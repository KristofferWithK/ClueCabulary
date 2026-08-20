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
// Indices, not names, so they moved when Viborg came off the route: Skagen
// was 6 and is 5, København was 9 and is 8. Both cases still passed at the old
// numbers — they landed on Odense and on nothing at all — which is the quiet
// way an edge-case check stops being one.
for (const [city, name] of [
  [5, 'Skagen'],
  [8, 'Kobenhavn'],
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

// Home's progress band is one line and has to stay one line. It used to be an
// eyebrow, a bar and a four-part count that took THREE lines at 360px and left
// Casey a thumbnail. The widest the two counts can ever get is four digits
// between them — they are disjoint states, so the hundred splits one way or
// the other — and city 0 is Sønderborg, the longest name on the route.
//
// Counting lines by the tops of the range's client rects does not work here: a
// 0.9rem <strong> beside 0.72rem text has a different top on the SAME line and
// reads as two. Group by the vertical centre instead.
//
// Both checks were run against the band this replaced — the column layout with
// the four-part count — and both fail on it: three lines at 360px. Worth
// knowing which of them a given regression trips, because it is not the
// obvious one. Putting `discovered` and `to find` back *without* reverting the
// CSS still measures one line, because the count is `flex: 0 0 auto` and a
// flex item that cannot shrink never wraps; it pushes the row wider instead
// and the second check is what catches it. The line count only moves once the
// row goes back to a column. Between them they cover both ways out.
const progressLines = async () =>
  page.evaluate(() => {
    const el = document.querySelector('.collect-count')
    const range = document.createRange()
    range.selectNodeContents(el)
    const centres = []
    for (const r of range.getClientRects()) {
      if (r.height < 2) continue
      const c = r.top + r.height / 2
      if (!centres.some((x) => Math.abs(x - c) < 5)) centres.push(c)
    }
    const row = document.querySelector('.home-progress-band')
    const name = document.querySelector('.city-eyebrow')
    return {
      lines: centres.length,
      text: `${name.textContent} — ${el.textContent.replace(/\s+/g, ' ').trim()}`,
      overflows: row.scrollWidth > row.clientWidth + 1,
      clipped: name.scrollWidth > name.clientWidth + 1,
      wide: document.scrollingElement.scrollWidth > window.innerWidth + 1,
    }
  })

for (const query of [
  '?mock=1&howto=0&city=0&collected=30',
  '?mock=1&howto=0&city=0&wrapped=50&collected=100',
]) {
  await page.setViewportSize({ width: 360, height: 640 })
  await open(query)
  const p = await progressLines()
  check('the progress band is one line at 360px', p.lines === 1, p.text)
  check('and nothing in it overflows or is cut off', !p.overflows && !p.clipped && !p.wide)
}
// Wipe what that seeded. `?collected=100` gives every word in city 0 a full
// stats record, and `?almost=…` further down explicitly skips words that
// already have one — so leaving it stood there turned the round-greening
// section into a round that could not green anything, and the check under it
// failed a hundred lines away from the cause.
await page.evaluate(() => localStorage.clear())
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
  () => !document.querySelector('.phase-caption')?.textContent?.includes('Casey is guessing'),
  undefined,
  { timeout: 20000 },
)
// Drive to the end however the round went: guess on until the board is clear
// or the clues run out into sudden death.
for (let i = 0; i < 12 && (await page.locator('.round-summary').count()) === 0; i++) {
  const guessable = page.locator('.word-card.card-guessable').first()
  if (await guessable.isVisible().catch(() => false)) {
    await guessable.click()
    const confirm = page.locator('.guess-confirm .btn-primary')
    if (await confirm.isVisible().catch(() => false)) await confirm.click()
  } else {
    // '#clue-word', not '.clue-input input': the dock holds a second input (the
    // lookup box), so that locator matches two and fails strict mode INSIDE the
    // .catch below, silently. This loop had been spinning its twelve turns
    // without ever giving a second clue, and the end-screen checks under it
    // were skipped on every run — the same bug wrapup-drive already carries a
    // comment about.
    const clue = page.locator('#clue-word')
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
const summarised = (await page.locator('.round-summary').count()) > 0
if (summarised) {
  const shown = await page.locator('.collected-section').count()
  // The key dot is gone: your own key is the card's border now.
const greens = await page.locator('.word-card.mykey-green').count()
  check('a round that greens words says so', shown === 1, `${shown} sections, ${greens} key marks`)

  // ---- the end screen, on the tight phone, with the lid both ways ----------
  // The summary is the one screen with no upper bound on its height: the turn
  // log grows with the round, and opening it is the player adding content to a
  // screen that is already full. It scrolls inside .summary-scroll rather than
  // moving the document — the same bargain Settings makes — so the DOCUMENT
  // must sit still with the lid on AND off. Measured at 360x640, where it
  // would give first.
  const fits = async (what) => {
    const r = await page.evaluate(() => ({
      sh: document.scrollingElement.scrollHeight,
      ih: window.innerHeight,
    }))
    check(`no-scroll: ${what} @360x640`, r.sh <= r.ih + 1, `${r.sh} vs ${r.ih}`)
  }
  await page.setViewportSize({ width: 360, height: 640 })
  await page.waitForTimeout(300)
  check('the summary opens with its log shut', (await page.locator('.turn-log').count()) === 0)
  // Non-vacuity for the two measurements below. The sentences are the tallest
  // thing on this screen after the transcript — five of them are ~250px on a
  // 640px phone — so a no-scroll reading taken on a summary that happened to
  // render none of them would be measuring the old screen and passing for the
  // wrong reason.
  const sentenceRows = await page.locator('.round-sentence').count()
  check('the summary being measured has its sentences on it', sentenceRows > 0, `${sentenceRows} rows`)
  await fits('round summary, log shut')
  await page.locator('.log-toggle').click()
  await page.waitForTimeout(300)
  check('and one tap opens the log', (await page.locator('.turn-log').count()) === 1)
  await fits('round summary, log open')
  // The containing block itself, not only its consequence. Every guess in the
  // log carries a .visually-hidden span and .visually-hidden is
  // position:absolute, so without a positioned scroller they resolve against
  // .app-shell and park 1px boxes at whatever y the log reaches — measured at
  // 1027 on a 640px phone, document 1028 vs 640, while the scroller itself was
  // correctly clipping at 420. Asserted on offsetParent because the overflow it
  // causes only appears once the transcript is long enough, and the length of a
  // transcript is a property of the round, not of the layout.
  const hiddenHome = await page.evaluate(() => {
    const span = document.querySelector('.turn-log .visually-hidden')
    return span ? (span.offsetParent?.className ?? '(none — it reached the document)') : '(no span)'
  })
  check(
    "the log's hidden labels resolve inside the scroller, not against the shell",
    /summary-scroll/.test(hiddenHome),
    hiddenHome,
  )
  // Play again sits OUTSIDE the scroller for exactly this reason: a long
  // transcript must not push the way out of the round off the phone.
  const playAgain = await page.locator('.summary-actions .btn-primary').boundingBox()
  check(
    'and Play again is still on the phone underneath it',
    playAgain.y + playAgain.height <= 640.5,
    `bottom ${(playAgain.y + playAgain.height).toFixed(0)} of 640`,
  )
  await page.setViewportSize(PHONE)
  await page.waitForTimeout(200)
} else {
  console.log('SKIP round did not reach a summary on this seed')
}

// Casey's whole turn used to happen in silence: no live region existed
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

// Nor on a fresh profile, which is the case that mattered: Home used to test
// `settings.apiKey`, a field settings v7 cleared everywhere and nothing writes
// any more, so "Add your API key in Settings" greeted every player of a game
// that talks to the proxy without one. This is the check that would have
// caught it — a real first run, no mock, nothing stored.
await page.evaluate(() => localStorage.clear())
await open('?howto=0&city=0')
check(
  'and none at all on a fresh profile',
  (await page.locator('.setup-nudge').count()) === 0,
  await page.locator('.cluey-bubble').first().innerText(),
)

// But a base URL of your own with no key in the app is NOT a fresh profile —
// it is the setup the deploy guide recommends, a worker holding the key as a
// Cloudflare secret. Those players have configured something and have to be
// able to hear that it is not answering. Testing the key alone left them with
// nothing, which proxy-drive found the hard way: it walks that exact setup and
// reached Settings through the banner this card deleted.
await page.evaluate(() => {
  const raw = JSON.parse(localStorage.getItem('cluecab-settings-v1') ?? '{}')
  raw.state = {
    ...raw.state,
    useMock: false,
    apiKey: '',
    baseUrl: 'http://127.0.0.1:9/v1',
    klausVerifiedAt: null,
  }
  localStorage.setItem('cluecab-settings-v1', JSON.stringify(raw))
})
await open('?howto=0&city=0')
check(
  'a worker of your own that has never answered does prompt, with no key in the app',
  (await page.locator('.cluey-bubble.setup-nudge').count()) === 1,
)
await page.evaluate(() => localStorage.clear())

// Connecting Casey is the one thing a stuck player must be able to do from the
// phone in their hand, so the steps live in the app rather than behind a link
// to a markdown file. They have to fit the screen and be reachable.
await page.evaluate(() => {
  const raw = JSON.parse(localStorage.getItem('cluecab-settings-v1') ?? '{}')
  raw.state = { ...raw.state, useMock: false, apiKey: 'a-key', klausVerifiedAt: null }
  localStorage.setItem('cluecab-settings-v1', JSON.stringify(raw))
})
await open('?howto=0&city=0')
// The prompt that survives is the one that means something — an own key that
// has never produced an answer — and it speaks through Casey now rather than
// from a banner above the map.
check(
  'the prompt that survives comes out of Casey mouth',
  (await page.locator('.cluey-bubble.setup-nudge').count()) === 1,
)
await page.locator('.setup-nudge').first().click()
await page.waitForSelector('.settings-screen')
const panel = page.locator('.connect-cluey')
check('the setup steps are in the app', (await panel.count()) === 1)
check('and open while Casey has never answered', await panel.evaluate((el) => el.open))
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

// Once Casey has answered it is history, and must stop eating the screen.
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
  'and collapses once Casey has answered',
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

  // The open case is the screen rather than a band on it (E1), and it holds
  // that at every phone size — the compartments are a fixed count of slots on
  // stretching rows, so a taller phone is meant to grow the case rather than
  // leave a gap under it. And the city filter scrolls INSIDE itself: the one
  // sideways scroller on the screen must never become the document's.
  const caseBox = await page.evaluate(() => {
    const c = document.querySelector('.case-open')
    return {
      h: c ? Math.round(c.getBoundingClientRect().height) : 0,
      ih: window.innerHeight,
      dw: document.scrollingElement.scrollWidth,
      iw: window.innerWidth,
    }
  })
  check(
    `the open case fills the phone @${vp.name}`,
    caseBox.h >= caseBox.ih * 0.45,
    `${caseBox.h} of ${caseBox.ih}`,
  )
  check(
    `no sideways scroll on the suitcase @${vp.name}`,
    caseBox.dw <= caseBox.iw + 1,
    `${caseBox.dw} vs ${caseBox.iw}`,
  )

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
  // &wraps=1 banks the earned wrap-up round the button now costs.
  await open('?mock=1&howto=0&city=0&collected=40&seed=9&wraps=1')
  await page.evaluate(() => localStorage.removeItem('cluecab-game-v1'))
  // &wraps=1 banks the earned wrap-up round the button now costs.
  await open('?mock=1&howto=0&city=0&collected=40&seed=9&wraps=1')
  await page.locator('.cluey-button').click()
  await page.waitForSelector('.suitcase-screen')
  await page.locator('.case-actions .btn-primary').click()
  await page.waitForSelector('.packing-dock')
  // Hear-the-board is gone in this phase, not merely quiet. The cards are
  // English-side up and the dictionary is shut, so reading the Danish aloud
  // would be handing over the answer key to the one round that packs words for
  // good. Absence rather than a disabled button: there is then no control to
  // explain, and nothing to tap twice by accident.
  check(
    `hear-the-board is absent while the board is English-side up @${vp.name}`,
    (await page.locator('.hear-board').count()) === 0,
  )
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

// ---- the ride (localStorage cluecab-kbfast), and what it may not change ----
//
// The experiment makes the composer arrive EARLY. It is allowed to change when
// the dock moves and nothing else — least of all where it stops, which cost
// three builds to get right.
//
// Both modes are run through the app's own keyboard path rather than through a
// hand-written imitation of it, which is what cluecab-kbsim is for. What that
// cannot show is the real thing's timing, since there is no iOS keyboard here
// to be early relative to; what it can show is that the ride happens at all,
// that it does not happen with the flag off, and that both come to rest in
// exactly the same place. Those are the three claims this experiment makes.
{
  const KB = 336
  // Watch rather than sample. Reading the transform "while the ride is on" is a
  // race the drive loses on a busy machine — it did, and reported a working
  // ride as absent because it looked 300ms too late. This records every inline
  // style a dock is ever given, and where the document had got to at that
  // point, so the claim is checked against what happened rather than against
  // whatever a lucky poll caught. Registered once: addInitScript accumulates,
  // and two copies would record everything twice.
  await page.addInitScript(() => {
    window.__ride = []
    // Whether the document had been shrunk yet, carried along by hand rather
    // than read from the DOM inside the callback. Mutation records arrive in a
    // batch, after the fact, so reading document.body there answers "at the end
    // of the batch" and would call a transform written BEFORE the shrink one
    // written after it. The records themselves are in order, so walking them
    // keeps the sequence honest.
    let shrunk = false
    new MutationObserver((records) => {
      for (const r of records) {
        const el = r.target
        if (!(el instanceof HTMLElement)) continue
        window.__ride.push({
          // Every style write, not only the docks', so that "no dock was ever
          // transformed" is visibly a count of something rather than a count
          // of nothing.
          what: el === document.body ? 'body' : el.classList.contains('dock') ? 'dock' : 'other',
          transform: el.style.transform,
          shrunk,
        })
        if (el === document.body) shrunk = document.body.style.height !== ''
      }
    }).observe(document, { attributes: true, subtree: true, attributeFilter: ['style'] })
  })

  const arm = async (fast) => {
    // A round to be in the middle of, saved, and then resumed by the reload —
    // cluecab-kbsim and the flag are both read once, at mount.
    await open('?mock=1&howto=0&seed=7&grid=standard&first=player')
    await page.evaluate(() => localStorage.removeItem('cluecab-game-v1'))
    await open('?mock=1&howto=0&seed=7&grid=standard&first=player')
    await page.locator('.home-play').click()
    await page.waitForSelector('.board-grid')
    const study = page.locator('.study-dock .btn-primary')
    if (await study.isVisible().catch(() => false)) await study.click()
    await page.waitForTimeout(250)

    await page.evaluate(
      ([kb, on]) => {
        localStorage.setItem('cluecab-kbsim', String(kb))
        if (on) localStorage.setItem('cluecab-kbfast', '1')
        else localStorage.removeItem('cluecab-kbfast')
      },
      [KB, fast],
    )
    await open('?mock=1&howto=0')
    // A condition, not a duration: the keyboard is up, the document has
    // shrunk, and nothing is holding the dock but the layout.
    await page.waitForFunction(
      () =>
        document.documentElement.classList.contains('kb-up') &&
        document.body.style.height !== '' &&
        !document.querySelector('.dock.kb-lifted')?.style.transform,
      null,
      { timeout: 15000 },
    )
    const during = await page.evaluate(() => window.__ride ?? [])
    const rest = await page.evaluate(() => {
      const d = document.querySelector('.dock.kb-lifted')
      const b = d.getBoundingClientRect()
      return {
        top: Math.round(b.top),
        bottom: Math.round(b.bottom),
        transform: d.style.transform,
        transition: d.style.transition,
        body: document.body.style.height,
        board: Math.round(document.querySelector('.board-grid').getBoundingClientRect().height),
      }
    })
    await page.evaluate(() => {
      localStorage.removeItem('cluecab-kbsim')
      localStorage.removeItem('cluecab-kbfast')
    })
    return { during, rest }
  }

  const off = await arm(false)
  const on = await arm(true)

  // Inert without the flag: the dock is never given a transform, and the
  // document shrinks the moment the keyboard is declared, exactly as before.
  const moved = (log) => log.filter((e) => e.what === 'dock' && e.transform !== '')
  check(
    'without cluecab-kbfast the dock is never transformed',
    moved(off.during).length === 0 && off.rest.transform === '' && off.rest.transition === '',
    `${off.during.length} style writes, ${moved(off.during).length} of them a transform`,
  )

  // Not a vacuous pair: with the flag on there really is a ride, and it is
  // carrying the dock while the document is still at its full height — which
  // is the lateness being compensated for, caught in the act.
  const ahead = moved(on.during).filter((e) => /^translateY\(-\d/.test(e.transform) && !e.shrunk)
  check(
    'with cluecab-kbfast the dock rides ahead of the document',
    ahead.length > 0,
    ahead.length ? ahead[0].transform : `nothing rode: ${JSON.stringify(on.during)}`,
  )
  // And hands back: what holds the dock up afterwards is the layout, not us.
  check(
    'and hands the dock back to the layout when it lands',
    on.rest.transform === '' && on.rest.transition === '' && on.rest.body === off.rest.body,
    `transform ${JSON.stringify(on.rest.transform)}, body ${on.rest.body} vs ${off.rest.body}`,
  )

  // The measurement that matters: same resting place, to the pixel.
  check(
    'and comes to rest in exactly the same place either way',
    on.rest.top === off.rest.top && on.rest.bottom === off.rest.bottom,
    `fast ${on.rest.top}–${on.rest.bottom}, today ${off.rest.top}–${off.rest.bottom}`,
  )
  check(
    'and the board is the same height either way',
    on.rest.board === off.rest.board,
    `${on.rest.board} vs ${off.rest.board}`,
  )
}

// ---- The board never moves. ------------------------------------------------
//
// "When guessing it's a giant text block that adjusts the sizing of the grid.
// The grid should stay locked. and the text can be cut."
//
// The board is a flex:1 area sharing the game screen's column with the dock,
// so every line the dock gained came off the grid, and the grid resized every
// card with it. Measured before the reserve, over one seeded round at 360x640:
// 200px of board height and 18px of board position, phase to phase.
//
// This is the assertion that keeps it fixed, and it is the point of the whole
// change — the reserve without it regresses the first time a dock grows a line.
//
// Sampled on every animation frame rather than polled between phases, because
// the drift is a WITHIN-phase event: a lookup answer arriving, a card being
// selected, Casey's guess line changing every 1100ms. A poll placed at the
// phase boundaries would have caught none of the seven states below, and would
// have passed just as happily before the fix.
{
  const VP = { width: 360, height: 640 }
  await page.setViewportSize(VP)
  // Standard: the widest board, so the tightest layout, and eight clue tokens
  // rather than five — long enough for the round to reach both sudden death
  // and the fullest the guess dock ever gets (a card selected, the stop button
  // showing and a lookup answer up, all at once), which the beginner board
  // finishes before it can produce.
  const Q = '?mock=1&howto=0&seed=7&city=0&grid=standard&first=player'
  await open(Q)
  await page.evaluate(() => localStorage.removeItem('cluecab-game-v1'))
  await open(Q)
  await page.locator('.home-play').click()
  await page.waitForSelector('.board-grid')
  const studyDock = page.locator('.study-dock .btn-primary')
  if (await studyDock.isVisible().catch(() => false)) await studyDock.click()
  await page.waitForTimeout(300)

  // Installed with evaluate rather than addInitScript on purpose: the round is
  // played without a navigation, and addInitScript accumulates across the ones
  // the ride section above already registered.
  await page.evaluate(() => {
    window.__board = {}
    const tick = () => {
      const grid = document.querySelector('.board-grid')
      const cap = document.querySelector('.phase-caption')
      // __where lets a state that is not a phase — a lookup answer on screen —
      // be recorded under its own name instead of smearing into the phase it
      // happens inside.
      const key = window.__where ?? (cap?.firstChild?.textContent ?? '').trim()
      if (grid && key) {
        const b = grid.getBoundingClientRect()
        const at = (window.__board[key] ??= { n: 0 })
        for (const f of ['x', 'y', 'width', 'height']) {
          const v = Math.round(b[f] * 100) / 100
          at[`${f}lo`] = at.n ? Math.min(at[`${f}lo`], v) : v
          at[`${f}hi`] = at.n ? Math.max(at[`${f}hi`], v) : v
        }
        // The dock's own height, which is the mechanism: the board is what is
        // left over once the dock has taken its reserve, so a dock that is the
        // same height in every phase IS a board that does not move. Recorded
        // beside the effect so a failure says which of the two broke.
        const dock = document.querySelector('.game-screen .dock')
        if (dock) {
          const d = Math.round(dock.getBoundingClientRect().height * 100) / 100
          at.docklo = at.n ? Math.min(at.docklo, d) : d
          at.dockhi = at.n ? Math.max(at.dockhi, d) : d
        }
        at.n++
      }
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
  const where = (w) => page.evaluate((w) => (window.__where = w), w)

  // Hear-the-board, recorded as its own state so its frames join the one
  // rectangle every phase is compared against. It is a header control on a
  // screen whose header is the ceiling the board hangs from, and it swaps its
  // own glyph while running (▶ → ■) — a header that grew by a line would take
  // the whole board down with it, silently, in the phase the player is staring
  // hardest at. Measured mid-tour, not just before and after.
  await where('hear the board playing')
  await page.locator('.hear-board').click()
  await page.waitForTimeout(1500)
  const tourPressed = await page.locator('.hear-board').getAttribute('aria-pressed')
  check('hear-the-board reports itself playing', tourPressed === 'true', String(tourPressed))
  // A second tap stops it — the control is the same control, and a tour that
  // could only be waited out would be the study phase again with extra steps.
  await page.locator('.hear-board').click()
  await page.waitForTimeout(200)
  check(
    'and a second tap stops it',
    (await page.locator('.hear-board').getAttribute('aria-pressed')) === 'false',
  )
  await where(null)

  // "nice" has seven Danish glosses in the shipped set, cut to four by the UI —
  // the longest answer the offline half of the dictionary can produce, and the
  // single worst offender measured (188px of board on the clue dock).
  let lookedUp = 0
  // `while` runs with the answers ON SCREEN. The first version of this took its
  // reading after clearing the field, which made the one check that was meant
  // to catch an overflowing dock a check on an empty one — it passed on a
  // reserve that really did push the document to 657px on a 640px screen.
  const longLookup = async (label, while_) => {
    const field = page.locator('.game-screen .translate-input').first()
    if (!(await field.isVisible().catch(() => false))) return
    await where(label)
    await field.fill('nice')
    await page.waitForTimeout(900)
    const hits = await page.locator('.translate-hits li').count()
    if (hits >= 4) lookedUp++
    await page.waitForTimeout(200)
    if (while_) await while_()
    await field.fill('')
    await page.waitForTimeout(300)
    await where(null)
    return hits
  }

  let clueLookupHits = 0
  let guessLookupHits = 0
  let worst = null
  // .round-summary, not .debrief — the round-end screen was renamed while this
  // was being written, and a loop that waits for a class nobody renders any
  // more just runs its full count. This file already carries one scar of that
  // shape (see the `.redemption-form` note above, dead for its whole life).
  for (let i = 0; i < 26 && (await page.locator('.round-summary').count()) === 0; i++) {
    const clue = page.locator('.clue-input #clue-word')
    if (await clue.isVisible().catch(() => false)) {
      if (!clueLookupHits) clueLookupHits = (await longLookup('clue dock + lookup')) ?? 0
      await clue.fill(`kluex${i}`)
      await page.waitForTimeout(200)
      const send = page.locator('.clue-input .btn-primary')
      if (await send.isEnabled().catch(() => false)) {
        await send.click()
        await page.waitForTimeout(850)
        continue
      }
    }

    const guessable = page.locator('.word-card.card-guessable').first()
    if (await guessable.isVisible().catch(() => false)) {
      if (!guessLookupHits) guessLookupHits = (await longLookup('guess bar + lookup')) ?? 0
      await guessable.click()
      await page.waitForTimeout(200)
      // The fullest the dock ever is, and the state the reserve is sized
      // against: a card selected (a 44px confirm row where a one-line hint
      // was), the stop button once a guess has been made, and a four-hit
      // lookup answer, all at once. Recorded so its rect joins the comparison.
      const fullest =
        !worst &&
        (await page.locator('.guess-bar .btn-ghost').count()) > 0 &&
        (await page.locator('.guess-bar .guess-confirm').count()) > 0 &&
        (await page.locator('.guess-bar .translate-input').count()) > 0
      if (fullest) {
        await longLookup('guess bar, everything at once', async () => {
          worst = await page.evaluate(() => {
            const dock = document.querySelector('.game-screen .dock')
            const bottom = dock.getBoundingClientRect().bottom
            // How far past the dock's own bottom edge anything inside it
            // reaches. The reserve is only honest if this is zero: a dock
            // whose content hangs out of it has not reserved anything.
            const out = [...dock.querySelectorAll('*')].map((el) =>
              Math.round((el.getBoundingClientRect().bottom - bottom) * 10) / 10,
            )
            return {
              sh: document.scrollingElement.scrollHeight,
              ih: window.innerHeight,
              spill: Math.max(0, ...out),
              hits: dock.querySelectorAll('.translate-hits li').length,
            }
          })
        })
      }
      const confirm = page.locator('.guess-confirm .btn-primary')
      if (await confirm.isVisible().catch(() => false)) {
        await confirm.click()
        await page.waitForTimeout(650)
        continue
      }
    }
    await page.waitForTimeout(550)
  }

  const board = await page.evaluate(() => window.__board)
  const states = Object.entries(board).filter(([k]) => k !== 'Round over')
  const rects = states.map(([k, v]) => [k, v])

  // Not vacuous: the round has to have BEEN in the phases being compared, or
  // "they all match" is a statement about one of them.
  const seen = new Set(states.map(([k]) => k))
  const required = [
    'Give Casey a clue',
    'Casey is guessing',
    'Your turn to guess',
    'Sudden death — no clues left',
    'clue dock + lookup',
    'guess bar + lookup',
    'hear the board playing',
  ]
  const missing = required.filter((r) => !seen.has(r))
  check(
    'the seeded round passed through every phase this compares',
    missing.length === 0,
    missing.length ? `missing ${missing.join(', ')}` : [...seen].join(' | '),
  )
  // aiClueInput ("Casey prepares a clue") is deliberately not in that list,
  // and its absence is a measurement rather than an oversight: against the
  // offline companion it does not survive a paint — the mock's clue resolves
  // in a microtask, so React has committed playerGuessing before the next
  // frame, and ~4800 sampled frames over two full rounds caught it zero times.
  // It renders the same .ai-panel dock as "Casey is guessing", which IS
  // measured, and the reserve below is declared on the dock's class rather
  // than on the phase — so the two cannot come out different.
  const docks = rects.map(([k, v]) => [k, v.docklo, v.dockhi])
  const dockLo = Math.min(...docks.map(([, lo]) => lo))
  const dockHi = Math.max(...docks.map(([, , hi]) => hi))
  check(
    'and every dock it rendered reserved the same height',
    dockLo === dockHi,
    dockLo === dockHi
      ? `${dockLo}px in all of them`
      : docks.map(([k, lo, hi]) => `${k} ${lo}..${hi}`).join(' | '),
  )
  check(
    'and the lookups really put four answers on screen',
    clueLookupHits >= 4 && guessLookupHits >= 4,
    `clue dock ${clueLookupHits}, guess bar ${guessLookupHits}`,
  )

  // The measurement. Every frame of every phase, one rectangle.
  const span = (f) => {
    const lo = Math.min(...rects.map(([, v]) => v[`${f}lo`]))
    const hi = Math.max(...rects.map(([, v]) => v[`${f}hi`]))
    return { lo, hi, drift: Math.round((hi - lo) * 100) / 100 }
  }
  const y = span('y')
  const h = span('height')
  const x = span('x')
  const w = span('width')
  const frames = rects.reduce((n, [, v]) => n + v.n, 0)
  const worstOf = (f) =>
    rects
      .map(([k, v]) => `${k} ${v[`${f}lo`]}..${v[`${f}hi`]}`)
      .join(' | ')

  check(
    'the board is the same rectangle in every phase of a round',
    y.drift === 0 && h.drift === 0 && x.drift === 0 && w.drift === 0,
    `${rects.length} states, ${frames} frames — top drift ${y.drift}px, height drift ${h.drift}px` +
      (y.drift || h.drift ? `\n     ${worstOf(y.drift ? 'y' : 'height')}` : ` (top ${y.lo}, height ${h.lo})`),
  )

  // The fullest state the guess dock reaches — a card selected, the stop
  // button showing and four lookup answers up, all at once. This is where the
  // reserve is deliberately smaller than the content, and the answers list is
  // what has to give. It must give way INSIDE itself: nothing may hang out of
  // the dock, and the document must not lengthen.
  check(
    'the fullest the guess dock gets stays inside its reserve',
    worst ? worst.spill <= 0.5 && worst.sh <= worst.ih + 1 && worst.hits >= 4 : false,
    worst
      ? `${worst.hits} answers up, ${worst.spill}px past the dock, document ${worst.sh} vs ${worst.ih}`
      : 'never reached a selected card with the stop button and a lookup',
  )
  await page.setViewportSize(PHONE)
}

check('no page errors', errors.length === 0, errors.join(' | '))
await browser.close()
preview.stop()
console.log(fail.length ? `\nFAILED: ${fail.join(', ')}` : '\nLAYOUT DRIVE OK')
if (fail.length) process.exitCode = 1
