import { ConnectionManager } from '@/lib/relay/connection-manager'
import { TabManager } from '@/lib/relay/tab-manager'

const RELAY_SERVER_URL = 'ws://localhost:3100/extension/ws'

export default defineBackground(() => {
  let connectionManager: ConnectionManager | null = null
  let tabManager: TabManager | null = null

  function start(): void {
    tabManager = new TabManager((sessionId, method, params) => {
      connectionManager?.sendEvent('forwardCDPEvent', {
        sessionId,
        method,
        params,
      })
    })

    connectionManager = new ConnectionManager(RELAY_SERVER_URL, async (request) => {
      if (!tabManager) throw new Error('TabManager not initialized')

      switch (request.method) {
        case 'forwardCDPCommand': {
          const params = request.params as {
            sessionId: string
            method: string
            params?: Record<string, unknown>
          }
          return tabManager.sendCDPCommandBySession(
            params.sessionId,
            params.method,
            params.params ?? {},
          )
        }

        case 'createInitialTab': {
          const params = request.params as { url?: string; tabId?: number }

          let result: Awaited<ReturnType<typeof tabManager.attachToExistingTab>>

          if (params.tabId) {
            result = await tabManager.attachToExistingTab(params.tabId)
          } else {
            // Find the best non-extension, non-blank tab to attach to
            const tabs = await browser.tabs.query({ currentWindow: true })
            const isUsableTab = (t: chrome.tabs.Tab) =>
              t.url &&
              !t.url.startsWith('chrome-extension://') &&
              !t.url.startsWith('chrome://') &&
              t.url !== 'about:blank'
            const targetTab =
              tabs.find((t) => t.active && isUsableTab(t)) ?? tabs.find((t) => isUsableTab(t))

            if (targetTab?.id) {
              result = await tabManager.attachToExistingTab(targetTab.id)
            } else {
              result = await tabManager.createTabWithTargetInfo(params.url ?? 'about:blank')
            }
          }

          // Fire Target.attachedToTarget event so the relay forwards it to Playwright
          connectionManager?.sendEvent('forwardCDPEvent', {
            sessionId: result.sessionId,
            method: 'Target.attachedToTarget',
            params: {
              sessionId: result.sessionId,
              targetInfo: result.targetInfo,
              waitingForDebugger: false,
            },
          })

          return result
        }

        case 'getTabs': {
          return { tabs: tabManager.getTabEntries() }
        }

        case 'ping': {
          return { pong: true }
        }

        default:
          throw new Error(`Unknown RPC method: ${request.method}`)
      }
    })

    connectionManager.connect()
    console.log('[background] CDP relay client started')
  }

  // Click icon → open sidepanel for THIS tab (same pattern as Claude extension)
  browser.action.onClicked.addListener((tab) => {
    if (!tab.id) return
    // Do NOT await — both calls must stay in the same user gesture context
    browser.sidePanel.setOptions({
      tabId: tab.id,
      path: `sidepanel.html?tabId=${encodeURIComponent(tab.id)}`,
      enabled: true,
    })
    // @ts-expect-error -- sidePanel.open exists in Chrome 116+
    browser.sidePanel.open({ tabId: tab.id })
  })

  // Route messages between sidepanel and content scripts
  browser.runtime.onMessage.addListener((message, sender) => {
    // Content script -> sidepanel messages (overlay button clicks)
    if (
      message.type === 'overlay_next' ||
      message.type === 'overlay_previous' ||
      message.type === 'overlay_stop'
    ) {
      // These will be handled by the sidepanel's onMessage listener
      // Broadcast to all extension pages (sidepanel is an extension page)
      return
    }

    // Content script ready notification
    if (message.type === 'content_ready' && sender.tab?.id) {
      console.log(`[background] Content script ready on tab ${sender.tab.id}`)
      return
    }
  })

  // Monitor URL changes for page-aware playback
  browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.url) {
      // Broadcast URL change to sidepanel
      browser.runtime
        .sendMessage({
          type: 'url_changed',
          data: { tabId, url: changeInfo.url },
        })
        .catch(() => {
          // Sidepanel might not be open
        })
    }
  })

  start()
})
