// The collection lives on one phone. This drives the whole way out and back:
// export, wipe, restore, and prove a merge cannot cost you a green word.
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'

const PORT = 4176
const preview = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
  cwd: '/home/user/ClueCabulary',
  stdio: 'ignore',
})
await sleep(2500)

const BASE = `http://127.0.0.1:${PORT}/ClueCabulary/`
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
})
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  permissions: ['clipboard-read', 'clipboard-write'],
})
const page = await ctx.newPage()
page.on('dialog', (d) => d.accept())
page.on('pageerror', (e) => console.log('PAGE CRASH:', e.message))

const openSettings = async (query) => {
  await page.goto(BASE + query)
  await page.waitForSelector('.city-card')
  await page.locator('.home-nav .btn').click()
  await page.waitForSelector('.settings-screen')
}
const learnedOnHome = async () => {
  await page.locator('.settings-screen .icon-btn').click()
  await page.waitForSelector('.city-card')
  const text = await page.locator('.collect-count').textContent()
  return Number(text.trim().match(/^(\d+)/)[1])
}

try {
  // A collection worth losing: 34 green words in Kolding.
  await openSettings('?mock=1&howto=0&city=2&learned=34')
  await page.locator('.backup-fallback').first().click()
  await page.locator('.backup-paste .btn-small').first().click()
  await sleep(300)
  const saved = await page.evaluate(() => navigator.clipboard.readText())
  const parsed = JSON.parse(saved)
  if (parsed.app !== 'cluecabulary') throw new Error('clipboard did not hold a backup')
  console.log(`exported: ${Object.keys(parsed.srs.stats).length} word records, city ${parsed.journey.cityIndex}`)

  // The one thing a backup exists for: the file must not carry the API key.
  if (/apiKey|sk-|Bearer/i.test(saved)) throw new Error('backup leaked a credential')
  console.log('no credential in the file')

  // Wipe it the way a player would, then confirm it is really gone.
  await page.locator('.btn-danger').click()
  await sleep(400)
  const afterReset = await learnedOnHome()
  if (afterReset !== 0) throw new Error(`reset left ${afterReset} learned words`)
  console.log('after reset: 0 learned')

  // Restore, and check every part came back.
  await page.locator('.home-nav .btn').click()
  await page.waitForSelector('.settings-screen')
  await page.locator('.backup-fallback').first().click()
  await page.locator('.backup-paste textarea').fill(saved)
  await page.locator('.backup-paste .btn-small').nth(1).click()
  await page.waitForSelector('.backup-preview')
  const preview34 = await page.locator('.backup-preview li').first().textContent()
  console.log('preview says:', preview34.replace(/\s+/g, ' ').trim())
  await page.locator('.backup-choice .btn-primary').click()
  await page.waitForSelector('.test-ok')
  const restored = await learnedOnHome()
  if (restored !== 34) throw new Error(`restore gave ${restored} learned words, expected 34`)
  console.log(`restored: ${restored} learned`)

  const city = await page.evaluate(
    () => JSON.parse(localStorage.getItem('cluecab-journey-v2') ?? '{}').state?.cityIndex,
  )
  if (city !== 2) throw new Error(`restore lost the journey: city ${city}`)
  console.log('journey restored: city', city)

  // Merging must never cost a green. Knock the device back to ten green words,
  // fold the thirty-four-word backup in, and all thirty-four must survive.
  await page.goto(`${BASE}?mock=1&howto=0`)
  await page.waitForSelector('.city-card')
  await page.evaluate(() => {
    localStorage.removeItem('cluecab-srs-v1')
    localStorage.removeItem('cluecab-journey-v2')
  })
  await openSettings('?mock=1&howto=0&city=2&learned=10')
  await page.locator('.backup-fallback').first().click()
  await page.locator('.backup-paste textarea').fill(saved)
  await page.locator('.backup-paste .btn-small').nth(1).click()
  await page.waitForSelector('.backup-preview')
  await page.locator('.backup-choice .btn-primary').click()
  await page.waitForSelector('.test-ok')
  const merged = await learnedOnHome()
  if (merged !== 34) throw new Error(`merge gave ${merged} learned words, expected 34`)
  console.log(`merged 10 + 34 → ${merged} learned, nothing lost`)

  // A file from somewhere else must be refused, not half-eaten.
  await page.locator('.home-nav .btn').click()
  await page.waitForSelector('.settings-screen')
  await page.locator('.backup-fallback').first().click()
  await page.locator('.backup-paste textarea').fill('{"some":"other app"}')
  await page.locator('.backup-paste .btn-small').nth(1).click()
  await page.waitForSelector('.test-fail')
  console.log('rejected junk:', (await page.locator('.test-fail').textContent()).trim())
  if (await page.locator('.backup-preview').count()) throw new Error('junk reached the restore step')
  const survived = await learnedOnHome()
  if (survived !== 34) throw new Error(`a rejected file disturbed the collection: ${survived}`)

  console.log('BACKUP DRIVE OK')
} catch (e) {
  console.log('BACKUP DRIVE FAILED:', e.message)
  process.exitCode = 1
} finally {
  await browser.close()
  preview.kill()
}
