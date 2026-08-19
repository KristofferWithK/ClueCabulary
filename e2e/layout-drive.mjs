import { chromium } from 'playwright'
import { startPreview } from './preview-server.mjs'
import { setTimeout as sleep } from 'node:timers/promises'

const PORT = 4182
const preview = await startPreview(PORT)

/**
 * Layout and journey-edge regressions that only show up in a real browser:
 * the end of the road, map labels near the viewBox edge, the primary action's
 * position on small phones, and the board's ⓘ overlapping words.
 */
const EXE = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium'
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
// and blanks the app for good — cityIndex and the suitcase are both persisted.
await open('?mock=1&howto=0&city=9&wrapped=100')
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

// Settings is the one screen with more to say than a phone is tall. The
// DOCUMENT must not scroll — its internal container does, under a header
// that stays put.
await open('?mock=1&howto=0&city=0')
await page.locator('.icon-btn[aria-label="Settings"]').click()
await page.waitForSelector('.settings-screen')
const headerTop = async () => (await page.locator('.screen-header').boundingBox()).y
const atRest = await headerTop()
await page.evaluate(() => {
  document.querySelector('.screen-scroll').scrollTo(0, 600)
})
await page.waitForTimeout(250)
const scrolled = await headerTop()
check(
  'the settings header stays put when its scroller scrolls',
  scrolled <= atRest + 0.5 && scrolled >= -0.5,
  `${atRest.toFixed(0)}px at rest, ${scrolled.toFixed(0)}px scrolled`,
)
const settingsDoc = await page.evaluate(() => ({
  sh: document.scrollingElement.scrollHeight,
  ih: window.innerHeight,
  inner: document.querySelector('.screen-scroll').scrollTop,
}))
check(
  'and the scroll happened inside, never on the document',
  settingsDoc.sh <= settingsDoc.ih + 1 && settingsDoc.inner > 0,
  `document ${settingsDoc.sh} vs ${settingsDoc.ih}, scroller at ${settingsDoc.inner}`,
)
const opaque = await page
  .locator('.screen-header')
  .evaluate((el) => getComputedStyle(el).backgroundColor)
check('and is opaque, so content passes behind it', !/rgba\(0, 0, 0, 0\)|transparent/.test(opaque), opaque)
await page.goBack()
await page.waitForTimeout(250)

// One service now: the direct routes are retired, and the chip is how you get
// back to the working default after typing a Base URL of your own.
await open('?mock=1&howto=0&city=0')
await page.locator('.icon-btn[aria-label="Settings"]').click()
await page.waitForSelector('.settings-screen')
const chips = page.locator('.provider-list .chip')
check('the service chip is there', (await chips.count()) === 1, `${await chips.count()} chips`)
const row = await page.locator('.provider-list').boundingBox()
check(
  'and fits the phone',
  row.x >= -0.5 && row.x + row.width <= PHONE.width + 0.5,
  `${row.width.toFixed(0)}px on ${PHONE.width}px`,
)
// Type somewhere else, then tap the chip: the way back has to work, or a
// mistyped URL is a dead end on a phone with no keyboard shortcuts.
await page.locator('input[type="url"]').fill('https://somewhere-else.example/v1')
await page.waitForTimeout(200)
await chips.first().click()
await page.waitForTimeout(400)
const baseUrl = await page.locator('input[type="url"]').inputValue()
check(
  'and tapping it comes back to the proxy',
  baseUrl === 'https://cluecabulary-proxy.kristoffer-kai.workers.dev/v1',
  baseUrl,
)
const modelAfter = await page.locator('.settings-section input[type="text"]').first().inputValue()
// Cleared on purpose: a model id belongs to the service that published it, and
// a wrong one is a 404 that reads as a broken endpoint. The server is asked.
check('and clears the model rather than guessing one', modelAfter === '', `"${modelAfter}"`)
await page.goBack()
await page.waitForTimeout(250)

