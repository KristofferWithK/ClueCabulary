// The train in (O1) and the tutorial round (O2): a fresh device opens inside
// the train, Casey speaks, the ticket confirms the language, and then a real
// scripted round on the real beginner board teaches the game before the app
// lands Home exactly once.
//
// What this drives, on the smallest phone we serve (360×640):
//   - the gate: fresh runs, veterans (rules seen / words in the SRS map) go
//     straight Home and are marked done silently, ?howto=0 suppresses without
//     writing, a mid-flow marker resumes at its act
//   - skip, always visible and working from EVERY act — the tutorial included
//   - the ticket is a card, never a one-entry <select>, in the
//     `name — endonym` format Settings' picker uses
//   - the whole tutorial round, tap by tap, DRIVEN BY THE DOCK ITSELF: the
//     drive reads data-beat/data-target and does what the script asks, so an
//     edited script cannot silently outrun this test
//   - a reload mid-round resumes the round with its reveals intact
//   - the round finishes with the network cut — offline by construction
//   - Settings' "Replay the intro" reruns the flow without touching the flag
//   - no document scroll in any act
import { chromium } from 'playwright'
import { startPreview } from './preview-server.mjs'

const PORT = 4183
const preview = await startPreview(PORT)

const EXE = process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium'
const BASE = preview.base
// The tight case. The whole flow is measured where it would give first.
const VP = { width: 360, height: 640 }

const browser = await chromium.launch({ executablePath: EXE })
const ctx = await browser.newContext({ viewport: VP })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(String(e)))

const fail = []
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) fail.push(name)
}

const open = async (query = '') => {
  await page.goto(BASE + query, { waitUntil: 'networkidle' })
  await page.waitForTimeout(400)
}
const act = () =>
  page.evaluate(() => document.querySelector('.onboard-screen')?.dataset.act ?? null)
const marker = () => page.evaluate(() => localStorage.getItem('cluecab-onboard-v1'))
const atHome = async () => (await page.locator('.home-play').count()) === 1
const inTutorial = async () => (await page.locator('.tutorial-dock').count()) === 1
const beatKind = () =>
  page.evaluate(() => document.querySelector('.tutorial-dock')?.dataset.beat ?? null)
const noScroll = async (name) => {
  const r = await page.evaluate(() => ({
    sh: document.scrollingElement.scrollHeight,
    ih: window.innerHeight,
  }))
  check(`no-scroll: ${name}`, r.sh <= r.ih + 1, `${r.sh} vs ${r.ih}`)
}
const skipOnScreen = async (where) => {
  const skip = await page.locator('.onboard-skip').boundingBox()
  check(
    `Skip is visible at the ${where}`,
    skip && skip.y >= 0 && skip.y + skip.height <= VP.height + 0.5,
    skip ? `bottom ${(skip.y + skip.height).toFixed(0)} of ${VP.height}` : 'no skip button',
  )
}

/**
 * Play tutorial beats by doing exactly what the dock asks for, until a
 * predicate says stop or the script wins. Returns how the loop ended.
 */
async function playBeats({ until = async () => false, cap = 80 } = {}) {
  for (let i = 0; i < cap; i++) {
    await page.waitForTimeout(120)
    if (await until()) return 'until'
    const kind = await beatKind()
    if (kind === 'win') return 'win'
    if (kind === 'say') {
      await page.locator('.tutorial-next').click()
    } else if (kind === 'tapCard') {
      await page.locator('.word-card').first().click()
    } else if (kind === 'chooseClue') {
      await page.locator('.tutorial-clue-option').first().click()
    } else if (kind === 'watchGuess') {
      const btn = page.locator('.tutorial-next')
      await btn.waitFor({ state: 'visible' })
      // The plan can still be in flight for a beat; the button says so.
      for (let w = 0; w < 20 && !(await btn.isEnabled()); w++) await page.waitForTimeout(100)
      await btn.click()
    } else if (kind === 'guess') {
      const target = await page.evaluate(
        () => document.querySelector('.tutorial-dock')?.dataset.target,
      )
      if (!target) return 'no-target'
      await page.locator(`.word-card:has(.card-word:text-is("${target}"))`).click()
      await page.locator('.guess-confirm .btn-primary').click()
    } else {
      return `unknown-beat:${kind}`
    }
  }
  return 'cap'
}

// ---- a genuinely fresh device opens inside the train -----------------------
await open()
check('a fresh device opens inside the train', (await act()) === 'train')
check('Casey is at the window', (await page.locator('.onboard-casey .cluey-svg').count()) === 1)
const firstLine = (await page.locator('.onboard-bubble').innerText()).trim()
check('and speaks', firstLine.length > 0, firstLine.slice(0, 50))
await skipOnScreen('train')
await noScroll('the train act')

