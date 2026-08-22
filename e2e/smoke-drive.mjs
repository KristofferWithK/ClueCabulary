// Manual-style smoke drive of the built app with the mock companion.
import { readdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { startPreview } from './preview-server.mjs'
import { audioSlug } from '../scripts/audio-slug.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
/**
 * How many clips of each bake this build actually carries.
 *
 * The type assertion below can only be made about a bake that exists, and the
 * two are baked by separate CI runs — a tree can honestly be between them, as
 * this one was for nine minutes when the words were re-baked at 1.0 and the
 * 0.6 set moved to slow/. Counting first means the drive says "the ordinary
 * bake is missing" instead of "the app is silent", and stays strict about
 * whichever bake IS there.
 */
const clipCount = (...parts) => {
  try {
    return readdirSync(resolve(ROOT, 'dist', 'audio', ...parts)).filter((f) => f.endsWith('.mp3'))
      .length
  } catch {
    return 0
  }
}
const NORMAL_CLIPS = clipCount('da')
const SLOW_CLIPS = clipCount('da', 'slow')
console.log(`clips in dist: ${NORMAL_CLIPS} ordinary, ${SLOW_CLIPS} slow`)

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

  // A first visit opens inside the train now (O1) — ride it like a new
  // player would: Casey's three lines, then the ticket, and since O2 the
  // ticket opens the tutorial round. Smoke SKIPS it: the scripted round is
  // onboarding-drive's whole subject, and this drive is about the game the
  // flow lands in. The rules overlay no longer opens itself; ? is its only
  // door and onboarding-drive owns the flow's own checks.
  await page.waitForSelector('.onboard-screen[data-act="train"]', { timeout: 8000 })
  await page.screenshot({ path: `${SHOT_DIR}/00-train.png` })
  for (let i = 0; i < 3; i++) await page.locator('.onboard-next').click()
  await page.waitForSelector('.onboard-ticket')
  await page.locator('.onboard-ticket').click()
  await page.waitForSelector('.tutorial-dock')
  await page.screenshot({ path: `${SHOT_DIR}/00b-tutorial.png` })
  await page.locator('.onboard-skip').click()
  await page.waitForSelector('h1:has-text("900words")')
  await page.screenshot({ path: `${SHOT_DIR}/01-home.png` })

  await page.locator('.home-play').click() // the board, 3x6 — there is only one
  await page.waitForSelector('.board-grid')
  await page.screenshot({ path: `${SHOT_DIR}/02-board.png` })
  const cards = await page.locator('.word-card .card-word').allTextContents()
  console.log('BOARD:', cards.join(', '))

  // ---- tapping a word says it ----------------------------------------------
  // The board was the one surface where a word could be touched without being
  // heard: the guess-confirm button spoke and the packing hit spoke, so the
  // word arrived only at the moment of committing to it, never while it was
  // being read.
  //
  // Asserted on the network, because that is the only observable that tells a
  // wired tap from a silent one — headless Chromium will happily construct an
  // Audio element for a file that was never requested.
  //
  // On the CONTENT TYPE, not the status, and that distinction is the whole
  // assertion. `vite preview` answers an unknown path with index.html and a
  // 200, so a status check here passes with the clips deleted — this check was
  // written that way first and was demonstrated to pass against an empty
  // dist/audio, which is the vacuous-drive trap this repo has been caught by
  // twice. 854 bytes of text/html is not a word being spoken. (speak.ts checks
  // the type for the same reason at runtime: caching HTML under a clip's URL
  // would keep it for a year.)
  // The LAST card, deliberately: `speak.ts` memoises a played clip, so a word
  // played here would not be fetched again when the tour below reaches it, and
  // this check would silently steal an assertion from that one. The tour only
  // gets a few words into board order in its 3.4s, so the end of the board is
  // out of its way.
  const audioHits = []
  page.on('response', (r) => {
    if (r.url().includes('/audio/')) {
      audioHits.push({
        url: r.url(),
        status: r.status(),
        type: r.headers()['content-type'] ?? '',
      })
    }
  })
  const tapWord = cards[cards.length - 1]
  const wantSlug = `${audioSlug(tapWord)}.mp3`
  await page.locator('.word-card').last().click()
  await sleep(600)
  const hit = audioHits.find((h) => h.url.endsWith(wantSlug))
  if (!hit) {
    throw new Error(
      `tapping «${tapWord}» requested no audio (wanted ${wantSlug}; saw ${
        audioHits.map((h) => h.url.split('/').pop()).join(', ') || 'nothing'
      })`,
    )
  }
  if (NORMAL_CLIPS === 0) {
    console.log(
      `NOTE: no ordinary bake in dist (${SLOW_CLIPS} slow clips present), so the tap could only ` +
        `be checked for asking. Run bake-audio.yml.`,
    )
  } else if (!hit.type.startsWith('audio/')) {
    throw new Error(
      `${wantSlug} came back ${hit.status} ${hit.type || '(no type)'} — that is the ` +
        `preview server's index.html fallback, not a clip. The build has no word audio.`,
    )
  } else {
    console.log(`tap spoke: ${tapWord} -> ${wantSlug} ${hit.status} ${hit.type}`)
  }

  // The tap must NOT have opened the dictionary (U1): "the translation and
  // definition of the word should only appear if you click on the i symbol
  // and not just the word. The audio should still play though." ⓘ alone opens
  // the sheet now, and this used to be a tolerance ("the tap may have opened
  // it") rather than an assertion — that tolerance is the bug U1 closes.
  const opened = await page.locator('.sheet').isVisible().catch(() => false)
  if (opened) throw new Error('tapping the card opened the dictionary — that is ⓘ\'s job now (U1)')

  // ---- and 🐢 says the same word again, out of the other bake ---------------
  // Two assertions in one gesture. That the button is wired at all, and that
  // it reaches audio/da/slow/ rather than replaying what the tap above already
  // put in memory — which is the failure the variant-keyed cache in speak.ts
  // exists to prevent, and the one that would look exactly like a working
  // button from the outside.
  //
  // The type check here is unconditional: the slow set is the audio this repo
  // has shipped since the first bake, so an index.html answering for it is a
  // broken build and not a state to be tolerant of.
  await page.locator('.word-card-wrap').last().locator('.card-info').click()
  await page.waitForSelector('.sheet')
  const slowBtn = page.locator('.sheet-head .speak-btn[aria-label*="slowly"]')
  if (!(await slowBtn.count())) throw new Error('the dictionary sheet has no slow button')
  const before = audioHits.length
  await slowBtn.click()
  await sleep(600)
  const slowWant = `/audio/da/slow/${wantSlug}`
  const slowHit = audioHits.slice(before).find((h) => h.url.includes(slowWant))
  if (!slowHit) {
    throw new Error(
      `🐢 on «${tapWord}» requested no slow clip (wanted ${slowWant}; saw ${
        audioHits
          .slice(before)
          .map((h) => h.url)
          .join(', ') || 'nothing'
      })`,
    )
  }
  if (SLOW_CLIPS > 0 && !slowHit.type.startsWith('audio/')) {
    throw new Error(
      `${slowWant} came back ${slowHit.status} ${slowHit.type || '(no type)'} — the slow bake is ` +
        `on disk but the build is not serving it.`,
    )
  }
  console.log(`🐢 spoke: ${tapWord} -> ${slowWant} ${slowHit.status} ${slowHit.type}`)
  await page.click('.sheet .btn')

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
  //
  // BOTH channels are recorded, because which one fires is not a fact about
  // this feature — it is a fact about whether `make-audio.mjs` has been run.
  // Watching only the speech engine is what this drive used to do, and it went
  // blind the moment the clips were committed: `playWord` found a real file,
  // played it, and never reached the fallback the assertion was counting. The
  // tour was working the whole time. A drive that fails when the app gains
  // audio is measuring the wrong thing, and the no-clip state is supported
  // (see the note at the top of speak.ts), so both have to count.
  await page.evaluate(() => {
    window.__asked = []
    const synth = window.speechSynthesis
    const speak = synth.speak.bind(synth)
    synth.speak = (u) => {
      window.__asked.push(u.text)
      try {
        speak(u)
      } catch {}
    }
    // The clip path goes through fetch (speak.ts takes the bytes rather than
    // handing the element a src, for the 206 reason documented there), so the
    // request carries the word's own filename even though the element only
    // ever sees a blob: URL.
    const fetch0 = window.fetch.bind(window)
    window.fetch = (...args) => {
      const raw = typeof args[0] === 'string' ? args[0] : (args[0]?.url ?? '')
      const m = String(raw).match(/\/audio\/[^/]+\/([^/?]+)\.mp3/)
      if (m) window.__asked.push(`clip:${m[1]}`)
      return fetch0(...args)
    }
  })
  if (!(await page.locator('.hear-board').count())) throw new Error('no hear-the-board button')
  await page.locator('.hear-board').click()
  await sleep(3400)
  // Compared in slug space, since one channel reports the word and the other
  // reports its filename, and «øje»/«oeje» are the same statement.
  const asSlug = (e) => (e.startsWith('clip:') ? e.slice(5) : audioSlug(e))
  // Consecutive repeats of ONE word collapse to one. A single "say this" can
  // legitimately reach both channels: headless Chromium has no audio device, so
  // the clip is fetched, `play()` rejects, and playWord falls back to the
  // speech engine exactly as it is designed to on a phone with a broken
  // decoder — which shows up here as far, far, seng, seng. What is under test
  // is the ORDER the tour asks for words in, not how many ways it tried to say
  // each one, so the run is flattened before comparing.
  const raw = (await page.evaluate(() => window.__asked.slice())).map(asSlug)
  const heard = raw.filter((s, i) => i === 0 || s !== raw[i - 1])
  // Board order, which is reading order. Three words in 3.4s at the 1500ms
  // cadence — the pace HearBoard measured off the clips — and the third is
  // allowed for slack rather than required, since the run is flattened above.
  if (heard.length < 2) throw new Error(`hear-the-board said ${heard.length} words in 3.4s`)
  // NOT `.map(audioSlug)`: map passes the INDEX as the second argument, which
  // audioSlug reads as the language, so `FOLDS[1]` is undefined and the fold
  // never runs. Latent since the helper grew a lang parameter and invisible
  // while the board asked for here was the 3x4, whose first three words happen
  // to be plain ASCII. The 3x6 deals «køkken» second and it came out `k-kken`
  // against the app's `koekken`, reported as the tour saying words out of order.
  const wanted = cards.slice(0, heard.length).map((w) => audioSlug(w))
  if (heard.join('|') !== wanted.join('|')) {
    throw new Error(`hear-the-board went out of order: ${heard.join(', ')} vs ${wanted.join(', ')}`)
  }
  // Interruptible, and the assertion is that it STAYS stopped — a tour that
  // merely paused would resume over whatever came next.
  await page.locator('.hear-board').click()
  const atStop = await page.evaluate(() => window.__asked.length)
  await sleep(2600)
  const afterStop = await page.evaluate(() => window.__asked.length)
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
    // The one-tap lookup is the word itself, inside the verdict line, rather
    // than a "Look up «x»" row of its own inside the dictionary — the row was
    // the same word again one line lower, out of the dock's reserve.
    lookup: [...document.querySelectorAll('.clue-input .clue-lookup')].map((b) => b.textContent),
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
  await page.goto(preview.base + '?mock=1&seed=5&howto=0')
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
  // one a stray URL puts a player on permanently — played rounds under
  // Casey's name with nothing on screen saying so, while also suppressing
  // both of Home's setup warnings. Since E3 the practice companion is the
  // local clue engine rather than random guesses, and the note says that
  // instead — but it must still say plainly that Casey is not the one playing.
  const note = await page.locator('.practice-note').textContent()
  if (!/Practice companion/.test(note ?? '')) {
    throw new Error(`no practice note while on the practice companion: ${note}`)
  }
  if (!/Casey is offline/.test(note)) throw new Error(`note is too coy: ${note}`)
  console.log('practice companion says so:', note.replace(/\s+/g, ' ').trim().slice(0, 60) + '…')

  // ---- the round summary: numbers first, the transcript behind a lid -------
  // The turn log used to be a one-line score strip: «mad ✓  hus ·». The model
  // had always written a reason for each guess and the engine dropped it on
  // the floor, so "why that word?" was the one question the app had thrown
  // away. Played out here rather than asserted on a fixture, because the value
  // only exists if the reasoning survives the engine and the store.
  await page.evaluate(() => localStorage.removeItem('cluecab-game-v1'))
  await page.goto(preview.base + '?mock=1&seed=11&howto=0')
  await page.waitForSelector('.city-card')
  await page.locator('.home-play').click()
  await page.waitForSelector('.board-grid')
  for (let i = 0; i < 30 && (await page.locator('.round-summary').count()) === 0; i++) {
    const cap = await page.locator('.phase-caption').textContent().catch(() => '')
    if (cap === 'Give Casey a clue') {
      await page.fill('.clue-input input', `huskeliste${i}`)
      await page.click('.clue-input .btn-primary')
      // Anything that is not the clue turn is a turn where the player taps
      // cards, so ask the board rather than the caption. This used to match
      // cap.includes('Sudden'), which the last-chance rename (D5) silently
      // broke: the loop stopped clicking, the round never reached a summary,
      // and the drive failed ten seconds later on .summary-stats with nothing
      // to say why. The card's own rule is that copy moves and identifiers do
      // not — so a drive should key on neither, and just look for the card.
    } else {
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
    //
    // It does have to hurry Casey, though (U3): her turn is two beats per
    // guess now — the reasoning, then the guess it explains — and thirty
    // iterations of 700ms is not enough round to reach a summary if a
    // multi-turn round watches every one of them out. A tap on her panel skips
    // to the next beat, which is the gesture a player has too.
    const casey = page.locator('.dock.ai-panel[data-hurry]')
    if (await casey.isVisible().catch(() => false)) await casey.click().catch(() => {})
    await sleep(700)
  }
  await page.waitForSelector('.summary-stats', { timeout: 10000 })

  // What the round actually did, in the two tiles that replaced Casey's
  // paragraph about it. There were four until P1; the city and the journey
  // went, because both are the collection rather than the round and both are
  // drawn bigger one tap away. Read as text and checked as shapes: a tile
  // saying "undefined" still looks like a stat.
  const tiles = await page.evaluate(() => {
    const read = (sel) => document.querySelector(`${sel} .stat-n`)?.textContent?.trim() ?? ''
    return {
      discovered: read('.stat-discovered'),
      collected: read('.stat-collected'),
      names: document.querySelectorAll('.stat-collected .stat-words .speak-word').length,
      face: document.querySelectorAll('.outcome-banner .cluey-svg').length,
      banner: document.querySelector('.outcome-banner')?.innerText ?? '',
      retired: document.querySelectorAll(
        '.summary-scroll, .stat-city, .stat-total, .collected-section',
      ).length,
    }
  })
  if (!/^\d+$/.test(tiles.discovered)) throw new Error(`discovered tile: "${tiles.discovered}"`)
  // The collected tile hides itself at zero, so it is the count OR nothing.
  if (tiles.collected !== '' && !/^\d+$/.test(tiles.collected)) {
    throw new Error(`collected tile: "${tiles.collected}"`)
  }
  // The list that used to sit below the fold is folded into the tile that
  // counts it, and the names are still speak buttons (U1).
  if (Number(tiles.collected) > 0 && tiles.names === 0) {
    throw new Error(`${tiles.collected} collected and no names in the tile`)
  }
  if (tiles.retired > 0) throw new Error(`${tiles.retired} things P1 retired are still on the screen`)
  if (tiles.face !== 1) throw new Error(`${tiles.face} Caseys on the summary`)
  if (/🎉/.test(tiles.banner)) throw new Error('the celebration emoji is back on the summary')
  // This profile has never finished a round before, so every word on this board
  // was met for the first time. A zero here is the signature of the discovered
  // diff being taken AFTER recordRound, where it is uniformly empty.
  if (Number(tiles.discovered) === 0) {
    throw new Error('a board of first-ever words counted as 0 discovered')
  }
  console.log(
    `stats: ${tiles.discovered} new, ${tiles.collected || 0} collected (${tiles.names} named)`,
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
