// Manual-style smoke drive of the built app with the mock companion.
import { chromium } from 'playwright'
import { passKlausOpening } from './first-turn.mjs'
import { startPreview } from './preview-server.mjs'

const PORT = 4173
const preview = await startPreview(PORT)
import { setTimeout as sleep } from 'node:timers/promises'

const SHOT_DIR = process.env.SHOT_DIR ?? '.'

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium',
})
const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
page.on('console', (m) => m.type() === 'error' && console.log('PAGE ERROR:', m.text()))
page.on('pageerror', (e) => console.log('PAGE CRASH:', e.message))

try {
  await page.goto(preview.base + '?mock=1&seed=5')
  await page.waitForSelector('h1:has-text("ClueCabulary")')

  // First visit opens with the letter, which hands over to the rules.
  await page.waitForSelector('.letter', { timeout: 8000 })
  await page.screenshot({ path: `${SHOT_DIR}/00-letter.png` })
  await page.click('.letter-go')

  // Then the How-to-play overlay — read it like a new player would.
  await page.waitForSelector('.howto', { timeout: 5000 })
  await page.screenshot({ path: `${SHOT_DIR}/00-howto.png` })
  await page.click('.howto .btn-primary')
  await page.screenshot({ path: `${SHOT_DIR}/01-home.png` })

  await page.click('.grid-card:first-child') // beginner 3x4
  await page.waitForSelector('.board-grid')
  await page.screenshot({ path: `${SHOT_DIR}/02-board.png` })
  const cards = await page.locator('.word-card .card-da').allTextContents()
  console.log('BOARD:', cards.join(', '))

  // Early cities open with the whole board translated; read it, then begin.
  const study = page.locator('.study-dock .btn-primary')
  if (await study.isVisible().catch(() => false)) {
    const glosses = await page.locator('.word-card .card-en').count()
    if (glosses !== cards.length) {
      throw new Error(`study phase showed ${glosses} of ${cards.length} translations`)
    }
    console.log(`study phase: all ${glosses} translations shown`)
    await page.screenshot({ path: `${SHOT_DIR}/02b-study.png` })
    await study.click()
    // Translations must hide again once the round starts.
    if ((await page.locator('.word-card .card-en').count()) !== 0) {
      throw new Error('translations stayed visible after the study phase')
    }
  }

  // Player clue round
  // Klaus opens the round, so the clue box is one guess away.
  await passKlausOpening(page)
  await page.fill('.clue-input input', 'huskeliste')
  await page.click('.clue-input .btn-primary')
  console.log('clue submitted; waiting for AI guesses…')
  // Wait until phase leaves aiGuessing (AI finishes its guesses)
  await page.waitForFunction(
    () => !document.querySelector('.phase-caption')?.textContent?.includes('Klaus is guessing'),
    undefined,
    { timeout: 20000 },
  )
  await page.screenshot({ path: `${SHOT_DIR}/03-after-ai-guess.png` })
  console.log('phase now:', await page.locator('.phase-caption').textContent())

  // If it's now the player's guessing turn (AI gave a clue), make one guess then stop.
  const caption = await page.locator('.phase-caption').textContent()
  if (caption?.includes('Your turn')) {
    console.log('AI clue:', await page.locator('.guess-bar .dock-title').textContent())
    await page.locator('.word-card.card-guessable').first().click()
    await page.locator('.guess-confirm .btn-primary').click()
    await sleep(400)
    await page.screenshot({ path: `${SHOT_DIR}/04-player-guessed.png` })
    console.log('after player guess phase:', await page.locator('.phase-caption').textContent())
    const stop = page.locator('.btn-ghost')
    if (await stop.isVisible().catch(() => false)) await stop.click()
  }

  // Dictionary sheet
  const info = page.locator('.card-info').first()
  if (await info.isVisible().catch(() => false)) {
    await info.click()
    await page.waitForSelector('.sheet')
    await page.screenshot({ path: `${SHOT_DIR}/05-dictionary.png` })
    console.log('dictionary shows:', await page.locator('.sheet h2').textContent())
    await page.click('.sheet .btn')
  }

  // Translations toggle. Deliberately disabled during the redemption round —
  // which the mock AI can reach on some seeds — so only exercise it in play.
  const toggle = page.locator('.game-header .icon-btn:last-child')
  if (await toggle.isEnabled()) {
    await toggle.click()
    await page.screenshot({ path: `${SHOT_DIR}/06-translations.png` })
  } else {
    console.log('translations toggle locked (redemption round) — skipping')
    await page.screenshot({ path: `${SHOT_DIR}/06-redemption.png` })
  }

  console.log('SMOKE OK')
} catch (e) {
  await page.screenshot({ path: `${SHOT_DIR}/99-failure.png` }).catch(() => {})
  console.log('SMOKE FAILED:', e.message)
  process.exitCode = 1
} finally {
  await browser.close()
  preview.stop()
}