// A screenshot of Settings has to say which build it is, or "have you got the
// update yet?" cannot be answered.
await open('?mock=1&howto=0&city=0')
await page.locator('.icon-btn[aria-label="Settings"]').click()
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
await open('?mock=1&howto=0&seed=7&city=0&grid=beginner')
await page.locator('.home-play').click()
await page.waitForTimeout(700)
const info = await page.locator('.card-info').first().boundingBox()
const word = await page.locator('.card-da').first().boundingBox()
check(
  'the lookup button does not overlap the word',
  !(info.y + info.height > word.y && info.x < word.x + word.width),
)

// Turning a word green is the loop's whole reward and used to happen silently.
// Play a mock round to the end with every word one handling short of green.
await open('?mock=1&howto=0&seed=5&city=0&almost=100&grid=beginner')
await page.locator('.home-play').click()
await page.waitForSelector('.board-grid')
const study = page.locator('.study-dock .btn-primary')
if (await study.isVisible().catch(() => false)) await study.click()
await page.fill('.clue-input input', 'huskeliste')
await page.click('.clue-input .btn-primary')
await page.waitForFunction(
  () => !document.querySelector('.phase-caption')?.textContent?.includes('Cluey is guessing'),
  undefined,
  { timeout: 20000 },
)
// Drive to the end however the round went: guess on until the board is clear
// or the clues run out into sudden death.
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
  // There was a second exit here, for the last-chance form. It was written
  // against `.redemption-form`, a class that never existed, so it was dead for
  // its whole life; the form it was looking for is now gone too.
  await page.waitForTimeout(900)
}
const debriefed = (await page.locator('.debrief').count()) > 0
if (debriefed) {
  const shown = await page.locator('.collected-section').count()
  // The key dot is gone: your own key is the card's border now.
const greens = await page.locator('.word-card.mykey-green').count()
  check('a round that greens words says so', shown === 1, `${shown} sections, ${greens} key marks`)
} else {
  console.log('SKIP round did not reach a debrief on this seed')
}

// Cluey's whole turn used to happen in silence: no live region existed
// anywhere in the game loop.
await open('?mock=1&howto=0&seed=7&city=0&grid=beginner')
await page.locator('.home-play').click()
await page.waitForSelector('.board-grid')
const studyBtn = page.locator('.study-dock .btn-primary')
if (await studyBtn.isVisible().catch(() => false)) await studyBtn.click()
const regions = await page.locator('[aria-live], [role="status"], [role="alert"]').count()
check('the game loop has a live region', regions > 0, `${regions} found`)
const pressed = await page.locator('.game-header .icon-btn[aria-pressed]').count()
check('the translations toggle exposes its state', pressed === 1)

// The clue count. It arrived because a rule turned on it — the last chance
// opened after a given number of clues — and it outlives that rule: it is how
// far into the round you are, and how close sudden death is. A header that
// overflows or a count only sighted players get would each undo the point of
// showing it.
const header = await page.evaluate(() => {
  const h = document.querySelector('.game-header')
  const t = document.querySelector('.turn-tokens')
  return {
    overflows: h.scrollWidth > h.clientWidth + 1,
    count: t.querySelector('.token-count')?.textContent ?? '',
    label: t.getAttribute('aria-label') ?? '',
    pipsHidden: t.querySelector('.token-row')?.getAttribute('aria-hidden') === 'true',
  }
})
check('the header fits with the clue count in it', !header.overflows)
check('the count is on screen', /clues given/.test(header.count), header.count)
check('and in the accessible name, not only the pips', /clues given/.test(header.label), header.label)
check('and the pips do not read out twice', header.pipsHidden)
// It used to end with a sentence about whether the last chance was open. That
// rule is gone, and the label must not still describe it.
check('and says how many are left, not a rule that no longer exists', /left/.test(header.label) && !/last chance/i.test(header.label), header.label)

// The rules overlay claims role=dialog aria-modal; it has to behave like one.
await page.goto(BASE + '?mock=1', { waitUntil: 'networkidle' })
await page.waitForSelector('.howto')
const focusedInside = await page.evaluate(
  () => document.querySelector('.howto')?.contains(document.activeElement) ?? false,
)
check('the rules take focus when they open', focusedInside)
await page.keyboard.press('Escape')
await page.waitForTimeout(400)
check('Escape closes the rules', (await page.locator('.howto').count()) === 0)

