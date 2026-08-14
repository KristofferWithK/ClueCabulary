// The collection: four word states — discovered, collected, wrapped, and the
// slots still to find — on Home and in the collection view.
import { chromium } from 'playwright'
import { startPreview } from './preview-server.mjs'

const PORT = 4179
const preview = await startPreview(PORT)

const SHOT_DIR = process.env.SHOT_DIR ?? '.'
const BASE = preview.base

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium',
})
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
page.on('pageerror', (e) => console.log('PAGE CRASH:', e.message))

try {
  // 10 words wrapped, the next 20 collected on top (?wrapped seeds the first
  // K, ?collected the first K — so 10 overlap and 20 are collected-only),
  // and 5 more one interaction short.
  await page.goto(`${BASE}?mock=1&howto=0&city=0&wrapped=10&collected=30&almost=35`)
  await page.waitForSelector('.city-card')
  await page.waitForSelector('.home-map')
  const count = await page.locator('.collect-count').textContent()
  console.log('home:', count?.replace(/\s+/g, ' ').trim())
  if (!count?.includes('10 wrapped')) throw new Error('home did not show 10 wrapped')
  if (!count?.includes('20 collected')) throw new Error('home did not show 20 collected')
  await page.screenshot({ path: `${SHOT_DIR}/c1-home.png` })

  // The collection view: all four states rendered as distinct slots.
  await page.click('.btn:has-text("Kufferten")')
  await page.waitForSelector('.word-dex')
  const wrapped = await page.locator('.dex-wrapped').count()
  const collected = await page.locator('.dex-collected').count()
  const discovered = await page.locator('.dex-discovered').count()
  const unknown = await page.locator('.dex-unknown').count()
  console.log(`dex: ${wrapped} wrapped, ${collected} collected, ${discovered} discovered, ${unknown} to find`)
  if (wrapped !== 10) throw new Error(`expected 10 wrapped slots, saw ${wrapped}`)
  if (collected !== 20) throw new Error(`expected 20 collected slots, saw ${collected}`)
  if (discovered !== 5) throw new Error(`expected 5 discovered slots, saw ${discovered}`)
  if (unknown !== 65) throw new Error(`expected 65 empty slots, saw ${unknown}`)
  await page.screenshot({ path: `${SHOT_DIR}/c2-collection.png` })

  // A real word tile opens the dictionary sheet; a ? slot is not a button.
  await page.locator('.dex-collected').first().click()
  await page.waitForSelector('.sheet', { timeout: 4000 })
  console.log('a collected tile opens the dictionary')
  await page.click('.sheet .btn')
  await page.screenshot({ path: `${SHOT_DIR}/c3-sheet.png` })

  // The wrapped ledger survives a reload — it is the permanent record.
  await page.reload()
  await page.waitForSelector('.city-card')
  const state = await page.evaluate(
    () => JSON.parse(localStorage.getItem('cluecab-journey-v2') ?? '{}').state,
  )
  if (Object.keys(state.wrapped ?? {}).length !== 10) {
    throw new Error(`the wrapped ledger did not survive a reload: ${JSON.stringify(state.wrapped)}`)
  }
  console.log('the wrapped ledger survives a reload')

  console.log('COLLECTION DRIVE OK')
} catch (e) {
  await page.screenshot({ path: `${SHOT_DIR}/c9-failure.png` }).catch(() => {})
  console.log('COLLECTION DRIVE FAILED:', e.message)
  process.exitCode = 1
} finally {
  await browser.close()
  preview.stop()
}
