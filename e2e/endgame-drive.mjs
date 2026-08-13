// The two ends of a round: who opens it, and what happens when the clues run
// out.
//
// Both are rules, not decoration. The player opens, so the round starts on
// their clue rather than on waiting for Klaus.
// Sudden death means the clue tokens running out is not the end — you keep
// naming words with nothing to go on, and one wrong name finishes it. Neither
// is provable from the engine alone: the phase has to reach the screen, the
// board has to stay tappable, and the round has to be able to end both ways.
import { chromium } from 'playwright'
import { startPreview } from './preview-server.mjs'

const PORT = 4195
const preview = await startPreview(PORT)

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
})
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
const page = await ctx.newPage()
const crashes = []
page.on('pageerror', (e) => crashes.push(String(e)))

const fail = []
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) fail.push(name)
}

const game = () =>
  page.evaluate(() => JSON.parse(localStorage.getItem('cluecab-game-v1') ?? '{}').state?.game)

/** Start a round on the given board, past the study phase. */
async function start(gridIndex, seed = 5) {
  await page.goto(`${preview.base}?mock=1&howto=0&letter=0&seed=${seed}`)
  await page.waitForSelector('.city-card')
  await page.evaluate(() => localStorage.removeItem('cluecab-game-v1'))
  await page.goto(`${preview.base}?mock=1&howto=0&letter=0&seed=${seed}`)
  await page.waitForSelector('.city-card')
  await page.locator('.grid-card').nth(gridIndex).click()
  await page.waitForSelector('.board-grid')
  const study = page.locator('.study-dock .btn-primary')
  if (await study.isVisible().catch(() => false)) await study.click()
}

/** Rewrite the live game into sudden death, the way running out of clues does. */
async function forceSuddenDeath() {
  await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('cluecab-game-v1'))
    raw.state.game.phase = 'suddenDeath'
    raw.state.game.turnsLeft = 0
    localStorage.setItem('cluecab-game-v1', JSON.stringify(raw))
  })
  // A reload lands on Home — the screen is not persisted, only the game is —
  // so come back in through the door the player would use.
  await page.reload()
  await page.getByRole('button', { name: 'Continue game' }).click()
  await page.waitForSelector('.sudden-death-bar', { timeout: 15_000 })
}

/** Tap a board card by its Danish word and confirm. */
async function name(da) {
  await page.locator(`.word-card:has(.card-word:text-is("${da}"))`).click()
  await page.locator('.guess-confirm .btn-primary').click()
}

