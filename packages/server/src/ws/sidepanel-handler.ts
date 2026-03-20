import type { ServerToSidepanelMessage, SidepanelToServerMessage } from '@auto-guide/shared'
import type { WSContext, WSMessageReceive } from 'hono/ws'
import { AgentOrchestrator } from '../agent/orchestrator.js'
import { logger } from '../logger.js'
import type { CDPRelay } from '../relay/cdp-relay.js'

export function createSidepanelHandler(
  cdpEndpoint = 'ws://localhost:3100/cdp',
  relay?: CDPRelay,
): {
  onOpen: (ws: WSContext) => void
  onMessage: (data: WSMessageReceive, ws: WSContext) => void
  onClose: () => void
  orchestrator: AgentOrchestrator // default orchestrator for tests
} {
  const sessions = new Map<number, AgentOrchestrator>()
  let activeWs: WSContext | null = null

  function getOrCreateOrchestrator(tabId?: number): AgentOrchestrator {
    const key = tabId ?? 0
    let orchestrator = sessions.get(key)
    if (!orchestrator) {
      orchestrator = new AgentOrchestrator(cdpEndpoint, relay)
      sessions.set(key, orchestrator)
      wireOrchestrator(orchestrator)
      logger.info({ tabId: key }, 'Created new orchestrator session')
    }
    return orchestrator
  }

  function wireOrchestrator(orchestrator: AgentOrchestrator): void {
    orchestrator.on('message', (msg: ServerToSidepanelMessage) => {
      logger.debug({ type: msg.type, hasWs: !!activeWs }, 'Forwarding to sidepanel')
      if (activeWs) send(activeWs, msg)
    })
    orchestrator.on('guide_complete', ({ guide }: { guide: unknown }) => {
      if (activeWs) {
        send(activeWs, { type: 'guide_complete', data: { guide } } as ServerToSidepanelMessage)
      }
    })
    orchestrator.on('generation_finished', () => {
      if (activeWs) {
        send(activeWs, { type: 'generation_finished', data: {} } as ServerToSidepanelMessage)
      }
    })
  }

  function send(ws: WSContext, message: ServerToSidepanelMessage): void {
    ws.send(JSON.stringify(message))
  }

  function onOpen(ws: WSContext): void {
    activeWs = ws
    logger.info('Sidepanel connected')
  }

  function onMessage(data: WSMessageReceive, _ws: WSContext): void {
    let msg: SidepanelToServerMessage
    try {
      msg = JSON.parse(
        typeof data === 'string' ? data : data.toString(),
      ) as SidepanelToServerMessage
    } catch {
      return
    }

    switch (msg.type) {
      case 'generate': {
        const orchestrator = getOrCreateOrchestrator(msg.data.tabId)
        orchestrator.startGeneration(msg.data.journeyDescription, msg.data.startUrl ?? '')
        break
      }
      case 'stop': {
        const orchestrator = sessions.get(msg.data.tabId ?? 0)
        orchestrator?.stop()
        break
      }
      case 'user_follow_up': {
        const orchestrator = sessions.get(msg.data.tabId ?? 0)
        if (orchestrator) {
          logger.info({ tabId: msg.data.tabId, text: msg.data.text }, 'Follow-up')
          // TODO: inject follow-up into running agent session
        }
        break
      }
    }
  }

  function onClose(): void {
    activeWs = null
    logger.info('Sidepanel disconnected')
  }

  // Expose default orchestrator for backward compat (tests)
  const defaultOrchestrator = getOrCreateOrchestrator(0)

  return { onOpen, onMessage, onClose, orchestrator: defaultOrchestrator }
}
