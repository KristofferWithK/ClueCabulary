// The two endings a forbidden word can have, both driven through the real UI.
//
// A forbidden word used to mean one thing: the last chance, whenever it
// happened. It now means two, split by the clue count — before the threshold
// the round ends where it stands, after it the last chance opens as before.
// Both halves are here because the interesting failure is not the engine
// getting the count wrong (unit tests hold that) but the app showing the wrong
// screen: a debrief with no explanation, a redemption form that never appears,
// a banner keyed to an ending nobody wrote copy for.
import { chromium } from 'playwright'
import { startPreview } from './preview-server.mjs'

const PORT = 4174
const preview = await startPreview(PORT)
const SIZES = ['beginner', 'middle', 'standard']

const SHOT_DIR = process.env.SHOT_DIR ?? '.'
// Kept in step with src/engine/config.ts by hand — a drive cannot import it.
const REDEMPTION_AFTER_ROUND = 3

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium',
})
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
const crashes = []
page.on('pageerror', (e) => crashes.push(e.message))

const fail = []
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) fail.push(name)
}

const readGame = () =>
  page.evaluate(() => JSON.parse(localStorage.getItem('cluecab-game-v1') ?? '{}').state?.game)

const caption = () => page.locator('.phase-caption').textContent()

/** Fresh round on the given board, past the study phase. */
async function start(gridIndex, seed) {
  await page.goto(`${preview.base}?mock=1&seed=${seed}&howto=0&grid=${SIZES[gridIndex]}`)
  await page.waitForSelector('.city-card')
  await page.evaluate(() => localStorage.removeItem('cluecab-game-v1'))
  await page.goto(`${preview.base}?mock=1&seed=${seed}&howto=0&grid=${SIZES[gridIndex]}`)
  await page.waitForSelector('.city-card')
  await page.locator('.home-play').click()
  await page.waitForSelector('.board-grid')
  const study = page.locator('.study-dock .btn-primary')
  if (await study.isVisible().catch(() => false)) await study.click()
}

/** Tap a specific board word and confirm it. */
async function guessWord(da) {
  await page.click(`.word-card:has(.card-word:text-is("${da}"))`)
  await page.click('.guess-confirm .btn-primary')
}

const wordFor = (game, id) => game.words.find((w) => w.wordId === id)

/** A word forbidden on the key the player's guess is judged against. */
const forbiddenForPlayerTurn = (game) =>
  Object.entries(game.aiKey).find(
    ([id, role]) => role === 'forbidden' && game.reveals[id].kind === 'hidden',
  )?.[0]

