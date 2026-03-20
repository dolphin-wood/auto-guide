import { chromium } from 'playwright'

const CDP_ENDPOINT = process.env.CDP_ENDPOINT ?? 'ws://localhost:3100/cdp'

async function main() {
  console.log(`Connecting to ${CDP_ENDPOINT}...`)
  const browser = await chromium.connectOverCDP(CDP_ENDPOINT)
  console.log('Connected.')

  const contexts = browser.contexts()
  console.log(`Contexts: ${contexts.length}`)
  if (contexts.length === 0 || contexts[0]!.pages().length === 0) {
    console.log('No pages found.')
    await browser.close()
    return
  }

  const page = contexts[0]!.pages()[0]!
  console.log(`Page URL: ${page.url()}`)
  console.log(`Page closed: ${page.isClosed()}`)

  // Test 1: snapshotForAI
  console.log('\n--- Test _snapshotForAI ---')
  try {
    const t0 = Date.now()
    const snap = page as unknown as { _snapshotForAI: () => Promise<{ full: string }> }
    const result = await snap._snapshotForAI()
    console.log(`OK in ${Date.now() - t0}ms, length=${result.full.length}`)
  } catch (err) {
    console.log(`FAILED: ${err}`)
  }

  // Test 2: screenshot
  console.log('\n--- Test page.screenshot ---')
  try {
    const t1 = Date.now()
    const buf = await page.screenshot({ type: 'jpeg', quality: 50 })
    console.log(`OK in ${Date.now() - t1}ms, size=${buf.length}`)
  } catch (err) {
    console.log(`FAILED: ${err}`)
  }

  await browser.close()
  console.log('\nDone.')
}

main().catch(console.error)