// Tap through the welcome. Three lines, then the ticket.
const lines = [firstLine]
for (let i = 0; i < 6 && (await act()) === 'train'; i++) {
  await page.locator('.onboard-next').click()
  await page.waitForTimeout(150)
  if ((await act()) === 'train') lines.push((await page.locator('.onboard-bubble').innerText()).trim())
}
check('the welcome is three distinct tapped lines', new Set(lines).size === 3, `${lines.length} taps`)
check('and then he asks for a destination', (await act()) === 'ticket')

// ---- the ticket: a confirm card, never a one-entry select ------------------
const tickets = await page.locator('.onboard-ticket').count()
check('one shipped language, one ticket card', tickets === 1, `${tickets} cards`)
check(
  'and never a select',
  (await page.locator('.onboard-screen select').count()) === 0,
)
const ticketText = (await page.locator('.onboard-ticket').innerText()).replace(/\s+/g, ' ')
check(
  'the ticket reads name — endonym, the format Settings uses',
  /Danish — Dansk/.test(ticketText),
  ticketText,
)
check('and says where and how much', /Denmark/.test(ticketText) && /900 words/.test(ticketText), ticketText)
check('the flow marker resumed-from is down before the reload could need it', (await marker()) === 'ticket')
await skipOnScreen('ticket')
await noScroll('the ticket act')

// ---- the ticket opens the tutorial round (O2) ------------------------------
await page.locator('.onboard-ticket').click()
await page.waitForSelector('.tutorial-dock')
check('the ticket opens the tutorial round', await inTutorial())
check('and writes the tutorial marker', (await marker()) === 'tutorial')
check('a real 3×4 board is dealt', (await page.locator('.word-card').count()) === 12)
check(
  'Casey is on screen beside the board',
  (await page.locator('.tutorial-dock .cluey-svg').count()) === 1 &&
    (await page.locator('.board-grid').count()) === 1,
)
await skipOnScreen('tutorial')
await noScroll('the tutorial, first beat')

// Play as far as the scripted miss: the first ✕ on the board is the
// directional burn the script stages on «barn».
const missOnBoard = async () => (await page.locator('.card-mark').count()) >= 1
const missLeg = await playBeats({ until: missOnBoard })
check('the scripted miss lands on the board as a ✕', missLeg === 'until', missLeg)
check('…with the first green already found', (await page.locator('.card-green').count()) >= 1)
check('and the round is still mid-script, marker unmoved', (await marker()) === 'tutorial')
await noScroll('the tutorial, after the miss')

// ---- a reload mid-round resumes the same round -----------------------------
await open()
check('a reload mid-tutorial comes back to the round', await inTutorial())
check('with the burn still on the board', await missOnBoard())
check('and the found card still green', (await page.locator('.card-green').count()) >= 1)

// ---- and the rest of the round completes with the network cut --------------
await ctx.setOffline(true)
const endLeg = await playBeats()
await ctx.setOffline(false)
check('the round plays to the win with the network cut', endLeg === 'win', endLeg)
check('confetti falls', (await page.locator('.confetti').count()) === 1)
const winLine = (await page.locator('.tutorial-bubble').innerText()).trim()
check('and Casey says the case line', /green both ways/i.test(winLine), winLine.slice(0, 60))
await page.locator('.tutorial-continue').click()
await page.waitForTimeout(400)
check('the tutorial lands Home', await atHome())
check('and the flow is marked done', (await marker()) === 'done')
// The tutorial's words counted: the case now holds discovered words.
const discovered = await page.evaluate(() => {
  const raw = localStorage.getItem('cluecab-srs-v1')
  const stats = raw ? JSON.parse(raw)?.state?.stats : null
  return stats ? Object.keys(stats).length : 0
})
check('the tutorial words entered the SRS for real', discovered === 12, `${discovered} records`)
// But no game was recorded, and nothing was earned — the first REAL win stays
// the unlock moment.
const games = await page.evaluate(() => {
  const raw = localStorage.getItem('cluecab-srs-v1')
  const s = raw ? JSON.parse(raw)?.state : null
  return s ? { played: s.games?.played ?? 0, banked: s.wrapUpsBanked ?? 0 } : null
})
check('but no game and no wrap-up were recorded', games && games.played === 0 && games.banked === 0, JSON.stringify(games))
await open()
check('a reload goes straight Home', (await atHome()) && (await act()) === null)

