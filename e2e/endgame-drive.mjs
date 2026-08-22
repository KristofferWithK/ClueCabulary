// The two ends of a round: who opens it, and what happens when the clues run
// out.
//
// Both are rules, not decoration. The player opens, so the round starts on
// their clue rather than on waiting for Casey.
// Sudden death means the clue tokens running out is not the end — you keep
// naming words with nothing to go on, and one wrong name finishes it. Neither
// is provable from the engine alone: the phase has to reach the screen, the
// board has to stay tappable, and the round has to be able to end both ways.
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright'
import { startPreview } from './preview-server.mjs'

const PORT = 4195
const preview = await startPreview(PORT)

// Read off disk rather than out of the page: the sentences the summary shows
// have to be checkable against the dataset they claim to come from, and the app
// does not put WORDS on the window.
const DATASET = new Map(
  JSON.parse(readFileSync(new URL('../src/data/words.da.json', import.meta.url), 'utf8')).map(
    (w) => [w.id, w],
  ),
)

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium',
})
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
const page = await ctx.newPage()
const crashes = []
page.on('pageerror', (e) => crashes.push(String(e)))

// Every utterance the page asks for, in order. Headless Chromium has a
// speechSynthesis with no voices in it, so `speak()` is callable and silent —
// which is all this needs: audible sound cannot be asserted, but "the app asked
// for these words, in this order" can. The same trick offline-drive plays with
// clip requests, for the half of `playWord` that has no clip to fetch.
await page.addInitScript(() => {
  window.__said = []
  const synth = window.speechSynthesis
  if (!synth) return
  const speak = synth.speak.bind(synth)
  synth.speak = (u) => {
    window.__said.push(u.text)
    try {
      speak(u)
    } catch {
      /* no voice installed; the record is the point */
    }
  }
})

const fail = []
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) fail.push(name)
}

const game = () =>
  page.evaluate(() => JSON.parse(localStorage.getItem('cluecab-game-v1') ?? '{}').state?.game)

/** Start a round, past the study phase. (There is one board since N1, so the
 *  gridIndex this took is gone rather than defaulted.) */
