import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'

const PORT = 4175
const preview = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
  cwd: '/home/user/ClueCabulary',
  stdio: 'ignore',
})
await sleep(2500)

/**
 * Layout and journey-edge regressions that only show up in a real browser:
 * the end of the road, map labels near the viewBox edge, the primary action's
 * position on small phones, a leaked exam, and the board's ⓘ overlapping words.
 */
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const BASE = `http://127.0.0.1:${PORT}/ClueCabulary/`
const PHONE = { width: 390, height: 844 }

const browser = await chromium.launch({ executablePath: EXE })
const ctx = await browser.newContext({ viewport: PHONE, deviceScaleFactor: 2 })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))

const fail = []
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) fail.push(name)
}

async function open(query) {
  await page.goto(BASE + query, { waitUntil: 'networkidle' })
  await page.waitForTimeout(400)
}

// The final city used to ask cityAt() for a stop past the end, which throws
// and blanks the app for good — cityIndex and stamps are both persisted.
await open('?mock=1&howto=0&city=9&stamps=5&learned=100')
check('the end of the journey renders', (await page.locator('.journey-done').count()) === 1)
check('no page errors at the final city', errors.length === 0, errors.join(' | '))

// The "you are here" label must stay inside the map — Skagen sits at the top
// edge, København at the right.
for (const [city, name] of [
  [6, 'Skagen'],
  [9, 'Kobenhavn'],
  [0, 'Sonderborg'],
]) {
  await open(`?mock=1&howto=0&city=${city}`)
  const map = await page.locator('.home-map').boundingBox()
  const label = await page.locator('.home-map-here').boundingBox()
  const inside =
    label.y >= map.y - 0.5 &&
    label.y + label.height <= map.y + map.height + 0.5 &&
    label.x >= map.x - 0.5 &&
    label.x + label.width <= map.x + map.width + 0.5
  check(`map label stays inside the map at ${name}`, inside)
}

// The primary action has to be reachable without scrolling, on the small
// phones people actually own.
for (const vp of [
  { width: 390, height: 844, name: 'iPhone 14' },
  { width: 375, height: 667, name: 'iPhone SE' },
  { width: 360, height: 640, name: 'small Android' },
]) {
  await page.setViewportSize({ width: vp.width, height: vp.height })
  await open('?mock=1&howto=0&city=0')
  const primary = await page.locator('.btn-primary.btn-big').first().boundingBox()
  check(
    `primary action is above the fold on ${vp.name}`,
    primary.y + primary.height <= vp.height,
    `bottom ${(primary.y + primary.height).toFixed(0)} of ${vp.height}`,
  )
}
await page.setViewportSize(PHONE)

// An exam put down mid-paper survives a relaunch — the attempt was already
// spent, so the paper has to come back. It locks the dictionary app-wide while
// it is open, so Home must surface it, let you resume, and let you drop it.
await page.evaluate(() => {
  const raw = JSON.parse(localStorage.getItem('cluecab-journey-v2'))
  raw.state.activeExam = { cityIndex: 0, wordIds: ['w1', 'w2', 'w3'], answers: { w1: 'the' } }
  localStorage.setItem('cluecab-journey-v2', JSON.stringify(raw))
})
await open('?mock=1&howto=0')
check('a suspended exam is surfaced on home', (await page.locator('.exam-resume').count()) === 1)
const spentBefore = await page.evaluate(
  () => JSON.parse(localStorage.getItem('cluecab-journey-v2') ?? '{}').state?.trialsSpent?.['0'] ?? 0,
)
await page.locator('.exam-resume .btn-gate').click()
await page.waitForTimeout(350)
check('resuming reopens the same paper', (await page.locator('.gate-list').count()) === 1)
const spentAfter = await page.evaluate(
  () => JSON.parse(localStorage.getItem('cluecab-journey-v2') ?? '{}').state?.trialsSpent?.['0'] ?? 0,
)
check('resuming does not spend a second attempt', spentBefore === spentAfter, `${spentBefore} -> ${spentAfter}`)
await page.goBack()
await page.waitForTimeout(350)
await page.locator('.btn-quiet').click()
await page.waitForTimeout(250)
check('abandoning it clears the lock', (await page.locator('.exam-resume').count()) === 0)

