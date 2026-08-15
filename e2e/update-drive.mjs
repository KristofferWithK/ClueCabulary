// An installed PWA can sit on one build for weeks. This proves the app notices
// a new service worker, tells the player, holds its tongue mid-round, and
// actually applies the update when asked.
import { chromium } from 'playwright'
import { startPreview } from './preview-server.mjs'
import { setTimeout as sleep } from 'node:timers/promises'
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

// fileURLToPath, not .pathname: the latter yields /C:/… on Windows, which
// node then resolves to C:\C:\….
const SW = fileURLToPath(new URL('../dist/sw.js', import.meta.url))
const PORT = 4184
const preview = await startPreview(PORT)
const original = await readFile(SW, 'utf8')


const BASE = preview.base
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium',
})
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
const page = await ctx.newPage()
page.on('pageerror', (e) => console.log('PAGE CRASH:', e.message))

/** The update prompt, distinguished from the one-off offline-ready notice. */
const REFRESH = '.update-banner:has(.update-actions)'

/** Ask the registration to re-check sw.js, the way the hourly timer does. */
const checkForUpdate = () =>
  page.evaluate(async () => {
    const r = await navigator.serviceWorker.getRegistration()
    await r?.update()
  })

try {
  await page.goto(`${BASE}?mock=1&howto=0&city=0`)
  await page.waitForSelector('.city-card')
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, undefined, {
    timeout: 20000,
  })
  console.log('service worker controlling the page')

  // Nothing to say when there is nothing new.
  await checkForUpdate()
  await sleep(1000)
  if (await page.locator(REFRESH).count()) {
    throw new Error('banner appeared with no update available')
  }
  console.log('quiet when up to date')

  // Ship a new build. A byte-different sw.js is exactly what the browser
  // compares, so this is the real trigger, not a simulated one.
  await writeFile(SW, `${original}\n// build 2\n`)
  await checkForUpdate()
  await page.waitForSelector(REFRESH, { timeout: 15000 })
  console.log('told the player:', (await page.locator(`${REFRESH} span`).textContent()).trim())

  // Dismissing must stick — nagging on every check would be worse than silence.
  await page.locator(`${REFRESH} .btn:not(.btn-primary)`).click()
  await sleep(400)
  if (await page.locator(REFRESH).count()) throw new Error('Later did not dismiss')
  await checkForUpdate()
  await sleep(1000)
  if (await page.locator(REFRESH).count()) throw new Error('dismissed banner came back')
  console.log('Later dismisses and stays dismissed')

  // Mid-round the banner must hold its tongue: a reload would spoil the game.
  await page.reload()
  await page.waitForSelector('.city-card')
  await page.locator('.home-play').click()
  await page.waitForSelector('.board-grid')
  const study = page.locator('.study-dock .btn-primary')
  if (await study.isVisible().catch(() => false)) await study.click()
  await writeFile(SW, `${original}\n// build 3\n`)
  await checkForUpdate()
  await sleep(1500)
  if (await page.locator(REFRESH).count()) {
    throw new Error('banner interrupted a round in progress')
  }
  console.log('silent during a round')

  // Back on Home with the round abandoned, it may speak again — and Reload
  // must actually take the new worker.
  await page.goto(`${BASE}?mock=1&howto=0&city=0`)
  await page.waitForSelector('.city-card')
  await page.evaluate(() => localStorage.removeItem('cluecab-game-v1'))
  await page.reload()
  await page.waitForSelector('.city-card')
  await checkForUpdate()
  await page.waitForSelector(REFRESH, { timeout: 15000 })
  const before = await page.evaluate(
    async () => (await navigator.serviceWorker.getRegistration())?.waiting !== null,
  )
  if (!before) throw new Error('expected a waiting worker before Reload')
  await page.locator(`${REFRESH} .btn-primary`).click()
  await page.waitForFunction(
    async () => {
      const r = await navigator.serviceWorker.getRegistration()
      return r != null && r.waiting === null && !!navigator.serviceWorker.controller
    },
    undefined,
    { timeout: 20000 },
  )
  console.log('Reload took the waiting worker')

  await page.waitForSelector('.city-card', { timeout: 15000 })
  console.log('app still alive after the update')

  console.log('UPDATE DRIVE OK')
} catch (e) {
  console.log('UPDATE DRIVE FAILED:', e.message)
  process.exitCode = 1
} finally {
  await writeFile(SW, original)
  await browser.close()
  preview.stop()
}
