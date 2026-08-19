// How much one board repeats the last one, measured through the shipped app.
//
// "I also noticed I'm getting a lot of the same words" was reported from real
// play, and then, once it was fixed too far the other way: "It seems like a
// simple rule. Every board has 3 words from the previous round."
//
// That rule lives in the sampler, and unit tests hold it there. What they
// cannot show is that the app REACHES the sampler with the right argument — the
// store has to remember the last two boards, persist them across a reload, and
// hand them over on the next deal. Every one of those is a place the rule can
// be true in the module and false on the phone, and one of them (the persisted
// key changing shape between versions) has already been a real hazard here.
import { chromium } from 'playwright'
import { startPreview } from './preview-server.mjs'

const PORT = 4198
const preview = await startPreview(PORT)
const SIZES = ['beginner', 'middle', 'standard']

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium',
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

const CARRY_OVER = 3

const persisted = () =>
  page.evaluate(() => JSON.parse(localStorage.getItem('cluecab-game-v1') ?? '{}'))

/** Deal a board and return its word ids, in board order. */
async function deal(gridIndex) {
  await page.goto(`${preview.base}?mock=1&howto=0&fresh=1&grid=${SIZES[gridIndex]}`)
  await page.waitForSelector('.city-card')
  await page.locator('.home-play').click()
  await page.waitForSelector('.board-grid')
  const study = page.locator('.study-dock .btn-primary')
  if (await study.isVisible().catch(() => false)) await study.click()
  const state = await persisted()
  return state.state.game.words.map((w) => w.wordId)
}

const shared = (a, b) => a.filter((id) => b.includes(id))

