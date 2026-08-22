// The wrap-up round, end to end on a 360x640 phone: a board dealt from the
// city with its collected cards English-side up, the packing phase (miss,
// retry, skip), the dictionary lock, and the ledger — packed words found
// green are wrapped; skipped ones are not, greens or no greens.
//
// Since W1 there is a third case and it gets its own run at the bottom: a
// board TOPPED UP from words that are not collected. Those cards play like any
// other, start Danish-side up, cannot be packed, and cannot be wrapped however
// green they end.
import { chromium } from 'playwright'
import { startPreview } from './preview-server.mjs'

const PORT = 4200
const preview = await startPreview(PORT)

const SHOT_DIR = process.env.SHOT_DIR ?? '.'
const BASE = preview.base

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium',
})
const page = await browser.newPage({ viewport: { width: 360, height: 640 } })
page.on('pageerror', (e) => console.log('PAGE CRASH:', e.message))

const fail = []
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) fail.push(name)
}

const gameWords = () =>
  page.evaluate(() => JSON.parse(localStorage.getItem('cluecab-game-v1')).state.game.words)
const gameReveals = () =>
  page.evaluate(() => JSON.parse(localStorage.getItem('cluecab-game-v1')).state.game.reveals)
const wrappedLedger = () =>
  page.evaluate(
    () => JSON.parse(localStorage.getItem('cluecab-journey-v2') ?? '{}').state?.wrapped ?? {},
  )

/** Pack one card via the dock: tap its English face, type, submit. */
async function pack(word, text) {
  await page.locator('.card-face-en .card-word-en', { hasText: word.en[0] }).first().click()
  await page.fill('.packing-input', text)
  await page.click('.packing-dock .btn-primary')
  await page.waitForTimeout(150)
}

/** Danish-looking clues unlikely to collide with a board; tried in order,
 *  since any one of them CAN be on (or too near) a dealt board. */
const CLUES = ['snurretop', 'vandmelon', 'flyvemaskine', 'regnbue', 'edderkop', 'paraply']

/** Drive a started round to its end, whatever path it takes. */
async function driveToEnd() {
  for (let i = 0; i < 30 && (await page.locator('.round-summary').count()) === 0; i++) {
    const guessable = page.locator('.word-card.card-guessable').first()
    if (await guessable.isVisible().catch(() => false)) {
      await guessable.click()
      const confirm = page.locator('.guess-confirm .btn-primary')
      if (await confirm.isVisible().catch(() => false)) await confirm.click()
    } else {
      // '#clue-word', not '.clue-input input': the dock holds a second input
      // (the lookup box), and a two-match locator fails strict mode silently
      // inside a .catch — this loop spun 30 times on exactly that.
      const clue = page.locator('#clue-word')
      if (await clue.isVisible().catch(() => false)) {
        for (const c of CLUES) {
          await clue.fill(c)
          await page.click('.clue-input .btn-primary')
          await page.waitForTimeout(250)
          if ((await page.locator('.clue-error').count()) === 0) break
        }
      }
    }
    // A forbidden word used to be able to interrupt this with the last chance,
    // which this loop failed on purpose — what a wrap-up round wraps does not
    // depend on how the round ends. Nothing interrupts it now.
    await page.waitForTimeout(700)
  }
}

