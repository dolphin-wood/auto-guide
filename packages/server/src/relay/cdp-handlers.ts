import type { TargetManager } from './target-manager.js'

type ForwardCDPFn = (
  sessionId: string,
  method: string,
  params?: Record<string, unknown>,
) => Promise<{ result: unknown }>

type SendRPCFn = (method: string, params?: Record<string, unknown>) => Promise<{ result: unknown }>

interface CDPCommand {
  id: number
  method: string
  params?: Record<string, unknown>
  sessionId?: string
}

interface CDPEvent {
  method: string
  params: Record<string, unknown>
}

interface CDPResult {
  result: unknown
  events?: CDPEvent[]
}

export class CDPCommandRouter {
  private targetManager: TargetManager
  private forwardToExtension: ForwardCDPFn
  private sendRPC: SendRPCFn

  constructor(targetManager: TargetManager, forwardToExtension: ForwardCDPFn, sendRPC?: SendRPCFn) {
    this.targetManager = targetManager
    this.forwardToExtension = forwardToExtension
    this.sendRPC = sendRPC ?? (async (method, params) => forwardToExtension('', method, params))
  }

  async handle(command: CDPCommand): Promise<CDPResult> {
    switch (command.method) {
      case 'Browser.getVersion':
        return this.handleBrowserGetVersion()
      case 'Target.getTargets':
        return this.handleGetTargets()
      case 'Target.setAutoAttach':
        return this.handleSetAutoAttach(command.sessionId)
      case 'Target.setDiscoverTargets':
        return { result: {} }
      case 'Target.createTarget':
        return this.handleCreateTarget(command)
      case 'Browser.setDownloadBehavior':
        return { result: {} }
      default:
        return this.forwardCommand(command)
    }
  }

  private handleBrowserGetVersion(): CDPResult {
    return {
      result: {
        protocolVersion: '1.3',
        product: 'Chrome/AutoGuide-Extension',
        revision: '',
        userAgent: 'AutoGuide',
        jsVersion: '',
      },
    }
  }

  private handleGetTargets(): CDPResult {
    return {
      result: {
        targetInfos: this.targetManager.getAllTargets(),
      },
    }
  }

  private async handleSetAutoAttach(sessionId?: string): Promise<CDPResult> {
    // If called with a sessionId (per-page auto-attach), just return
    if (sessionId) {
      return { result: {} }
    }

    // Auto-create an initial tab if none exist
    // The extension will send Target.attachedToTarget events back through the event channel
    if (this.targetManager.getAllTargets().length === 0) {
      try {
        const result = await this.sendRPC('createInitialTab', { url: 'about:blank' })
        const data = result.result as
          | {
              sessionId: string
              targetInfo: {
                targetId: string
                type: string
                title: string
                url: string
                browserContextId?: string
              }
            }
          | undefined
        if (data?.targetInfo) {
          this.targetManager.addTarget(data.sessionId, {
            targetId: data.targetInfo.targetId,
            type: (data.targetInfo.type ?? 'page') as 'page',
            title: data.targetInfo.title ?? '',
            url: data.targetInfo.url ?? '',
            attached: true,
            browserContextId: data.targetInfo.browserContextId,
          })
        }
      } catch (err) {
        // logged by caller
      }
    }

    return { result: {} }
  }

  private async handleCreateTarget(command: CDPCommand): Promise<CDPResult> {
    const result = await this.sendRPC('createInitialTab', command.params)

    const data = result.result as
      | {
          sessionId: string
          targetInfo: {
            targetId: string
            type: string
            title: string
            url: string
            browserContextId?: string
          }
        }
      | undefined
    if (!data?.targetInfo) {
      return { result: { targetId: '' } }
    }

    // Register the new target
    this.targetManager.addTarget(data.sessionId, {
      targetId: data.targetInfo.targetId,
      type: (data.targetInfo.type ?? 'page') as 'page',
      title: data.targetInfo.title ?? '',
      url: data.targetInfo.url ?? '',
      attached: true,
      browserContextId: data.targetInfo.browserContextId,
    })

    return {
      result: { targetId: data.targetInfo.targetId },
      events: [
        {
          method: 'Target.attachedToTarget',
          params: {
            sessionId: data.sessionId,
            targetInfo: data.targetInfo,
            waitingForDebugger: false,
          },
        },
      ],
    }
  }

  private async forwardCommand(command: CDPCommand): Promise<CDPResult> {
    const sessionId = command.sessionId ?? this.targetManager.getFirstSessionId()

    if (!sessionId) {
      return { result: { error: 'No active session' } }
    }

    const result = await this.forwardToExtension(sessionId, command.method, command.params)

    return { result: result.result }
  }
}
