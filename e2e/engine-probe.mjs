// The first honest "does the offline engine clue and guess as well as a
// frontier model?" — docs/clue-engine.md §6 Stage 4, item 2.
//
//   OLLAMA_API_KEY=... node e2e/engine-probe.mjs --rounds 1
//   ENGINE_PROBE_FAKE=1 node e2e/engine-probe.mjs      (local stand-in, free)
//   node scripts/run-drives.mjs engine-probe           (opt-in, never default)
//
// IT SPENDS REAL MODEL CALLS, which is why it is opt-in and why it refuses to
// start without a key rather than quietly falling back to something free and
// calling the result a measurement. `--rounds 1` is about 16 calls; the count
// and the wall time are printed at the end so the bill is never a guess.
//
// WHY IT IS NOT A BROWSER DRIVE. Every other file here opens the built app and
// uses it with a thumb, because that is where the class of bug they hunt lives.
// This one needs a configuration the app deliberately does not have — the
// ENGINE cluing while a MODEL guesses, and the reverse — so there is no screen
// to drive. It loads the app's own modules through Vite's SSR loader instead,
// which means it measures the same `searchClue`, the same `sim`, the same
// prompts and the same `chatJson` the phone runs, rather than a copy of them.
//
// WHAT IT MEASURES. Hits per number: of the words a clue asked for, how many
// the other side actually turned over green on the giver's key. That is the
// same statistic `src/ai/local/engine-selfplay.test.ts` prints for the offline
// table and the clue ledger accumulates from real play, so the three are
// directly comparable — which is the whole point of choosing it over win rate,
// a number too coarse to read off a handful of paid rounds.
import { createServer } from 'vite'
import { startFakeOllama } from './fake-ollama.mjs'

const argv = process.argv.slice(2)
const arg = (name, fallback) => {
  const i = argv.indexOf(`--${name}`)
  return i === -1 ? fallback : argv[i + 1]
}
const ROUNDS = Number(arg('rounds', '1'))
const MAX_CALLS = Number(arg('max-calls', '80'))
const FAKE = !!process.env.ENGINE_PROBE_FAKE
const KEY = process.env.OLLAMA_API_KEY ?? ''
const MODEL = process.env.OLLAMA_MODEL ?? 'gpt-oss:120b'

if (!FAKE && !KEY) {
  console.log(
    'ENGINE PROBE SKIPPED (no OLLAMA_API_KEY).\n' +
      'This probe pays for every round it plays. Set OLLAMA_API_KEY (and\n' +
      'OLLAMA_BASE_URL if you are fronting the proxy) to run it for real, or\n' +
      'ENGINE_PROBE_FAKE=1 to exercise the harness against e2e/fake-ollama.mjs\n' +
      'for nothing — which proves the plumbing and measures no model at all.',
  )
  process.exit(0)
}

// --- the app's own modules, not copies of them -----------------------------

const server = await createServer({
  // No config file, so no PWA plugin — and therefore nothing that can resolve
  // `virtual:pwa-register/react`. Nothing this probe loads imports it; the
  // dependency SCANNER would crawl the whole tree and complain anyway, so it
  // is switched off rather than answered.
  configFile: false,
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'error',
})
const load = (p) => server.ssrLoadModule(p)

const { BOARD } = await load('/src/engine/config.ts')
const { applyEvent, createGame, currentClue, isGuessable } = await load('/src/engine/game.ts')
const { mulberry32 } = await load('/src/engine/rng.ts')
const { danish } = await load('/src/lang/da/index.ts')
const { WORDS } = await load('/src/data/words.ts')
const { wordsForCity } = await load('/src/journey/progress.ts')
const { buildAiClueView, buildAiGuessView } = await load('/src/ai/projections.ts')
const { OllamaCompanion, planGuessExecution } = await load('/src/ai/companion.ts')
const { loadEvaluator } = await load('/src/ai/local/evaluator.ts')
const { searchClue } = await load('/src/ai/local/search.ts')

