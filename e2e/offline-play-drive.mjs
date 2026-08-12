// A whole round played with no key, no network and no model.
//
// The practice companion used to clue "mok1" and guess by hash — a test
// double, not something anyone could play. It is now LocalCompanion, which
// clues by naming a concept that covers several of its own words and none of
// its forbidden ones. This drive plays a real round against it in a browser,
// because "the app works without Ollama" is a claim about the app, not about
// a class.
//
// ?mock=1 still selects the deterministic double, which is what the other
// drives assert against — so this one must NOT pass it.
import { chromium } from 'playwright'
import { startPreview } from './preview-server.mjs'
import { setTimeout as sleep } from 'node:timers/promises'

const PORT = 4197
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

// The practice companion, with no key anywhere near the settings.
await page.addInitScript(() => {
  localStorage.setItem(
    'cluecab-settings-v1',
    JSON.stringify({
      state: {
        apiKey: '',
        baseUrl: 'https://ollama.com/v1',
        model: 'gpt-oss:120b',
        gridSize: 'beginner',
        clueLanguage: 'en',
        studyPhase: 'never',
        useMock: true,
        klausVerifiedAt: null,
      },
      version: 1,
    }),
  )
})

try {
  await page.goto(`${preview.base}?howto=0&seed=3`)
  await page.waitForSelector('.city-card')

  const board = await page.evaluate(
    () => JSON.parse(localStorage.getItem('cluecab-words-preview') ?? 'null'),
  )
  void board

  await page.locator('.grid-card').first().click()
  await page.waitForSelector('.board-grid')
  const study = page.locator('.study-dock .btn-primary')
  if (await study.isVisible().catch(() => false)) await study.click()

  const words = await page.evaluate(() => {
    const g = JSON.parse(localStorage.getItem('cluecab-game-v1')).state.game
    return g.words.map((w) => w.da)
  })
  console.log(`board: ${words.join(', ')}`)
  check('the first board is drawn from the curated city', words.length === 12)

  // Klaus guesses first, from a clue a person would actually type.
  await page.fill('.clue-input input', 'anatomy')
  await page.click('.clue-input .btn-primary')
  await page.waitForFunction(
    () => !document.querySelector('.phase-caption')?.textContent?.includes('Klaus is guessing'),
    undefined,
    { timeout: 25000 },
  )
  await sleep(1200)
  check('no error banner without a key', (await page.locator('.error-banner').count()) === 0)

  // Then Klaus's own clue, which is the thing that used to read "mok1".
  for (let i = 0; i < 14; i++) {
    const clueLine = await page.locator('.ai-clue-line, .clue-banner, .phase-caption').allTextContents()
    if (clueLine.join(' ').match(/mok\d/)) break
    const guessable = page.locator('.word-card.card-guessable').first()
    if (await guessable.isVisible().catch(() => false)) {
      await guessable.click()
      const confirm = page.locator('.guess-confirm .btn-primary')
      if (await confirm.isVisible().catch(() => false)) await confirm.click()
    } else {
      const clue = page.locator('.clue-input input')
      if (await clue.isVisible().catch(() => false)) {
        await clue.fill(['beverage', 'creature', 'meal', 'anatomy'][i % 4])
        await page.click('.clue-input .btn-primary')
      }
    }
    await sleep(900)
    if ((await page.locator('.debrief').count()) > 0) break
    if ((await page.locator('.redemption-form input').count()) > 0) break
  }

  const shown = (await page.locator('body').innerText()).toLowerCase()
  check('Klaus never says "mok1" to a player', !/\bmok\d/.test(shown), shown.match(/mok\d/)?.[0] ?? '')

  const history = await page.evaluate(() => {
    const g = JSON.parse(localStorage.getItem('cluecab-game-v1')).state.game
    return g.clueHistory.filter((c) => c.by === 'ai').map((c) => `${c.text} (${c.number})`)
  })
  console.log(`klaus clued: ${history.join(' | ') || '(none yet)'}`)
  check('Klaus gave a real clue', history.length > 0 && !/mok/.test(history.join(' ')), history.join(' | '))
  check('no page errors', crashes.length === 0, crashes.join(' | '))

  console.log(fail.length ? `\nFAILED: ${fail.join(', ')}` : '\nOFFLINE PLAY DRIVE OK')
  if (fail.length) process.exitCode = 1
} catch (e) {
  console.log('OFFLINE PLAY DRIVE FAILED:', e.stack ?? e.message)
  process.exitCode = 1
} finally {
  await browser.close()
  preview.stop()
  process.exit(process.exitCode ?? 0)
}
