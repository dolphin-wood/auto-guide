import type { TargetInfo } from '@auto-guide/shared'
import { beforeEach, describe, expect, it } from 'vitest'
import { TargetManager } from '../relay/target-manager'

describe('TargetManager', () => {
  let manager: TargetManager

  beforeEach(() => {
    manager = new TargetManager()
  })

  describe('adding targets', () => {
    it('should add a target and retrieve it by targetId', () => {
      const target: TargetInfo = {
        targetId: 't1',
        type: 'page',
        title: 'Google',
        url: 'https://google.com',
        attached: true,
      }
      manager.addTarget('session-1', target)

      expect(manager.getTargetBySessionId('session-1')).toEqual(target)
    })

    it('should store the sessionId mapping for the target', () => {
      const target: TargetInfo = {
        targetId: 't1',
        type: 'page',
        title: 'Google',
        url: 'https://google.com',
        attached: true,
      }
      manager.addTarget('session-1', target)

      expect(manager.getSessionIdByTargetId('t1')).toBe('session-1')
    })
  })

  describe('removing targets', () => {
    it('should remove a target by sessionId', () => {
      const target: TargetInfo = {
        targetId: 't1',
        type: 'page',
        title: 'Google',
        url: 'https://google.com',
        attached: true,
      }
      manager.addTarget('session-1', target)
      manager.removeBySessionId('session-1')

      expect(manager.getTargetBySessionId('session-1')).toBeUndefined()
      expect(manager.getSessionIdByTargetId('t1')).toBeUndefined()
    })
  })

  describe('listing targets', () => {
    it('should return all page targets', () => {
      manager.addTarget('s1', {
        targetId: 't1',
        type: 'page',
        title: 'Page 1',
        url: 'https://a.com',
        attached: true,
      })
      manager.addTarget('s2', {
        targetId: 't2',
        type: 'page',
        title: 'Page 2',
        url: 'https://b.com',
        attached: true,
      })

      const targets = manager.getAllTargets()
      expect(targets).toHaveLength(2)
    })

    it('should return the first available sessionId', () => {
      manager.addTarget('s1', {
        targetId: 't1',
        type: 'page',
        title: 'Page',
        url: 'https://a.com',
        attached: true,
      })

      expect(manager.getFirstSessionId()).toBe('s1')
    })

    it('should return undefined when no targets exist', () => {
      expect(manager.getFirstSessionId()).toBeUndefined()
    })
  })

  describe('updating target info', () => {
    it('should update url and title for an existing target', () => {
      manager.addTarget('s1', {
        targetId: 't1',
        type: 'page',
        title: 'Old Title',
        url: 'https://old.com',
        attached: true,
      })

      manager.updateTarget('t1', { title: 'New Title', url: 'https://new.com' })

      const target = manager.getTargetBySessionId('s1')
      expect(target?.title).toBe('New Title')
      expect(target?.url).toBe('https://new.com')
    })
  })
})