// --- the same board draw the offline table uses ----------------------------

const cityOneBoard = (seed) => {
  const pool = wordsForCity(WORDS, 0)
  const rng = mulberry32(seed)
  const picked = [...pool]
  for (let i = picked.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[picked[i], picked[j]] = [picked[j], picked[i]]
  }
  return picked
    .slice(0, BOARD.totalWords)
    .map((w) => ({ wordId: w.id, da: w.da, en: [...w.en], pos: w.pos }))
}

const flip = (side) => (side === 'player' ? 'ai' : 'player')

/** The mirror trick from engine.test.ts: the player's seat as an ai view. */
const mirror = (s) => ({
  ...s,
  playerKey: s.aiKey,
  aiKey: s.playerKey,
  reveals: Object.fromEntries(
    Object.entries(s.reveals).map(([id, r]) => [
      id,
      r.kind === 'bystander' ? { ...r, against: r.against.map(flip) } : r,
    ]),
  ),
  clueHistory: s.clueHistory.map((c) => ({ ...c, by: flip(c.by) })),
  phase:
    s.phase === 'playerClueInput'
      ? 'aiClueInput'
      : s.phase === 'playerGuessing'
        ? 'aiGuessing'
        : s.phase,
})

// --- the two seats ---------------------------------------------------------

let calls = 0
let fake = null
const settings = { baseUrl: '', apiKey: KEY, model: MODEL }

async function llm() {
  if (FAKE) {
    fake = fake ?? (await startFakeOllama(4199, { auto: true }))
    return new OllamaCompanion({ baseUrl: fake.baseUrl, apiKey: 'fake', model: 'fake' })
  }
  return new OllamaCompanion({
    ...settings,
    baseUrl: process.env.OLLAMA_BASE_URL ?? 'https://ollama.com/v1',
  })
}

const budget = () => {
  if (++calls > MAX_CALLS) throw new Error(`stopped at the ${MAX_CALLS}-call budget`)
}

/** Both configurations, played out; returns { asked, hits, clues }. */
async function playConfig(seed, { clueBy, guessBy }, ev, model) {
  let s = createGame({ config: BOARD, words: cityOneBoard(seed), seed })
  let asked = 0
  let hits = 0
  let clues = 0
  let safety = 60

  while (s.phase !== 'finished' && s.phase !== 'suddenDeath' && safety-- > 0) {
    if (s.phase === 'aiClueInput' || s.phase === 'playerClueInput') {
      const seat = s.phase === 'aiClueInput' ? 'ai' : 'player'
      const view = buildAiClueView(seat === 'ai' ? s : mirror(s), 'target')
      let text
      let number
      let targets
      if (clueBy === 'engine') {
        const plan = searchClue(ev, view)
        if (!plan) break
        ;({ text, targets } = plan)
        number = plan.coverage
      } else {
        budget()
        const res = await model.getClue(view)
        text = res.clue
        number = res.number
        targets = res.targetWordIds
      }
      asked += number
      clues++
      s = applyEvent(s, { type: 'SUBMIT_CLUE', by: seat, text, number, targets }, danish)
      continue
    }

    // Whoever is guessing, the view is built from the ai seat — mirrored when
    // it is the player's. The clue-giver's key is what a hit is judged on, and
    // the engine records that for us in the guess's own `result`.
    const seat = s.phase === 'aiGuessing' ? 'ai' : 'player'
    const view = buildAiGuessView(seat === 'ai' ? s : mirror(s), 'target')
    const clue = currentClue(s)
    let plan
    if (guessBy === 'engine') {
      plan = planGuessExecution(
        view.words
          .filter((w) => isGuessable(s, w.id))
          .map((w) => ({
            wordId: w.id,
            confidence: Math.min(0.95, 0.2 + ev.sim(clue.text, w.id) * 0.25),
            reasoning: '',
            sim: ev.sim(clue.text, w.id),
          }))
          .sort((a, b) => b.sim - a.sim || (a.wordId < b.wordId ? -1 : 1)),
        clue.number,
      )
    } else {
      budget()
      const res = await model.getGuesses(view)
      plan = planGuessExecution(res.guesses, clue.number)
    }
    const phase = s.phase
    for (const g of plan) {
      if (s.phase !== phase) break
      if (!isGuessable(s, g.wordId)) continue
      const before = currentClue(s).guesses.length
      s = applyEvent(s, { type: 'GUESS', wordId: g.wordId }, danish)
      const after = currentClue(s)
      hits += after.guesses.slice(before).filter((x) => x.result === 'green').length
    }
    if (s.phase === phase) s = applyEvent(s, { type: 'STOP_GUESSING' }, danish)
  }
  return { asked, hits, clues }
}

