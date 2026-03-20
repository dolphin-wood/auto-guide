import { OverlayManager } from './content/overlay/overlay-manager'

export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    const overlay = new OverlayManager()

    // Notify sidepanel that content script is ready
    browser.runtime.sendMessage({ type: 'content_ready' }).catch(() => {
      // Sidepanel may not be open yet
    })

    // Listen for commands from sidepanel
    browser.runtime.onMessage.addListener((message) => {
      if (message.type === 'show_overlay') {
        overlay.show(message.data)
      }

      if (message.type === 'hide_overlay') {
        overlay.hide()
      }
    })
  },
})
