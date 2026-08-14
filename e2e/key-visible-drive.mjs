// Guards the bug that made the game unplayable: your own key card must be
// drawn on the board, or you cannot tell which words to clue.
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

  const expectedGreens = Object.values(game.playerKey).filter((r) => r === 'green').length
  const expectedForbidden = Object.values(game.playerKey).filter((r) => r === 'forbidden').length

  const shownGreens = await page.locator('.word-card.mykey-green').count()
  const shownForbidden = await page.locator('.word-card.mykey-forbidden').count()
  console.log(
    `key on board: ${shownGreens}/${expectedGreens} targets, ${shownForbidden}/${expectedForbidden} forbidden`,
  )
  if (shownGreens !== expectedGreens) {
    throw new Error(`your targets are not shown (${shownGreens} of ${expectedGreens})`)
  }
  if (shownForbidden !== expectedForbidden) {
    throw new Error(`your forbidden words are not shown (${shownForbidden} of ${expectedForbidden})`)
  }

  // Each marked card must actually say so to a screen reader too.
  const label = await page.locator('.word-card.mykey-green').first().getAttribute('aria-label')
  if (!label?.includes('your target')) throw new Error(`target not announced: ${label}`)

  // A dashed card is forbidden ON your key: a word Cluey must never be led to,
  // NOT a word you must never tap. Under his clue it is judged against his key
  // and is perfectly safe. The legend said "forbidden for you", which reads as
  // the opposite and disagreed with the screen-reader name beside it.
  const dashLabel = await page
    .locator('.word-card.mykey-forbidden')
    .first()
    .getAttribute('aria-label')
  if (!dashLabel?.includes('forbidden on your key')) {
    throw new Error(`dashed card not announced as a key marking: ${dashLabel}`)
  }

  // The legend explains the markers, and the dictionary is reachable by tapping
  // a card outside your guessing turn.
  await page.waitForSelector('.key-legend')
  const legend = (await page.locator('.key-legend').textContent()) ?? ''
  if (!legend.includes('forbidden on your key')) {
    throw new Error(`legend does not say whose key the dashes are: ${legend.trim()}`)
  }
  if (/forbidden for you/.test(legend)) {
    throw new Error('legend still reads as "you must not name this"')
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
