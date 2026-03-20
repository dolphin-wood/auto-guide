import { getElementRect, waitForElement } from './element-finder'
import { createSpotlight } from './spotlight'
import { createTooltip } from './tooltip'

interface SubstepData {
  targetSelector: string | string[]
  hint: string
}

interface OverlayCommand {
  substep: SubstepData
  stepIndex: number
  substepIndex: number
  totalSteps: number
}

function isValidRect(rect: DOMRect): boolean {
  return rect.width > 0 && rect.height > 0
}

export class OverlayManager {
  private shadowHost: HTMLElement | null = null
  private shadowRoot: ShadowRoot | null = null
  private spotlight: ReturnType<typeof createSpotlight> | null = null
  private tooltip: ReturnType<typeof createTooltip> | null = null
  private resizeObserver: ResizeObserver | null = null
  private mutationObserver: MutationObserver | null = null
  private handleScroll: (() => void) | null = null
  private debounceTimer: ReturnType<typeof setTimeout> | null = null
  private lastValidRect: DOMRect | null = null

  show(command: OverlayCommand): void {
    this.cleanup()
    this.ensureShadowRoot()

    // Wait for element to appear (handles dynamic pages like search results)
    waitForElement(command.substep.targetSelector).then((element) => {
      if (!element) {
        console.warn('[overlay] Target element not found:', command.substep.targetSelector)
        return
      }
      const rect = element.getBoundingClientRect()
      console.log(
        '[overlay] Found element:',
        command.substep.targetSelector,
        element.tagName,
        `${rect.width}x${rect.height} @ (${rect.left},${rect.top})`,
      )
      // Scroll element into view if not visible
      const elRect = element.getBoundingClientRect()
      const inView =
        elRect.top >= 0 &&
        elRect.bottom <= window.innerHeight &&
        elRect.left >= 0 &&
        elRect.right <= window.innerWidth
      if (!inView) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' })
      }

      // Wait for smooth scroll to finish before showing overlay
      const delay = inView ? 0 : 400
      setTimeout(() => this.showForElement(element, command), delay)
    })
  }

  private showForElement(element: HTMLElement, command: OverlayCommand): void {
    const rect = getElementRect(element)
    this.lastValidRect = rect

    // Create spotlight
    this.spotlight = createSpotlight()
    this.spotlight.update(rect)
    this.shadowRoot!.appendChild(this.spotlight.element)

    // Create tooltip
    this.tooltip = createTooltip({
      hint: command.substep.hint,
      stepProgress: `Step ${command.stepIndex + 1}/${command.totalSteps}`,
      onNext: () => {
        browser.runtime.sendMessage({ type: 'overlay_next' })
      },
      onPrevious: () => {
        browser.runtime.sendMessage({ type: 'overlay_previous' })
      },
      onStop: () => {
        browser.runtime.sendMessage({ type: 'overlay_stop' })
      },
    })
    this.shadowRoot!.appendChild(this.tooltip.element)
    this.tooltip.position(rect)

    // Debounced position update — shared by all observers
    const updateRect = () => {
      if (this.debounceTimer) clearTimeout(this.debounceTimer)
      this.debounceTimer = setTimeout(() => {
        const newRect = getElementRect(element)
        if (isValidRect(newRect)) {
          this.lastValidRect = newRect
          this.spotlight?.update(newRect)
          this.tooltip?.position(newRect)
        }
      }, 50)
    }

    // ResizeObserver for size/layout changes
    this.resizeObserver = new ResizeObserver(updateRect)
    this.resizeObserver.observe(element)
    this.resizeObserver.observe(document.documentElement)

    // MutationObserver for DOM changes that may shift element position
    this.mutationObserver = new MutationObserver(updateRect)
    this.mutationObserver.observe(document.body, { childList: true, subtree: true })

    // Scroll events (capture phase)
    const onScroll = updateRect
    window.addEventListener('scroll', onScroll, { capture: true, passive: true })
    this.handleScroll = onScroll
  }

  hide(): void {
    this.cleanup()
  }

  private ensureShadowRoot(): void {
    if (this.shadowRoot) return

    this.shadowHost = document.createElement('auto-guide-overlay')
    Object.assign(this.shadowHost.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      width: '100vw',
      height: '100vh',
      zIndex: '2147483646',
      pointerEvents: 'none',
      overflow: 'visible',
    })

    this.shadowRoot = this.shadowHost.attachShadow({ mode: 'closed' })
    document.documentElement.appendChild(this.shadowHost)
  }

  private cleanup(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer)
      this.debounceTimer = null
    }

    if (this.handleScroll) {
      window.removeEventListener('scroll', this.handleScroll, {
        capture: true,
      } as EventListenerOptions)
      this.handleScroll = null
    }

    if (this.resizeObserver) {
      this.resizeObserver.disconnect()
      this.resizeObserver = null
    }

    if (this.mutationObserver) {
      this.mutationObserver.disconnect()
      this.mutationObserver = null
    }

    this.spotlight?.destroy()
    this.spotlight = null

    this.tooltip?.destroy()
    this.tooltip = null

    if (this.shadowHost) {
      this.shadowHost.remove()
      this.shadowHost = null
      this.shadowRoot = null
    }
  }
}
