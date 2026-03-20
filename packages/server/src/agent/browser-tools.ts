import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tool } from '@anthropic-ai/claude-agent-sdk'
import type { Guide } from '@auto-guide/shared'
import type { Page } from 'playwright'
import { z } from 'zod'
import type { ActionRecorder } from './action-recorder.js'
import { validateGuide } from './guide-validation.js'
import { FINDER_INJECT_SCRIPT } from './scripts/finder-inject.js'

const SNAPSHOT_DIR = join(process.cwd(), 'tmp', 'snapshots')

declare global {
  interface Window {
    __autoGuideFinder: (el: Element) => string
    __agMutationCount?: number
    __agMutationObserver?: MutationObserver
  }
}

export interface BrowserToolsContext {
  getPage: () => Page | null
  recorder: ActionRecorder
  onGuideSubmitted: (guide: Guide) => void
}

export function createBrowserMcpTools(ctx: BrowserToolsContext) {
  mkdirSync(SNAPSHOT_DIR, { recursive: true })

  return [
    tool(
      'page_snapshot',
      'Get the a11y snapshot of the current page. Writes to a file and returns the path. Use Grep to search it for interactive elements. Contains refs like [ref=e5] for page_click/page_fill. Also returns a screenshot.',
      {},
      async () => {
        const page = ctx.getPage()
        if (!page) return text('No browser page connected')
        try {
          const snapshotPage = page as unknown as {
            _snapshotForAI: () => Promise<{ full: string }>
          }
          const result = await snapshotPage._snapshotForAI()
          const snapshot = result.full
          const snapshotFile = join(SNAPSHOT_DIR, `snapshot-${Date.now()}.yaml`)
          writeFileSync(snapshotFile, snapshot, 'utf-8')
          const lines = snapshot.split('\n').length

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const content: any[] = [
            {
              type: 'text',
              text:
                `URL: ${page.url()}\n` +
                `Snapshot: ${snapshotFile} (${lines} lines)\n\n` +
                `Use Grep to search. Example: Grep pattern="button|textbox|combobox" path="${snapshotFile}"`,
            },
          ]

          try {
            const buffer = await page.screenshot({ type: 'jpeg', quality: 50 })
            content.push({ type: 'image', data: buffer.toString('base64'), mimeType: 'image/jpeg' })
          } catch {
            // Screenshot failed, continue with text only
          }

          return { content } as never
        } catch (err) {
          return text(`Snapshot failed: ${err}`)
        }
      },
    ),

    tool(
      'page_click',
      'Click an element by its a11y ref. Provide a description of the action for the guide.',
      {
        ref: z.string().describe('The a11y ref, e.g. "e5"'),
        description: z
          .string()
          .describe('What this click does, e.g. "Click the Round trip dropdown"'),
        guide_target_ref: z
          .string()
          .optional()
          .describe('If clicking inside a widget, set to the widget container ref'),
      },
      async (args) => {
        const page = ctx.getPage()
        if (!page) return text('No browser page connected')
        const locator = page.locator(`aria-ref=${args.ref}`)

        const preSelector = await computeSelector(page, locator)

        const changes = await detectDomChanges(page, () => locator.click())

        const [postSelector, guideTargetSelector] = await Promise.all([
          computeSelector(page, locator),
          args.guide_target_ref && args.guide_target_ref !== args.ref
            ? computeSelector(page, page.locator(`aria-ref=${args.guide_target_ref}`))
            : Promise.resolve(undefined),
        ])

        ctx.recorder.record({
          action: 'click',
          ref: args.ref,
          computedSelector: preSelector,
          postSelector: postSelector !== preSelector ? postSelector : undefined,
          guideTargetRef: args.guide_target_ref,
          guideTargetSelector,
          description: args.description,
          url: page.url(),
        })

        let msg = `Clicked: ${args.description}`
        if (changes.urlChanged)
          msg += '\nPage navigated to a new URL. Call page_snapshot to see the new page.'
        else if (changes.domChanged)
          msg += '\nSignificant DOM changes detected. Consider calling page_snapshot.'
        return text(msg)
      },
    ),

    tool(
      'page_fill',
      'Fill a text input by its a11y ref. Clears existing text first.',
      {
        ref: z.string().describe('The a11y ref of the input'),
        value: z.string().describe('The text to fill'),
        description: z.string().describe('What this fill does, e.g. "Enter Tokyo as origin"'),
        guide_target_ref: z
          .string()
          .optional()
          .describe('If filling inside a widget, set to the widget container ref'),
      },
      async (args) => {
        const page = ctx.getPage()
        if (!page) return text('No browser page connected')
        const locator = page.locator(`aria-ref=${args.ref}`)

        const preSelector = await computeSelector(page, locator)

        const changes = await detectDomChanges(page, () => locator.fill(args.value))

        const [postSelector, guideTargetSelector] = await Promise.all([
          computeSelector(page, locator),
          args.guide_target_ref && args.guide_target_ref !== args.ref
            ? computeSelector(page, page.locator(`aria-ref=${args.guide_target_ref}`))
            : Promise.resolve(undefined),
        ])

        ctx.recorder.record({
          action: 'fill',
          ref: args.ref,
          computedSelector: preSelector,
          postSelector: postSelector !== preSelector ? postSelector : undefined,
          guideTargetRef: args.guide_target_ref,
          guideTargetSelector,
          description: args.description,
          params: { value: args.value },
          url: page.url(),
        })

        let msg = `Filled: ${args.description}`
        if (changes.domChanged)
          msg +=
            '\nSignificant DOM changes detected (e.g. autocomplete suggestions). Consider calling page_snapshot.'
        return text(msg)
      },
    ),

    tool(
      'page_select',
      'Select an option from a dropdown by its a11y ref.',
      {
        ref: z.string().describe('The a11y ref of the select element'),
        value: z.string().describe('The value to select'),
        description: z.string().describe('What this selection does, e.g. "Select one-way trip"'),
        guide_target_ref: z
          .string()
          .optional()
          .describe('If selecting inside a widget, set to the widget container ref'),
      },
      async (args) => {
        const page = ctx.getPage()
        if (!page) return text('No browser page connected')
        const locator = page.locator(`aria-ref=${args.ref}`)

        const preSelector = await computeSelector(page, locator)

        const changes = await detectDomChanges(page, () => locator.selectOption(args.value))

        const [postSelector, guideTargetSelector] = await Promise.all([
          computeSelector(page, locator),
          args.guide_target_ref && args.guide_target_ref !== args.ref
            ? computeSelector(page, page.locator(`aria-ref=${args.guide_target_ref}`))
            : Promise.resolve(undefined),
        ])

        ctx.recorder.record({
          action: 'select',
          ref: args.ref,
          computedSelector: preSelector,
          postSelector: postSelector !== preSelector ? postSelector : undefined,
          guideTargetRef: args.guide_target_ref,
          guideTargetSelector,
          description: args.description,
          params: { value: args.value },
          url: page.url(),
        })

        let msg = `Selected: ${args.description}`
        if (changes.domChanged)
          msg += '\nSignificant DOM changes detected. Consider calling page_snapshot.'
        return text(msg)
      },
    ),

    tool(
      'compute_selector',
      'Compute a CSS selector for an element without performing any action. Use this for elements you cannot click (e.g. purchase/submit buttons that would trigger irreversible actions) but still need in the guide.',
      {
        ref: z.string().describe('The a11y ref, e.g. "e5"'),
        description: z.string().describe('What this element is, e.g. "Purchase button"'),
      },
      async (args) => {
        const page = ctx.getPage()
        if (!page) return text('No browser page connected')
        const locator = page.locator(`aria-ref=${args.ref}`)
        const selector = await computeSelector(page, locator)

        ctx.recorder.record({
          action: 'compute',
          ref: args.ref,
          computedSelector: selector,
          description: args.description,
          url: page.url(),
        })
        return text(`Selector for "${args.description}": ${selector}`)
      },
    ),

    tool(
      'get_action_log',
      'Get the recorded action log. Call after completing the journey to compose the guide.',
      {},
      async () => {
        const log = ctx.recorder.getActionLog()
        return text(JSON.stringify(log, null, 2))
      },
    ),

    tool(
      'submit_guide',
      'Submit the final Guide JSON string. Must include pages with steps and substeps.',
      {
        guide: z.string().describe('The complete Guide as a JSON string'),
      },
      async (args) => {
        let guide: Guide
        try {
          guide = JSON.parse(args.guide) as Guide
        } catch {
          return text('Invalid JSON. Please provide valid Guide JSON.')
        }
        const validation = validateGuide(guide)
        if (!validation.valid) {
          return text(
            `Validation failed:\n${validation.errors.join('\n')}\n\nPlease fix and resubmit.`,
          )
        }
        ctx.onGuideSubmitted(guide)
        return text(`Guide "${guide.title}" submitted (${guide.pages.length} pages)`)
      },
    ),
  ]
}

