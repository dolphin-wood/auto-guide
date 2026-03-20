import { describe, expect, it } from 'vitest'
import { ActionRecorder } from '../agent/action-recorder'
import { createBrowserMcpTools } from '../agent/browser-tools'

describe('Browser MCP tools', () => {
  function makeTools() {
    const recorder = new ActionRecorder()
    return createBrowserMcpTools({
      getPage: () => null,
      recorder,
      onGuideSubmitted: () => {},
    })
  }

  describe('tool definitions', () => {
    it('should define all required tools', () => {
      const tools = makeTools()
      const names = tools.map((t) => t.name)
      expect(names).toContain('page_snapshot')
      expect(names).toContain('page_click')
      expect(names).toContain('page_fill')
      expect(names).toContain('page_select')
      expect(names).toContain('get_action_log')
      expect(names).toContain('submit_guide')
      expect(names).not.toContain('page_navigate')
      expect(names).not.toContain('page_screenshot')
    })

    it('should have descriptions for all tools', () => {
      const tools = makeTools()
      for (const t of tools) {
        expect(t.description).toBeTruthy()
        expect(t.description.length).toBeGreaterThan(10)
      }
    })
  })
})
