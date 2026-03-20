import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AgentOrchestrator } from '../agent/orchestrator'

describe('AgentOrchestrator', () => {
  let orchestrator: AgentOrchestrator

  beforeEach(() => {
    orchestrator = new AgentOrchestrator('ws://localhost:3100/cdp')
  })

  describe('session lifecycle', () => {
    it('should start in idle state', () => {
      expect(orchestrator.getState()).toBe('idle')
    })

    it('should transition to running when generation starts', async () => {
      // Start but don't await (it runs the agent loop)
      const emitter = orchestrator.startGeneration('Book a flight', 'https://flights.google.com')
      expect(orchestrator.getState()).toBe('running')
      orchestrator.stop()
    })

    it('should transition back to idle after stop', async () => {
      orchestrator.startGeneration('Book a flight', 'https://flights.google.com')
      orchestrator.stop()
      // Allow microtask to settle
      await new Promise((r) => setTimeout(r, 50))
      expect(orchestrator.getState()).toBe('idle')
    })

    it('should emit events for streaming output', () => {
      const listener = vi.fn()
      orchestrator.on('message', listener)

      orchestrator.emit('message', { type: 'agent_text_delta', data: { text: 'Hello' } })

      expect(listener).toHaveBeenCalledWith({
        type: 'agent_text_delta',
        data: { text: 'Hello' },
      })
    })
  })

  describe('guide submission tracking', () => {
    it('should track whether a guide has been submitted', () => {
      expect(orchestrator.hasGuideBeenSubmitted()).toBe(false)
    })

    it('should mark guide as submitted when submit_guide tool is called', () => {
      orchestrator.markGuideSubmitted({
        id: 'g1',
        title: 'Test',
        description: 'Test guide',
        pages: [],
      })
      expect(orchestrator.hasGuideBeenSubmitted()).toBe(true)
    })

    it('should store the submitted guide', () => {
      const guide = {
        id: 'g1',
        title: 'Test',
        description: 'Test guide',
        pages: [],
      }
      orchestrator.markGuideSubmitted(guide)
      expect(orchestrator.getSubmittedGuide()).toEqual(guide)
    })

    it('should reset guide submission state on new generation', () => {
      orchestrator.markGuideSubmitted({
        id: 'g1',
        title: 'Test',
        description: 'Test guide',
        pages: [],
      })
      orchestrator.startGeneration('New journey', 'https://example.com')
      expect(orchestrator.hasGuideBeenSubmitted()).toBe(false)
      orchestrator.stop()
    })
  })
})
