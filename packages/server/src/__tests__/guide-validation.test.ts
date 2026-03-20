import type { Guide } from '@auto-guide/shared'
import { describe, expect, it } from 'vitest'
import { validateGuide } from '../agent/guide-validation'

describe('Guide validation', () => {
  const validGuide: Guide = {
    id: 'guide-1',
    title: 'Test Guide',
    description: 'A test guide',
    pages: [
      {
        urlPattern: 'https://example.com/*',
        title: 'Example Page',
        steps: [
          {
            id: 'step-1',
            instruction: 'Click the button',
            substeps: [
              {
                targetSelector: 'button.submit',
                hint: 'Click the submit button',
              },
            ],
          },
        ],
      },
    ],
  }

  it('should accept a valid guide', () => {
    const result = validateGuide(validGuide)
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('should reject a guide with no pages', () => {
    const guide: Guide = { ...validGuide, pages: [] }
    const result = validateGuide(guide)
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('Guide must have at least one page')
  })

  it('should reject a page with no steps', () => {
    const guide: Guide = {
      ...validGuide,
      pages: [{ urlPattern: 'https://example.com', title: 'Empty', steps: [] }],
    }
    const result = validateGuide(guide)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('at least one step'))).toBe(true)
  })

  it('should reject a step with no substeps', () => {
    const guide: Guide = {
      ...validGuide,
      pages: [
        {
          urlPattern: 'https://example.com',
          title: 'Page',
          steps: [{ id: 's1', instruction: 'Do something', substeps: [] }],
        },
      ],
    }
    const result = validateGuide(guide)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('at least one substep'))).toBe(true)
  })

  it('should reject a substep with empty targetSelector', () => {
    const guide: Guide = {
      ...validGuide,
      pages: [
        {
          urlPattern: 'https://example.com',
          title: 'Page',
          steps: [
            {
              id: 's1',
              instruction: 'Do something',
              substeps: [
                {
                  targetSelector: '',
                  hint: 'Click',
                },
              ],
            },
          ],
        },
      ],
    }
    const result = validateGuide(guide)
    expect(result.valid).toBe(false)
    expect(result.errors.some((e) => e.includes('targetSelector'))).toBe(true)
  })

  it('should collect multiple errors at once', () => {
    const guide: Guide = {
      ...validGuide,
      pages: [
        { urlPattern: '', title: '', steps: [] },
        {
          urlPattern: 'https://example.com',
          title: 'Page',
          steps: [{ id: '', instruction: '', substeps: [] }],
        },
      ],
    }
    const result = validateGuide(guide)
    expect(result.valid).toBe(false)
    expect(result.errors.length).toBeGreaterThan(1)
  })
})
