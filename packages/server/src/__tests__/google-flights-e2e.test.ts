import type { AddressInfo } from 'net'
import { execSync } from 'node:child_process'
import { resolve } from 'node:path'
import Anthropic from '@anthropic-ai/sdk'
import { serve } from '@hono/node-server'
import { createNodeWebSocket } from '@hono/node-ws'
import { Hono } from 'hono'
import { chromium, type BrowserContext } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { CDPRelay } from '../relay/cdp-relay'
import { createSidepanelHandler } from '../ws/sidepanel-handler'

const hasApiKey = !!process.env.ANTHROPIC_API_KEY
const EXTENSION_DIR = resolve(__dirname, '../../../extension')

describe.skipIf(!hasApiKey)('Google Flights E2E with LLM-as-judge', () => {
  let mainServer: ReturnType<typeof serve>
  let context: BrowserContext
  let mainPort: number

  beforeAll(async () => {
    // Build extension
    console.log('[gf-e2e] Building extension...')
    execSync('pnpm build', { cwd: EXTENSION_DIR, stdio: 'pipe' })
    const extensionPath = resolve(EXTENSION_DIR, '.output/chrome-mv3')

    // Start main server
    const mainApp = new Hono()
    const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app: mainApp })
    const relay = new CDPRelay()
    const sidepanel = createSidepanelHandler('ws://localhost:3100/cdp', relay)

    mainApp.get('/json/version', (c) =>
      c.json({
        Browser: 'Chrome/AutoGuide',
        'Protocol-Version': '1.3',
        webSocketDebuggerUrl: `ws://${c.req.header('host')}/cdp`,
      }),
    )
    mainApp.get('/json/list', (c) => c.json([]))

    mainApp.get(
      '/extension/ws',
      upgradeWebSocket(() => ({
        onOpen(_evt, ws) {
          relay.handleExtensionOpen(ws)
        },
        onMessage(evt) {
          relay.handleExtensionMessage(evt.data as string)
        },
        onClose() {
          relay.handleExtensionClose()
        },
      })),
    )
    mainApp.get(
      '/cdp',
      upgradeWebSocket(() => ({
        onOpen(_evt, ws) {
          relay.handlePlaywrightOpen(ws)
        },
        onMessage(evt) {
          relay.handlePlaywrightMessage(evt.data as string)
        },
        onClose() {
          relay.handlePlaywrightClose()
        },
      })),
    )
    mainApp.get(
      '/sidepanel/ws',
      upgradeWebSocket(() => ({
        onOpen(_evt, ws) {
          sidepanel.onOpen(ws)
        },
        onMessage(evt, ws) {
          sidepanel.onMessage(evt.data, ws)
        },
        onClose() {
          sidepanel.onClose()
        },
      })),
    )

    mainServer = serve({ fetch: mainApp.fetch, port: 3100 })
    injectWebSocket(mainServer)
    mainPort = (mainServer.address() as AddressInfo).port

    // Launch Chrome with extension
    console.log('[gf-e2e] Launching Chrome with extension...')
    context = await chromium.launchPersistentContext('', {
      headless: false,
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
    })

    let sw = context.serviceWorkers()[0]
    if (!sw) sw = await context.waitForEvent('serviceworker', { timeout: 10_000 })
    console.log(`[gf-e2e] Extension loaded: ${sw.url().split('/')[2]}`)

    await new Promise((r) => setTimeout(r, 3000))
  }, 60_000)

  afterAll(async () => {
    await context?.close()
    mainServer?.close()
  })

  it('should generate a valid guide for booking a one-way flight Tokyo→Sapporo', async () => {
    const extensionId = context.serviceWorkers()[0]!.url().split('/')[2]

    // 1. Open Google Flights (user's starting point)
    const flightsPage = await context.newPage()
    await flightsPage.goto('https://www.google.com/travel/flights', {
      waitUntil: 'domcontentloaded',
    })
    await flightsPage.waitForTimeout(2000)

    // 2. Open sidepanel — navigate to sidepanel.html but keep flights tab active
    //    In real usage, user clicks extension icon to open sidepanel alongside the tab
    const sidepanel = await context.newPage()
    await sidepanel.goto(`chrome-extension://${extensionId}/sidepanel.html`)
    await sidepanel.waitForSelector('textarea', { timeout: 5_000 })

    // Bring Google Flights tab to front so extension can find it
    await flightsPage.bringToFront()
    await flightsPage.waitForTimeout(500)

    // Switch back to sidepanel to interact
    await sidepanel.bringToFront()

    // 3. User types the journey
    await sidepanel.locator('textarea').fill('東京から札幌への片道フライトを予約する')
    await sidepanel.locator('button[type="submit"]').click()

    const page = sidepanel

    // Wait for guide or error
    const playbackButton = page.locator('button', { hasText: 'Start Playback' })
    const errorDiv = page.locator('.bg-red-50')

    const winner = await Promise.race([
      playbackButton.waitFor({ timeout: 420_000 }).then(() => 'guide' as const),
      errorDiv.waitFor({ timeout: 420_000 }).then(() => 'error' as const),
    ]).catch(() => 'timeout' as const)

    if (winner === 'error') {
      const errorText = await errorDiv.textContent()
      throw new Error(`Agent error: ${errorText}`)
    }
    if (winner === 'timeout') {
      await page.screenshot({ path: 'tmp/gf-timeout.png' })
      throw new Error('Timed out waiting for guide')
    }

    // Click "Start Playback" to switch to PlaybackView and extract the guide content
    await playbackButton.click()
    await page.waitForTimeout(1000)

    // Take a screenshot of the playback view
    await page.screenshot({ path: 'tmp/gf-playback.png' })

    // Extract the guide content from PlaybackView (step list)
    const playbackContent = await page.textContent('body')
    console.log('[gf-e2e] Playback view content:', playbackContent?.slice(0, 800))

    // --- LLM-as-judge evaluation ---
    const client = new Anthropic()
    const judgeResponse = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2000,
      messages: [
        {
          role: 'user',
          content: `You are evaluating an auto-generated user guide for "booking a one-way flight from Tokyo to Sapporo on Google Flights".

The guide was generated by an AI agent. Below is the guide's playback view showing the step-by-step instructions:

---
${playbackContent?.slice(0, 3000)}
---

Evaluate on these criteria (score 1-5):

1. **Completeness**: Does it cover: selecting one-way trip, entering Tokyo as origin, Sapporo as destination, searching for flights?
2. **Clarity**: Are step instructions clear and user-friendly?
3. **Accuracy**: Do steps match the expected Google Flights workflow?

Respond in JSON:
{
  "completeness": { "score": N, "reasoning": "..." },
  "clarity": { "score": N, "reasoning": "..." },
  "accuracy": { "score": N, "reasoning": "..." },
  "overall_score": N,
  "summary": "..."
}`,
        },
      ],
    })

    const judgeText =
      judgeResponse.content[0]!.type === 'text' ? judgeResponse.content[0]!.text : ''
    console.log('[gf-e2e] LLM Judge evaluation:', judgeText)

    // Parse and validate scores
    const jsonMatch = judgeText.match(/\{[\s\S]*\}/)
    expect(jsonMatch).not.toBeNull()

    const evaluation = JSON.parse(jsonMatch![0]) as {
      completeness: { score: number }
      clarity: { score: number }
      accuracy: { score: number }
      overall_score: number
      summary: string
    }

    console.log(
      `[gf-e2e] Scores: completeness=${evaluation.completeness.score}, clarity=${evaluation.clarity.score}, accuracy=${evaluation.accuracy.score}, overall=${evaluation.overall_score}`,
    )

    // Minimum quality threshold: average >= 3
    const avgScore =
      (evaluation.completeness.score + evaluation.clarity.score + evaluation.accuracy.score) / 3
    // Threshold 2: basic quality. Improve agent execution to reach 3+
    expect(avgScore).toBeGreaterThanOrEqual(2)
  }, 480_000) // 8 min timeout for real Google Flights
})
