// Guards the bug that made the game unplayable: your own key card must be
// drawn on the board, or you cannot tell which words to clue.
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { setTimeout as sleep } from 'node:timers/promises'

const SHOT_DIR = process.env.SHOT_DIR ?? '.'
const preview = spawn('npx', ['vite', 'preview', '--port', '4178', '--strictPort'], {
  cwd: new URL('..', import.meta.url).pathname,
  stdio: 'ignore',
})
await sleep(1500)

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium',
})
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
page.on('pageerror', (e) => console.log('PAGE CRASH:', e.message))

try {
  await page.goto('http://localhost:4178/ClueCabulary/?mock=1&seed=5&howto=0')
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

  // The legend explains the markers, and the dictionary is reachable by tapping
  // a card outside your guessing turn.
  await page.waitForSelector('.key-legend')
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
  preview.kill()
}
