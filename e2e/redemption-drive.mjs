// Drives the forbidden-word → redemption → win path against the built app.
// The test peeks at the persisted game state in localStorage to find a word
// that is forbidden on the AI's key, taps it deliberately during the player's
// guessing turn, then answers the translation challenge correctly.
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'

const SHOT_DIR = process.env.SHOT_DIR ?? '.'
const preview = spawn('npx', ['vite', 'preview', '--port', '4174', '--strictPort'], {
  cwd: new URL('..', import.meta.url).pathname,
  stdio: 'ignore',
})
await sleep(1500)

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium',
})
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
page.on('pageerror', (e) => console.log('PAGE CRASH:', e.message))

const readGame = () =>
  page.evaluate(() => JSON.parse(localStorage.getItem('cluecab-game-v1') ?? '{}').state?.game)

try {
  await page.goto('http://localhost:4174/ClueCabulary/?mock=1&seed=11&howto=0')
  await page.waitForSelector('h1:has-text("ClueCabulary")')
  await page.click('.grid-card:first-child')
  await page.waitForSelector('.board-grid')

  // Round-trip one player clue. Two valid routes into redemption from here:
  // the mock AI stumbles onto a forbidden word itself, or we reach our own
  // guessing turn and deliberately tap one.
  await page.fill('.clue-input input', 'huskeliste')
  await page.click('.clue-input .btn-primary')
  await page.waitForFunction(
    () =>
      document.querySelector('.redemption') !== null ||
      document.querySelector('.phase-caption')?.textContent === 'Your turn to guess',
    undefined,
    { timeout: 30000 },
  )

  if (!(await page.locator('.redemption').isVisible())) {
    const game = await readGame()
    if (!game) throw new Error('no persisted game found')
    const forbidden = Object.entries(game.aiKey).find(
      ([id, role]) => role === 'forbidden' && game.reveals[id].kind === 'hidden',
    )
    if (!forbidden) throw new Error('no hidden AI-forbidden word (unexpected)')
    const word = game.words.find((w) => w.wordId === forbidden[0])
    console.log(`deliberately guessing forbidden word: ${word.da}`)
    await page.click(`.word-card:has(.card-da:text-is("${word.da}"))`)
    await page.click('.guess-confirm .btn-primary')
  } else {
    console.log('mock AI hit a forbidden word on its own — proceeding to redemption')
  }
  await page.waitForSelector('.redemption')
  await page.screenshot({ path: `${SHOT_DIR}/r1-redemption.png` })

  // Dictionary must be locked: no ⓘ buttons and the Aa toggle disabled.
  if ((await page.locator('.card-info').count()) > 0) throw new Error('dictionary not locked!')

  const current = await readGame()
  const prompted = current.words.filter((w) => current.redemption.promptWordIds.includes(w.wordId))
  console.log(`answering ${prompted.length} words`)
  for (const w of prompted) {
    await page.fill(`.redemption-item:has(.redemption-da:text-is("${w.da}")) input`, w.en[0])
  }
  await page.screenshot({ path: `${SHOT_DIR}/r2-filled.png` })
  await page.click('.btn-danger')
  await page.waitForSelector('.outcome-banner')
  const title = await page.locator('.outcome-banner h2').textContent()
  console.log('outcome:', title)
  await page.screenshot({ path: `${SHOT_DIR}/r3-outcome.png` })
  if (!title?.includes('Redeemed')) throw new Error(`expected redemption win, got: ${title}`)

  // SRS must have recorded the round.
  const srs = await page.evaluate(() =>
    Object.keys(JSON.parse(localStorage.getItem('cluecab-srs-v1') ?? '{}').state?.stats ?? {}),
  )
  if (srs.length === 0) throw new Error('SRS did not record the round')
  console.log(`SRS recorded ${srs.length} words`)
  console.log('REDEMPTION DRIVE OK')
} catch (e) {
  await page.screenshot({ path: `${SHOT_DIR}/r9-failure.png` }).catch(() => {})
  console.log('REDEMPTION DRIVE FAILED:', e.message)
  process.exitCode = 1
} finally {
  await browser.close()
  preview.kill()
}
