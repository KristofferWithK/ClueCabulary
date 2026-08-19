// Manual-style smoke drive of the built app with the mock companion.
import { chromium } from 'playwright'
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
  await page.goto(preview.base + '?mock=1&seed=5&grid=beginner')
  await page.waitForSelector('h1:has-text("ClueCabulary")')

  // First visit opens with the How-to-play overlay — read it like a new player would.
  await page.waitForSelector('.howto', { timeout: 8000 })
  await page.screenshot({ path: `${SHOT_DIR}/00-howto.png` })
  await page.click('.howto .btn-primary')
  await page.screenshot({ path: `${SHOT_DIR}/01-home.png` })

  await page.locator('.home-play').click() // beginner 3x4, via ?grid=
  await page.waitForSelector('.board-grid')
  await page.screenshot({ path: `${SHOT_DIR}/02-board.png` })
  const cards = await page.locator('.word-card .card-word').allTextContents()
  console.log('BOARD:', cards.join(', '))

  // A round opens on Danish words and nothing else. No study dock, no glosses.
  // Asserted rather than tolerated: this drive used to accept the study phase if
  // it appeared, so it would have kept passing while every round opened with
  // twelve English translations on screen — which is exactly what a stale
  // persisted setting was still doing.
  if (await page.locator('.study-dock').count()) {
    throw new Error('the round opened with the study phase')
  }
  const openingGlosses = await page.locator('.word-card .card-en').count()
  if (openingGlosses !== 0) {
    throw new Error(`the round opened with ${openingGlosses} translations on the board`)
  }
  console.log(`opened on ${cards.length} Danish words, 0 translations`)

  // The clue box asks for a Danish word, and it was the only free-text field in
  // the app leaving the phone keyboard's English autocorrect on. What comes
  // back from that is an English word the player never typed — a plausible
  // source of the clue «foster», which is legal, unguessable, and a
  // Danish/English homograph besides.
  const clueAttrs = await page.evaluate(() => {
    const el = document.querySelector('.clue-input input')
    return { correct: el.getAttribute('autocorrect'), spell: el.getAttribute('spellcheck') }
  })
  if (clueAttrs.correct !== 'off' || clueAttrs.spell !== 'false') {
    throw new Error(`clue box still autocorrects: ${JSON.stringify(clueAttrs)}`)
  }

  // Cluey reads a Danish board and gets the clue as a bare string, so an
  // English word there is one he cannot place. The box says so and puts the
  // lookup one tap away rather than passing the English along.
  await page.fill('.clue-input input', 'water')
  const warned = await page.evaluate(() => ({
    label: document.querySelector('.clue-input .btn-primary').textContent,
    error: document.querySelector('.clue-error')?.textContent ?? '',
    lookup: [...document.querySelectorAll('.clue-input .composer-link')].map((b) => b.textContent),
  }))
  if (!/looks English/.test(warned.error)) throw new Error(`no English warning: ${warned.error}`)
  if (!/anyway/.test(warned.label)) throw new Error(`no override offered: ${warned.label}`)
  if (!warned.lookup.some((l) => l.includes('water'))) {
    throw new Error(`no one-tap lookup offered: ${JSON.stringify(warned.lookup)}`)
  }

  // Everything the shipped thousand can settle offline must never reach that
  // path: a homograph that is also Danish, a compound of two known words, and
  // a Danish word we simply do not ship — 'unknown' is permission, not
  // suspicion, which is where «trafik» and most real clues live.
  for (const ok of ['salt', 'dyreliv', 'trafik', 'kæledyr', 'hunden']) {
    await page.fill('.clue-input input', ok)
    const label = await page.locator('.clue-input .btn-primary').textContent()
    if (/anyway/.test(label ?? '')) throw new Error(`«${ok}» was treated as English`)
  }
  console.log('English clue warned with an override; Danish forms pass untouched')

  // Player clue round
  await page.fill('.clue-input input', 'huskeliste')
  await page.click('.clue-input .btn-primary')
  console.log('clue submitted; waiting for AI guesses…')
  // Wait until phase leaves aiGuessing (AI finishes its guesses)
  await page.waitForFunction(
    () => !document.querySelector('.phase-caption')?.textContent?.includes('Cluey is guessing'),
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

  // Translations toggle. It used to be disabled during the redemption round,
  // which the mock AI could reach on some seeds, so this had a skip branch.
  // The only thing that disables it now is the opening study phase, which this
  // drive is already past — so it must simply be live.
  const toggle = page.locator('.game-header .icon-btn:last-child')
  if (!(await toggle.isEnabled())) throw new Error('the translations toggle is disabled in play')
  await toggle.click()
  await page.screenshot({ path: `${SHOT_DIR}/06-translations.png` })

  // ---- and on a phone that has been playing since before the default moved --
  // The check above passes on a fresh install even when the app is broken for
  // everyone who already has it: settings persist, so a device holding the old
  // studyPhase kept opening every round with the whole board translated long
  // after the default said otherwise. This is that device.
  const V1_SETTINGS = JSON.stringify({
    version: 1,
    state: {
      apiKey: '',
      baseUrl: 'https://example.invalid/v1',
      model: 'm',
      gridSize: 'beginner',
      clueLanguage: 'en',
      studyPhase: 'auto',
      useMock: false,
      klausVerifiedAt: null,
    },
  })
  await page.evaluate((blob) => {
    localStorage.clear()
    localStorage.setItem('cluecab-settings-v1', blob)
  }, V1_SETTINGS)
  await page.goto(preview.base + '?mock=1&seed=5&howto=0&grid=beginner')
  await page.waitForSelector('.city-card')
  await page.locator('.home-play').click()
  await page.waitForSelector('.board-grid')
  if (await page.locator('.study-dock').count()) {
    throw new Error('an upgraded save still opens with the study phase')
  }
  const staleGlosses = await page.locator('.word-card .card-en').count()
  if (staleGlosses !== 0) {
    throw new Error(`an upgraded save opened with ${staleGlosses} translations`)
  }
  const migrated = await page.evaluate(
    () => JSON.parse(localStorage.getItem('cluecab-settings-v1')).state.studyPhase,
  )
  if (migrated !== 'never') throw new Error(`studyPhase not migrated: ${migrated}`)
  console.log('a v1 save upgrades to a clean opening board')

  // ---- and the practice companion admits to being the practice companion ----
  // This whole drive runs on ?mock=1, which writes useMock into settings. The
  // in-round note used to key on the FALLBACK flag alone, so this route — the
  // one a stray URL puts a player on permanently — produced random guesses
  // under Cluey's name with nothing on screen saying so, while also suppressing
  // both of Home's setup warnings.
  const note = await page.locator('.practice-note').textContent()
  if (!/Practice companion/.test(note ?? '')) {
    throw new Error(`no practice note while on the mock: ${note}`)
  }
  if (!/Cluey is not playing/.test(note)) throw new Error(`note is too coy: ${note}`)
  console.log('practice companion says so:', note.replace(/\s+/g, ' ').trim().slice(0, 60) + '…')

  // ---- the debrief shows why, not only what -------------------------------
  // The turn log used to be a one-line score strip: «mad ✓  hus ·». The model
  // had always written a reason for each guess and the engine dropped it on
  // the floor, so "why that word?" was the one question the app had thrown
  // away. Played out here rather than asserted on a fixture, because the value
  // only exists if the reasoning survives the engine and the store.
  await page.evaluate(() => localStorage.removeItem('cluecab-game-v1'))
  await page.goto(preview.base + '?mock=1&seed=11&howto=0&grid=beginner')
  await page.waitForSelector('.city-card')
  await page.locator('.home-play').click()
  await page.waitForSelector('.board-grid')
  for (let i = 0; i < 30 && (await page.locator('.debrief').count()) === 0; i++) {
    const cap = await page.locator('.phase-caption').textContent().catch(() => '')
    if (cap === 'Give Cluey a clue') {
      await page.fill('.clue-input input', `huskeliste${i}`)
      await page.click('.clue-input .btn-primary')
    } else if (cap === 'Your turn to guess' || cap?.includes('Sudden')) {
      const card = page.locator('.word-card.card-guessable').first()
      if (await card.isVisible().catch(() => false)) {
        await card.click()
        const confirm = page.locator('.guess-confirm .btn-primary')
        if (await confirm.isVisible().catch(() => false)) await confirm.click()
      }
    }
    // This loop used to have to answer the last chance here — a forbidden word
    // could interrupt it with a twenty-word translation form. Nothing
    // interrupts a round any more; it plays to a debrief or to sudden death.
    await sleep(700)
  }
  await page.waitForSelector('.turn-log', { timeout: 10000 })
  const log = await page.evaluate(() => ({
    turns: document.querySelectorAll('.turn-log > li').length,
    guesses: document.querySelectorAll('.turn-guesses li').length,
    whys: document.querySelectorAll('.turn-why').length,
    confidences: document.querySelectorAll('.guess-confidence').length,
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }))
  if (log.turns === 0) throw new Error('turn log is empty')
  if (log.whys === 0) throw new Error('the debrief shows no reasoning at all')
  // Every AI guess carries both; the player's own taps carry neither, so the
  // count is bounded by the guesses rather than equal to them.
  if (log.confidences === 0) throw new Error('no confidence shown for any AI guess')
  if (log.confidences > log.guesses) throw new Error('more confidences than guesses')
  if (log.overflow > 0) throw new Error(`debrief overflows by ${log.overflow}px`)
  console.log(
    `turn log: ${log.turns} turns, ${log.guesses} guesses, ${log.whys} reasons, ${log.confidences} confidences`,
  )

  // ---- flagging a bad call, on the one screen that shows the reasoning ------
  // The flag is only worth tapping because Cluey is shown it next round, so
  // this checks it reaches storage rather than just toggling a glyph.
  const flags = page.locator('.flag-btn')
  const flagCount = await flags.count()
  if (flagCount === 0) throw new Error('nothing in the review page can be flagged')
  await flags.first().click()
  await sleep(150)
  const stored = await page.evaluate(
    () => JSON.parse(localStorage.getItem('cluecab-feedback-v1') ?? '{}').state?.flags ?? [],
  )
  if (stored.length !== 1) throw new Error(`flag not stored: ${JSON.stringify(stored)}`)
  if (!stored[0].what) throw new Error(`flag carries no word: ${JSON.stringify(stored[0])}`)
  if (!(await flags.first().getAttribute('aria-pressed')) === true) {
    throw new Error('flag does not report its state')
  }
  // A mis-tap must be undoable.
  await flags.first().click()
  await sleep(150)
  const cleared = await page.evaluate(
    () => JSON.parse(localStorage.getItem('cluecab-feedback-v1') ?? '{}').state?.flags ?? [],
  )
  if (cleared.length !== 0) throw new Error(`flag would not come back off: ${cleared.length}`)
  console.log(`flagged and unflagged one of ${flagCount} calls`)

  console.log('SMOKE OK')
} catch (e) {
  await page.screenshot({ path: `${SHOT_DIR}/99-failure.png` }).catch(() => {})
  console.log('SMOKE FAILED:', e.message)
  process.exitCode = 1
} finally {
  await browser.close()
  preview.stop()
}
