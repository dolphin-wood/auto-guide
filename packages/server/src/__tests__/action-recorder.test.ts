import { beforeEach, describe, expect, it } from 'vitest'
import { ActionRecorder } from '../agent/action-recorder'

describe('ActionRecorder', () => {
  let recorder: ActionRecorder

  beforeEach(() => {
    recorder = new ActionRecorder()
  })

  describe('recording browser actions', () => {
    it('should record a click action with ref and computed selector', () => {
      recorder.record({
        action: 'click',
        ref: 'e12',
        computedSelector: 'button.search-btn',
        elementInfo: { tag: 'button', role: 'button', text: 'Search' },
        url: 'https://example.com',
      })

      const log = recorder.getActionLog()
      expect(log).toHaveLength(1)
      expect(log[0]!.action).toBe('click')
      expect(log[0]!.ref).toBe('e12')
      expect(log[0]!.computedSelector).toBe('button.search-btn')
      expect(log[0]!.elementInfo?.text).toBe('Search')
    })

    it('should record a fill action with value param', () => {
      recorder.record({
        action: 'fill',
        ref: 'e5',
        computedSelector: 'input[name="origin"]',
        elementInfo: { tag: 'input', role: 'textbox', text: '' },
        params: { value: 'Tokyo' },
        url: 'https://flights.google.com',
      })

      const log = recorder.getActionLog()
      expect(log[0]!.params?.value).toBe('Tokyo')
    })

    it('should auto-assign timestamps in chronological order', () => {
      recorder.record({ action: 'click', ref: 'e1', url: 'https://example.com' })
      recorder.record({ action: 'click', ref: 'e2', url: 'https://example.com' })

      const log = recorder.getActionLog()
      expect(log[0]!.timestamp).toBeLessThanOrEqual(log[1]!.timestamp)
    })

    it('should record navigate actions without ref', () => {
      recorder.record({
        action: 'navigate',
        url: 'https://flights.google.com',
        params: { value: 'https://flights.google.com' },
      })

      const log = recorder.getActionLog()
      expect(log[0]!.action).toBe('navigate')
      expect(log[0]!.ref).toBeUndefined()
    })
  })

  describe('action log management', () => {
    it('should return an empty log initially', () => {
      expect(recorder.getActionLog()).toHaveLength(0)
    })

    it('should clear all recorded actions on reset', () => {
      recorder.record({ action: 'click', ref: 'e1', url: 'https://example.com' })
      recorder.record({ action: 'fill', ref: 'e2', url: 'https://example.com' })

      recorder.reset()
      expect(recorder.getActionLog()).toHaveLength(0)
    })

    it('should return a copy of the log (not a mutable reference)', () => {
      recorder.record({ action: 'click', ref: 'e1', url: 'https://example.com' })

      const log1 = recorder.getActionLog()
      const log2 = recorder.getActionLog()
      expect(log1).not.toBe(log2)
      expect(log1).toEqual(log2)
    })
  })
})
