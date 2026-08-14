// Drives the journey: home → a packed suitcase opens the road → travel to the
// next city unlocks its 100 words.
//
// TEMPORARILY REDUCED: the suitcase is packed by dev switch (?wrapped=100)
// rather than by playing a wrap-up round, because the wrap-up mode lands in
// the next change. The full loop — collect → wrap in play → travel — returns
// with it.
import { chromium } from 'playwright'
import { startPreview } from './preview-server.mjs'

const PORT = 4177
const preview = await startPreview(PORT)

const SHOT_DIR = process.env.SHOT_DIR ?? '.'
const BASE = preview.base

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium',
})
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
page.on('pageerror', (e) => console.log('PAGE CRASH:', e.message))

const journeyState = () =>
  page.evaluate(() => JSON.parse(localStorage.getItem('cluecab-journey-v2') ?? '{}').state)

try {
  // A fresh journey starts in the far south with nothing collected.
  await page.goto(`${BASE}?mock=1&howto=0`)
  await page.waitForSelector('.city-card')
  const start = await page.locator('.city-name').textContent()
  if (start?.trim() !== 'Sønderborg') throw new Error(`expected to start in Sønderborg, got ${start}`)
  if (await page.locator('.btn-travel').count()) throw new Error('travel offered with nothing wrapped')
  await page.screenshot({ path: `${SHOT_DIR}/j1-home-start.png` })

  // One word short of a packed suitcase: the road stays shut.
  await page.goto(`${BASE}?mock=1&howto=0&city=0&wrapped=99`)
  await page.waitForSelector('.city-card')
  const almost = await page.locator('.collect-count').textContent()
  console.log('progress at 99:', almost?.replace(/\s+/g, ' ').trim())
  if (!almost?.includes('99')) throw new Error('wrapped count did not reach 99')
  if (await page.locator('.btn-travel').count())
    throw new Error('travel offered at 99 of 100 wrapped')
  await page.screenshot({ path: `${SHOT_DIR}/j2-almost.png` })

  // The hundredth word wraps → the road north opens on Home.
  await page.goto(`${BASE}?mock=1&howto=0&city=0&wrapped=100`)
  await page.waitForSelector('.btn-travel')
  await page.screenshot({ path: `${SHOT_DIR}/j3-travel-open.png` })

  // Travel happens on the map, and lands on the arrival screen.
  await page.click('.btn-travel')
  await page.waitForSelector('.denmark-map')
  await page.click('.map-screen .btn-primary')
  await page.waitForSelector('.arrival-city')
  const arrived = await page.locator('.arrival-city').textContent()
  console.log('arrived in:', arrived)
  if (arrived?.trim() !== 'Ribe') throw new Error(`expected to arrive in Ribe, got ${arrived}`)
  await page.screenshot({ path: `${SHOT_DIR}/j4-arrival.png` })

  const state = await journeyState()
  if (state.cityIndex !== 1) throw new Error(`journey did not advance: ${JSON.stringify(state)}`)
  if (!state.arrivedAt?.['1']) throw new Error('arrival was not logged')
  if (Object.keys(state.wrapped ?? {}).length !== 100)
    throw new Error('the packed suitcase did not travel with the player')

  // The map shows the new position.
  await page.click('.arrival-screen .btn:not(.btn-primary)')
  await page.waitForSelector('.denmark-map')
  await page.screenshot({ path: `${SHOT_DIR}/j5-map.png` })

  console.log('JOURNEY DRIVE OK')
} catch (e) {
  await page.screenshot({ path: `${SHOT_DIR}/j9-failure.png` }).catch(() => {})
  console.log('JOURNEY DRIVE FAILED:', e.message)
  process.exitCode = 1
} finally {
  await browser.close()
  preview.stop()
}
