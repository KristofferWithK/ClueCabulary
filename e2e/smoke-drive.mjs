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
  await page.waitForSelector('h1:has-text("900words")')

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

  // ---- hear the board -------------------------------------------------------
  // The opening study phase was removed for being homework before the game, and
  // a forced pre-game slideshow of every word would be the same thing wearing a
  // hat. This is the version that survived review: a button. Nothing starts it
  // but a tap, which is also the rule the whole app follows — every sound in it
  // follows a touch.
  //
  // Headless Chromium carries a speechSynthesis with no voices, so `speak()` is
  // callable and silent. Audible sound cannot be asserted from here; "the app
  // asked for these words, in this order" can, and that is the behaviour.
  await page.evaluate(() => {
    window.__said = []
    const synth = window.speechSynthesis
    const speak = synth.speak.bind(synth)
    synth.speak = (u) => {
      window.__said.push(u.text)
      try {
        speak(u)
      } catch {}
    }
  })
  if (!(await page.locator('.hear-board').count())) throw new Error('no hear-the-board button')
  await page.locator('.hear-board').click()
  await sleep(2600)
  const heard = await page.evaluate(() => window.__said.slice())
  // Board order, which is reading order. Two words in 2.6s at the 1200ms
  // cadence; a third is allowed for slack rather than required.
  if (heard.length < 2) throw new Error(`hear-the-board said ${heard.length} words in 2.6s`)
  if (heard.join('|') !== cards.slice(0, heard.length).join('|')) {
    throw new Error(`hear-the-board went out of order: ${heard.join(', ')} vs ${cards.join(', ')}`)
  }
  // Interruptible, and the assertion is that it STAYS stopped — a tour that
  // merely paused would resume over whatever came next.
  await page.locator('.hear-board').click()
  const atStop = await page.evaluate(() => window.__said.length)
  await sleep(2600)
  const afterStop = await page.evaluate(() => window.__said.length)
  if (afterStop !== atStop) throw new Error(`stopping left it running: ${atStop} then ${afterStop}`)
  if ((await page.locator('.hear-board').getAttribute('aria-pressed')) !== 'false') {
    throw new Error('hear-the-board still claims to be playing after being stopped')
  }
  console.log(`hear the board: ${heard.join(', ')}… stopped at ${atStop} of ${cards.length}`)

  // And it obeys the one switch that governs every sound in the app. A control
  // that cannot make a noise is worse than no control, so it goes away rather
  // than sitting there disabled — the same call SpeakWord makes.
  await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('cluecab-settings-v1'))
    raw.state.sound = false
    localStorage.setItem('cluecab-settings-v1', JSON.stringify(raw))
  })
  await page.reload()
  await page.getByRole('button', { name: 'Continue game' }).click()
  await page.waitForSelector('.board-grid')
  if (await page.locator('.hear-board').count()) {
    throw new Error('hear-the-board is still offered with sound turned off')
  }
  await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('cluecab-settings-v1'))
    raw.state.sound = true
    localStorage.setItem('cluecab-settings-v1', JSON.stringify(raw))
  })
  await page.reload()
  await page.getByRole('button', { name: 'Continue game' }).click()
  await page.waitForSelector('.board-grid')
  console.log('hear the board: absent with sound off, back with it on')

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

  // Casey reads a Danish board and gets the clue as a bare string, so an
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

  // Everything the shipped nine hundred can settle offline must never reach that
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
    () => !document.querySelector('.phase-caption')?.textContent?.includes('Casey is guessing'),
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
  // under Casey's name with nothing on screen saying so, while also suppressing
  // both of Home's setup warnings.
  const note = await page.locator('.practice-note').textContent()
  if (!/Practice companion/.test(note ?? '')) {
    throw new Error(`no practice note while on the mock: ${note}`)
  }
  if (!/Casey is not playing/.test(note)) throw new Error(`note is too coy: ${note}`)
  console.log('practice companion says so:', note.replace(/\s+/g, ' ').trim().slice(0, 60) + '…')

  // ---- the round summary: numbers first, the transcript behind a lid -------
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
  for (let i = 0; i < 30 && (await page.locator('.round-summary').count()) === 0; i++) {
    const cap = await page.locator('.phase-caption').textContent().catch(() => '')
    if (cap === 'Give Casey a clue') {
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
    // interrupts a round any more; it plays to a summary or to sudden death.
    await sleep(700)
  }
  await page.waitForSelector('.summary-stats', { timeout: 10000 })

  // What the round actually did, in the four tiles that replaced Casey's
  // paragraph about it. Read as text and checked as shapes: a tile saying
  // "undefined/100" still looks like a stat.
  const tiles = await page.evaluate(() => {
    const read = (sel) => document.querySelector(`${sel} .stat-n`)?.textContent?.trim() ?? ''
    return {
      discovered: read('.stat-discovered'),
      collected: read('.stat-collected'),
      city: read('.stat-city'),
      total: read('.stat-total'),
    }
  })
  if (!/^\d+$/.test(tiles.discovered)) throw new Error(`discovered tile: "${tiles.discovered}"`)
  if (!/^\d+$/.test(tiles.collected)) throw new Error(`collected tile: "${tiles.collected}"`)
  if (!/^\d+\/100$/.test(tiles.city)) throw new Error(`city tile: "${tiles.city}"`)
  if (!/^\d+\/\d{3,4}$/.test(tiles.total)) throw new Error(`total tile: "${tiles.total}"`)
  // This profile has never finished a round before, so every word on this board
  // was met for the first time. A zero here is the signature of the discovered
  // diff being taken AFTER recordRound, where it is uniformly empty.
  if (Number(tiles.discovered) === 0) {
    throw new Error('a board of first-ever words counted as 0 discovered')
  }
  console.log(
    `stats: ${tiles.discovered} new, ${tiles.collected} collected, ${tiles.city} in the city, ${tiles.total} in all`,
  )

  // The transcript starts shut. Everything below it is about what is inside,
  // so the lid has to come off first — which is itself the assertion that it
  // was on.
  if ((await page.locator('.turn-log').count()) !== 0) {
    throw new Error('the turn log was already open')
  }
  await page.locator('.log-toggle').click()
  await page.waitForSelector('.turn-log', { timeout: 10000 })
  const log = await page.evaluate(() => ({
    turns: document.querySelectorAll('.turn-log > li').length,
    guesses: document.querySelectorAll('.turn-guesses li').length,
    whys: document.querySelectorAll('.turn-why').length,
    confidences: document.querySelectorAll('.guess-confidence').length,
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  }))
  if (log.turns === 0) throw new Error('turn log is empty')
  if (log.whys === 0) throw new Error('the turn log shows no reasoning at all')
  // Every AI guess carries both; the player's own taps carry neither, so the
  // count is bounded by the guesses rather than equal to them.
  if (log.confidences === 0) throw new Error('no confidence shown for any AI guess')
  if (log.confidences > log.guesses) throw new Error('more confidences than guesses')
  if (log.overflow > 0) throw new Error(`the summary overflows by ${log.overflow}px`)
  console.log(
    `turn log: ${log.turns} turns, ${log.guesses} guesses, ${log.whys} reasons, ${log.confidences} confidences`,
  )

  // ---- flagging a bad call, on the one screen that shows the reasoning ------
  // The flag is only worth tapping because Casey is shown it next round, so
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
