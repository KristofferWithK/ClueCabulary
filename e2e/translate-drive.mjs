// Looking a word up mid-round, which is what clueing in Danish requires.
//
// The dictionary sheet only ever answered "what is this board word?" — the
// question you have already been handed the answer to. Composing a Danish clue
// asks the opposite, about a word that is not on the board and may not be in
// the app at all. This drives that field where it is actually used, and checks
// the two rules that keep it from being a way to read the board for free.
import { chromium } from 'playwright'
import { startPreview } from './preview-server.mjs'
import { setTimeout as sleep } from 'node:timers/promises'

const PORT = 4197
const preview = await startPreview(PORT)

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

const lookedUp = () =>
  page.evaluate(() => JSON.parse(localStorage.getItem('cluecab-game-v1') ?? '{}').state?.lookedUp ?? [])

try {
  await page.goto(`${preview.base}?mock=1&howto=0&seed=5&grid=beginner`)
  await page.waitForSelector('.city-card')
  await page.locator('.home-play').click()
  await page.waitForSelector('.board-grid')
  const study = page.locator('.study-dock .btn-primary')
  if (await study.isVisible().catch(() => false)) await study.click()

  const board = await page.evaluate(() => {
    const g = JSON.parse(localStorage.getItem('cluecab-game-v1')).state.game
    return g.words.map((w) => ({ id: w.wordId, da: w.da, en: w.en }))
  })
  console.log(`board: ${board.map((w) => w.da).join(', ')}`)

  // It lives where the clue is written, not behind a menu.
  const box = page.locator('.clue-input .translate-box')
  check('the lookup is in the clue dock', (await box.count()) === 1)

  // And it is a field, not a drawer: typeable with no tap of its own first.
  // It was a <details>, which cost a tap every turn — the component remounts
  // with the phase and a <details> keeps its open state on the element, so it
  // shut itself again each time. This fill would time out against that.
  check(
    'and it is a field you can just type into',
    await box
      .locator('input')
      .fill('dog', { timeout: 3000 })
      .then(() => true, () => false),
  )
  // Named by its placeholder rather than a label above it: the label was a
  // whole line of a composer that has to fit above a keyboard, spent saying a
  // word the field could say itself. What matters is that it is still named —
  // on screen for everyone, and to a screen reader.
  const field = box.locator('input')
  check(
    'named on screen without spending a line on a label',
    (await field.getAttribute('placeholder')) === 'Dictionary',
    await field.getAttribute('placeholder'),
  )
  check(
    'and named for a screen reader too',
    /translate/i.test((await field.getAttribute('aria-label')) ?? ''),
    await field.getAttribute('aria-label'),
  )
  check('and no disclosure to open first', (await box.locator('summary').count()) === 0)

  // English in, Danish out — the direction a Danish clue actually needs.
  await sleep(250)
  const hits = await box.locator('.translate-hits li').allTextContents()
  check('an English word gives the Danish', hits.join(' ').includes('hund'), hits[0] ?? '(none)')

  // And no request was needed: the thousand words answer offline.
  check('with no Ask Casey needed', (await box.locator('.translate-ask').count()) === 0)

  // Looking up an English word whose Danish is ON the board. This is the case
  // that read as a broken dictionary from a phone: "wood" answers "et træ",
  // which is both the correct translation and an illegal clue, with nothing
  // saying so. The board is already on screen, so naming it reveals nothing.
  const boardEn = board[2].en[0]
  await box.locator('input').fill(boardEn)
  await sleep(300)
  const flagged = await box.locator('.translate-hits .hit-on-board').count()
  check(
    'a hit that is on the board says so, instead of inviting an illegal clue',
    flagged >= 1,
    `${boardEn} → ${(await box.locator('.translate-hits li').allTextContents()).join(' | ')}`,
  )

  // A word outside the set offers Casey rather than inventing something.
  await box.locator('input').fill('helicopter')
  await sleep(250)
  check(
    'a word outside the set offers to ask Casey',
    (await box.locator('.translate-ask').count()) === 1,
  )
  check('and claims nothing on its own', (await box.locator('.translate-hits').count()) === 0)

  // Looking up a BOARD word costs what tapping ⓘ costs. Otherwise this field
  // is a way to read the whole board for nothing.
  const before = await lookedUp()
  await box.locator('input').fill(board[0].en[0])
  await sleep(250)
  await box.locator('.translate-ask .btn').click().catch(() => undefined)
  await sleep(600)
  const after = await lookedUp()
  check(
    'looking up a board word is charged as a lookup',
    after.includes(board[0].id) && after.length > before.length,
    `${before.length} → ${after.length}`,
  )

  // The other half of the rule: there is a phase where this box would BE the
  // answer key, and it must not be on screen there. That used to be the
  // redemption challenge ("translate the board with no dictionary"); with that
  // retired, the wrap-up packing phase is the one no-dictionary moment left,
  // and it makes the same bargain in the other direction.
  await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('cluecab-game-v1'))
    raw.state.mode = 'wrapup'
    raw.state.packingDone = false
    raw.state.packed = []
    localStorage.setItem('cluecab-game-v1', JSON.stringify(raw))
  })
  // A reload lands on Home, where there is no lookup box to find — so the
  // check below would pass without ever reaching the screen it names. Come
  // back in the way the player does.
  await page.reload()
  await page.getByRole('button', { name: 'Continue game' }).click()
  await page.waitForSelector('.packing-dock', { timeout: 15000 })
  check(
    'and it is gone while the board is being packed, where it would be the answer key',
    (await page.locator('.translate-box').count()) === 0,
  )
  check('as is the dictionary on every card', (await page.locator('.card-info').count()) === 0)


  check('no page errors', crashes.length === 0, crashes.join(' | '))
  console.log(fail.length ? `\nFAILED: ${fail.join(', ')}` : '\nTRANSLATE DRIVE OK')
  if (fail.length) process.exitCode = 1
} catch (e) {
  console.log('TRANSLATE DRIVE FAILED:', e.stack ?? e.message)
  process.exitCode = 1
} finally {
  await browser.close()
  preview.stop()
  process.exit(process.exitCode ?? 0)
}