async function start(seed = 5) {
  await page.goto(`${preview.base}?mock=1&howto=0&seed=${seed}`)
  await page.waitForSelector('.city-card')
  await page.evaluate(() => localStorage.removeItem('cluecab-game-v1'))
  await page.goto(`${preview.base}?mock=1&howto=0&seed=${seed}`)
  await page.waitForSelector('.city-card')
  await page.locator('.home-play').click()
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
  await start()
  const opened = await game()
  check('the round opens on the player', opened.phase === 'playerClueInput', opened.phase)
  check(
    'so the clue box is there and nothing is being waited for',
    (await page.locator('.clue-input').count()) === 1 &&
      (await page.locator('.guess-bar').count()) === 0,
  )
  check('and Casey has not clued yet', opened.clueHistory.length === 0, `${opened.clueHistory.length} clues`)

  // ---- the board, and there is one of it (N1) ---------------------------------
  const mid = opened
  check('the board is 3 across and 6 down', mid.config.cols === 3 && mid.config.rows === 6)
  check('with eighteen words', mid.words.length === 18, `${mid.words.length}`)
  check('and eight clues', mid.config.turnTokens === 8, `${mid.config.turnTokens}`)
  const perSide = Object.values(mid.playerKey).filter((r) => r === 'green').length
  check('eight greens a side, three of them shared', perSide === 8, `${perSide}`)
  check(
    'all eighteen cards render',
    (await page.locator('.word-card').count()) === 18,
    `${await page.locator('.word-card').count()}`,
  )

  // ---- a turn ends itself on the last guess the clue asked for ---------------
  // "when you have guessed the amount of words Cluey gives you the turn ends
  // automatically" — asked for before the rename, and Casey is the same
  // suitcase. Before this the number bought one guess more than it said,
  // so finding everything the clue promised left the turn open with nothing to
  // do in it — which reads as the app having stopped rather than as a bonus.
  //
  // Driven from a forced state rather than by playing on: reaching a Casey clue
  // of a known number, with that many of his greens still on the board, is a
  // matter of luck with the mock companion.
  await start()
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
  // "· 2 guesses left" since K2, where it read "— up to 2 more guesses": the
  // title is one nowrap line and has a Danish clue to fit beside it.
  check('the bar offers exactly the number, not the number plus one', /2 guesses left/.test(
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
  await start()
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
  check('and the summary says so', (await page.locator('.round-summary').count()) === 1)

  // The reward the win leaves behind. A real win in a real round, so this is
  // the one place the whole earn path runs end to end — recordGame, the bank,
  // and the line the player actually reads — rather than a store call.
  check(
    'winning earns a wrap-up round, announced on the summary',
    (await page.locator('.earned-section').count()) === 1,
  )
  const bankedAfterWin = await page.evaluate(
    () => JSON.parse(localStorage.getItem('cluecab-srs-v1') ?? '{}').state?.wrapUpsBanked ?? 0,
  )
  check('and banks it', bankedAfterWin >= 1, `${bankedAfterWin}`)

  // ---- the summary counts the round, and the collection it left behind ------
  // Four tiles, and every number has to be a number: the two on the left are
  // diffs finishRound took across the SRS, the two on the right are
  // countCollection over this city and over the whole dataset. A tile that
  // rendered "undefined/100" or "NaN" would look like a stat and mean nothing,
  // so the shapes are asserted rather than the presence of the block.
  const stats = await page.evaluate(() => {
    const read = (sel) => document.querySelector(`${sel} .stat-n`)?.textContent?.trim() ?? ''
    return {
      discovered: read('.stat-discovered'),
      collected: read('.stat-collected'),
      city: read('.stat-city'),
      total: read('.stat-total'),
      label: document.querySelector('.stat-city .stat-label')?.textContent?.trim() ?? '',
    }
  })
  check('the summary counts what was discovered', /^\d+$/.test(stats.discovered), stats.discovered)
  check('and what was collected', /^\d+$/.test(stats.collected), stats.collected)
  check('and where the city stands', /^\d+\/100$/.test(stats.city), stats.city)
  check('naming the city, since the number means nothing alone', /\w/.test(stats.label), stats.label)
  check('and the whole journey', /^\d+\/\d{3,4}$/.test(stats.total), stats.total)
  // This round greened words on a board of never-before-seen ones, so a zero
  // here would mean the diff was taken on the wrong side of recordRound.
  check(
    'and a board of new words is not counted as zero new words',
    Number(stats.discovered) > 0,
    stats.discovered,
  )

  // ---- the round's words, put in a sentence ---------------------------------
  // The point of this section is the words that are NOT on the board. Nothing
  // in the nine hundred is a preposition, a conjunction or a pronoun, because
  // none of them can be clued — there is no clue for «hvis» — so they arrive as
  // scenery in somebody else's sentence or they do not arrive at all. How much
  // scenery the shipped examples actually carry is measured by
  // `scripts/measure-function-words.mjs`; what is checked here is that the
  // section exists, is drawn from THIS round's greens rather than from the
  // dataset at large, and can be heard.
  const sentences = await page.evaluate(() =>
    [...document.querySelectorAll('.round-sentence')].map((li) => ({
      da: li.querySelector('[lang="da"]')?.textContent ?? '',
      en: li.querySelector('.sentence-en')?.textContent ?? '',
      speakable: !!li.querySelector('button.speak-sentence'),
    })),
  )
  check('the summary puts the round in sentences', sentences.length > 0, `${sentences.length} shown`)
  check('at most five of them', sentences.length <= 5, `${sentences.length}`)
  check(
    'each with a Danish sentence and its English',
    sentences.length > 0 && sentences.every((s) => s.da.length > 2 && s.en.length > 2),
    JSON.stringify(sentences[0] ?? null),
  )
  // Non-vacuous in the way that matters: not "there are sentences" but "these
  // are the sentences of words this round turned green". A component that
  // showed the first five words of the dataset would satisfy every check above
  // and fail this one.
  const greenExamples = new Set(
    won.words
      .filter((w) => won.reveals[w.wordId].kind === 'green')
      .map((w) => DATASET.get(w.wordId)?.exampleDa),
  )
  check(
    "and every one belongs to a word this round greened",
    sentences.length > 0 && sentences.every((s) => greenExamples.has(s.da)),
    sentences.map((s) => s.da).join(' | '),
  )
  check('each one a speak button', sentences.every((s) => s.speakable))

  await page.evaluate(() => (window.__said.length = 0))
  await page.locator('.round-sentence button.speak-sentence').first().click()
  await page.waitForTimeout(250)
  const saidSentence = await page.evaluate(() => window.__said.slice())
  check(
    'tapping a sentence says the whole sentence, not just the word',
    saidSentence.includes(sentences[0].da),
    JSON.stringify(saidSentence),
  )

  // The transcript is behind a lid, shut. It is the longest thing on the screen
  // and the least urgent — the numbers above are what the round is judged on.
  check('the turn log is collapsed to start with', (await page.locator('.turn-log').count()) === 0)
  await page.locator('.log-toggle').click()
  await page.waitForTimeout(200)
  check('and one tap opens it', (await page.locator('.turn-log').count()) === 1)
  check(
    'with the lid reporting its own state',
    (await page.locator('.log-toggle').getAttribute('aria-expanded')) === 'true',
  )
  await page.locator('.log-toggle').click()
  await page.waitForTimeout(200)
  check('and shuts again', (await page.locator('.turn-log').count()) === 0)

  // ---- sudden death: the losing end ------------------------------------------
  await start()
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
  // As a bystander against both sides, which is the only thing a non-green can
  // be now. It used to branch: a word forbidden on either key revealed as
  // 'forbidden' here instead, and that special case is gone with the role.
  check(
    'as a neutral for both sides, since there is no other role left',
    lost.reveals[dud.wordId].kind === 'bystander' &&
      lost.reveals[dud.wordId].against?.length === 2,
    JSON.stringify(lost.reveals[dud.wordId]),
  )
  // The summary has to name it: the board unmounts, so this sentence is all
  // the player sees of what ended the round.
  const culprit = (await page.locator('.outcome-culprit').textContent()) ?? ''
  check('and the summary names the card that ended it', culprit.includes(dud.da), culprit.trim())

  // ---- sudden death: walking away --------------------------------------------
  await start()
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
