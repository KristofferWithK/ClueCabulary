import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'
import { readFileSync } from 'node:fs'
const WORDS = JSON.parse(readFileSync('/home/user/ClueCabulary/src/data/words.da.json', 'utf8'))
const ids = WORDS.filter((w) => w.freqRank <= 100).sort((a, b) => a.freqRank - b.freqRank).map((w) => w.id)
const NOW = Date.now()
const bank = (l) => Object.fromEntries(l.map((id) => [id, NOW]))
const BASE = 'http://localhost:4194/ClueCabulary/'
const preview = spawn('npx', ['vite', 'preview', '--port', '4194', '--strictPort'], { cwd: '/home/user/ClueCabulary', stdio: 'ignore' })
await sleep(2500)
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium' })
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
page.on('pageerror', (e) => console.log('PAGE CRASH:', e.message.split('\n')[0]))
const st = () => page.evaluate(() => JSON.parse(localStorage.getItem('cluecab-journey-v2') ?? '{}').state)
try {
  console.log('--- A: end of journey, backed out of the results screen ---')
  await page.goto(`${BASE}?mock=1&howto=0&city=9&learned=100&stamps=4`)
  await page.waitForSelector('.city-card')
  await page.click('.btn-gate')
  await page.waitForSelector('.gate-list')
  const n = await page.locator('.gate-item input').count()
  for (let i = 0; i < n; i++) await page.locator('.gate-item input').nth(i).fill('zzz')
  await page.click('.gate-screen .btn-primary'); await page.waitForSelector('.gate-results')
  const ans = await page.locator('.gate-results .result-answer em').allTextContents()
  await page.click('.gate-actions .btn-primary'); await page.waitForSelector('.gate-list')
  for (let i = 0; i < n; i++) await page.locator('.gate-item input').nth(i).fill(ans[i].replace(/^\s*=\s*/, '').split(',')[0].trim())
  await page.click('.gate-screen .btn-primary'); await page.waitForSelector('.gate-results')
  await page.click('.gate-screen .screen-header .icon-btn')   // back arrow
  await page.goto(`${BASE}?mock=1&howto=0`) // relaunch, no journey switches
  await page.waitForSelector('.city-card')
  const s = await st()
  console.log('stamps:', JSON.stringify(s.stamps), '| activeExam set?', s.activeExam !== null)
  console.log('journey-done shown?', (await page.locator('.journey-done').count()) > 0)
  console.log('resume/abandon buttons:', await page.locator('.exam-resume button').count())
  console.log('gate buttons anywhere on home:', await page.locator('.btn-gate').count())
  await page.click('.wotd'); await sleep(300)
  console.log('dictionary opens?', (await page.locator('.sheet').count()) > 0)

  console.log('')
  console.log('--- B: merged devices leave a city fully banked with 4 stamps ---')
  await page.evaluate((banked) => {
    localStorage.setItem('cluecab-journey-v2', JSON.stringify({
      state: { cityIndex: 0, stamps: { 0: 4 }, banked, trialsSpent: { 0: 4 }, arrivedAt: {}, activeExam: null },
      version: 2,
    }))
  }, bank(ids))
  await page.goto(`${BASE}?mock=1&howto=0`); await page.waitForSelector('.city-card')
  console.log('gate label:', (await page.locator('.btn-gate .gate-paper').textContent())?.trim())
  for (let round = 1; round <= 2; round++) {
    await page.click('.btn-gate'); await page.waitForSelector('.gate-screen')
    console.log(`round ${round}: rows =`, await page.locator('.gate-item').count(), '| submit:', (await page.locator('.gate-screen .btn-primary').textContent())?.trim())
    await page.click('.gate-screen .btn-primary'); await sleep(300)
    console.log(`round ${round}: stamps =`, JSON.stringify((await st()).stamps), '| spent =', JSON.stringify((await st()).trialsSpent))
    if (await page.locator('.travel-callout').count()) { console.log('travel callout shown'); break }
    await page.click('.gate-actions .btn-primary'); await page.waitForSelector('.city-card')
  }
} catch (e) { console.log('ERR', e.message.split('\n')[0]) } finally { await browser.close(); preview.kill() }
