const MAX_CONCURRENT_CDP = 3

interface TabEntry {
  tabId: number
  sessionId: string
  targetId: string
  url: string
  title: string
}

interface TargetInfo {
  targetId: string
  type: string
  title: string
  url: string
  attached: boolean
  browserContextId?: string
}

type CDPEventCallback = (sessionId: string, method: string, params: Record<string, unknown>) => void

export class TabManager {
  private tabs = new Map<string, TabEntry>() // sessionId -> TabEntry
  private tabIdToSession = new Map<number, string>() // tabId -> sessionId
  private onCDPEvent: CDPEventCallback
  private pendingCDP = 0
  private cdpQueue: Array<() => void> = []

  constructor(onCDPEvent: CDPEventCallback) {
    this.onCDPEvent = onCDPEvent
    this.setupEventListeners()
  }

  async attachToExistingTab(tabId: number): Promise<{ sessionId: string; targetInfo: TargetInfo }> {
    const tab = await browser.tabs.get(tabId)
    return this.attachAndRegisterTab(tabId, tab.url ?? '', tab.title ?? '')
  }

  async createTabWithTargetInfo(
    url: string,
  ): Promise<{ sessionId: string; targetInfo: TargetInfo }> {
    const tab = await browser.tabs.create({ url, active: false })
    return this.attachAndRegisterTab(tab.id!, tab.url ?? url, tab.title ?? '')
  }

  private async attachAndRegisterTab(
    tabId: number,
    url: string,
    title: string,
  ): Promise<{ sessionId: string; targetInfo: TargetInfo }> {
    // Detach first if already attached (e.g., from a previous session)
    try {
      await browser.debugger.detach({ tabId })
    } catch {
      /* not attached */
    }
    await browser.debugger.attach({ tabId }, '1.3')
    await this.sendCDPCommand(tabId, 'Page.enable', {})

    const targetResult = (await this.sendCDPCommand(tabId, 'Target.getTargetInfo', {})) as {
      targetInfo: { targetId: string; browserContextId?: string }
    }

    const targetId = targetResult.targetInfo.targetId
    const browserContextId = targetResult.targetInfo.browserContextId
    const sessionId = `session-${tabId}`

    const entry: TabEntry = {
      tabId,
      sessionId,
      targetId,
      url,
      title,
    }

    this.tabs.set(sessionId, entry)
    this.tabIdToSession.set(tabId, sessionId)

    const targetInfo: TargetInfo = {
      targetId,
      type: 'page',
      title,
      url,
      attached: true,
      browserContextId,
    }

    return { sessionId, targetInfo }
  }

  async sendCDPCommandBySession(
    sessionId: string,
    method: string,
    params: Record<string, unknown>,
  ): Promise<unknown> {
    const entry = this.tabs.get(sessionId)
    if (!entry) {
      throw new Error(`No tab found for session ${sessionId}`)
    }
    return this.sendCDPCommand(entry.tabId, method, params)
  }

  async closeTab(sessionId: string): Promise<void> {
    const entry = this.tabs.get(sessionId)
    if (!entry) return
    try {
      await browser.debugger.detach({ tabId: entry.tabId })
    } catch {
      // Tab may already be closed
    }
    try {
      await browser.tabs.remove(entry.tabId)
    } catch {
      // Tab may already be closed
    }
    this.tabIdToSession.delete(entry.tabId)
    this.tabs.delete(sessionId)
  }

  getTabEntries(): TabEntry[] {
    return [...this.tabs.values()]
  }

  private async sendCDPCommand(
    tabId: number,
    method: string,
    params: Record<string, unknown>,
  ): Promise<unknown> {
    // Concurrency limiter
    if (this.pendingCDP >= MAX_CONCURRENT_CDP) {
      await new Promise<void>((resolve) => this.cdpQueue.push(resolve))
    }
    this.pendingCDP++
    try {
      return await browser.debugger.sendCommand({ tabId }, method, params)
    } finally {
      this.pendingCDP--
      if (this.cdpQueue.length > 0) {
        this.cdpQueue.shift()!()
      }
    }
  }

  private setupEventListeners(): void {
    browser.debugger.onEvent.addListener((source, method, params) => {
      if (!source.tabId) return
      const sessionId = this.tabIdToSession.get(source.tabId)
      if (!sessionId) return

      // Update internal URL cache on navigation
      if (method === 'Page.frameNavigated') {
        const frame = (params as Record<string, unknown>).frame as
          | Record<string, unknown>
          | undefined
        if (frame?.url && !frame.parentId) {
          const entry = this.tabs.get(sessionId)
          if (entry) entry.url = frame.url as string
        }
      }

      this.onCDPEvent(sessionId, method, (params ?? {}) as Record<string, unknown>)
    })

    browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
      const sessionId = this.tabIdToSession.get(tabId)
      if (!sessionId) return
      const entry = this.tabs.get(sessionId)
      if (!entry) return

      if (changeInfo.url) entry.url = changeInfo.url
      if (changeInfo.title) entry.title = changeInfo.title
    })

    browser.tabs.onRemoved.addListener((tabId) => {
      const sessionId = this.tabIdToSession.get(tabId)
      if (!sessionId) return
      this.tabIdToSession.delete(tabId)
      this.tabs.delete(sessionId)
    })

    browser.debugger.onDetach.addListener((source) => {
      if (!source.tabId) return
      const sessionId = this.tabIdToSession.get(source.tabId)
      if (!sessionId) return
      this.tabIdToSession.delete(source.tabId)
      this.tabs.delete(sessionId)

      this.onCDPEvent(sessionId, 'Target.detachedFromTarget', { sessionId })
    })
  }
}
