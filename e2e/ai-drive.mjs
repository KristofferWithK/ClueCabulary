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

const fail = []
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) fail.push(name)
}

// Cluey talks to the fake, not to Ollama, and not through the mock.
await page.addInitScript(
  ({ baseUrl }) => {
    localStorage.setItem(
      'cluecab-settings-v1',
      JSON.stringify({
        state: {
          apiKey: 'fake-key-for-tests',
          baseUrl,
          model: 'fake-model',
          gridSize: 'beginner',
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
 * Cluey opens by default now, which would spend the first queued fake response
 * on his opening clue and shift every scenario below by one. ?first=player is
 * a local-only dev switch for exactly this: these tests are about the AI
 * client's parsing, retries and error taxonomy, not about who goes first.
 */
async function freshRound(seed = 5) {
  await page.goto(`${BASE}?howto=0&first=player&grid=beginner&seed=${seed}`)
  await page.waitForSelector('.city-card')
  await page.evaluate(() => localStorage.removeItem('cluecab-game-v1'))
  await page.goto(`${BASE}?howto=0&first=player&grid=beginner&seed=${seed}`)
  await page.waitForSelector('.city-card')
  await page.locator('.home-play').click()
  await page.waitForSelector('.board-grid')
  const study = page.locator('.study-dock .btn-primary')
  if (await study.isVisible().catch(() => false)) await study.click()
  const game = await gameState()
  return {
    ids: game.words.map((w) => w.wordId),
    aiGreens: Object.entries(game.aiKey)
      .filter(([, role]) => role === 'green')
      .map(([id]) => id),
  }
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
  await sleep(2500)
  check('clean JSON drives a real round', fake.received.length >= 1, `${fake.received.length} calls`)
  check(
    'the request carried the Authorization header',
    fake.received[0].auth === 'Bearer fake-key-for-tests',
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
    /^Cluey could not/.test(neverValid) && !/JSON|schema|wordId|invalid/i.test(neverValid),
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

  // ---- a Cluey who never answers must not cost the board ---------------------
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
  await page.getByRole('button', { name: 'Play on without Cluey' }).click()
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
  check('the next round goes back to Cluey', fake.received.length >= 1, `${fake.received.length} calls`)

  // ---- and the round ENDS without asking the model anything -----------------
  // Finishing a round used to fire a debrief request: one POST per round, whose
  // answer is not on the screen any more. This is the assertion that the call
  // is gone rather than merely unused — it is made against the bytes the
  // browser sends, which is the only place that can tell the difference.
  //
  // Verified to bite: putting `void get().requestDebrief()` back at the end of
  // finishRound makes it read 1 call instead of 0.
  //
  // Sudden death is the cheap way to an ending here. The clue-and-guess loop
  // above would need a scripted reply for every turn of a full round; this
  // needs none, because sudden death has no clue-giver and therefore no AI turn.
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
    'finishing a round sends nothing to the model',
    fake.received.length === 0,
    `${fake.received.length} calls`,
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
