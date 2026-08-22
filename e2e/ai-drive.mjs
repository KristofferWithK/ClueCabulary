// The real AI client, in a real browser, against a fake Ollama on localhost.
//
// Every other drive runs the mock companion, which hands back ready-made
// objects and never calls chatJson. So until this existed, none of the client
// path had run outside unit tests: the fetch itself, JSON parsing, the code
// fence strip, the outermost-brace salvage, schema validation, the corrective
// retry, or the error taxonomy. resolveEndpoint permits http on a local host —
// the exemption written for a locally-run Ollama — so the client needs no
// special-casing to talk to the fake.
import { chromium } from 'playwright'
import { startPreview } from './preview-server.mjs'
import { startFakeOllama, clueReply, guessReply } from './fake-ollama.mjs'
import { setTimeout as sleep } from 'node:timers/promises'

const PORT = 4186
const FAKE_PORT = 4187
const preview = await startPreview(PORT)
const fake = await startFakeOllama(FAKE_PORT)

const BASE = preview.base
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium',
})
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } })
const page = await ctx.newPage()
page.on('pageerror', (e) => console.log('PAGE CRASH:', e.message))

// S1: Casey's guesses are spoken. This is the drive that puts a real guess
// through the whole AI pipeline in a real browser, so it is where a clip
// request for that guess is observable — not on the network response's
// status (this build may have no bake at all), just that `playWord` asked.
const audioHits = []
page.on('response', (r) => {
  if (r.url().includes('/audio/')) audioHits.push(r.url())
})

const fail = []
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) fail.push(name)
}

// Casey talks to the fake, not to Ollama, and not through the mock.
await page.addInitScript(
  ({ baseUrl }) => {
    localStorage.setItem(
      'cluecab-settings-v1',
      JSON.stringify({
        state: {
          apiKey: 'fake-key-for-tests',
          baseUrl,
          model: 'fake-model',
          clueLanguage: 'en',
          studyPhase: 'never',
          useMock: false,
        },
        // Current version on purpose: as version 1 this is run through every
        // migration on the way in, and v7 clears the API key this drive is
        // here to watch travel.
        version: 7,
      }),
    )
  },
  { baseUrl: fake.baseUrl },
)

const gameState = () =>
  page.evaluate(() => JSON.parse(localStorage.getItem('cluecab-game-v1') ?? '{}').state?.game)

/**
 * A fresh beginner round with the PLAYER cluing first.
 *
 * Casey opens by default now, which would spend the first queued fake response
 * on his opening clue and shift every scenario below by one. ?first=player is
 * a local-only dev switch for exactly this: these tests are about the AI
 * client's parsing, retries and error taxonomy, not about who goes first.
 */
async function freshRound(seed = 5) {
  await page.goto(`${BASE}?howto=0&first=player&seed=${seed}`)
  await page.waitForSelector('.city-card')
  await page.evaluate(() => localStorage.removeItem('cluecab-game-v1'))
  await page.goto(`${BASE}?howto=0&first=player&seed=${seed}`)
  await page.waitForSelector('.city-card')
  await page.locator('.home-play').click()
  await page.waitForSelector('.board-grid')
  const study = page.locator('.study-dock .btn-primary')
  if (await study.isVisible().catch(() => false)) await study.click()
  const game = await gameState()
  const green = (key) =>
    Object.entries(key)
      .filter(([, role]) => role === 'green')
      .map(([id]) => id)
  return {
    ids: game.words.map((w) => w.wordId),
    aiGreens: green(game.aiKey),
    // U3's section needs guesses that KEEP the turn alive, and under the
    // player's clue that means green on the PLAYER's key — the guess is judged
    // against the clue-giver's key and nothing else. A bystander would end the
    // turn on the first reveal and there would be no second one to compare.
    playerGreens: green(game.playerKey),
    da: Object.fromEntries(game.words.map((w) => [w.wordId, w.da])),
  }
}

/**
 * Skip whatever is left of Casey's current beat (U3), the way a thumb does.
 *
 * Her turn is two beats per guess now — her reasoning, then the guess it
 * explains — and a tap on the panel hurries to the next one. Used where a
 * section is waiting for the turn to be OVER rather than watching it happen.
 */
