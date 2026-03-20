export function createSpotlight(): {
  element: HTMLElement
  update: (rect: DOMRect) => void
  destroy: () => void
} {
  const el = document.createElement('div')

  Object.assign(el.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    width: '0',
    height: '0',
    boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.5)',
    borderRadius: '4px',
    border: '2px solid #3b82f6',
    pointerEvents: 'none',
    zIndex: '2147483646',
    transition: 'all 0.3s ease',
  })

  function update(rect: DOMRect): void {
    const padding = 4
    Object.assign(el.style, {
      top: `${rect.top - padding}px`,
      left: `${rect.left - padding}px`,
      width: `${rect.width + padding * 2}px`,
      height: `${rect.height + padding * 2}px`,
    })
  }

  function destroy(): void {
    el.remove()
  }

  return { element: el, update, destroy }
}
