// Guards the bug that made the game unplayable: your own key card must be
// drawn on the board, or you cannot tell which words to clue.
//
// The key used to carry two markings and this drive checked both: a solid
// green border for a target and a dashed black one for a word forbidden on
// your key. Forbidden words are gone from every board, so there is one marking
// left and it is the one the game cannot be played without — hence the extra
// checks below that it is drawn on EVERY green and on nothing else. A count
// that matched by accident would have been caught by the dashed cards before;
// now nothing else is in the picture, so this asks per card.
import { chromium } from 'playwright'
import { startPreview } from './preview-server.mjs'

const PORT = 4178
const preview = await startPreview(PORT)
import { setTimeout as sleep } from 'node:timers/promises'

const SHOT_DIR = process.env.SHOT_DIR ?? '.'

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium',
})
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
page.on('pageerror', (e) => console.log('PAGE CRASH:', e.message))

try {
  await page.goto(preview.base + '?mock=1&seed=5&howto=0')
  await page.waitForSelector('.city-card')
  await page.click('.btn-primary')
  await page.waitForSelector('.board-grid')

  const game = await page.evaluate(
    () => JSON.parse(localStorage.getItem('cluecab-game-v1') ?? '{}').state?.game,
  )
  if (!game) throw new Error('no game state')

  const myGreens = Object.keys(game.playerKey).filter((id) => game.playerKey[id] === 'green')
  const shownGreens = await page.locator('.word-card.mykey-green').count()
  console.log(`key on board: ${shownGreens}/${myGreens.length} targets`)
  if (myGreens.length === 0) throw new Error('the deal put nothing on the player key')
  if (shownGreens !== myGreens.length) {
    throw new Error(`your targets are not shown (${shownGreens} of ${myGreens.length})`)
  }

  // Card by card, not just by count: the marking has to be on the RIGHT cards.
  // With only one marking left, a count can agree while every mark sits on the
  // wrong word — which is the same unplayable board this drive exists for.
  const marked = new Set(
    await page.locator('.word-card.mykey-green .card-word').allTextContents(),
  )
  const expectedDa = new Set(
    myGreens.map((id) => game.words.find((w) => w.wordId === id).da),
  )
  for (const da of expectedDa) {
    if (!marked.has(da)) throw new Error(`«${da}» is your target and is not drawn as one`)
  }
  for (const da of marked) {
    if (!expectedDa.has(da)) throw new Error(`«${da}» is drawn as your target and is not one`)
  }
  console.log(`and on the right cards: ${[...marked].slice(0, 4).join(', ')}…`)

  // Each marked card must actually say so to a screen reader too — the border
  // is now the only visual carrier, so the accessible name is the only other
  // route to the same information.
  const label = await page.locator('.word-card.mykey-green').first().getAttribute('aria-label')
  if (!label?.includes('your target')) throw new Error(`target not announced: ${label}`)

  // And a card that is NOT yours must not claim to be.
  const plain = await page
    .locator('.word-card:not(.mykey-green)')
    .first()
    .getAttribute('aria-label')
  if (plain?.includes('your target')) throw new Error(`unmarked card announced as a target: ${plain}`)

  // The legend explains the marker, and the dictionary is reachable by tapping
  // a card outside your guessing turn.
  await page.waitForSelector('.key-legend')
  const legend = (await page.locator('.key-legend').textContent()) ?? ''
  if (!legend.includes('your target')) {
    throw new Error(`legend does not explain the border: ${legend.trim()}`)
  }
  // The legend had a second swatch for the dashed cards. It must not describe
  // a marking the board no longer draws.
  if (/forbidden/i.test(legend)) {
    throw new Error(`legend still describes forbidden words: ${legend.trim()}`)
  }
  await page.locator('.word-card').first().click()
  await page.waitForSelector('.sheet', { timeout: 5000 })
  console.log('tap-to-look-up opened:', (await page.locator('.sheet h2').textContent())?.trim())
  await page.screenshot({ path: `${SHOT_DIR}/k1-key-visible.png` })
  await page.click('.sheet .btn')

  console.log('KEY VISIBLE DRIVE OK')
} catch (e) {
  await page.screenshot({ path: `${SHOT_DIR}/k9-failure.png` }).catch(() => {})
  console.log('KEY VISIBLE DRIVE FAILED:', e.message)
  process.exitCode = 1
} finally {
  await browser.close()
  preview.stop()
}