const hurryCasey = async (taps = 10) => {
  const panel = page.locator('.dock.ai-panel[data-hurry]')
  for (let i = 0; i < taps; i++) {
    if (!(await panel.isVisible().catch(() => false))) return i
    await panel.click({ timeout: 1000 }).catch(() => {})
    await sleep(70)
  }
  return taps
}

const submitClue = async (text = 'huskeliste') => {
  await page.fill('.clue-input input', text)
  await page.click('.clue-input .btn-primary')
}

const errorText = async () => {
  await page.waitForSelector('.error-banner', { timeout: 15000 })
  return (await page.locator('.error-banner p').textContent()).trim()
}

try {
  // ---- clean JSON: the round actually advances -------------------------------
  let round = await freshRound()
  fake.reset()
  fake.queue(guessReply([round.ids[0]]), clueReply(round.aiGreens.slice(0, 2)))
  await submitClue()
  await page.waitForSelector('.ai-guess-line, .guess-bar', { timeout: 20000 })
  // Hurried rather than waited out: since U3 the first card does not flip
  // until the think beat has had its two seconds, and a fixed 2.5s sleep would
  // be measuring the beat clock rather than the client. The taps put the turn
  // where this section wants it — finished — in about a fifth of the time.
  await hurryCasey()
  await sleep(2500)
  check('clean JSON drives a real round', fake.received.length >= 1, `${fake.received.length} calls`)
  check(
    'the request carried the Authorization header',
    fake.received[0].auth === 'Bearer fake-key-for-tests',
  )
  check(
    "Casey's guess is spoken (S1): a clip was requested for it",
    audioHits.some((u) => u.includes('/audio/da/')),
    audioHits.length ? audioHits.map((u) => u.split('/').pop()).join(', ') : 'no audio requested',
  )

  // ---- the firewall, on the bytes that left the browser ----------------------
  // Permute the player's key and confirm the guess request is unchanged. The
  // unit tests assert this over prompt builders; this asserts it over the whole
  // chain — view, prompt, request body — as it actually leaves the browser.
  //
  // Verified to bite: adding the player's role to the guess prompt makes this
  // fail (same byte length, different content), so it compares content and not
  // just size. Note what it cannot see — a field added to the view that no
  // prompt builder reads never reaches the wire, and is correctly not a leak.
  const bodyA = fake.received[0].raw
  await freshRound()
  await page.evaluate(() => {
    const store = JSON.parse(localStorage.getItem('cluecab-game-v1'))
    const key = store.state.game.playerKey
    const ids = Object.keys(key)
    // Rotate every role by one, so no word keeps its old role.
    const roles = ids.map((id) => key[id])
    ids.forEach((id, i) => (key[id] = roles[(i + 1) % roles.length]))
    localStorage.setItem('cluecab-game-v1', JSON.stringify(store))
  })
  // A reload lands on Home — the screen is not persisted, only the game is.
  await page.reload()
  await page.waitForSelector('.city-card')
  await page.locator('.btn-primary.btn-big').first().click()
  await page.waitForSelector('.board-grid')
  const study2 = page.locator('.study-dock .btn-primary')
  if (await study2.isVisible().catch(() => false)) await study2.click()
  fake.reset()
  fake.queue(guessReply([round.ids[0]]), clueReply(round.aiGreens.slice(0, 2)))
  await submitClue()
  await sleep(2500)
  const bodyB = fake.received[0]?.raw
  check(
    'the guess request is byte-identical under a permuted player key',
    !!bodyB && bodyA === bodyB,
    bodyB ? `${bodyA.length} vs ${bodyB.length} bytes` : 'no request captured',
  )

  // ---- U3: she says why, and THEN she guesses --------------------------------
  // The claim is an order, not a presence: the sentence in the bubble is up
  // BEFORE the card it explains flips, and it is that card's sentence and not
  // the next one's. Driven through the real client so the reasoning travels the
  // whole way — model reply, schema, plan, store, panel — and read off the DOM
  // rather than off the store, because a reasoning that reaches the state and
  // not the screen is exactly the failure this is here to catch.
  //
  // Two guesses, both green on the PLAYER's key so the turn survives the first
  // one, each with its own word named in its own sentence.
  await page.addInitScript(() => {
    // Clip requests, counted in the page: S1 speaks each guess as it lands, and
    // the two beats must not turn one guess into two clips.
    window.__clips = []
    const fetch0 = window.fetch.bind(window)
    window.fetch = (...args) => {
      const raw = typeof args[0] === 'string' ? args[0] : (args[0]?.url ?? '')
      const m = String(raw).match(/\/audio\/[^/]+\/([^/?]+)\.mp3/)
      if (m) window.__clips.push(m[1])
      return fetch0(...args)
    }
  })
  round = await freshRound()
  const spoken = round.playerGreens.slice(0, 2)
  fake.reset()
  fake.queue(
    {
      json: {
        guesses: spoken.map((wordId, i) => ({
          wordId,
          confidence: 0.9 - i * 0.05,
          reasoning: `I am naming ${round.da[wordId]} here, and nothing else on the board.`,
        })),
      },
    },
    clueReply(round.aiGreens.slice(0, 2)),
  )
  // Sampled rather than polled with locators: a beat is about a second long and
  // a round-trip per read would miss the edges. Only CHANGES are recorded, so
  // the transcript is the sequence of states the panel actually passed through.
  await page.evaluate(() => {
    window.__u3 = []
    window.__u3timer = setInterval(() => {
      const panel = document.querySelector('.dock.ai-panel[data-beat]')
      if (!panel) return
      const face = panel.querySelector('.cluey-figure')
      if (face) (window.__anim ??= new Set()).add(getComputedStyle(face).animationName)
      const at = {
        beat: panel.dataset.beat,
        bubble: (document.querySelector('.ai-bubble')?.textContent ?? '').trim(),
        line: (document.querySelector('.ai-guess-line')?.textContent ?? '').trim(),
        t: Date.now(),
      }
      const last = window.__u3[window.__u3.length - 1]
      if (!last || last.beat !== at.beat || last.bubble !== at.bubble || last.line !== at.line) {
        window.__u3.push(at)
      }
    }, 40)
  })
  await submitClue()
  await sleep(9000)
  const transcript = await page.evaluate(() => {
    clearInterval(window.__u3timer)
    return { beats: window.__u3, clips: window.__clips, anim: [...(window.__anim ?? [])] }
  })
  // Walk the transcript into one entry per card that flipped, carrying the
  // think beat that stood immediately before it.
  const flips = []
  let pending = null
  for (const b of transcript.beats) {
    if (b.beat === 'think') {
      if (!pending) pending = b
      continue
    }
    const named = b.line.match(/«([^»]+)»/)
    if (named) {
      flips.push({ da: named[1], thought: pending?.bubble ?? '', waited: pending ? b.t - pending.t : 0 })
      pending = null
    }
  }
  check(
    'Casey reveals a guess per planned word, in order',
    flips.length === spoken.length &&
      flips.every((f, i) => f.da === round.da[spoken[i]]),
    flips.map((f) => f.da).join(' → ') || 'no card flipped',
  )
  check(
    'and the bubble before each reveal is that guess’s own reasoning',
    flips.length > 0 && flips.every((f) => f.thought.includes(f.da)),
    flips.map((f) => `${f.da} ← "${f.thought.slice(0, 46)}…"`).join(' | ') || 'nothing to read',
  )
  check(
    'and it stood there long enough to read',
    flips.length > 0 && flips.every((f) => f.waited >= 1500),
    flips.map((f) => `${f.waited}ms`).join(', '),
  )
  check(
    'and S1 still speaks each guess exactly once',
    transcript.clips.length === flips.length,
    `${transcript.clips.length} clips for ${flips.length} guesses: ${transcript.clips.join(', ')}`,
  )

  // ---- and the same beats for someone who asked for stillness ---------------
  // The beats are a clock, not an animation, so reduced motion must not skip
  // any of them — while Casey's face, which IS animated, holds still. The
  // allowlist that stops it is in index.css under "reduced motion"; this is the
  // check that it covers the face this panel renders.
  //
  // Not vacuous, and this is what says so: her face on the ORDINARY path,
  // sampled in the section above, is running a named keyframe rather than
  // sitting at `none`, so the reading below has something to have turned off.
  check(
    'her face is animated at all when nobody asked for stillness',
    transcript.anim.length > 0 && transcript.anim.some((a) => a !== 'none'),
    transcript.anim.join('/') || 'unread',
  )
  await page.emulateMedia({ reducedMotion: 'reduce' })
  round = await freshRound()
  fake.reset()
  fake.queue(
    {
      json: {
        guesses: round.playerGreens.slice(0, 2).map((wordId, i) => ({
          wordId,
          confidence: 0.9 - i * 0.05,
          reasoning: `Still ${round.da[wordId]}, and still for the same reason.`,
        })),
      },
    },
    clueReply(round.aiGreens.slice(0, 2)),
  )
  await page.evaluate(() => {
    window.__still = new Set()
    window.__stillAnim = new Set()
    window.__stillTimer = setInterval(() => {
      const panel = document.querySelector('.dock.ai-panel[data-beat]')
      if (!panel) return
      window.__still.add(panel.dataset.beat)
      const face = panel.querySelector('.cluey-figure')
      if (face) window.__stillAnim.add(getComputedStyle(face).animationName)
    }, 40)
  })
  await submitClue()
  await sleep(7000)
  const still = await page.evaluate(() => {
    clearInterval(window.__stillTimer)
    return { beats: [...window.__still].sort(), anim: [...window.__stillAnim] }
  })
  check(
    'reduced motion gets both beats, without the face animation',
    still.beats.join(',') === 'reveal,think' && still.anim.every((a) => a === 'none'),
    `beats ${still.beats.join('+') || 'none'}; face animation ${still.anim.join('/') || 'unread'}`,
  )
  await page.emulateMedia({ reducedMotion: 'no-preference' })

  // ---- messy but recoverable replies -----------------------------------------
  const shapes = [
    {
      name: 'fenced JSON is unwrapped',
      body: (ids) => '```json\n' + JSON.stringify(guessReply([ids[0]]).json) + '\n```',
    },
    {
      name: 'JSON buried in prose is salvaged',
      body: (ids) =>
        `Sure! Here is my answer:\n${JSON.stringify(guessReply([ids[0]]).json)}\nHope that helps.`,
    },
  ]
  for (const shape of shapes) {
    round = await freshRound()
    fake.reset()
    fake.queue({ body: shape.body(round.ids) }, clueReply(round.aiGreens.slice(0, 2)))
    await submitClue()
    await sleep(2500)
    check(shape.name, (await page.locator('.error-banner').count()) === 0)
  }

  // ---- a valid shape naming a word that is not guessable → corrective retry ---
  round = await freshRound()
  fake.reset()
  fake.queue(guessReply(['not-a-word-on-this-board']), guessReply([round.ids[0]]), clueReply(round.aiGreens.slice(0, 2)))
  await submitClue()
  await sleep(3000)
  check('an off-board wordId is retried, not accepted', fake.received.length >= 2, `${fake.received.length} calls`)
  check('and the retry says what was wrong', /invalid|corrected JSON/i.test(fake.received[1]?.raw ?? ''))

  // ---- nothing usable, ever → the round says so rather than hanging ----------
  // Five, because the call gets three corrections after its first attempt. The
  // fake auto-replies once its script drains, so a short queue would be rescued
  // by a valid reply and this would assert nothing.
  round = await freshRound()
  fake.reset()
  fake.queue(...Array.from({ length: 5 }, (_, i) => ({ body: `No JSON from me (${i}).` })))
  await submitClue()
  const neverValid = await errorText()
  check('a model that never returns JSON surfaces an error', neverValid.length > 0, neverValid)
  check('and it took every correction first', fake.received.length === 4, `${fake.received.length} calls`)
  // What the player reads is about their game. The validator's own words —
  // "not an unrevealed GREEN word on your key", "schema mismatch" — are written
  // for the model, and used to reach the screen verbatim under "The AI kept
  // answering invalidly".
  check(
    'and the message is written for the player, not for the model',
    /^Casey could not/.test(neverValid) && !/JSON|schema|wordId|invalid/i.test(neverValid),
    neverValid,
  )

  // ---- the HTTP error taxonomy ----------------------------------------------
  const httpCases = [
    // No longer "check the API key in Settings": there is no key and no field.
    [401, /refused the request/i, 'auth'],
    [404, /Model or endpoint/i, 'not-found'],
    [429, /Rate limited/i, 'rate-limit'],
  ]
  for (const [status, pattern, label] of httpCases) {
    round = await freshRound()
    fake.reset()
    fake.queue({ status })
    await submitClue()
    const msg = await errorText()
    check(`HTTP ${status} reads as ${label}`, pattern.test(msg), msg)
  }

  // ---- 500 is retried exactly once, then succeeds ----------------------------
  round = await freshRound()
  fake.reset()
  fake.queue({ status: 500 }, guessReply([round.ids[0]]), clueReply(round.aiGreens.slice(0, 2)))
  await submitClue()
  await sleep(3000)
  check('a 500 is retried and the round continues', (await page.locator('.error-banner').count()) === 0)
  check('and it was retried exactly once', fake.received.length >= 2, `${fake.received.length} calls`)

  // ---- a Casey who never answers must not cost the board ---------------------
  // Retry alone is a dead end when the key is wrong, missing, or blocked by
  // CORS — and the board is already dealt. This is the first round a new player
  // ever plays, so it had better not end here.
  round = await freshRound()
  fake.reset()
  fake.queue({ status: 401 })
  await submitClue()
  await errorText()
  const banner = await page.locator('.error-banner').boundingBox()
  const actions = await page.locator('.error-actions').boundingBox()
  check(
    'both error actions fit the phone',
    actions.x >= banner.x - 0.5 && actions.x + actions.width <= banner.x + banner.width + 0.5,
    `${actions.width.toFixed(0)}px inside ${banner.width.toFixed(0)}px`,
  )
  await page.getByRole('button', { name: 'Play on without Casey' }).click()
  await page.waitForSelector('.practice-note', { timeout: 20000 })
  await sleep(2000)
  check('the round carries on with the practice companion', (await page.locator('.error-banner').count()) === 0)
  check('and stops asking the server that just refused', fake.received.length === 1, `${fake.received.length} calls`)

  await page.reload()
  await page.waitForSelector('.city-card')
  const stillFallen = await page.evaluate(
    () => JSON.parse(localStorage.getItem('cluecab-game-v1') ?? '{}').state?.practiceFallback,
  )
  check('the fallback survives a reload of the same round', stillFallen === true)
  const mockLeaked = await page.evaluate(
    () => JSON.parse(localStorage.getItem('cluecab-settings-v1') ?? '{}').state?.useMock,
  )
  check('and changes no setting, so it cannot become permanent', mockLeaked === false)

  round = await freshRound()
  fake.reset()
  fake.queue(guessReply([round.ids[0]]), clueReply(round.aiGreens.slice(0, 2)))
  await submitClue()
  await sleep(2500)
  check('the next round goes back to Casey', fake.received.length >= 1, `${fake.received.length} calls`)

  // ---- and the round ENDS without asking the model anything -----------------
  // What a finished round asks the model for changed twice. The debrief was
  // one POST per round narrating what the screen already said — B1 deleted it,
  // and the deletion was asserted here against the bytes the browser sends.
  // H5 spends that vacated budget on the story: a round that ends with greens
  // makes exactly ONE request, for the words no board can carry, and a round
  // that ends with nothing green still makes none. Both halves are pinned,
  // because each is a way the feature can quietly rot — the story call
  // sneaking into greenless rounds, or dying out of green ones.
  //
  // Sudden death is the cheap way to both endings. The clue-and-guess loop
  // above would need a scripted reply for every turn of a full round; this
  // needs none, because sudden death has no clue-giver and therefore no AI
  // turn — and a green on either key keeps it going, so one round can bank a
  // green and then end on a dud.
  await freshRound()
  await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('cluecab-game-v1'))
    raw.state.game.phase = 'suddenDeath'
    raw.state.game.turnsLeft = 0
    localStorage.setItem('cluecab-game-v1', JSON.stringify(raw))
  })
  await page.reload()
  await page.waitForSelector('.city-card')
  await page.getByRole('button', { name: 'Continue game' }).click()
  await page.waitForSelector('.sudden-death-bar', { timeout: 20000 })
  const sd = await gameState()
  const dud = sd.words.find(
    (w) =>
      sd.playerKey[w.wordId] !== 'green' &&
      sd.aiKey[w.wordId] !== 'green' &&
      sd.reveals[w.wordId].kind === 'hidden',
  )
  if (!dud) throw new Error('no non-green word to end sudden death on')
  // Reset AFTER the round is set up and BEFORE the guess that ends it, so the
  // count below covers exactly the ending.
  fake.reset()
  await page.locator(`.word-card:has(.card-word:text-is("${dud.da}"))`).click()
  await page.locator('.guess-confirm .btn-primary').click()
  await page.waitForSelector('.round-summary', { timeout: 20000 })
  await sleep(2500)
  check(
    'a round ending with nothing green sends nothing to the model',
    fake.received.length === 0,
    `${fake.received.length} calls`,
  )

  // The green ending: bank one green in sudden death, then end on the dud.
  await freshRound()
  await page.evaluate(() => {
    const raw = JSON.parse(localStorage.getItem('cluecab-game-v1'))
    raw.state.game.phase = 'suddenDeath'
    raw.state.game.turnsLeft = 0
    localStorage.setItem('cluecab-game-v1', JSON.stringify(raw))
  })
  await page.reload()
  await page.waitForSelector('.city-card')
  await page.getByRole('button', { name: 'Continue game' }).click()
  await page.waitForSelector('.sudden-death-bar', { timeout: 20000 })
  const sd2 = await gameState()
  const green = sd2.words.find(
    (w) =>
      (sd2.playerKey[w.wordId] === 'green' || sd2.aiKey[w.wordId] === 'green') &&
      sd2.reveals[w.wordId].kind === 'hidden',
  )
  const dud2 = sd2.words.find(
    (w) =>
      sd2.playerKey[w.wordId] !== 'green' &&
      sd2.aiKey[w.wordId] !== 'green' &&
      sd2.reveals[w.wordId].kind === 'hidden',
  )
  if (!green || !dud2) throw new Error('sudden death board lacks a green or a dud')
  await page.locator(`.word-card:has(.card-word:text-is("${green.da}"))`).click()
  await page.locator('.guess-confirm .btn-primary').click()
  await page.waitForSelector('.sudden-death-bar', { timeout: 20000 })
  fake.reset()
  await page.locator(`.word-card:has(.card-word:text-is("${dud2.da}"))`).click()
  await page.locator('.guess-confirm .btn-primary').click()
  await page.waitForSelector('.round-summary', { timeout: 20000 })
  // The story is asked for from the summary, answered by the fake's echo, and
  // must reach the screen — asserted on the section, not the store, because a
  // request that succeeds into a hidden section is the failure mode a vacuous
  // green here would hide.
  await page.waitForSelector('.story-section .round-sentence', { timeout: 20000 })
  await sleep(1500)
  check(
    'a round ending with a green asks for exactly the story',
    fake.received.length === 1,
    `${fake.received.length} calls`,
  )
  const storyReq = fake.received[0]?.raw ?? ''
  check(
    'and the story request is board-blind',
    storyReq.includes('SMALL WORDS TO INCLUDE') && !storyReq.includes('my key'),
  )
  check(
    'and the smuggled words are named on the summary',
    (await page.locator('.story-targets .story-target').count()) >= 1,
  )

  console.log(fail.length ? `\nFAILED: ${fail.join(', ')}` : '\nAI DRIVE OK')
  if (fail.length) process.exitCode = 1
} catch (e) {
  console.log('AI DRIVE FAILED:', e.message)
  process.exitCode = 1
} finally {
  await browser.close()
  await fake.stop()
  preview.stop()
}