// The practice companion needs no key, so neither nudge belongs on Home.
await open('?mock=1&howto=0&city=0')
check('no setup nudge with the practice companion', (await page.locator('.setup-nudge').count()) === 0)

// Connecting Cluey is the one thing a stuck player must be able to do from the
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
const panel = page.locator('.connect-cluey')
check('the setup steps are in the app', (await panel.count()) === 1)
check('and open while Cluey has never answered', await panel.evaluate((el) => el.open))
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

// Once Cluey has answered it is history, and must stop eating the screen.
await page.evaluate(() => {
  const raw = JSON.parse(localStorage.getItem('cluecab-settings-v1'))
  raw.state.klausVerifiedAt = Date.now()
  localStorage.setItem('cluecab-settings-v1', JSON.stringify(raw))
})
await open('?howto=0&city=0')
await page.locator('.btn').filter({ hasText: 'Settings' }).first().click().catch(() => {})
if ((await page.locator('.settings-screen').count()) === 0) {
  await page.evaluate(() => window.history.pushState({}, '', location.href))
  await page.locator('.icon-btn[aria-label="Settings"]').click()
}
await page.waitForSelector('.settings-screen', { timeout: 5000 })
check(
  'and collapses once Cluey has answered',
  (await page.locator('.connect-cluey').evaluate((el) => el.open)) === false,
)

// ---- The no-scroll principle, measured. -----------------------------------
// Every core screen fits the phone: document.scrollingElement.scrollHeight
// must not exceed the viewport, on the smallest phone we serve, in every
// game phase a player can sit in. The shell deliberately never clips
// (overflow stays visible), so any screen that outgrows the phone becomes
// document scroll and fails here — inflate any dock to prove the check bites.
const noScroll = async (name) => {
  const r = await page.evaluate(() => ({
    sh: document.scrollingElement.scrollHeight,
    ih: window.innerHeight,
  }))
  check(`no-scroll: ${name}`, r.sh <= r.ih + 1, `${r.sh} vs ${r.ih}`)
}

for (const vp of [
  { width: 360, height: 640, name: '360x640' },
  { width: 375, height: 667, name: '375x667' },
  { width: 390, height: 844, name: '390x844' },
]) {
  await page.setViewportSize({ width: vp.width, height: vp.height })

  await open('?mock=1&howto=0&city=0&collected=30')
  await noScroll(`home @${vp.name}`)

  await page.locator('.cluey-button').click()
  await page.waitForSelector('.suitcase-screen')
  await noScroll(`suitcase @${vp.name}`)

  await open('?mock=1&howto=0')
  await page.locator('.map-button').click()
  await page.waitForSelector('.denmark-map')
  await noScroll(`map @${vp.name}`)

  await open('?mock=1&howto=0')
  await page.locator('.icon-btn[aria-label="Settings"]').click()
  await page.waitForSelector('.settings-screen')
  await noScroll(`settings @${vp.name}`)

  // The game, in the phase measured tallest (the opening clue dock), on the
  // widest board.
  await open('?mock=1&howto=0&seed=7&grid=standard&first=player')
  await page.evaluate(() => localStorage.removeItem('cluecab-game-v1'))
  await open('?mock=1&howto=0&seed=7&grid=standard&first=player')
  await page.locator('.home-play').click()
  await page.waitForSelector('.board-grid')
  const studyBtn2 = page.locator('.study-dock .btn-primary')
  if (await studyBtn2.isVisible().catch(() => false)) await studyBtn2.click()
  await page.waitForTimeout(300)
  await noScroll(`game clue dock 4x5 @${vp.name}`)

  // And the wrap-up packing phase, the new dock.
  await open('?mock=1&howto=0&city=0&collected=40&seed=9')
  await page.evaluate(() => localStorage.removeItem('cluecab-game-v1'))
  await open('?mock=1&howto=0&city=0&collected=40&seed=9')
  await page.locator('.cluey-button').click()
  await page.waitForSelector('.suitcase-screen')
  await page.locator('.case-actions .btn-primary').click()
  await page.waitForSelector('.packing-dock')
  await page.locator('.card-face-en').first().click()
  await page.waitForTimeout(200)
  await noScroll(`wrap-up packing @${vp.name}`)
}
await page.setViewportSize(PHONE)

