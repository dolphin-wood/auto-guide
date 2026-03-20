import { resolve } from 'path'
import { serve } from '@hono/node-server'
import { createNodeWebSocket } from '@hono/node-ws'
import { config } from 'dotenv'
import { Hono } from 'hono'
import { logger } from './logger.js'
import { CDPRelay } from './relay/cdp-relay.js'
import { createSidepanelHandler } from './ws/sidepanel-handler.js'

config({ path: resolve(import.meta.dirname, '../../../.env') })

const app = new Hono()

const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app })

const relay = new CDPRelay()
const sidepanel = createSidepanelHandler('ws://localhost:3100/cdp', relay)
// cdpEndpoint is the base URL — orchestrator appends /:tabId

// Health check
app.get('/health', (c) => {
  return c.json({ status: 'ok', extensionConnected: relay.isExtensionConnected() })
})

// Chrome Discovery endpoints (required for Playwright connectOverCDP)
app.get('/json/version', (c) => {
  return c.json({
    Browser: 'Chrome/AutoGuide-Extension',
    'Protocol-Version': '1.3',
    webSocketDebuggerUrl: `ws://${c.req.header('host') ?? 'localhost:3100'}/cdp/0`,
  })
})

app.get('/json/list', (c) => {
  return c.json([])
})

// Extension WebSocket — Chrome Extension connects here
app.get(
  '/extension/ws',
  upgradeWebSocket(() => ({
    onOpen(_evt, ws) {
      relay.handleExtensionOpen(ws)
    },
    onMessage(evt, _ws) {
      relay.handleExtensionMessage(evt.data as string)
    },
    onClose() {
      relay.handleExtensionClose()
    },
  })),
)

// CDP WebSocket — Playwright connectOverCDP() connects here, one per tab
app.get(
  '/cdp/:tabId',
  upgradeWebSocket((c) => {
    const tabId = Number(c.req.param('tabId'))
    return {
      onOpen(_evt, ws) {
        relay.handlePlaywrightOpen(ws, tabId)
      },
      onMessage(evt, _ws) {
        relay.handlePlaywrightMessage(evt.data as string, tabId)
      },
      onClose() {
        relay.handlePlaywrightClose(tabId)
      },
    }
  }),
)

// Sidepanel WebSocket — Extension sidepanel connects here
app.get(
  '/sidepanel/ws',
  upgradeWebSocket(() => ({
    onOpen(_evt, ws) {
      sidepanel.onOpen(ws)
    },
    onMessage(evt, ws) {
      sidepanel.onMessage(evt.data, ws)
    },
    onClose(_evt, ws) {
      sidepanel.onClose(ws)
    },
  })),
)

const PORT = Number(process.env.PORT ?? 3100)

const server = serve({
  fetch: app.fetch,
  port: PORT,
})

injectWebSocket(server)

logger.info({ port: PORT }, 'Auto-Guide server running')

function shutdown() {
  logger.info('Shutting down...')
  // Force exit — server.close() waits for existing connections which blocks shutdown
  process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

export { relay, sidepanel }