try {
  // ---- before the threshold: the round ends where it stands ----------------
  await start(0, 11)
  await page.fill('.clue-input input', 'huskeliste')
  await page.click('.clue-input .btn-primary')
  await page.waitForFunction(
    () => document.querySelector('.phase-caption')?.textContent === 'Your turn to guess',
    undefined,
    { timeout: 30_000 },
  )
  let game = await readGame()
  // Two: the player opens and Cluey answers with his own clue, so the player's
  // first turn to guess is already the second clue of the round.
  check(
    'few enough clues given that the last chance is shut',
    game.clueHistory.length <= REDEMPTION_AFTER_ROUND,
    `${game.clueHistory.length} given`,
  )
  // The screen says so before it can cost anything — and says WHOSE forbidden
  // words, because the only ones visible here are the player's own dashed
  // cards and those are the safe ones. A regex on "ends the round" alone would
  // keep passing on the unqualified sentence that made this wrong.
  const stake = await page.locator('.stake-note').textContent()
  check('the guess bar says what a forbidden word costs now', /end the round/.test(stake), stake)
  check("and whose forbidden words it means", /Cluey/.test(stake), stake)

  const doomed = forbiddenForPlayerTurn(game)
  if (!doomed) throw new Error('no hidden forbidden word on Cluey’s key')
  const doomedDa = wordFor(game, doomed).da
  await guessWord(doomedDa)
  await page.waitForSelector('.outcome-banner', { timeout: 15_000 })
  await page.screenshot({ path: `${SHOT_DIR}/r1-early-hit.png` })

  check('no last chance is offered', (await page.locator('.redemption').count()) === 0)
  const title = await page.locator('.outcome-banner h2').textContent()
  check('the debrief names the ending', title === 'Forbidden word', title)
  // The board unmounts when the round finishes, so the banner has to say which
  // card did it — otherwise the shortest round in the game explains nothing.
  const culprit = await page.locator('.outcome-culprit').textContent()
  check('and names the word that ended it', culprit.includes(doomedDa), culprit)
  check('and who named it', /^You named/.test(culprit), culprit)
  game = await readGame()
  check(
    'the engine recorded the new ending, not the challenge one',
    game.outcome.reason === 'forbidden-hit',
    JSON.stringify(game.outcome),
  )
  check('and no redemption was set up', game.redemption === undefined)

  // The round still counts: a board seen is a board the scheduler knows about.
  const srsAfterEarly = await page.evaluate(
    () => Object.keys(JSON.parse(localStorage.getItem('cluecab-srs-v1') ?? '{}').state?.stats ?? {}).length,
  )
  check('and the round was still recorded', srsAfterEarly > 0, `${srsAfterEarly} words`)

  // ---- after it: the last chance, exactly as before ------------------------
  // Driven on the 4x5 board, where the player has three guessing turns past
  // the threshold (clues 4, 6 and 8), so the loop below has room to find one
  // with a hidden forbidden word still on it. The threshold moved from 4 to 3
  // and every board now has an eligible player turn — game.test.ts pins that
  // arithmetic on all three; this drive is about which SCREEN appears, and the
  // widest board is the one that reaches the state most reliably.
  let reached = false
  for (const seed of [3, 5, 8, 13, 21, 34]) {
    await start(2, seed)
    for (let turn = 0; turn < 24 && !reached; turn++) {
      const cap = await caption()
      game = await readGame()
      if (!game || game.phase === 'finished' || game.phase === 'redemption') break
      if (game.phase === 'suddenDeath') break

      if (cap === 'Give Cluey a clue') {
        await page.fill('.clue-input input', `huskeliste${turn}`)
        await page.click('.clue-input .btn-primary')
        await page
          .waitForFunction(
            (was) => document.querySelector('.phase-caption')?.textContent !== was,
            cap,
            { timeout: 30_000 },
          )
          .catch(() => {})
        continue
      }

      if (cap === 'Your turn to guess') {
        if (game.clueHistory.length > REDEMPTION_AFTER_ROUND) {
          reached = true
          break
        }
        // Burn the turn on a neutral: it ends the turn without finding a green
        // and without ending the round.
        const dull = Object.entries(game.aiKey).find(
          ([id, role]) => role === 'bystander' && game.reveals[id].kind === 'hidden',
        )
        if (!dull) break
        await guessWord(wordFor(game, dull[0]).da)
        await page
          .waitForFunction(
            () => document.querySelector('.phase-caption')?.textContent !== 'Your turn to guess',
            undefined,
            { timeout: 30_000 },
          )
          .catch(() => {})
        continue
      }
      // Cluey's turn: wait for him.
      await page
        .waitForFunction(
          (was) => document.querySelector('.phase-caption')?.textContent !== was,
          cap,
          { timeout: 30_000 },
        )
        .catch(() => {})
    }
    if (reached) {
      console.log(`reached a player turn past the threshold on seed ${seed}`)
      break
    }
  }
  check('a player guessing turn past the threshold is reachable', reached)

  if (reached) {
    game = await readGame()
    check(
      'the guess bar now promises the last chance',
      /last chance/.test(await page.locator('.stake-note').textContent()),
    )
    const late = forbiddenForPlayerTurn(game)
    if (!late) throw new Error('no hidden forbidden word left')
    await guessWord(wordFor(game, late).da)
    await page.waitForSelector('.redemption', { timeout: 15_000 })
    await page.screenshot({ path: `${SHOT_DIR}/r2-redemption.png` })
    check('the last chance opens past the threshold', true)

    // Dictionary must be locked: no ⓘ buttons on the challenge.
    check('the dictionary is locked', (await page.locator('.card-info').count()) === 0)

    const current = await readGame()
    const prompted = current.words.filter((w) =>
      current.redemption.promptWordIds.includes(w.wordId),
    )
    console.log(`answering ${prompted.length} words`)
    for (const w of prompted) {
      await page.fill(`.redemption-item:has(.redemption-da:text-is("${w.da}")) input`, w.en[0])
    }
    await page.click('.btn-danger')
    await page.waitForSelector('.outcome-banner')
    const redeemed = await page.locator('.outcome-banner h2').textContent()
    await page.screenshot({ path: `${SHOT_DIR}/r3-redeemed.png` })
    check('and answering it correctly still wins the round', redeemed.includes('Redeemed'), redeemed)
  }

  check('no page errors', crashes.length === 0, crashes.join(' | '))
} catch (e) {
  await page.screenshot({ path: `${SHOT_DIR}/r9-failure.png` }).catch(() => {})
  console.log('REDEMPTION DRIVE THREW:', e.message)
  fail.push(e.message)
} finally {
  await browser.close()
  preview.stop()
}

if (fail.length) {
  console.error(`\nFAILED: ${fail.join(', ')}`)
  process.exit(1)
}
console.log('\nREDEMPTION DRIVE OK')