try {
  await page.goto(`${preview.base}?mock=1&howto=0`)
  await page.waitForSelector('.city-card')
  await page.evaluate(() => localStorage.clear())

  // ---- the first board has nothing to repeat -------------------------------
  const boards = [await deal(0)]
  check('the first board deals', boards[0].length === 12, `${boards[0].length} words`)

  // ---- and every board after it repeats exactly three ----------------------
  // Six rounds: enough that the pool is no longer "everything the player has
  // ever seen", which is the state where the quota is trivially satisfiable.
  for (let r = 1; r < 6; r++) {
    const next = await deal(0)
    const carried = shared(next, boards[r - 1])
    check(
      `board ${r + 1} shares exactly ${CARRY_OVER} words with board ${r}`,
      carried.length === CARRY_OVER,
      `${carried.length}: ${carried.join(', ')}`,
    )
    if (r >= 2) {
      // A word may carry over once and then must sit a board out — without
      // this the same three ride the quota forward and one word lands on most
      // of the boards in a sitting, which is the original complaint again.
      const rode = carried.filter((id) => boards[r - 2].includes(id))
      check(`and none of the three had already carried over`, rode.length === 0, rode.join(', '))
    }
    boards.push(next)
  }

  // ---- across a reload, because the app is a PWA the player closes ---------
  await page.reload()
  await page.waitForSelector('.city-card')
  const afterReload = await deal(0)
  check(
    'the rule survives closing the app',
    shared(afterReload, boards[boards.length - 1]).length === CARRY_OVER,
    `${shared(afterReload, boards[boards.length - 1]).length}`,
  )

  // ---- and on a board of a different size ---------------------------------
  const bigger = await deal(1)
  check(
    'and holds when the next board is a different size',
    shared(bigger, afterReload).length === CARRY_OVER,
    `${shared(bigger, afterReload).length} of ${bigger.length}`,
  )

  // ---- what the store actually keeps --------------------------------------
  const state = (await persisted()).state
  check('the store remembers exactly two boards', state.recentBoards?.length === 2)
  check(
    'newest first',
    JSON.stringify(state.recentBoards[0]) === JSON.stringify(bigger),
    `${state.recentBoards[0]?.length} vs ${bigger.length}`,
  )

  // ---- a reroll is not a board the player played --------------------------
  // "A reroll button at the beginning to reroll the board if I have no idea on
  // how to connect the words." The button re-deals; the hazard is what it tells
  // the NEXT deal. A board dealt and rejected in ten seconds is not one the
  // player played, so it has to REPLACE the head of the two-deep window rather
  // than push onto it — otherwise the genuinely-previous board falls out of the
  // window and the reroll comes back holding three words of the very board the
  // player just said they could not read. Unit tests hold that in the store;
  // this is the same claim through the button.
  const beforeReroll = await deal(0)
  const played = (await persisted()).state.recentBoards[1]
  // In the header now, as a symbol: in the composer it cost a whole line of a
  // block that has to fit above the keyboard. Same conditions, same job.
  const reroll = page.locator('.icon-btn[aria-label="Deal new words"]')
  check('the reroll is offered before the first clue', await reroll.isVisible())
  await reroll.click()
  await page.waitForFunction(
    (was) =>
      JSON.parse(localStorage.getItem('cluecab-game-v1') ?? '{}').state?.game?.words?.[0]
        ?.wordId !== was,
    beforeReroll[0],
    { timeout: 15_000 },
  )
  const rerolled = (await persisted()).state.game.words.map((w) => w.wordId)
  check(
    'it deals a different board of the same size',
    rerolled.length === beforeReroll.length &&
      JSON.stringify(rerolled) !== JSON.stringify(beforeReroll),
    `${rerolled.length} words`,
  )
  const after = (await persisted()).state.recentBoards
  check(
    'the rejected board is not remembered',
    JSON.stringify(after[0]) === JSON.stringify(rerolled) &&
      JSON.stringify(after[1]) === JSON.stringify(played),
    `[${after[0]?.length}, ${after[1]?.length}]`,
  )
  check(
    'and it carried its three words from the last board actually played',
    shared(rerolled, played).length === CARRY_OVER,
    `${shared(rerolled, played).length} from played`,
  )
  // The point of the whole button. Before the sampler was told which board had
  // been rejected it answered the wrong question — it avoided the board BEFORE
  // and had no opinion about the one on screen — and a 3x4 reroll came back
  // measuring 7 of the same 12 words. Zero now, including the carry-over: the
  // rejected board took only three words off the played one, so the quota can
  // always be drawn from the other nine.
  const stale = shared(rerolled, beforeReroll).length
  check(
    'and it does not hand back the board the player just rejected',
    stale === 0,
    `${stale} of ${rerolled.length} words in common`,
  )

  // The other gate: one shared board per date, so a rerolled daily is nobody's
  // board. Checked here rather than the clue-count gate because this one is
  // deterministic — getting back to the clue dock with a clue behind you means
  // surviving a full guessing turn, which used to be a coin toss because a
  // forbidden word ended the round on roughly a tenth of them. Nothing ends a
  // round mid-turn now, but this gate is still the deterministic one to check
  // here. The clue-count gate is held in gameStore.test.ts,
  // where the store can simply be asked.
  await page.goto(`${preview.base}?mock=1&howto=0&fresh=1`)
  await page.waitForSelector('.city-card')
  // The daily challenge is the star beside Play now.
  await page.click('.home-daily')
  await page.waitForSelector('.clue-input')
  check(
    'and the daily challenge, which is one shared board, offers no reroll',
    (await page.locator('.icon-btn[aria-label="Deal new words"]').count()) === 0,
  )

  // ---- a v1 save upgrades rather than breaking ----------------------------
  // v1 kept one board under `lastBoard`. An installed PWA updates under the
  // player, so the old shape has to survive the change: it becomes the board to
  // carry three words out of, and the next deal must still be a legal board.
  const legacy = boards[0]
  await page.evaluate(
    ([ids]) => {
      localStorage.setItem(
        'cluecab-game-v1',
        JSON.stringify({ version: 1, state: { lastBoard: ids, lookedUp: [], recentBoards: undefined } }),
      )
    },
    [legacy],
  )
  const afterMigration = await deal(0)
  check('a v1 save still deals a full board', afterMigration.length === 12)
  check(
    'and its one remembered board is honoured',
    shared(afterMigration, legacy).length === CARRY_OVER,
    `${shared(afterMigration, legacy).length}`,
  )

  check('no page errors', crashes.length === 0, crashes.join(' | '))
} finally {
  await browser.close()
  preview.stop()
}

if (fail.length) {
  console.error(`\nFAILED: ${fail.join(', ')}`)
  process.exit(1)
}
console.log('\nREPEAT DRIVE OK')
