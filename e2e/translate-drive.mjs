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

const lookedUp = () =>
  page.evaluate(() => JSON.parse(localStorage.getItem('cluecab-game-v1') ?? '{}').state?.lookedUp ?? [])

try {
  await page.goto(`${preview.base}?mock=1&howto=0&seed=5`)
  await page.waitForSelector('.city-card')
  await page.locator('.grid-card').first().click()
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
  await box.locator('summary').click()

  // English in, Danish out — the direction a Danish clue actually needs.
  await box.locator('input').fill('dog')
  await sleep(250)
  const hits = await box.locator('.translate-hits li').allTextContents()
  check('an English word gives the Danish', hits.join(' ').includes('hund'), hits[0] ?? '(none)')

  // And no request was needed: the thousand words answer offline.
  check('with no Ask Klaus needed', (await box.locator('.translate-ask').count()) === 0)

  // A word outside the set offers Klaus rather than inventing something.
  await box.locator('input').fill('helicopter')
  await sleep(250)
  check(
    'a word outside the set offers to ask Klaus',
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

  // The redemption challenge IS "translate the board with no dictionary".
  await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('cluecab-game-v1'))
    raw.state.game.phase = 'redemption'
    localStorage.setItem('cluecab-game-v1', JSON.stringify(raw))
  })
  await page.reload()
  await page.waitForTimeout(600)
  check(
    'and it is gone during redemption, where it would be the answer key',
    (await page.locator('.translate-box').count()) === 0,
  )

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
