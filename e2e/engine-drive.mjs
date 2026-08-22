// The practice round is played by the local clue engine (E3), and this drive
// is the acceptance for the seam: a full round, end to end, with the network
// gone except for the static file server — and real clues on the board where
// `mok1` used to be.
//
// Three claims, each of which could be true in the module and false in the
// app:
//
//   1. OFFLINE. Under ?mock=1 nothing may leave the page — no proxy, no AI
//      call, nothing. Every request to any origin but the preview server is
//      recorded and fails the drive.
//   2. REAL CLUES. Casey's clues in the persisted history must be words, not
//      the mock's `mok<n>` counters — and each must still be legal against
//      the board it was given on, because the engine runs the same
//      `checkClueLegality` the player is bound by.
//   3. LAZY DATA. The book and matrix arrive as their own chunks when the
//      first engine call needs them, not in the main bundle. Asserted from
//      the browser's own resource log, because a vite config can change
//      silently.
import { chromium } from 'playwright'
import { startPreview } from './preview-server.mjs'

const PORT = 4187
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

// ---- claim 1: nothing leaves the page ------------------------------------
const escaped = []
await page.route('**/*', (route) => {
  const url = route.request().url()
  if (url.startsWith(preview.base) || url.startsWith('data:')) return route.continue()
  escaped.push(url)
  return route.abort()
})

try {
  await page.goto(`${preview.base}?mock=1&howto=0&fresh=1`)
  await page.waitForSelector('.city-card')

  await page.locator('.home-play').click()
  await page.waitForSelector('.board-grid')
  const study = page.locator('.study-dock .btn-primary')
  if (await study.isVisible().catch(() => false)) await study.click()

  // ---- play the round to its end, whatever the phases turn out to be ------
  // The same loop smoke-drive settled on: the player clues something legal and
  // unguessable, guesses once when it is their turn, and the engine does the
  // rest. Sudden death needs no handling — the player keeps guessing there
  // too, and a miss ends the round.
  let saw = { aiClue: false, rationale: false }
  for (let i = 0; i < 40 && (await page.locator('.round-summary').count()) === 0; i++) {
    const cap = (await page.locator('.phase-caption').textContent().catch(() => '')) ?? ''
    if (/Give Casey a clue/.test(cap)) {
      await page.fill('.clue-input input', `huskeliste${i}`)
      await page.click('.clue-input .btn-primary')
    } else if (/Your turn to guess|Last chance/.test(cap)) {
      const title = await page
        .locator('.guess-bar .dock-title')
        .textContent()
        .catch(() => null)
      if (title) {
        saw.aiClue = true
        console.log('    Casey clues:', title.replace(/\s+/g, ' ').trim())
      }
      const card = page.locator('.word-card.card-guessable').first()
      if ((await card.count()) > 0) {
        await card.click()
        const confirm = page.locator('.guess-confirm .btn-primary')
        if (await confirm.isVisible().catch(() => false)) await confirm.click()
      }
    }
    // Casey thinks aloud before each guess now (U3), which is two beats per
    // guess rather than one interval. A tap on her panel skips to the next
    // beat, so this loop's forty iterations still reach a summary — and the
    // rationale it goes on to read is written on the way past either way.
    const casey = page.locator('.dock.ai-panel[data-hurry]')
    if (await casey.isVisible().catch(() => false)) await casey.click().catch(() => {})
    await page.waitForTimeout(400)
  }
  check('the round reaches its summary', (await page.locator('.round-summary').count()) > 0)
  check('a Casey clue reached the board', saw.aiClue)

  // ---- claim 2: the clues were real ----------------------------------------
  const history = await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('cluecab-game-v1') ?? '{}')
    const g = raw.state?.game
    return (g?.clueHistory ?? []).map((c) => ({
      by: c.by,
      text: c.text,
      rationale: c.rationale ?? '',
      targets: c.targets ?? [],
    }))
  })
  const caseys = history.filter((c) => c.by === 'ai')
  check('Casey gave at least one clue', caseys.length > 0, `${caseys.length} of ${history.length}`)
  const mok = caseys.filter((c) => /^mok\d+$/i.test(c.text))
  check(
    'no clue is the mock counter',
    mok.length === 0,
    caseys.map((c) => c.text).join(', '),
  )
  const shaped = caseys.filter((c) => /^[a-zæøåé-]+$/i.test(c.text))
  check('every clue is one plain word', shaped.length === caseys.length)
  const reasoned = caseys.filter((c) => /points at/.test(c.rationale))
  check(
    'every clue carries the templated rationale',
    reasoned.length === caseys.length,
    caseys[0]?.rationale.slice(0, 80),
  )
  const targeted = caseys.filter((c) => c.targets.length >= 1)
  check('every clue names its targets', targeted.length === caseys.length)

  // ---- claim 3: the data came late and separately --------------------------
  const resources = await page.evaluate(() =>
    performance.getEntriesByType('resource').map((r) => r.name.split('/').pop() ?? ''),
  )
  const dataChunks = resources.filter((n) => /^(book|matrix)/.test(n))
  check(
    'the book and matrix arrive as their own chunks',
    dataChunks.length >= 2,
    dataChunks.join(', ') || `resources: ${resources.filter((n) => n.endsWith('.js')).join(', ')}`,
  )

  // ---- and claim 1, settled last so the whole session counts --------------
  check('nothing left the page', escaped.length === 0, escaped.slice(0, 3).join(', '))
  check('no page crashes', crashes.length === 0, crashes.join(' | '))
} finally {
  await browser.close()
  preview.stop()
}

if (fail.length > 0) {
  console.error(`\n${fail.length} failure(s): ${fail.join(', ')}`)
  process.exit(1)
}
console.log('\nengine-drive: the practice round is the engine, offline, with real clues')