// The ⓘ must not be drawn over the word it belongs to, or it steals taps meant
// for a guess.
await open('?mock=1&howto=0&seed=7&city=0')
await page.locator('.grid-card').first().click()
await page.waitForTimeout(700)
const info = await page.locator('.card-info').first().boundingBox()
const word = await page.locator('.card-da').first().boundingBox()
check(
  'the lookup button does not overlap the word',
  !(info.y + info.height > word.y && info.x < word.x + word.width),
)

// Turning a word green is the loop's whole reward and used to happen silently.
// Play a mock round to the end with every word one handling short of green.
await open('?mock=1&howto=0&seed=5&city=0&almost=100')
await page.locator('.grid-card').first().click()
await page.waitForSelector('.board-grid')
const study = page.locator('.study-dock .btn-primary')
if (await study.isVisible().catch(() => false)) await study.click()
await page.fill('.clue-input input', 'huskeliste')
await page.click('.clue-input .btn-primary')
await page.waitForFunction(
  () => !document.querySelector('.phase-caption')?.textContent?.includes('Klaus is guessing'),
  undefined,
  { timeout: 20000 },
)
// Drive to the end however the round went: guess on, or hit the forbidden word.
for (let i = 0; i < 12 && (await page.locator('.debrief').count()) === 0; i++) {
  const guessable = page.locator('.word-card.card-guessable').first()
  if (await guessable.isVisible().catch(() => false)) {
    await guessable.click()
    const confirm = page.locator('.guess-confirm .btn-primary')
    if (await confirm.isVisible().catch(() => false)) await confirm.click()
  } else {
    const clue = page.locator('.clue-input input')
    if (await clue.isVisible().catch(() => false)) {
      await clue.fill('igen')
      await page.click('.clue-input .btn-primary')
    }
  }
  await page.waitForTimeout(900)
  const redeem = page.locator('.redemption-form input').first()
  if (await redeem.isVisible().catch(() => false)) break
}
const debriefed = (await page.locator('.debrief').count()) > 0
if (debriefed) {
  const shown = await page.locator('.collected-section').count()
  const greens = await page.locator('.word-card .key-mark').count()
  check('a round that greens words says so', shown === 1, `${shown} sections, ${greens} key marks`)
} else {
  console.log('SKIP round did not reach a debrief on this seed')
}

// Klaus's whole turn used to happen in silence: no live region existed
// anywhere in the game loop.
await open('?mock=1&howto=0&seed=7&city=0')
await page.locator('.grid-card').first().click()
await page.waitForSelector('.board-grid')
const studyBtn = page.locator('.study-dock .btn-primary')
if (await studyBtn.isVisible().catch(() => false)) await studyBtn.click()
const regions = await page.locator('[aria-live], [role="status"], [role="alert"]').count()
check('the game loop has a live region', regions > 0, `${regions} found`)
const pressed = await page.locator('.game-header .icon-btn[aria-pressed]').count()
check('the translations toggle exposes its state', pressed === 1)

// The letter claims role=dialog aria-modal; it has to behave like one.
await page.goto(BASE + '?mock=1', { waitUntil: 'networkidle' })
await page.waitForSelector('.letter')
const focusedInside = await page.evaluate(
  () => document.querySelector('.letter-screen')?.contains(document.activeElement) ?? false,
)
check('the letter takes focus when it opens', focusedInside)
await page.keyboard.press('Escape')
await page.waitForTimeout(400)
check('Escape closes the letter', (await page.locator('.letter').count()) === 0)

check('no page errors', errors.length === 0, errors.join(' | '))
await browser.close()
preview.kill()
console.log(fail.length ? `\nFAILED: ${fail.join(', ')}` : '\nLAYOUT DRIVE OK')
if (fail.length) process.exitCode = 1
