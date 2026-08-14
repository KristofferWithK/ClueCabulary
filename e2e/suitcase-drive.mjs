// Kufferten, open on the table: the loose words of the city, the collected
// and wrapped compartments, sideways paging instead of scrolling, and the
// wrap-up button that moves words from one compartment to the other.
import { chromium } from 'playwright'
import { startPreview } from './preview-server.mjs'

const PORT = 4179
const preview = await startPreview(PORT)

const SHOT_DIR = process.env.SHOT_DIR ?? '.'
const BASE = preview.base

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium',
})
const page = await browser.newPage({ viewport: { width: 360, height: 640 } })
page.on('pageerror', (e) => console.log('PAGE CRASH:', e.message))

const fail = []
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) fail.push(name)
}

try {
  // 10 wrapped, 20 more collected, 5 discovered — every band populated.
  await page.goto(`${BASE}?mock=1&howto=0&city=0&wrapped=10&collected=30&almost=35`)
  await page.waitForSelector('.city-card')
  await page.click('.cluey-button')
  await page.waitForSelector('.suitcase-screen')
  await page.screenshot({ path: `${SHOT_DIR}/s1-suitcase.png` })

  // Three bands, each saying what it holds.
  const bandLabels = await page.locator('.case-band-label').allTextContents()
  // 65 undiscovered + 5 discovered: everything not yet in the case.
  check('the loose band counts its words', bandLabels.some((l) => /Loose.*70/.test(l)), bandLabels[0])
  check('the collected compartment counts 20', bandLabels.some((l) => /Collected — 20/.test(l)))
  check('the wrapped compartment counts 10', bandLabels.some((l) => /Wrapped — 10 of 100/.test(l)))

  // The loose band pages: undiscovered ? tiles and discovered words, 8 a page.
  const firstPage = await page.locator('.case-band').first().locator('.case-tile').count()
  check('the loose band shows one page of tiles', firstPage === 8, `${firstPage}`)
  const beforePage = await page
    .locator('.case-band')
    .first()
    .locator('.case-tile')
    .allTextContents()
  await page
    .locator('.case-band')
    .first()
    .locator('button[aria-label$="next page"]')
    .click()
  const afterPage = await page
    .locator('.case-band')
    .first()
    .locator('.case-tile')
    .allTextContents()
  check('the ›  leafs to different words', beforePage.join() !== afterPage.join())

  // A word tile opens the dictionary; a ? slot is not a button at all.
  await page.locator('.case-tile.case-collected').first().click()
  await page.waitForSelector('.sheet', { timeout: 4000 })
  check('a collected tile opens the dictionary', true)
  await page.click('.sheet .btn')
  const unknownButtons = await page.locator('button.case-unknown').count()
  check('undiscovered slots are not buttons', unknownButtons === 0, `${unknownButtons}`)

  // 30 in the pool: the wrap-up button is live, and launches the packing phase.
  const cta = page.locator('.case-actions .btn-primary')
  check('the wrap-up button is live at 30 collected', await cta.isEnabled())
  await cta.click()
  await page.waitForSelector('.packing-dock')
  check('and it opens a wrap-up round', true)
  await page.screenshot({ path: `${SHOT_DIR}/s2-wrapup-from-case.png` })

  // Below a boardful the button waits, and says what it is waiting for.
  await page.evaluate(() => localStorage.clear())
  await page.goto(`${BASE}?mock=1&howto=0&city=0&collected=10`)
  await page.waitForSelector('.city-card')
  await page.click('.cluey-button')
  await page.waitForSelector('.suitcase-screen')
  check(
    'below a boardful it waits',
    !(await page.locator('.case-actions .btn-primary').isEnabled()),
  )
  const hint = await page.locator('.case-hint').textContent()
  check('and says how many more to collect', /Collect 10 more/.test(hint ?? ''), hint ?? '')

  // Other cities are browsable; an unreached one keeps its words to itself.
  await page.locator('button[aria-label="Next city"]').click()
  await page.waitForTimeout(200)
  check('an unreached city shows only the promise', (await page.locator('.case-locked').count()) === 1)
  check('and offers no wrap-up button', (await page.locator('.case-actions .btn-primary').count()) === 0)
  await page.screenshot({ path: `${SHOT_DIR}/s3-locked-city.png` })

  console.log(fail.length ? `\nFAILED: ${fail.join(', ')}` : '\nSUITCASE DRIVE OK')
  if (fail.length) process.exitCode = 1
} catch (e) {
  await page.screenshot({ path: `${SHOT_DIR}/s9-failure.png` }).catch(() => {})
  console.log('SUITCASE DRIVE FAILED:', e.message)
  process.exitCode = 1
} finally {
  await browser.close()
  preview.stop()
}
