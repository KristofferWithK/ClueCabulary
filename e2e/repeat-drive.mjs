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

const CARRY_OVER = 3

const persisted = () =>
  page.evaluate(() => JSON.parse(localStorage.getItem('cluecab-game-v1') ?? '{}'))

/** Deal a board and return its word ids, in board order. */
async function deal(gridIndex) {
  await page.goto(`${preview.base}?mock=1&howto=0&letter=0`)
  await page.waitForSelector('.city-card')
  await page.locator('.grid-card').nth(gridIndex).click()
  await page.waitForSelector('.board-grid')
  const study = page.locator('.study-dock .btn-primary')
  if (await study.isVisible().catch(() => false)) await study.click()
  const state = await persisted()
  return state.state.game.words.map((w) => w.wordId)
}

const shared = (a, b) => a.filter((id) => b.includes(id))

try {
  await page.goto(`${preview.base}?mock=1&howto=0&letter=0`)
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
