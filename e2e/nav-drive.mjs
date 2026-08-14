import { chromium } from 'playwright'
import { startPreview } from './preview-server.mjs'
import { setTimeout as sleep } from 'node:timers/promises'

const PORT = 4181
const preview = await startPreview(PORT)

const EXE = '/opt/pw-browsers/chromium'
const ROOT = preview.base
const SENTINEL = ROOT + '?sentinel=1'
const APP = ROOT + '?mock=1&howto=0&city=2&learned=34'

const browser = await chromium.launch({ executablePath: EXE })
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))
page.on('console', (m) => m.type() === 'error' && console.log('CONSOLE:', m.text().slice(0, 300)))

const fail = []
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) fail.push(name)
}

/**
 * Land on a sentinel page, then the app. A system Back that reaches the
 * sentinel proves the app had no orphaned entry left to unwind; a system Back
 * that stays on the app URL proves the press was swallowed.
 */
async function fresh() {
  await page.goto(SENTINEL, { waitUntil: 'networkidle' })
  await page.goto(APP, { waitUntil: 'networkidle' })
  await page.waitForTimeout(400)
}
const onSentinel = () => page.url().includes('sentinel')
const screen = () =>
  page.evaluate(() => {
    if (document.querySelector('.map-screen')) return 'map'
    if (document.querySelector('.suitcase-screen')) return 'stats'
    if (document.querySelector('.settings-screen')) return 'settings'
    if (document.querySelector('.game-screen')) return 'game'
    return 'home'
  })
const back = async () => {
  await page.goBack().catch(() => {})
  await page.waitForTimeout(450)
}

// 1. Baseline: with nothing opened, one system Back leaves the app.
await fresh()
await back()
check('baseline: back leaves the app', onSentinel(), page.url())

// 2. In-app Back must consume the entry that opening the screen pushed, so the
//    next system Back leaves the app instead of being swallowed.
await fresh()
console.log('DEBUG url=', page.url(), 'body=', (await page.locator('body').innerText()).replace(/\s+/g,' ').slice(0,120))
await page.locator('.map-button').click()
await page.waitForTimeout(300)
check('map opens', (await screen()) === 'map')
await page.locator('.map-screen .icon-btn').click()
await page.waitForTimeout(400)
check('in-app back returns home', (await screen()) === 'home')
await back()
check('no orphaned entry after in-app back', onSentinel(), page.url())

// 3. System Back from a screen still returns home, and only then leaves.
await fresh()
await page.locator('.map-button').click()
await page.waitForTimeout(300)
await back()
check('system back returns home', !onSentinel() && (await screen()) === 'home')
await back()
check('a second back then leaves the app', onSentinel(), page.url())

// 4. A sheet dismissed in-app must not swallow the next system Back.
await fresh()
await page.locator('.wotd').click()
await page.waitForTimeout(300)
check('sheet opens', (await page.locator('.sheet').count()) === 1)
await page.locator('.sheet-backdrop').click({ position: { x: 10, y: 10 } })
await page.waitForTimeout(400)
check('sheet closes in-app', (await page.locator('.sheet').count()) === 0)
await back()
check('no orphaned entry after closing a sheet', onSentinel(), page.url())

// 5. Two layers deep: system Back peels exactly one at a time.
await fresh()
await page.locator('.btn:has-text("Kufferten")').click()
await page.waitForTimeout(300)
check('collection opens', (await screen()) === 'stats')
// The current city's row is already expanded on arrival.
await page.waitForTimeout(250)
await page.locator('.case-tile.case-collected').first().click()
await page.waitForTimeout(350)
check('sheet opens over collection', (await page.locator('.sheet').count()) === 1)
await back()
check(
  'back closes only the sheet',
  (await page.locator('.sheet').count()) === 0 && (await screen()) === 'stats',
  await screen(),
)
await back()
check('back then returns home', !onSentinel() && (await screen()) === 'home')
await back()
check('back then leaves the app', onSentinel(), page.url())

// 6. Hopping screen to screen must not strand entries: going home used to pop
//    one while each hop had pushed another.
await fresh()
await page.locator('.map-button').click()
await page.waitForTimeout(250)
await page.locator('.btn:has-text("Back")').click()
await page.waitForTimeout(250)
check('map to home via the in-page Back', (await screen()) === 'home')
await page.locator('.btn:has-text("Kufferten")').click()
await page.waitForTimeout(250)
// aria-label, not bare .icon-btn: the header now holds the city pager's
// arrows too, and a five-match locator fails strict mode.
await page.locator('.suitcase-screen .icon-btn[aria-label="Back"]').click()
await page.waitForTimeout(300)
check('collection to home', (await screen()) === 'home')
await back()
check('two screens visited, no entries stranded', onSentinel(), page.url())

// 6b. Repeated open/close must not accumulate entries.
await fresh()
for (let i = 0; i < 5; i++) {
  await page.locator('.map-button').click()
  await page.waitForTimeout(220)
  await page.locator('.map-screen .icon-btn').click()
  await page.waitForTimeout(260)
}
check('five round trips end on home', (await screen()) === 'home')
await back()
check('and leave no entries behind', onSentinel(), page.url())

check('no page errors', errors.length === 0, errors.join(' | '))
await browser.close()
preview.stop()
console.log(fail.length ? `\nFAILED: ${fail.join(', ')}` : '\nNAV DRIVE OK')
if (fail.length) process.exitCode = 1
