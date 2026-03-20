import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CDPCommandRouter } from '../relay/cdp-handlers'
import { TargetManager } from '../relay/target-manager'

describe('CDPCommandRouter', () => {
  let targetManager: TargetManager
  let router: CDPCommandRouter
  let forwardToExtension: ReturnType<typeof vi.fn>

  beforeEach(() => {
    targetManager = new TargetManager()
    forwardToExtension = vi.fn().mockResolvedValue({ result: {} })
    router = new CDPCommandRouter(targetManager, forwardToExtension)

    // Seed a target
    targetManager.addTarget('session-1', {
      targetId: 'target-1',
      type: 'page',
      title: 'Test Page',
      url: 'https://example.com',
      attached: true,
      browserContextId: 'ctx-1',
    })
  })

  describe('locally handled commands', () => {
    it('should handle Browser.getVersion locally', async () => {
      const result = await router.handle({
        id: 1,
        method: 'Browser.getVersion',
      })

      expect(result).toHaveProperty('result')
      expect(forwardToExtension).not.toHaveBeenCalled()
    })

    it('should handle Target.getTargets locally', async () => {
      const result = await router.handle({
        id: 2,
        method: 'Target.getTargets',
      })

      expect(result.result).toHaveProperty('targetInfos')
      expect(forwardToExtension).not.toHaveBeenCalled()
    })

    it('should handle Target.setAutoAttach locally (events come via extension channel)', async () => {
      const result = await router.handle({
        id: 3,
        method: 'Target.setAutoAttach',
        params: { autoAttach: true, waitForDebuggerOnStart: false },
      })

      // setAutoAttach returns {} — Target.attachedToTarget events come separately
      // through the extension's forwardCDPEvent channel
      expect(result.result).toEqual({})
    })
  })

  describe('forwarded commands', () => {
    it('should forward Page.navigate to extension via forwardCDPCommand', async () => {
      await router.handle({
        id: 4,
        method: 'Page.navigate',
        params: { url: 'https://example.com' },
        sessionId: 'session-1',
      })

      expect(forwardToExtension).toHaveBeenCalledWith('session-1', 'Page.navigate', {
        url: 'https://example.com',
      })
    })

    it('should forward Runtime.evaluate to extension', async () => {
      await router.handle({
        id: 5,
        method: 'Runtime.evaluate',
        params: { expression: 'document.title' },
        sessionId: 'session-1',
      })

      expect(forwardToExtension).toHaveBeenCalledWith('session-1', 'Runtime.evaluate', {
        expression: 'document.title',
      })
    })

    it('should resolve sessionId from first target if not provided', async () => {
      await router.handle({
        id: 6,
        method: 'Page.navigate',
        params: { url: 'https://example.com' },
      })

      expect(forwardToExtension).toHaveBeenCalledWith('session-1', 'Page.navigate', {
        url: 'https://example.com',
      })
    })
  })

  describe('Target.createTarget', () => {
    it('should forward createInitialTab to extension', async () => {
      forwardToExtension.mockResolvedValue({
        result: { targetId: 'new-target', sessionId: 'new-session' },
      })

      await router.handle({
        id: 7,
        method: 'Target.createTarget',
        params: { url: 'about:blank' },
      })

      expect(forwardToExtension).toHaveBeenCalled()
    })
  })
})