try {
  // ---- The skip path: pack two, start early, nothing else may wrap. -------
  // &wraps=1 banks the won round a wrap-up now costs; the gate itself is
  // driven in suitcase-drive, and this drive is about the round it buys.
  await page.goto(`${BASE}?mock=1&howto=0&city=0&collected=40&seed=9&wraps=1`)
  await page.waitForSelector('.city-card')
  // The wrap-up button lives in the open suitcase — tap Casey to get there.
  await page.click('.cluey-button')
  await page.waitForSelector('.suitcase-screen')
  await page.click('.case-actions .btn-primary')
  await page.waitForSelector('.packing-dock')
  // Forty collected against an eighteen-card board: nothing is topped up here,
  // so every card is wrappable and every card starts English-side up.
  check('the board opens all English-side up', (await page.locator('.card-face-en').count()) === 18)
  check('and nothing on it is marked unwrappable', (await page.locator('.card-no-wrap').count()) === 0)
  check(
    'the dock counts against the whole board',
    /0 of 18/.test((await page.locator('.packing-dock .dock-title').textContent()) ?? ''),
    (await page.locator('.packing-dock .dock-title').textContent()) ?? '',
  )
  check('the dictionary is gone while packing', (await page.locator('.card-info').count()) === 0)
  await page.screenshot({ path: `${SHOT_DIR}/w1-packing.png` })

  const words = await gameWords()

  // A wrong answer is a recorded miss with a free retry.
  await pack(words[0], 'zzzzz')
  check('a miss says so', (await page.locator('.packing-miss').count()) === 1)
  await page.fill('.packing-input', words[0].da)
  await page.click('.packing-dock .btn-primary')
  await page.waitForTimeout(150)
  check(
    'the retry packs the card',
    (await page.locator('.card-face-en').count()) === 17,
  )
  const missRecorded = await page.evaluate(
    () => JSON.parse(localStorage.getItem('cluecab-game-v1')).state.packingMissed,
  )
  check('the first miss is remembered', missRecorded.length === 1)

  await pack(words[1], words[1].da)
  check('a second card packs clean', (await page.locator('.card-face-en').count()) === 16)
  const packedIds = [words[0].wordId, words[1].wordId]

  // Start early: the remaining cards stay English for the whole round. A link
  // in the dock's title row since K2, not a ghost button of its own — the
  // sentence it used to carry wrapped to two lines at 360px, and both came off
  // the board.
  await page.click('.packing-early')
  await page.waitForTimeout(400)
  check('the clues begin', (await page.locator('.packing-dock').count()) === 0)
  check('skipped cards stay English-side up', (await page.locator('.card-face-en').count()) === 16)
  await page.screenshot({ path: `${SHOT_DIR}/w2-started-early.png` })

  await driveToEnd()
  check('the round reaches a summary', (await page.locator('.round-summary').count()) === 1)
  await page.screenshot({ path: `${SHOT_DIR}/w3-summary.png` })

  const reveals = await gameReveals()
  const skippedGreens = words
    .filter((w) => !packedIds.includes(w.wordId))
    .filter((w) => reveals[w.wordId]?.kind === 'green')
  check(
    'the round revealed greens among the skipped cards',
    skippedGreens.length > 0,
    `${skippedGreens.length} skipped greens`,
  )
  const ledger = await wrappedLedger()
  check(
    'no skipped card wrapped, greens or no greens',
    Object.keys(ledger).every((id) => packedIds.includes(id)),
    JSON.stringify(Object.keys(ledger)),
  )
  const packedGreens = packedIds.filter((id) => reveals[id]?.kind === 'green')
  check(
    'every packed word found green IS wrapped',
    packedGreens.every((id) => id in ledger),
    `${packedGreens.length} packed greens`,
  )

  // ---- The full pack: the last card starts the round by itself. ----------
  // A clean slate: the unfinished-or-finished round above would otherwise
  // hold Home's wrap-up button back behind "Continue game".
  await page.evaluate(() => localStorage.clear())
  await page.goto(`${BASE}?mock=1&howto=0&city=0&collected=40&seed=31&wraps=1`)
  await page.waitForSelector('.city-card')
  // The wrap-up button lives in the open suitcase — tap Casey to get there.
  await page.click('.cluey-button')
  await page.waitForSelector('.suitcase-screen')
  await page.click('.case-actions .btn-primary')
  await page.waitForSelector('.packing-dock')
  const words2 = await gameWords()
  for (const w of words2) await pack(w, w.da)
  check('packing the last card starts the round', (await page.locator('.packing-dock').count()) === 0)
  check('every card is Danish-side up', (await page.locator('.card-face-en').count()) === 0)
  await page.screenshot({ path: `${SHOT_DIR}/w4-all-packed.png` })

  await driveToEnd()
  const reveals2 = await gameReveals()
  const ledger2 = await wrappedLedger()
  const greens2 = words2.filter((w) => reveals2[w.wordId]?.kind === 'green')
  check('the round revealed greens', greens2.length > 0, `${greens2.length}`)
  check(
    'every green on a fully-packed board wrapped',
    greens2.every((w) => w.wordId in ledger2),
    `${Object.keys(ledger2).length} in the ledger`,
  )

  // ---- W1's thin pool: a board topped up from words that cannot wrap. ----
  // Eight collected words on an eighteen-card board. Before W1 this could not
  // be dealt at all. Now ten cards are top-up: Danish-side up, quietly marked,
  // unpackable, and unwrappable however green they end.
  await page.evaluate(() => localStorage.clear())
  await page.goto(`${BASE}?mock=1&howto=0&city=0&collected=8&seed=17&wraps=1`)
  await page.waitForSelector('.city-card')
  await page.click('.cluey-button')
  await page.waitForSelector('.suitcase-screen')
  const thinHint = await page.locator('.case-hint').textContent()
  check(
    'the suitcase advises rather than refusing',
    /8 collected/.test(thinHint ?? '') && /at most 8/.test(thinHint ?? ''),
    thinHint ?? '',
  )
  check('and the button is live on eight words', await page.locator('.case-actions .btn-primary').isEnabled())
  await page.click('.case-actions .btn-primary')
  await page.waitForSelector('.packing-dock')

  const wrappable = await page.evaluate(
    () => JSON.parse(localStorage.getItem('cluecab-game-v1')).state.wrappable,
  )
  const words3 = await gameWords()
  check('the board is full', words3.length === 18, `${words3.length}`)
  check('with eight wrappable cards on it', wrappable.length === 8, `${wrappable.length}`)
  check(
    'only those eight open English-side up',
    (await page.locator('.card-face-en').count()) === 8,
    `${await page.locator('.card-face-en').count()}`,
  )
  check(
    'and the other ten wear the quiet mark',
    (await page.locator('.card-no-wrap').count()) === 10,
    `${await page.locator('.card-no-wrap').count()}`,
  )
  check(
    'the dock counts the eight it can pack, not the eighteen on the board',
    /0 of 8/.test((await page.locator('.packing-dock .dock-title').textContent()) ?? ''),
    (await page.locator('.packing-dock .dock-title').textContent()) ?? '',
  )
  await page.screenshot({ path: `${SHOT_DIR}/w5-topped-up.png` })

  // Every green on this board is a wrappable card: the deal puts the collected
  // words on the keys first, structurally. Eight collected against thirteen
  // distinct greens means all eight are green and five fillers make up the
  // rest — so no wrappable card is left off the key.
  const keys = await page.evaluate(() => {
    const g = JSON.parse(localStorage.getItem('cluecab-game-v1')).state.game
    return { playerKey: g.playerKey, aiKey: g.aiKey }
  })
  const greenIds = words3
    .map((w) => w.wordId)
    .filter((id) => keys.playerKey[id] === 'green' || keys.aiKey[id] === 'green')
  check('thirteen distinct greens, as on any board', greenIds.length === 13, `${greenIds.length}`)
  check(
    'and every wrappable card is one of them',
    wrappable.every((id) => greenIds.includes(id)),
    `${greenIds.filter((id) => wrappable.includes(id)).length} of ${wrappable.length}`,
  )

  // Packing every wrappable card opens the round, though ten cards on the
  // board were never English to begin with.
  for (const id of wrappable) {
    const w = words3.find((x) => x.wordId === id)
    await pack(w, w.da)
  }
  check('packing the wrappable cards starts the round', (await page.locator('.packing-dock').count()) === 0)
  check('and no card is left English-side up', (await page.locator('.card-face-en').count()) === 0)

  await driveToEnd()
  const reveals3 = await gameReveals()
  const ledger3 = await wrappedLedger()
  const fillerGreens = words3
    .filter((w) => !wrappable.includes(w.wordId) && reveals3[w.wordId]?.kind === 'green')
    .map((w) => w.wordId)
  check('the round greened some top-up cards', fillerGreens.length > 0, `${fillerGreens.length}`)
  check(
    'and not one of them wrapped',
    fillerGreens.every((id) => !(id in ledger3)),
    JSON.stringify(Object.keys(ledger3)),
  )
  check(
    'only collected words are in the ledger',
    Object.keys(ledger3).every((id) => wrappable.includes(id)),
    JSON.stringify(Object.keys(ledger3)),
  )

  console.log(fail.length ? `\nFAILED: ${fail.join(', ')}` : '\nWRAPUP DRIVE OK')
  if (fail.length) process.exitCode = 1
} catch (e) {
  await page.screenshot({ path: `${SHOT_DIR}/w9-failure.png` }).catch(() => {})
  console.log('WRAPUP DRIVE FAILED:', e.message)
  process.exitCode = 1
} finally {
  await browser.close()
  preview.stop()
}
