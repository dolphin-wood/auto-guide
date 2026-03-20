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
  onClose: (ws: WSContext) => void
  orchestrator: AgentOrchestrator // default orchestrator for tests
} {
  const sessions = new Map<number, AgentOrchestrator>()
  const tabWs = new Map<number, WSContext>()
  const wsTab = new Map<WSContext, number>()

  function getOrCreateOrchestrator(tabId: number): AgentOrchestrator {
    let orchestrator = sessions.get(tabId)
    if (!orchestrator) {
      orchestrator = new AgentOrchestrator(cdpEndpoint, relay, tabId)
      sessions.set(tabId, orchestrator)
      wireOrchestrator(tabId, orchestrator)
      logger.info({ tabId }, 'Created new orchestrator session')
    }
    return orchestrator
  }

  function wireOrchestrator(tabId: number, orchestrator: AgentOrchestrator): void {
    const sendToTab = (msg: ServerToSidepanelMessage) => {
      const ws = tabWs.get(tabId)
      if (ws) {
        ws.send(JSON.stringify(msg))
      } else {
        logger.warn({ tabId, type: msg.type }, 'No sidepanel WS for tab')
      }
    }

    orchestrator.on('message', sendToTab)
    orchestrator.on('guide_complete', ({ guide }: { guide: unknown }) => {
      sendToTab({ type: 'guide_complete', data: { guide } } as ServerToSidepanelMessage)
    })
    orchestrator.on('generation_finished', () => {
      sendToTab({ type: 'generation_finished', data: {} } as ServerToSidepanelMessage)
    })
  }

  function onOpen(ws: WSContext): void {
    logger.info('Sidepanel connected')
    // Tab binding happens on first message with tabId
  }

  function onMessage(data: WSMessageReceive, ws: WSContext): void {
    let msg: SidepanelToServerMessage
    try {
      msg = JSON.parse(
        typeof data === 'string' ? data : data.toString(),
      ) as SidepanelToServerMessage
    } catch {
      return
    }

    if (!msg.data) return
    const tabId = msg.data.tabId ?? 0

    // Bind this WS to the tab
    if (!wsTab.has(ws)) {
      wsTab.set(ws, tabId)
      tabWs.set(tabId, ws)
      logger.info({ tabId }, 'Sidepanel bound to tab')
    }

    switch (msg.type) {
      case 'generate': {
        const orchestrator = getOrCreateOrchestrator(tabId)
        orchestrator.startGeneration(msg.data.journeyDescription, msg.data.startUrl ?? '')
        break
      }
      case 'stop': {
        const orchestrator = sessions.get(tabId)
        orchestrator?.stop()
        break
      }
      case 'user_follow_up': {
        const orchestrator = sessions.get(tabId)
        if (orchestrator) {
          logger.info({ tabId, text: msg.data.text }, 'Follow-up')
          // TODO: inject follow-up into running agent session
        }
        break
      }
    }
  }

  function onClose(ws: WSContext): void {
    const tabId = wsTab.get(ws)
    if (tabId !== undefined) {
      tabWs.delete(tabId)
      wsTab.delete(ws)
      logger.info({ tabId }, 'Sidepanel disconnected')
    } else {
      logger.info('Sidepanel disconnected (unbound)')
    }
  }

  // Expose default orchestrator for backward compat (tests)
  const defaultOrchestrator = getOrCreateOrchestrator(0)

  return { onOpen, onMessage, onClose, orchestrator: defaultOrchestrator }
}
