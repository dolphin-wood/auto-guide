import { EventEmitter } from 'node:events'
import type { WSContext } from 'hono/ws'
import { logger } from '../logger.js'

interface ConnectedTarget {
  sessionId: string
  targetId: string
  targetInfo: {
    targetId: string
    type: string
    title: string
    url: string
    attached: boolean
    browserContextId?: string
  }
}

interface RelayChannel {
  tabId: number
  playwrightWs: WSContext | null
  connectedTargets: Map<string, ConnectedTarget>
  targetsSentToPlaywright: Set<string>
  pendingAttachParams: Record<string, unknown> | null
}

export class CDPRelay {
  private channels = new Map<number, RelayChannel>()
  private sessionToTab = new Map<string, number>()
  private extensionWs: WSContext | null = null
  private extensionPendingRequests = new Map<
    number,
    {
      resolve: (result: unknown) => void
      reject: (error: Error) => void
    }
  >()
  private extensionMessageId = 0
  private emitter = new EventEmitter()

  private getOrCreateChannel(tabId: number): RelayChannel {
    let channel = this.channels.get(tabId)
    if (!channel) {
      channel = {
        tabId,
        playwrightWs: null,
        connectedTargets: new Map(),
        targetsSentToPlaywright: new Set(),
        pendingAttachParams: null,
      }
      this.channels.set(tabId, channel)
    }
    return channel
  }

  handleExtensionOpen(ws: WSContext): void {
    this.extensionWs = ws
    logger.info('Extension connected')
  }

  handleExtensionMessage(data: string): void {
    let message: Record<string, unknown>
    try {
      message = JSON.parse(data) as Record<string, unknown>
    } catch {
      return
    }

    if (message.id !== undefined && typeof message.id === 'number') {
      const pending = this.extensionPendingRequests.get(message.id)
      if (pending) {
        this.extensionPendingRequests.delete(message.id)
        if (message.error) {
          pending.reject(new Error(message.error as string))
        } else {
          pending.resolve(message.result)
        }
        return
      }
    }

    if (message.method === 'pong') return

    if (message.method === 'forwardCDPEvent') {
      const params = message.params as {
        sessionId: string
        method: string
        params: Record<string, unknown>
      }

      if (params.method === 'Target.attachedToTarget') {
        const tp = params.params as {
          sessionId: string
          targetInfo: {
            targetId: string
            type: string
            title: string
            url: string
            browserContextId?: string
          }
          waitingForDebugger: boolean
        }

        if (tp.targetInfo.type !== 'page') return

        // Find which channel this session belongs to
        const tabId = this.sessionToTab.get(params.sessionId) ?? this.sessionToTab.get(tp.sessionId)
        if (tabId === undefined) {
          // New target — assign to the channel that has a pending attach
          for (const ch of this.channels.values()) {
            if (ch.pendingAttachParams && !ch.connectedTargets.has(tp.sessionId)) {
              this.assignTargetToChannel(ch, tp)
              return
            }
          }
          // Fallback: assign to first channel without targets
          for (const ch of this.channels.values()) {
            if (ch.connectedTargets.size === 0) {
              this.assignTargetToChannel(ch, tp)
              return
            }
          }
          return
        }

        const channel = this.channels.get(tabId)
        if (!channel) return

        this.assignTargetToChannel(channel, tp)
        return
      }

      if (params.method === 'Target.detachedFromTarget') {
        const dp = params.params as { sessionId: string }
        const tabId = this.sessionToTab.get(dp.sessionId)
        if (tabId !== undefined) {
          const channel = this.channels.get(tabId)
          channel?.connectedTargets.delete(dp.sessionId)
          this.sessionToTab.delete(dp.sessionId)
          this.sendToPlaywright(tabId, { method: 'Target.detachedFromTarget', params: dp })
        }
        return
      }

      if (params.method === 'Target.targetInfoChanged') {
        const tp = params.params as {
          targetInfo: { targetId: string; url: string; title: string }
        }
        for (const channel of this.channels.values()) {
          for (const target of channel.connectedTargets.values()) {
            if (target.targetId === tp.targetInfo.targetId) {
              target.targetInfo.url = tp.targetInfo.url
              target.targetInfo.title = tp.targetInfo.title
            }
          }
        }
      }

      // Route event to the correct channel by sessionId
      const tabId = this.sessionToTab.get(params.sessionId)
      const cdpEvent = { method: params.method, params: params.params, sessionId: params.sessionId }
      this.emitter.emit('cdp:event', { event: cdpEvent })
      if (tabId !== undefined) {
        this.sendToPlaywright(tabId, cdpEvent)
      }
    }
  }