// ---- skip works from every act ---------------------------------------------
await page.evaluate(() => localStorage.clear())
await open()
check('skip at the train act…', (await act()) === 'train')
await page.locator('.onboard-skip').click()
await page.waitForTimeout(300)
check('…lands Home', await atHome())
check('…and marks done', (await marker()) === 'done')

await page.evaluate(() => localStorage.clear())
await open()
for (let i = 0; i < 3; i++) await page.locator('.onboard-next').click()
await page.waitForTimeout(200)
check('skip at the ticket act…', (await act()) === 'ticket')
await page.locator('.onboard-skip').click()
await page.waitForTimeout(300)
check('…also lands Home marked done', (await atHome()) && (await marker()) === 'done')

await page.evaluate(() => localStorage.clear())
await open()
for (let i = 0; i < 3; i++) await page.locator('.onboard-next').click()
await page.waitForTimeout(200)
await page.locator('.onboard-ticket').click()
await page.waitForSelector('.tutorial-dock')
check('skip at the tutorial act…', await inTutorial())
await page.locator('.onboard-skip').click()
await page.waitForTimeout(300)
check('…lands Home marked done too', (await atHome()) && (await marker()) === 'done')
const staleRound = await page.evaluate(() => {
  const raw = localStorage.getItem('cluecab-game-v1')
  return raw ? JSON.parse(raw)?.state?.game !== null : false
})
check('…and leaves no half-round behind for Home to resume', !staleRound)

// ---- resume: a reload mid-flow picks up at the recorded act ----------------
await page.evaluate(() => {
  localStorage.clear()
  localStorage.setItem('cluecab-onboard-v1', 'ticket')
})
await open()
check('a mid-flow reload resumes at the ticket', (await act()) === 'ticket')

// A tutorial marker with no round in the store deals the round afresh.
await page.evaluate(() => {
  localStorage.clear()
  localStorage.setItem('cluecab-onboard-v1', 'tutorial')
})
await open()
check('a tutorial marker with no round resumes by dealing it', await inTutorial())

// ---- veterans are never ambushed --------------------------------------------
// The rules overlay seen once is proof enough of an existing device.
await page.evaluate(() => {
  localStorage.clear()
  localStorage.setItem('cluecab-howto-v4', 'seen')
})
await open()
check('a device that has seen the rules goes straight Home', await atHome())
check('and is marked done silently', (await marker()) === 'done')

// So are words in the SRS map — seeded through the real dev switch so the
// record is exactly the shape the store writes, then read on a plain load.
await page.evaluate(() => localStorage.clear())
await open('?mock=1&howto=0&learned=5')
check('seeding left the onboarding key untouched', (await marker()) === null)
await open()
check('a device with words in the case goes straight Home', await atHome())
check('and is marked done silently too', (await marker()) === 'done')

// ---- ?howto=0 suppresses, writing nothing ------------------------------------
// Dozens of drive URLs carry it; a fresh profile under it must stay fresh.
await page.evaluate(() => localStorage.clear())
await open('?howto=0')
check('?howto=0 suppresses the flow', await atHome())
check('and writes no marker at all', (await marker()) === null)

// ---- replay from Settings: transient, the flag untouched ---------------------
await page.evaluate(() => {
  localStorage.clear()
  localStorage.setItem('cluecab-onboard-v1', 'done')
})
await open('?mock=1&howto=0')
await page.locator('.icon-btn[aria-label="Settings"]').click()
await page.waitForSelector('.settings-screen')
await page.locator('.replay-intro').click()
await page.waitForTimeout(300)
check('Replay the intro runs the train again', (await act()) === 'train')
for (let i = 0; i < 3; i++) await page.locator('.onboard-next').click()
await page.waitForTimeout(200)
await page.locator('.onboard-ticket').click()
await page.waitForSelector('.tutorial-dock')
check('the replay reaches the tutorial round too', await inTutorial())
await page.locator('.onboard-skip').click()
await page.waitForTimeout(300)
check('skipping the replay lands Home', await atHome())
check('and the done flag never moved', (await marker()) === 'done')

// ---- ?onboard=1 forces a transient run (dev/e2e switch) ----------------------
await page.evaluate(() => localStorage.clear())
await open('?onboard=1')
check('?onboard=1 forces the train', (await act()) === 'train')
await page.locator('.onboard-skip').click()
await page.waitForTimeout(300)
check('and being transient, writes nothing on the way out', (await marker()) === null)

check('no page errors', errors.length === 0, errors.join(' | ').slice(0, 300))

await browser.close()
preview.stop()
console.log(fail.length ? `\nFAILED: ${fail.join(', ')}` : '\nONBOARDING DRIVE OK')
if (fail.length) process.exitCode = 1
