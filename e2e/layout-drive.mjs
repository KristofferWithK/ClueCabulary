import { chromium } from 'playwright'
import { startPreview } from './preview-server.mjs'
import { setTimeout as sleep } from 'node:timers/promises'

const PORT = 4182
const preview = await startPreview(PORT)

/**
 * Layout and journey-edge regressions that only show up in a real browser:
 * the end of the road, map labels near the viewBox edge, the primary action's
 * position on small phones, a leaked exam, and the board's ⓘ overlapping words.
 */
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
const BASE = preview.base
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

// Installed, there is no browser chrome above the page, so a scrolled screen
// used to draw its own title under the phone's clock.
await open('?mock=1&howto=0&city=0')
await page.locator('.home-screen .btn').last().click()
await page.waitForSelector('.settings-screen')
const headerTop = async () => (await page.locator('.screen-header').boundingBox()).y
const atRest = await headerTop()
await page.evaluate(() => window.scrollTo(0, 600))
await page.waitForTimeout(250)
const scrolled = await headerTop()
check(
  'the settings header stays put when the page scrolls',
  scrolled <= atRest + 0.5 && scrolled >= -0.5,
  `${atRest.toFixed(0)}px at rest, ${scrolled.toFixed(0)}px scrolled`,
)
const opaque = await page
  .locator('.screen-header')
  .evaluate((el) => getComputedStyle(el).backgroundColor)
check('and is opaque, so content passes behind it', !/rgba\(0, 0, 0, 0\)|transparent/.test(opaque), opaque)
await page.goBack()
await page.waitForTimeout(250)

// Typing a provider's base URL on a phone is a miserable way to find out
// whether it works, so switching service is one tap.
await open('?mock=1&howto=0&city=0')
await page.locator('.home-screen .btn').last().click()
await page.waitForSelector('.settings-screen')
const chips = page.locator('.provider-list .chip')
check('the service chips are there', (await chips.count()) === 2, `${await chips.count()} chips`)
const row = await page.locator('.provider-list').boundingBox()
check(
  'and fit the phone',
  row.x >= -0.5 && row.x + row.width <= PHONE.width + 0.5,
  `${row.width.toFixed(0)}px on ${PHONE.width}px`,
)
await chips.filter({ hasText: 'Gemini' }).click()
await page.waitForTimeout(400)
const baseUrl = await page.locator('input[type="url"]').inputValue()
check(
  'tapping Gemini sets its base URL',
  baseUrl === 'https://generativelanguage.googleapis.com/v1beta/openai',
  baseUrl,
)
const modelAfter = await page.locator('.settings-section input[type="text"]').first().inputValue()
// Cleared on purpose: the two services publish conflicting model ids, and a
// wrong one is a 404 that reads as a broken endpoint. The server is asked.
check('and clears the model rather than guessing one', modelAfter === '', `"${modelAfter}"`)
await page.goBack()
await page.waitForTimeout(250)

// A screenshot of Settings has to say which build it is, or "have you got the
// update yet?" cannot be answered.
await open('?mock=1&howto=0&city=0')
await page.locator('.home-screen .btn').last().click()
await page.waitForSelector('.settings-screen')
const stamp = (await page.locator('.build-footer').innerText()).trim()
check('Settings names the build', /Build \S+/.test(stamp), stamp.split('\n')[0])
check(
  'and offers a way to go and fetch a newer one',
  (await page.getByRole('button', { name: /check for updates/i }).count()) === 1,
)
await page.goBack()
await page.waitForTimeout(250)

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

// The practice companion needs no key, so neither nudge belongs on Home.
await open('?mock=1&howto=0&city=0')
check('no setup nudge with the practice companion', (await page.locator('.setup-nudge').count()) === 0)

// Connecting Klaus is the one thing a stuck player must be able to do from the
// phone in their hand, so the steps live in the app rather than behind a link
// to a markdown file. They have to fit the screen and be reachable.
await page.evaluate(() => {
  const raw = JSON.parse(localStorage.getItem('cluecab-settings-v1') ?? '{}')
  raw.state = { ...raw.state, useMock: false, apiKey: 'a-key', klausVerifiedAt: null }
  localStorage.setItem('cluecab-settings-v1', JSON.stringify(raw))
})
await open('?howto=0&city=0')
await page.locator('.setup-nudge').first().click()
await page.waitForSelector('.settings-screen')
const panel = page.locator('.connect-klaus')
check('the setup steps are in the app', (await panel.count()) === 1)
check('and open while Klaus has never answered', await panel.evaluate((el) => el.open))
const steps = await page.locator('.connect-steps li').count()
check('with every step listed', steps === 6, `${steps} steps`)
const box = await panel.boundingBox()
check(
  'the panel fits the phone',
  box.x >= -0.5 && box.x + box.width <= PHONE.width + 0.5,
  `${box.width.toFixed(0)}px wide on ${PHONE.width}px`,
)
const links = await page.locator('.connect-steps a').count()
check('and its links are tappable, not a wall of prose', links >= 4, `${links} links`)

// Once Klaus has answered it is history, and must stop eating the screen.
await page.evaluate(() => {
  const raw = JSON.parse(localStorage.getItem('cluecab-settings-v1'))
  raw.state.klausVerifiedAt = Date.now()
  localStorage.setItem('cluecab-settings-v1', JSON.stringify(raw))
})
await open('?howto=0&city=0')
await page.locator('.btn').filter({ hasText: 'Settings' }).first().click().catch(() => {})
if ((await page.locator('.settings-screen').count()) === 0) {
  await page.evaluate(() => window.history.pushState({}, '', location.href))
  await page.locator('.home-screen .btn').last().click()
}
await page.waitForSelector('.settings-screen', { timeout: 5000 })
check(
  'and collapses once Klaus has answered',
  (await page.locator('.connect-klaus').evaluate((el) => el.open)) === false,
)

check('no page errors', errors.length === 0, errors.join(' | '))
await browser.close()
preview.stop()
console.log(fail.length ? `\nFAILED: ${fail.join(', ')}` : '\nLAYOUT DRIVE OK')
if (fail.length) process.exitCode = 1
