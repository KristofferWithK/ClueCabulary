// A saved game, mid-round, for the iOS simulator to boot straight into.
//
// The simulator can install and photograph an app but not tap one, and every
// attempt to automate a touch on a CI runner cost more than it returned. It
// does not have to: the app keeps its whole state in localStorage, so a round
// can be played here, in a browser, and the result handed to the phone as a
// starting position.
//
//   CHROMIUM_PATH=... node scripts/make-sim-seed.mjs
//
// Writes ios/sim-seed.json, which .github/workflows/ios-sim.yml injects.
import { chromium } from 'playwright'
import { writeFileSync } from 'node:fs'
import { setTimeout as sleep } from 'node:timers/promises'
import { startPreview } from '../e2e/preview-server.mjs'

const preview = await startPreview(4327)
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH })
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })

// A fixed seed, so the board in every screenshot is the same board and a
// difference between two of them is a difference in the app.
await page.goto(`${preview.base}?mock=1&howto=0&seed=7&first=player`, { waitUntil: 'networkidle' })
await page.locator('.home-play').click()
await page.waitForSelector('.board-grid')
const study = page.locator('.study-dock .btn-primary')
if (await study.isVisible().catch(() => false)) await study.click()
await sleep(500)

const seed = await page.evaluate(() => {
  const out = {}
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)
    if (k?.startsWith('cluecab-')) out[k] = localStorage.getItem(k)
  }
  return out
})

writeFileSync(new URL('../ios/sim-seed.json', import.meta.url), JSON.stringify(seed, null, 2))
console.log(`seeded ${Object.keys(seed).length} keys, board is in the clue phase`)

await browser.close()
preview.stop()