// --- run -------------------------------------------------------------------

const started = Date.now()
const ev = await loadEvaluator()
const model = await llm()

const CONFIGS = [
  { label: 'engine clues / model guesses', clueBy: 'engine', guessBy: 'model' },
  { label: 'model clues  / engine guesses', clueBy: 'model', guessBy: 'engine' },
  { label: 'engine clues / engine guesses', clueBy: 'engine', guessBy: 'engine' },
]

const totals = CONFIGS.map(() => ({ asked: 0, hits: 0, clues: 0, stoppedBy: null }))

// Caught PER CONFIGURATION rather than around the whole run: a model that
// cannot settle on a clue is a result about that seat, and letting it take the
// other two rows down with it would throw away the comparison this probe
// exists to make. The reason is printed under the table.
for (let seed = 1; seed <= ROUNDS; seed++) {
  for (let i = 0; i < CONFIGS.length; i++) {
    try {
      const r = await playConfig(seed, CONFIGS[i], ev, model)
      totals[i].asked += r.asked
      totals[i].hits += r.hits
      totals[i].clues += r.clues
    } catch (e) {
      totals[i].stoppedBy = e.message
    }
  }
}

console.log(
  `\nengine probe — ${ROUNDS} city-1 board${ROUNDS === 1 ? '' : 's'}, ` +
    `${FAKE ? 'FAKE model (e2e/fake-ollama.mjs, zero cost)' : `model ${MODEL}`}\n` +
    'configuration                   clues  words asked  hits  hits/number\n' +
    CONFIGS.map((c, i) => {
      const t = totals[i]
      const rate = t.asked ? (t.hits / t.asked).toFixed(3) : '  —  '
      return (
        `${c.label.padEnd(30)} ${String(t.clues).padStart(5)} ${String(t.asked).padStart(12)} ` +
        `${String(t.hits).padStart(5)} ${rate.padStart(12)}`
      )
    }).join('\n'),
)
console.log(
  `\n${calls} model call${calls === 1 ? '' : 's'} made` +
    `${FAKE ? ' (against the local stand-in — nothing was paid)' : ''}, ` +
    `${((Date.now() - started) / 1000).toFixed(1)}s wall.`,
)
for (let i = 0; i < CONFIGS.length; i++) {
  if (totals[i].stoppedBy) console.log(`${CONFIGS[i].label}: stopped — ${totals[i].stoppedBy}`)
}
if (FAKE) {
  console.log(
    'THE FAKE IS NOT A MODEL. It answers by reading the board back out of the\n' +
      'prompt and naming the first hidden row, so its numbers say the harness\n' +
      'runs — nothing whatever about how a model plays.',
  )
}

// The third row is free and is printed for the same reason the offline table
// prints it: without something beside it a single rate is unreadable.
console.log(
  '\nRead against src/ai/local/engine-selfplay.test.ts, which prints hits/number\n' +
    'for the mock floor, the p-curve and the cross-model engine on the same boards.',
)

if (fake) await fake.stop()
await server.close()
