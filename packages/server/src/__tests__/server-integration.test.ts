import type { AddressInfo } from 'net'
import { serve } from '@hono/node-server'
import { createNodeWebSocket } from '@hono/node-ws'
import { Hono } from 'hono'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import WebSocket from 'ws'
import { createSidepanelHandler } from '../ws/sidepanel-handler'

describe('Server WebSocket integration', () => {
  let server: ReturnType<typeof serve>
  let port: number
  const sidepanel = createSidepanelHandler()

  beforeAll(async () => {
    const app = new Hono()
    const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app })

    app.get('/health', (c) => c.json({ status: 'ok' }))

    app.get(
      '/sidepanel/ws',
      upgradeWebSocket(() => ({
        onOpen(_evt, ws) {
          sidepanel.onOpen(ws)
        },
        onMessage(evt, ws) {
          sidepanel.onMessage(evt.data, ws)
        },
        onClose() {
          sidepanel.onClose(ws)
        },
      })),
    )

    server = serve({ fetch: app.fetch, port: 0 })
    injectWebSocket(server)

    port = (server.address() as AddressInfo).port
  })

  afterAll(() => {
    server.close()
  })

  it('should respond to health check', async () => {
    const res = await fetch(`http://localhost:${port}/health`)
    const data = await res.json()
    expect(data).toEqual({ status: 'ok' })
  })

  it('should accept sidepanel WebSocket connections', async () => {
    const ws = new WebSocket(`ws://localhost:${port}/sidepanel/ws`)

    const connected = await new Promise<boolean>((resolve) => {
      ws.on('open', () => resolve(true))
      ws.on('error', () => resolve(false))
    })

    expect(connected).toBe(true)
    ws.close()
  })

  it('should handle generate message and transition orchestrator to running', async () => {
    const ws = new WebSocket(`ws://localhost:${port}/sidepanel/ws`)

    await new Promise<void>((resolve) => ws.on('open', () => resolve()))

    ws.send(
      JSON.stringify({
        type: 'generate',
        data: { journeyDescription: 'Search for flights from Tokyo to Sapporo' },
      }),
    )

    await new Promise((r) => setTimeout(r, 50))
    expect(sidepanel.orchestrator.getState()).toBe('running')

    ws.send(JSON.stringify({ type: 'stop', data: {} }))
    await new Promise((r) => setTimeout(r, 50))

    expect(sidepanel.orchestrator.getState()).toBe('idle')
    ws.close()
  })

  it('should broadcast guide_complete event when guide is submitted', async () => {
    const ws = new WebSocket(`ws://localhost:${port}/sidepanel/ws`)

    await new Promise<void>((resolve) => ws.on('open', () => resolve()))

    const receivedMessages: unknown[] = []
    ws.on('message', (data) => {
      receivedMessages.push(JSON.parse(data.toString()))
    })

    sidepanel.orchestrator.markGuideSubmitted({
      id: 'test-guide',
      title: 'Test Guide',
      description: 'A test',
      pages: [
        {
          urlPattern: 'https://example.com',
          title: 'Example',
          steps: [
            {
              id: 's1',
              instruction: 'Click button',
              substeps: [{ targetSelector: 'button', hint: 'Click' }],
            },
          ],
        },
      ],
    })

    await new Promise((r) => setTimeout(r, 100))

    const guideCompleteMsg = receivedMessages.find(
      (m) => (m as Record<string, unknown>).type === 'guide_complete',
    )
    expect(guideCompleteMsg).toBeDefined()

    ws.close()
  })
})
