// The collection: three word states, the Pokédex, and stamps earned by exam.
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'

const SHOT_DIR = process.env.SHOT_DIR ?? '.'
const BASE = 'http://localhost:4179/ClueCabulary/'
const preview = spawn('npx', ['vite', 'preview', '--port', '4179', '--strictPort'], {
  cwd: new URL('..', import.meta.url).pathname,
  stdio: 'ignore',
})
await sleep(1500)

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium',
})
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
page.on('pageerror', (e) => console.log('PAGE CRASH:', e.message))

try {
  // 30 words green in the first city.
  await page.goto(`${BASE}?mock=1&howto=0&city=0&learned=30`)
  await page.waitForSelector('.city-card')
  await page.waitForSelector('.home-map')
  const count = await page.locator('.collect-count').textContent()
  console.log('home:', count?.replace(/\s+/g, ' ').trim())
  if (!count?.includes('30')) throw new Error('home did not show 30 learned')
  await page.screenshot({ path: `${SHOT_DIR}/c1-home.png` })

  // The Pokédex: learned, discovered and empty slots all present.
  await page.click('.btn:has-text("Samlingen")')
  await page.waitForSelector('.word-dex')
  const learned = await page.locator('.dex-learned').count()
  const unknown = await page.locator('.dex-unknown').count()
  console.log(`dex: ${learned} learned, ${unknown} still to find`)
  if (learned !== 30) throw new Error(`expected 30 green slots, saw ${learned}`)
  if (unknown !== 70) throw new Error(`expected 70 empty slots, saw ${unknown}`)
  await page.screenshot({ path: `${SHOT_DIR}/c2-collection.png` })
  await page.click('.icon-btn')

  // The exam is never locked, and passing it stamps the passport.
  await page.waitForSelector('.city-card')
  await page.click('.btn-gate')
  await page.waitForSelector('.gate-list')
  const words = await page.locator('.gate-list .gate-da').count()
  if (words !== 20) throw new Error(`expected a 20-word paper, got ${words}`)
  for (let i = 0; i < 20; i++) await page.locator('.gate-item input').nth(i).fill('zzz')
  await page.click('.btn-primary')
  await page.waitForSelector('.gate-results')
  if (await page.locator('.stamp-award').count()) throw new Error('a failed exam awarded a stamp')
  console.log('failed exam awarded no stamp')
  await page.screenshot({ path: `${SHOT_DIR}/c3-exam-failed.png` })

  const answers = await page.locator('.gate-results .result-answer em').allTextContents()
  await page.click('.btn-primary') // same words again
  await page.waitForSelector('.gate-list')
  for (let i = 0; i < 20; i++) {
    await page.locator('.gate-item input').nth(i).fill(answers[i].replace(/^\s*=\s*/, '').split(',')[0].trim())
  }
  await page.click('.btn-primary')
  await page.waitForSelector('.stamp-award')
  console.log('stamp:', (await page.locator('.stamp-award').textContent())?.replace(/\s+/g, ' ').trim())

  const state = await page.evaluate(
    () => JSON.parse(localStorage.getItem('cluecab-journey-v2') ?? '{}').state,
  )
  if (state.stamps?.['0'] !== 1) throw new Error(`expected 1 stamp, got ${JSON.stringify(state.stamps)}`)
  if (Object.keys(state.banked ?? {}).length !== 20) throw new Error('exam did not bank its 20 words')
  await page.screenshot({ path: `${SHOT_DIR}/c4-stamped.png` })

  console.log('COLLECTION DRIVE OK')
} catch (e) {
  await page.screenshot({ path: `${SHOT_DIR}/c9-failure.png` }).catch(() => {})
  console.log('COLLECTION DRIVE FAILED:', e.message)
  process.exitCode = 1
} finally {
  await browser.close()
  preview.kill()
}