  private assignTargetToChannel(
    channel: RelayChannel,
    tp: {
      sessionId: string
      targetInfo: {
        targetId: string
        type: string
        title: string
        url: string
        browserContextId?: string
      }
      waitingForDebugger: boolean
    },
  ): void {
    const alreadyConnected = channel.connectedTargets.has(tp.sessionId)
    channel.connectedTargets.set(tp.sessionId, {
      sessionId: tp.sessionId,
      targetId: tp.targetInfo.targetId,
      targetInfo: { ...tp.targetInfo, attached: true },
    })
    this.sessionToTab.set(tp.sessionId, channel.tabId)

    if (!alreadyConnected) {
      channel.targetsSentToPlaywright.add(tp.sessionId)
      this.sendToPlaywright(channel.tabId, {
        method: 'Target.attachedToTarget',
        params: tp,
      })
    }
  }

  handleExtensionClose(): void {
    this.extensionWs = null
    for (const channel of this.channels.values()) {
      channel.connectedTargets.clear()
      channel.targetsSentToPlaywright.clear()
    }
    this.sessionToTab.clear()
    for (const pending of this.extensionPendingRequests.values()) {
      pending.reject(new Error('Extension disconnected'))
    }
    this.extensionPendingRequests.clear()
    logger.info('Extension disconnected')
  }

  handlePlaywrightOpen(ws: WSContext, tabId: number): void {
    const channel = this.getOrCreateChannel(tabId)
    channel.playwrightWs = ws
    logger.info({ tabId }, 'Playwright connected')
  }

  async handlePlaywrightMessage(data: string, tabId: number): Promise<void> {
    let message: Record<string, unknown>
    try {
      message = JSON.parse(data) as Record<string, unknown>
    } catch {
      return
    }

    const channel = this.channels.get(tabId)
    if (!channel) return

    const id = message.id as number
    const method = message.method as string
    const params = message.params as Record<string, unknown> | undefined
    const sessionId = message.sessionId as string | undefined

    if (!this.extensionWs) {
      this.sendToPlaywright(tabId, { id, sessionId, error: { message: 'Extension not connected' } })
      return
    }

    try {
      const result = await this.routeCdpCommand(channel, method, params, sessionId)

      if (method === 'Target.setAutoAttach' && !sessionId) {
        for (const target of channel.connectedTargets.values()) {
          if (channel.targetsSentToPlaywright.has(target.sessionId)) continue
          channel.targetsSentToPlaywright.add(target.sessionId)
          this.sendToPlaywright(tabId, {
            method: 'Target.attachedToTarget',
            params: {
              sessionId: target.sessionId,
              targetInfo: { ...target.targetInfo, attached: true },
              waitingForDebugger: false,
            },
          })
        }
      }

      if (method === 'Target.setDiscoverTargets') {
        for (const target of channel.connectedTargets.values()) {
          this.sendToPlaywright(tabId, {
            method: 'Target.targetCreated',
            params: { targetInfo: { ...target.targetInfo, attached: true } },
          })
        }
      }

      if (method === 'Target.attachToTarget' && (result as Record<string, unknown>)?.sessionId) {
        const targetId = params?.targetId as string
        for (const target of channel.connectedTargets.values()) {
          if (target.targetId === targetId) {
            this.sendToPlaywright(tabId, {
              method: 'Target.attachedToTarget',
              params: {
                sessionId: (result as Record<string, unknown>).sessionId,
                targetInfo: { ...target.targetInfo, attached: true },
                waitingForDebugger: false,
              },
            })
          }
        }
      }

      this.sendToPlaywright(tabId, { id, sessionId, result })
    } catch (err) {
      this.sendToPlaywright(tabId, {
        id,
        sessionId,
        error: { message: err instanceof Error ? err.message : String(err) },
      })
    }
  }

  handlePlaywrightClose(tabId: number): void {
    const channel = this.channels.get(tabId)
    if (channel) {
      channel.playwrightWs = null
      // Clean up session mappings
      for (const sessionId of channel.connectedTargets.keys()) {
        this.sessionToTab.delete(sessionId)
      }
      channel.connectedTargets.clear()
      channel.targetsSentToPlaywright.clear()
    }
    logger.info({ tabId }, 'Playwright disconnected')
  }

  isExtensionConnected(): boolean {
    return this.extensionWs !== null
  }

  setTargetTab(tabId: number, params: { tabId?: number; url?: string }): void {
    const channel = this.getOrCreateChannel(tabId)
    channel.pendingAttachParams = { ...params, tabId }
  }

