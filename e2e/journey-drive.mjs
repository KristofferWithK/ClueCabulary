// Drives the journey: home → a failed travel exam blocks the road → a perfect
// exam passes the fifth gate → travel to the next city unlocks its 100 words.
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
import { startPreview } from './preview-server.mjs'

/**
 * The dataset, so the retry can be answered on its own terms.
 *
 * This drive used to scrape the answer key off the failed paper and type it
 * back positionally, which only worked because the retry WAS the failed paper —
 * the defect that let a player fail an exam, read the answers printed beside
 * every miss, and pass the identical twenty words. The drive passed because of
 * the bug. Now the retry is a different paper, so answer it from the dictionary
 * like someone who actually knows the words.
 */
const GLOSS = new Map(
  JSON.parse(readFileSync(new URL('../src/data/words.da.json', import.meta.url))).map((w) => [
    w.da,
    w.en[0],
  ]),
)

const PORT = 4177
const preview = await startPreview(PORT)
import { setTimeout as sleep } from 'node:timers/promises'

const SHOT_DIR = process.env.SHOT_DIR ?? '.'
const BASE = preview.base

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium',
})
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
page.on('pageerror', (e) => console.log('PAGE CRASH:', e.message))

const journeyState = () =>
  page.evaluate(() => JSON.parse(localStorage.getItem('cluecab-journey-v2') ?? '{}').state)

/** The exam's words, in order, read from the rendered rows. */
const examWords = () => page.locator('.gate-list .gate-da').allTextContents()

try {
  // A fresh journey starts in the far south with nothing collected.
  await page.goto(`${BASE}?mock=1&howto=0`)
  await page.waitForSelector('.city-card')
  const start = await page.locator('.city-name').textContent()
  if (start?.trim() !== 'Sønderborg') throw new Error(`expected to start in Sønderborg, got ${start}`)
  await page.screenshot({ path: `${SHOT_DIR}/j1-home-start.png` })

  // Jump to a city with four gates behind us and every word collected.
  await page.goto(`${BASE}?mock=1&howto=0&city=0&learned=100&stamps=4`)
  await page.waitForSelector('.city-card')
  const collected = await page.locator('.collect-count').textContent()
  console.log('progress:', collected?.replace(/\s+/g, ' ').trim())
  if (!collected?.includes('100')) throw new Error('learned count did not reach 100')
  await page.screenshot({ path: `${SHOT_DIR}/j2-home-ready.png` })

  // Four stamps already in the passport; the fifth exam is offered.
  const earned = await page.locator('.stamp.stamp-earned').count()
  if (earned !== 4) throw new Error(`expected 4 stamps, saw ${earned}`)
  await page.click('.btn-gate')
  await page.waitForSelector('.gate-list')
  const words = await examWords()
  if (words.length !== 20) throw new Error(`expected 20 exam words, got ${words.length}`)
  await page.screenshot({ path: `${SHOT_DIR}/j3-exam.png` })

  // The dictionary must be locked app-wide while an exam is open.
  if ((await page.locator('.card-info').count()) > 0) throw new Error('dictionary reachable in exam')

  // Wrong answers everywhere → exam fails and the road stays shut.
  for (let i = 0; i < 20; i++) {
    await page.locator('.gate-item input').nth(i).fill('zzz')
  }
  await page.click('.btn-primary')
  await page.waitForSelector('.gate-results')
  const rejected = await page.locator('.gate-results .rejected').count()
  console.log(`failed exam: ${rejected} / 20 marked wrong`)
  if (rejected !== 20) throw new Error('a wrong answer was accepted')
  if (await page.locator('.btn-travel, .travel-callout').count())
    throw new Error('travel offered despite a failed exam')
  await page.screenshot({ path: `${SHOT_DIR}/j4-exam-failed.png` })

  // The results screen prints the right answer beside every miss, so the retry
  // must not be able to reuse them: a different paper is the whole point.
  const failedPaper = words
  await page.click('.btn-primary') // Try the test again
  await page.waitForSelector('.gate-list')
  const retryPaper = await examWords()
  const carriedOver = retryPaper.filter((w) => failedPaper.includes(w))
  console.log(`retry paper shares ${carriedOver.length}/20 with the one just marked`)
  if (carriedOver.length === retryPaper.length)
    throw new Error('the retry re-served the paper whose answers were just printed')

  // Answer it properly, from the dictionary rather than from the answer key.
  for (let i = 0; i < 20; i++) {
    const gloss = GLOSS.get(retryPaper[i].trim())
    if (!gloss) throw new Error(`no gloss for exam word "${retryPaper[i]}"`)
    await page.locator('.gate-item input').nth(i).fill(gloss)
  }
  await page.click('.btn-primary')
  await page.waitForSelector('.gate-results')
  const accepted = await page.locator('.gate-results .accepted').count()
  console.log(`retry: ${accepted} / 20 accepted`)
  if (accepted !== 20) throw new Error('perfect answers were not all accepted')

  // Fifth gate passed → the road north opens.
  await page.waitForSelector('.travel-callout')
  await page.screenshot({ path: `${SHOT_DIR}/j5-travel-open.png` })
  await page.click('.gate-actions .btn-primary')
  await page.waitForSelector('.arrival-city')
  const arrived = await page.locator('.arrival-city').textContent()
  console.log('arrived in:', arrived)
  if (arrived?.trim() !== 'Ribe') throw new Error(`expected to arrive in Ribe, got ${arrived}`)
  await page.screenshot({ path: `${SHOT_DIR}/j6-arrival.png` })

  const state = await journeyState()
  if (state.cityIndex !== 1) throw new Error(`journey did not advance: ${JSON.stringify(state)}`)
  if (!state.arrivedAt?.['1']) throw new Error('arrival was not logged')

  // The map shows the new position.
  await page.click('.arrival-screen .btn:not(.btn-primary)')
  await page.waitForSelector('.denmark-map')
  await page.screenshot({ path: `${SHOT_DIR}/j7-map.png` })

  console.log('JOURNEY DRIVE OK')
} catch (e) {
  await page.screenshot({ path: `${SHOT_DIR}/j9-failure.png` }).catch(() => {})
  console.log('JOURNEY DRIVE FAILED:', e.message)
  process.exitCode = 1
} finally {
  await browser.close()
  preview.stop()
}
