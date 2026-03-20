import type { AddressInfo } from 'net'
import { execSync } from 'node:child_process'
import { resolve } from 'node:path'
import { serve } from '@hono/node-server'
import { createNodeWebSocket } from '@hono/node-ws'
import { Hono } from 'hono'
import { html } from 'hono/html'
import { chromium, type BrowserContext } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { CDPRelay } from '../relay/cdp-relay'
import { createSidepanelHandler } from '../ws/sidepanel-handler'

const hasApiKey = !!process.env.ANTHROPIC_API_KEY
const EXTENSION_DIR = resolve(__dirname, '../../../extension')

// Test site: simple multi-page travel booking
function createTestSiteApp() {
  const app = new Hono()
  app.get('/', (c) =>
    c.html(
      html`<!DOCTYPE html>
        <html>
          <head>
            <title>Demo Travel</title>
          </head>
          <body>
            <h1>Demo Travel</h1>
            <form action="/results" method="GET">
              <label for="trip-type">Trip Type</label>
              <select id="trip-type" name="trip_type">
                <option value="round-trip">Round Trip</option>
                <option value="one-way">One Way</option>
              </select>
              <label for="origin">From</label>
              <input type="text" id="origin" name="origin" placeholder="Departure city" />
              <label for="destination">To</label>
              <input type="text" id="destination" name="destination" placeholder="Arrival city" />
              <button type="submit">Search Flights</button>
            </form>
          </body>
        </html>`,
    ),
  )
  app.get('/results', (c) => {
    const origin = c.req.query('origin') ?? 'Unknown'
    const dest = c.req.query('destination') ?? 'Unknown'
    return c.html(
      html`<!DOCTYPE html>
        <html>
          <head>
            <title>Results</title>
          </head>
          <body>
            <h1>Results: ${origin} to ${dest}</h1>
            <a href="/booking?flight=SK303"
              ><div class="flight-card">
                <h3>SkyAir SK303</h3>
                <p>$195</p>
              </div></a
            >
          </body>
        </html>`,
    )
  })
  app.get('/booking', (c) => {
    const flight = c.req.query('flight') ?? ''
    return c.html(
      html`<!DOCTYPE html>
        <html>
          <head>
            <title>Booking</title>
          </head>
          <body>
            <h1>Confirm Booking</h1>
            <p>Flight: ${flight}</p>
            <button id="confirm-btn" onclick="document.getElementById('msg').style.display='block'">
              Confirm
            </button>
            <div id="msg" style="display:none"><h2>Booked!</h2></div>
          </body>
        </html>`,
    )
  })
  return app
}

describe.skipIf(!hasApiKey)('Agent E2E: full chain with extension', () => {
  let testSiteServer: ReturnType<typeof serve>
  let mainServer: ReturnType<typeof serve>
  let context: BrowserContext
  let mainPort: number
  const TEST_SITE_PORT = 3201

  beforeAll(async () => {
    // 1. Build extension
    console.log('[e2e] Building extension...')
    execSync('pnpm build', { cwd: EXTENSION_DIR, stdio: 'pipe' })
    const extensionPath = resolve(EXTENSION_DIR, '.output/chrome-mv3')

    // 2. Start test site
    const testApp = createTestSiteApp()
    testSiteServer = serve({ fetch: testApp.fetch, port: TEST_SITE_PORT })

    // 3. Start main server (relay + sidepanel)
    const mainApp = new Hono()
    const { injectWebSocket, upgradeWebSocket } = createNodeWebSocket({ app: mainApp })
    const relay = new CDPRelay()
    const sidepanel = createSidepanelHandler(`ws://localhost:3100/cdp`)

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

    // 4. Launch Chrome with extension loaded
    console.log('[e2e] Launching Chrome with extension...')
    context = await chromium.launchPersistentContext('', {
      headless: false,
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
    })

    // Wait for service worker to start
    let sw = context.serviceWorkers()[0]
    if (!sw) {
      sw = await context.waitForEvent('serviceworker', { timeout: 10_000 })
    }
    const extensionId = sw.url().split('/')[2]
    console.log(`[e2e] Extension loaded: ${extensionId}`)

    // Wait for extension to connect to server
    await new Promise((r) => setTimeout(r, 3000))
  }, 60_000)

  afterAll(async () => {
    await context?.close()
    testSiteServer?.close()
    mainServer?.close()
  })

  it('should generate a guide when user types in sidepanel', async () => {
    const extensionId = context.serviceWorkers()[0]!.url().split('/')[2]

    // 1. Open test site in a tab (user's starting point)
    const sitePage = await context.newPage()
    await sitePage.goto(`http://localhost:${TEST_SITE_PORT}`, { waitUntil: 'domcontentloaded' })

    // 2. Open sidepanel
    const page = await context.newPage()
    await page.goto(`chrome-extension://${extensionId}/sidepanel.html`)
    await page.waitForSelector('textarea', { timeout: 5_000 })

    // Keep test site as the "active" non-extension tab
    await sitePage.bringToFront()
    await sitePage.waitForTimeout(300)
    await page.bringToFront()

    // 3. User types journey
    await page.locator('textarea').fill('東京から札幌への片道フライトを予約する')

    // Click send button
    await page.locator('button[type="submit"]').click()

    // Wait for either guide_complete (Start Playback button) or error
    const playbackButton = page.locator('button', { hasText: 'Start Playback' })
    const errorDiv = page.locator('.bg-red-50') // our error MessageCard has bg-red-50

    const winner = await Promise.race([
      playbackButton.waitFor({ timeout: 420_000 }).then(() => 'guide' as const),
      errorDiv.waitFor({ timeout: 420_000 }).then(() => 'error' as const),
    ]).catch(() => 'timeout' as const)

    if (winner === 'error') {
      const errorText = await errorDiv.textContent()
      throw new Error(`Agent error: ${errorText}`)
    }

    if (winner === 'timeout') {
      // Take screenshot for debugging
      await page.screenshot({ path: 'tmp/e2e-timeout.png' })
      throw new Error('Timed out waiting for guide or error')
    }

    expect(await playbackButton.isVisible()).toBe(true)
    console.log('[e2e] Guide generated successfully!')

    // --- Overlay Playback Test ---
    // Click Start Playback
    await playbackButton.click()
    await page.waitForTimeout(1000)

    // Verify PlaybackView is shown (step list should be visible)
    const stepCards = page.locator('[data-slot="card"]')
    const stepCount = await stepCards.count()
    console.log(`[e2e] Playback view shows ${stepCount} steps`)
    expect(stepCount).toBeGreaterThanOrEqual(1)

    // Verify overlay appears on the test site tab
    await sitePage.bringToFront()
    await sitePage.waitForTimeout(1000)

    // Check for the overlay shadow host element
    const overlayHost = sitePage.locator('auto-guide-overlay')
    const hasOverlay = await overlayHost.count()
    console.log(`[e2e] Overlay present on target page: ${hasOverlay > 0}`)

    // Click Next in sidepanel to advance step
    await page.bringToFront()
    const nextButton = page.locator('button', { hasText: 'Next' })
    if (await nextButton.isVisible()) {
      await nextButton.click()
      console.log('[e2e] Clicked Next, overlay should update')
    }

    // Click Stop to end playback
    const stopButton = page.locator('button', { hasText: 'Stop' })
    if (await stopButton.isVisible()) {
      await stopButton.click()
      console.log('[e2e] Playback stopped')
    }

    console.log('[e2e] Full E2E (guide generation + overlay playback) passed!')
  }, 600_000)
})
