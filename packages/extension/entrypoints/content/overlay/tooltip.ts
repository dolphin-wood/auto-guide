interface TooltipOptions {
  hint: string
  stepProgress: string
  onNext: () => void
  onPrevious: () => void
  onStop: () => void
}

export function createTooltip(options: TooltipOptions): {
  element: HTMLElement
  position: (targetRect: DOMRect) => void
  destroy: () => void
} {
  const el = document.createElement('div')

  Object.assign(el.style, {
    position: 'fixed',
    zIndex: '2147483647',
    pointerEvents: 'auto',
    background: 'white',
    borderRadius: '8px',
    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
    padding: '12px 16px',
    maxWidth: '300px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    fontSize: '13px',
    lineHeight: '1.5',
    color: '#1a1a1a',
  })

  // Hint text
  const hintEl = document.createElement('div')
  hintEl.textContent = options.hint
  hintEl.style.marginBottom = '8px'
  el.appendChild(hintEl)

  // Progress + controls row
  const controlsRow = document.createElement('div')
  Object.assign(controlsRow.style, {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '8px',
  })

  const progressEl = document.createElement('span')
  progressEl.textContent = options.stepProgress
  Object.assign(progressEl.style, { fontSize: '11px', color: '#6b7280' })

  const btnGroup = document.createElement('div')
  btnGroup.style.display = 'flex'
  btnGroup.style.gap = '4px'

  function createButton(
    text: string,
    onClick: () => void,
    variant: 'default' | 'danger' = 'default',
  ): HTMLButtonElement {
    const btn = document.createElement('button')
    btn.textContent = text
    Object.assign(btn.style, {
      padding: '4px 10px',
      fontSize: '12px',
      borderRadius: '4px',
      border: variant === 'danger' ? '1px solid #ef4444' : '1px solid #d1d5db',
      background: 'white',
      color: variant === 'danger' ? '#ef4444' : '#374151',
      cursor: 'pointer',
    })
    btn.addEventListener('click', (e) => {
      e.stopPropagation()
      onClick()
    })
    return btn
  }

  btnGroup.appendChild(createButton('Back', options.onPrevious))
  btnGroup.appendChild(createButton('Next', options.onNext))
  btnGroup.appendChild(createButton('Stop', options.onStop, 'danger'))

  controlsRow.appendChild(progressEl)
  controlsRow.appendChild(btnGroup)
  el.appendChild(controlsRow)

  function position(targetRect: DOMRect): void {
    const gap = 8
    const vw = window.innerWidth
    const vh = window.innerHeight
    const tw = el.offsetWidth || 300
    const th = el.offsetHeight || 80

    // Vertical center helper (for left/right placements)
    const vcTop = Math.max(
      8,
      Math.min(targetRect.top + targetRect.height / 2 - th / 2, vh - th - 8),
    )
    // Horizontal center helper (for above/below placements)
    const hcLeft = Math.max(
      8,
      Math.min(targetRect.left + targetRect.width / 2 - tw / 2, vw - tw - 8),
    )

    // Try placements: right → left → above → below
    const placements = [
      { top: vcTop, left: targetRect.right + gap },
      { top: vcTop, left: targetRect.left - tw - gap },
      { top: targetRect.top - th - gap, left: hcLeft },
      { top: targetRect.bottom + gap, left: hcLeft },
    ]

    let best = placements[0]!
    for (const p of placements) {
      if (p.left >= 8 && p.left + tw <= vw - 8 && p.top >= 8 && p.top + th <= vh - 8) {
        best = p
        break
      }
    }

    // Clamp
    best.top = Math.max(8, Math.min(best.top, vh - th - 8))
    best.left = Math.max(8, Math.min(best.left, vw - tw - 8))

    Object.assign(el.style, { top: `${best.top}px`, left: `${best.left}px` })
  }

  function destroy(): void {
    el.remove()
  }

  return { element: el, position, destroy }
}
