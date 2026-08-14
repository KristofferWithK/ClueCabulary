// One real round against a real model, and a look at what Cluey actually says.
//
//   OLLAMA_API_KEY=... node e2e/live-drive.mjs
//
// Optional: OLLAMA_BASE_URL (default https://ollama.com/v1 — set this to your
// Cloudflare Worker if ollama.com refuses browser requests) and OLLAMA_MODEL.
//
// This exists because the prompts in src/ai/prompts.ts were written and tuned
// without anyone ever reading a single response. ai-drive.mjs proves the client
// handles whatever a model returns; only this can say whether the clues are any
// good, or whether ollama.com talks to a browser at all.
//
// The key is read from the environment, seeded before the first paint so it
// never appears in a URL, and never printed. The output is safe to paste.
import { chromium } from 'playwright'
import { startPreview } from './preview-server.mjs'
import { setTimeout as sleep } from 'node:timers/promises'

const KEY = process.env.OLLAMA_API_KEY
if (!KEY) {
  console.log('LIVE DRIVE SKIPPED (no OLLAMA_API_KEY)')
  process.exit(0)
}
const BASE_URL = process.env.OLLAMA_BASE_URL ?? 'https://ollama.com/v1'
const MODEL = process.env.OLLAMA_MODEL ?? 'gpt-oss:120b'

const PORT = 4188
const preview = await startPreview(PORT)
const BASE = preview.base

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium',
})
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
const page = await ctx.newPage()
page.on('pageerror', (e) => console.log('PAGE CRASH:', e.message))

await page.addInitScript(
  ({ apiKey, baseUrl, model }) => {
    localStorage.setItem(
      'cluecab-settings-v1',
      JSON.stringify({
        state: {
          apiKey,
          baseUrl,
          model,
          gridSize: 'beginner',
          clueLanguage: 'en',
          studyPhase: 'never',
          useMock: false,
        },
        version: 1,
      }),
    )
  },
  { apiKey: KEY, baseUrl: BASE_URL, model: MODEL },
)

/** Whatever the app is showing as an error, if anything. */
const currentError = async () =>
  (await page.locator('.error-banner').count())
    ? (await page.locator('.error-banner p').textContent()).trim()
    : null

try {
  console.log(`base URL: ${BASE_URL}`)
  console.log(`model:    ${MODEL}`)
  console.log('key:      (from OLLAMA_API_KEY, not shown)\n')

  await page.goto(`${BASE}?howto=0&grid=beginner`)
  await page.waitForSelector('.city-card')
  await page.locator('.home-play').click()
  await page.waitForSelector('.board-grid')
  const study = page.locator('.study-dock .btn-primary')
  if (await study.isVisible().catch(() => false)) await study.click()

  const board = await page.locator('.word-card .card-word').allTextContents()
  console.log(`board: ${board.join(', ')}\n`)

  // Your clue first, so Cluey has to guess before he has to invent.
  const clue = process.env.LIVE_CLUE ?? 'hverdag'
  console.log(`you clue: «${clue}» (2)`)
  await page.fill('.clue-input input', clue)
  await page.locator('.clue-input .stepper button').last().click()
  await page.click('.clue-input .btn-primary')

  // Cluey guessing, then Cluey clueing. A real model is slow; be patient.
  const deadline = Date.now() + 120_000
  let sawGuess = false
  let clueyClue = null
  while (Date.now() < deadline) {
    const err = await currentError()
    if (err) {
      console.log(`\nKLAUS FAILED: ${err}`)
      if (/CORS/i.test(err)) {
        console.log(
          '\nThat is ollama.com refusing a browser request. Deploy the worker in\n' +
            'proxy/ and re-run with OLLAMA_BASE_URL set to it plus /v1.',
        )
      }
      process.exitCode = 1
      break
    }
    if (!sawGuess && (await page.locator('.ai-guess-line').count())) {
      const line = (await page.locator('.ai-guess-line').textContent()).replace(/\s+/g, ' ').trim()
      if (line && !/choosing/i.test(line)) {
        console.log(`cluey guesses: ${line}`)
        sawGuess = true
      }
    }
    if (await page.locator('.guess-bar .dock-title').count()) {
      clueyClue = (await page.locator('.guess-bar .dock-title').textContent())
        .replace(/\s+/g, ' ')
        .trim()
      break
    }
    await sleep(1000)
  }

  if (clueyClue) {
    console.log(`\ncluey clues: ${clueyClue}`)
    console.log('\nLIVE DRIVE OK — Cluey answered, and the round advanced.')
  } else if (process.exitCode !== 1) {
    console.log('\nLIVE DRIVE TIMED OUT — no answer inside two minutes and no error shown.')
    process.exitCode = 1
  }
} catch (e) {
  console.log('LIVE DRIVE FAILED:', e.message)
  process.exitCode = 1
} finally {
  await browser.close()
  preview.stop()
}