function text(t: string) {
  return { content: [{ type: 'text' as const, text: t }] }
}

const finderInjectedPages = new WeakSet<Page>()

async function ensureFinderInjected(page: Page): Promise<void> {
  if (finderInjectedPages.has(page)) return
  await page.addInitScript(FINDER_INJECT_SCRIPT)
  // Also evaluate immediately for current page
  await page.evaluate(FINDER_INJECT_SCRIPT).catch(() => {})
  finderInjectedPages.add(page)
}

async function computeSelector(page: Page, locator: import('playwright').Locator): Promise<string> {
  await ensureFinderInjected(page)
  try {
    const handle = await locator.elementHandle({ timeout: 2000 })
    if (!handle) return 'unknown'
    return await page.evaluate((el) => {
      if (window.__autoGuideFinder) return window.__autoGuideFinder(el)
      if (el.id) return `#${el.id}`
      return el.tagName.toLowerCase()
    }, handle)
  } catch {
    return 'unknown'
  }
}

/**
 * Detect significant DOM changes after an action.
 * Returns a hint string if changes were detected, empty string otherwise.
 */
async function detectDomChanges(
  page: Page,
  action: () => Promise<unknown>,
): Promise<{ urlChanged: boolean; domChanged: boolean }> {
  const urlBefore = page.url()

  await page.evaluate(() => {
    window.__agMutationCount = 0
    const observer = new MutationObserver((mutations) => {
      let count = 0
      for (const m of mutations) {
        count += m.addedNodes.length + m.removedNodes.length
      }
      window.__agMutationCount! += count
    })
    observer.observe(document.body, { childList: true, subtree: true })
    window.__agMutationObserver = observer
  })

  await action()

  // Wait briefly for DOM to settle
  await page.waitForTimeout(500)

  // Collect results and disconnect
  const mutationCount = await page
    .evaluate(() => {
      window.__agMutationObserver?.disconnect()
      delete window.__agMutationObserver
      const count = window.__agMutationCount ?? 0
      delete window.__agMutationCount
      return count
    })
    .catch(() => 0)

  const urlAfter = page.url()

  return {
    urlChanged: urlAfter !== urlBefore,
    domChanged: mutationCount > 10,
  }
}
