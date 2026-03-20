export function findTargetElement(selector: string | string[]): HTMLElement | null {
  const selectors = Array.isArray(selector) ? selector : [selector]
  for (const sel of selectors) {
    try {
      const el = document.querySelector<HTMLElement>(sel)
      if (el) return el
    } catch {
      continue
    }
  }
  return null
}

/** Wait for element to appear in DOM, with timeout */
export function waitForElement(
  selector: string | string[],
  timeoutMs = 5000,
): Promise<HTMLElement | null> {
  const el = findTargetElement(selector)
  if (el) return Promise.resolve(el)

  const selectors = Array.isArray(selector) ? selector : [selector]

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      observer.disconnect()
      resolve(null)
    }, timeoutMs)

    const observer = new MutationObserver(() => {
      for (const sel of selectors) {
        try {
          const el = document.querySelector<HTMLElement>(sel)
          if (el) {
            clearTimeout(timer)
            observer.disconnect()
            resolve(el)
            return
          }
        } catch {
          continue
        }
      }
    })

    observer.observe(document.body, { childList: true, subtree: true })
  })
}

export function getElementRect(element: HTMLElement): DOMRect {
  return element.getBoundingClientRect()
}