  private async routeCdpCommand(
    channel: RelayChannel,
    method: string,
    params: Record<string, unknown> | undefined,
    sessionId: string | undefined,
  ): Promise<unknown> {
    switch (method) {
      case 'Browser.getVersion':
        return {
          protocolVersion: '1.3',
          product: 'Chrome/AutoGuide-Extension',
          revision: '1.0.0',
          userAgent: 'AutoGuide/1.0.0',
          jsVersion: 'V8',
        }

      case 'Browser.setDownloadBehavior':
        return {}

      case 'Target.setAutoAttach': {
        if (sessionId) break
        if (channel.connectedTargets.size === 0) {
          try {
            const createParams = channel.pendingAttachParams ?? {
              url: 'about:blank',
              tabId: channel.tabId,
            }
            channel.pendingAttachParams = null

            const tabResult = (await this.sendToExtension('createInitialTab', createParams)) as {
              sessionId: string
              targetInfo: {
                targetId: string
                type: string
                title: string
                url: string
                browserContextId?: string
              }
            }
            if (tabResult?.sessionId && tabResult?.targetInfo) {
              channel.connectedTargets.set(tabResult.sessionId, {
                sessionId: tabResult.sessionId,
                targetId: tabResult.targetInfo.targetId,
                targetInfo: { ...tabResult.targetInfo, attached: true },
              })
              this.sessionToTab.set(tabResult.sessionId, channel.tabId)
            }
          } catch (err) {
            logger.error({ err, tabId: channel.tabId }, 'Failed to create initial tab')
          }
        }
        return {}
      }

      case 'Target.setDiscoverTargets':
        return {}

      case 'Target.attachToTarget': {
        const targetId = params?.targetId as string
        for (const target of channel.connectedTargets.values()) {
          if (target.targetId === targetId) {
            return { sessionId: target.sessionId }
          }
        }
        throw new Error(`Target ${targetId} not found`)
      }

      case 'Target.getTargetInfo': {
        const targetId = params?.targetId as string | undefined
        if (targetId) {
          for (const target of channel.connectedTargets.values()) {
            if (target.targetId === targetId) {
              return { targetInfo: target.targetInfo }
            }
          }
        }
        if (sessionId) {
          const target = channel.connectedTargets.get(sessionId)
          if (target) return { targetInfo: target.targetInfo }
        }
        const first = channel.connectedTargets.values().next().value
        return { targetInfo: first?.targetInfo }
      }

      case 'Target.getTargets':
        return {
          targetInfos: [...channel.connectedTargets.values()].map((t) => ({
            ...t.targetInfo,
            attached: true,
          })),
        }

      case 'Target.createTarget':
      case 'Target.closeTarget':
        return await this.sendToExtension('forwardCDPCommand', { method, params })

      case 'Runtime.enable': {
        if (!sessionId) break

        const contextCreatedPromise = new Promise<void>((resolve) => {
          const handler = ({
            event,
          }: {
            event: { method: string; sessionId?: string; params?: Record<string, unknown> }
          }) => {
            if (
              event.method === 'Runtime.executionContextCreated' &&
              event.sessionId === sessionId
            ) {
              const p = event.params as
                | { context?: { auxData?: { isDefault?: boolean } } }
                | undefined
              if (p?.context?.auxData?.isDefault === true) {
                clearTimeout(timeout)
                this.emitter.off('cdp:event', handler)
                resolve()
              }
            }
          }
          const timeout = setTimeout(() => {
            this.emitter.off('cdp:event', handler)
            resolve()
          }, 3000)
          this.emitter.on('cdp:event', handler)
        })

        const result = await this.sendToExtension('forwardCDPCommand', {
          sessionId,
          method,
          params,
        })
        await contextCreatedPromise
        return result
      }
    }

    const resolvedSessionId = sessionId ?? channel.connectedTargets.values().next().value?.sessionId
    if (!resolvedSessionId) throw new Error('No active session for CDP command')

    return await this.sendToExtension('forwardCDPCommand', {
      sessionId: resolvedSessionId,
      method,
      params,
    })
  }

  private async sendToExtension(
    method: string,
    params?: Record<string, unknown>,
  ): Promise<unknown> {
    if (!this.extensionWs) throw new Error('Extension not connected')

    const id = ++this.extensionMessageId
    this.extensionWs.send(JSON.stringify({ id, method, params }))

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.extensionPendingRequests.delete(id)
        reject(new Error(`Extension request timeout: ${method}`))
      }, 30_000)

      this.extensionPendingRequests.set(id, {
        resolve: (result) => {
          clearTimeout(timeout)
          resolve(result)
        },
        reject: (error) => {
          clearTimeout(timeout)
          reject(error)
        },
      })
    })
  }

  private sendToPlaywright(tabId: number, msg: Record<string, unknown>): void {
    const channel = this.channels.get(tabId)
    if (channel?.playwrightWs) {
      channel.playwrightWs.send(JSON.stringify(msg))
    }
  }
}