// ---- The keyboard, as the native shell actually delivers it. ---------------
// Keyboard.resize 'native' makes the OS shrink the webview to end where the
// keyboard begins. That is a viewport resize, which a browser can do exactly —
// so the behaviour is checkable here rather than only on a phone, which is
// where several builds went.
{
  const KB = 336
  await open('?mock=1&howto=0&seed=7&grid=standard&first=player')
  await page.evaluate(() => localStorage.removeItem('cluecab-game-v1'))
  await open('?mock=1&howto=0&seed=7&grid=standard&first=player')
  await page.locator('.home-play').click()
  await page.waitForSelector('.board-grid')
  const study = page.locator('.study-dock .btn-primary')
  if (await study.isVisible().catch(() => false)) await study.click()
  await page.waitForTimeout(250)

  const gridBefore = await page.locator('.board-grid').boundingBox()
  const cardBefore = await page.locator('.word-card').first().boundingBox()

  // What the native listener does on keyboardWillShow, then the OS resize.
  await page.evaluate(() => {
    const grid = document.querySelector('.board-grid')
    document.documentElement.style.setProperty(
      '--board-h',
      `${Math.round(grid.getBoundingClientRect().height)}px`,
    )
    document.documentElement.classList.add('kb-up')
    document.querySelector('.clue-input')?.classList.add('kb-lifted')
  })
  await page.setViewportSize({ width: PHONE.width, height: PHONE.height - KB })
  await page.waitForTimeout(300)

  const gridDuring = await page.locator('.board-grid').boundingBox()
  const cardDuring = await page.locator('.word-card').first().boundingBox()
  const same = (a, b) =>
    Math.abs(a.x - b.x) < 0.5 &&
    Math.abs(a.y - b.y) < 0.5 &&
    Math.abs(a.width - b.width) < 0.5 &&
    Math.abs(a.height - b.height) < 0.5
  check(
    'the board keeps its exact size when the keyboard takes the bottom third',
    same(gridBefore, gridDuring) && same(cardBefore, cardDuring),
    `grid ${Math.round(gridDuring.height)} vs ${Math.round(gridBefore.height)}, card ${Math.round(cardDuring.height)} vs ${Math.round(cardBefore.height)}`,
  )

  // The composer is the last thing in the layout, so it ends at the bottom of
  // what is left — which is the keyboard's top edge, with no arithmetic.
  const dock = await page.locator('.clue-input').boundingBox()
  const bottom = dock.y + dock.height
  check(
    'and the composer sits against the keyboard',
    bottom <= PHONE.height - KB + 1 && bottom >= PHONE.height - KB - 40,
    `composer ends at ${Math.round(bottom)}, screen ends at ${PHONE.height - KB}`,
  )
  await noScroll('game with the keyboard up')

  await page.setViewportSize(PHONE)
  await page.evaluate(() => {
    document.documentElement.classList.remove('kb-up')
    document.documentElement.style.removeProperty('--board-h')
    document.querySelector('.clue-input')?.classList.remove('kb-lifted')
  })
  await page.waitForTimeout(250)
  const gridAfter = await page.locator('.board-grid').boundingBox()
  check('and comes back untouched', same(gridBefore, gridAfter), `${Math.round(gridAfter.height)}`)
}

check('no page errors', errors.length === 0, errors.join(' | '))
await browser.close()
preview.stop()
console.log(fail.length ? `\nFAILED: ${fail.join(', ')}` : '\nLAYOUT DRIVE OK')
if (fail.length) process.exitCode = 1