try {
  // ---- the player opens -------------------------------------------------------
  await start(0)
  const opened = await game()
  check('the round opens on the player', opened.phase === 'playerClueInput', opened.phase)
  check(
    'so the clue box is there and nothing is being waited for',
    (await page.locator('.clue-input').count()) === 1 &&
      (await page.locator('.guess-bar').count()) === 0,
  )
  check('and Klaus has not clued yet', opened.clueHistory.length === 0, `${opened.clueHistory.length} clues`)

  // ---- the 3x5 board ----------------------------------------------------------
  await start(1)
  const mid = await game()
  check('the middle board is 3 across and 5 down', mid.config.cols === 3 && mid.config.rows === 5)
  check('with fifteen words', mid.words.length === 15, `${mid.words.length}`)
  check('and six clues', mid.config.turnTokens === 6, `${mid.config.turnTokens}`)
  const perSide = Object.values(mid.playerKey).filter((r) => r === 'green').length
  check('seven greens a side, which is two, two and three', perSide === 7, `${perSide}`)
  check(
    'all fifteen cards render',
    (await page.locator('.word-card').count()) === 15,
    `${await page.locator('.word-card').count()}`,
  )

  // ---- a turn ends itself on the last guess the clue asked for ---------------
  // "when you have guessed the amount of words Klaus gives you the turn ends
  // automatically". Before this the number bought one guess more than it said,
  // so finding everything the clue promised left the turn open with nothing to
  // do in it — which reads as the app having stopped rather than as a bonus.
  //
  // Driven from a forced state rather than by playing on: reaching a Klaus clue
  // of a known number, with that many of his greens still on the board, is a
  // matter of luck with the mock companion.
  await start(0)
  await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('cluecab-game-v1'))
    const g = raw.state.game
    g.phase = 'playerGuessing'
    g.clueHistory = [{ by: 'ai', text: 'mok', number: 2, guesses: [] }]
    localStorage.setItem('cluecab-game-v1', JSON.stringify(raw))
  })
  await page.reload()
  await page.getByRole('button', { name: 'Continue game' }).click()
  await page.waitForSelector('.guess-bar', { timeout: 15_000 })
  const turn = await game()
  const hisGreens = turn.words
    .filter((w) => turn.aiKey[w.wordId] === 'green' && turn.reveals[w.wordId].kind === 'hidden')
    .map((w) => w.da)
  check('the bar offers exactly the number, not the number plus one', /up to 2 more guesses/.test(
    await page.locator('.guess-bar .dock-title').textContent(),
  ), await page.locator('.guess-bar .dock-title').textContent())

  await name(hisGreens[0])
  check(
    'one of two keeps the turn alive',
    (await page.locator('.guess-bar').count()) === 1,
    (await game()).phase,
  )
  await name(hisGreens[1])
  // No Stop button was pressed; the turn has to end on its own.
  const ended = await game()
  check(
    'and the second ends the turn with nothing to press',
    ended.phase !== 'playerGuessing',
    ended.phase,
  )
  check('the clue is spent', ended.turnsLeft === ended.config.turnTokens - 1, `${ended.turnsLeft}`)
  check(
    'both words were banked',
    hisGreens.slice(0, 2).every((da) => {
      const w = ended.words.find((x) => x.da === da)
      return ended.reveals[w.wordId].kind === 'green'
    }),
  )

  // ---- sudden death: the winning end -----------------------------------------
  await start(0)
  await forceSuddenDeath()
  const sd = await game()
  check('running out of clues opens sudden death rather than ending the round', !sd.outcome)
  check('and the board is still tappable', (await page.locator('.word-card:not([disabled])').count()) > 0)

  const greens = sd.words
    .filter((w) => (sd.playerKey[w.wordId] === 'green' || sd.aiKey[w.wordId] === 'green') &&
      sd.reveals[w.wordId].kind !== 'green')
    .map((w) => w.da)
  for (const da of greens) {
    if ((await page.locator('.sudden-death-bar').count()) === 0) break
    await name(da)
  }
  const won = await game()
  check(
    'naming every remaining green wins the round from sudden death',
    won.outcome?.result === 'won' && won.outcome?.reason === 'all-greens',
    JSON.stringify(won.outcome),
  )
  check('and the debrief says so', (await page.locator('.debrief').count()) === 1)

  // ---- sudden death: the losing end ------------------------------------------
  await start(0)
  await forceSuddenDeath()
  const sd2 = await game()
  const dud = sd2.words.find(
    (w) =>
      sd2.playerKey[w.wordId] !== 'green' &&
      sd2.aiKey[w.wordId] !== 'green' &&
      sd2.reveals[w.wordId].kind === 'hidden',
  )
  if (!dud) throw new Error('no non-green word to end sudden death on')
  await name(dud.da)
  const lost = await game()
  check(
    'one word that is green on neither key ends it',
    lost.outcome?.result === 'lost' && lost.outcome?.reason === 'sudden-death',
    JSON.stringify(lost.outcome),
  )
  check(
    'and the card is turned over, so the ending reads',
    lost.reveals[dud.wordId].kind !== 'hidden',
    lost.reveals[dud.wordId].kind,
  )

  // ---- sudden death: walking away --------------------------------------------
  await start(0)
  await forceSuddenDeath()
  await page.locator('.sudden-death-bar .btn-ghost').click()
  const gaveUp = await game()
  check(
    'giving up is allowed, and is a loss',
    gaveUp.outcome?.result === 'lost' && gaveUp.outcome?.reason === 'timeout',
    JSON.stringify(gaveUp.outcome),
  )

  check('no page errors', crashes.length === 0, crashes.join(' | '))
  console.log(fail.length ? `\nFAILED: ${fail.join(', ')}` : '\nENDGAME DRIVE OK')
  if (fail.length) process.exitCode = 1
} catch (e) {
  console.log('ENDGAME DRIVE FAILED:', e.stack ?? e.message)
  process.exitCode = 1
} finally {
  await browser.close()
  preview.stop()
  process.exit(process.exitCode ?? 0)
}
