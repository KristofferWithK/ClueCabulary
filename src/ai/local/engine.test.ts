import { describe, expect, it } from 'vitest'
import { BOARD } from '../../engine/config'
import {
  applyEvent as applyEventIn,
  createGame,
  currentClue,
  isGuessable,
} from '../../engine/game'
import { checkClueLegality } from '../../engine/legality'
import { mulberry32 } from '../../engine/rng'
import type { BoardWord, GameState, Side } from '../../engine/types'
import { danish } from '../../lang/da'
import { WORDS } from '../../data/words'
import { wordsForCity } from '../../journey/progress'
import { planGuessExecution } from '../companion'
import { buildAiClueView, buildAiGuessView, type AiClueView } from '../projections'
import { engineTrapIds, loadEvaluator, TWO_HOP_DISCOUNT } from './evaluator'
import { EngineCompanion } from './engineCompanion'
import { LAST_CLUE_THETA, searchClue, THETA, type SearchStats } from './search'

const applyEvent = (s: GameState, e: Parameters<typeof applyEventIn>[1]) =>
  applyEventIn(s, e, danish)

/** src/ compiles with DOM libs and no node types; see selfplay.test.ts. */
const envVar = (name: string): string | undefined =>
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[name]

/** A real city-1 board: eighteen of the city's hundred, seeded uniform. */
function cityOneBoard(seed: number): BoardWord[] {
  const pool = wordsForCity(WORDS, 0)
  const rng = mulberry32(seed)
  const picked = [...pool]
  for (let i = picked.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[picked[i], picked[j]] = [picked[j]!, picked[i]!]
  }
  return picked
    .slice(0, BOARD.totalWords)
    .map((w) => ({ wordId: w.id, da: w.da, en: [...w.en], pos: w.pos }))
}

/**
 * THE DIRECTIONAL TRAP PIN — the engine-side restatement of the rule
 * `game.test.ts` pins as "a guess is judged against the clue-giver key, and
 * only that key" (and CLAUDE.md calls the easiest to get backwards).
 *
 * Under Casey's clue the player's guesses are judged against Casey's key, so
 * the traps for Casey's clue are the cards the PLAYER could still name — and
 * a bystander reveal burns a card only for the side whose clue it was named
 * under. Both tests below were checked to FAIL against the flipped mutation
 * (`isOpenFor(w.reveal, 'player')` in `engineTrapIds`) and against the
 * direction-blind one (any bystander reveal counts as dead): get the
 * direction backwards and the engine scores a live card as spent and clues
 * straight into it.
 */
describe('the trap set is directional, like every reveal', () => {
  const view = (reveal: AiClueView['words'][number]['reveal']): AiClueView => ({
    kind: 'ai-clue',
    clueLanguage: 'target',
    turnsLeft: 5,
    words: [
      {
        id: 'w-green',
        da: 'hund',
        en: ['dog'],
        pos: 'noun',
        reveal: { kind: 'hidden' },
        roleOnMyKey: 'green',
      },
      {
        id: 'w-burned',
        da: 'kat',
        en: ['cat'],
        pos: 'noun',
        reveal,
        roleOnMyKey: 'bystander',
      },
    ],
    history: [],
    flagged: [],
  })

  it('a card revealed neutral under the PLAYER clue is still a trap for Casey', () => {
    // The player named it under their own clue; it is burned against them
    // only. Under Casey's clue they can — and might — name it again.
    const traps = engineTrapIds(view({ kind: 'bystander', against: ['player'] }))
    expect(traps).toEqual(['w-burned'])
  })

  it('the same card revealed under CASEY his own clue is dead, and no trap', () => {
    const traps = engineTrapIds(view({ kind: 'bystander', against: ['ai'] }))
    expect(traps).toEqual([])
  })

  it('a hidden neutral is a trap; a green is never one', () => {
    const traps = engineTrapIds(view({ kind: 'hidden' }))
    expect(traps).toEqual(['w-burned']) // never w-green
  })
})

describe('sim reads the book and the matrix on one scale', () => {
  it('a direct book entry scores at least its authored strength', async () => {
    const ev = await loadEvaluator()
    const assoc = ev.assocFor('da:mor')
    expect(assoc.length).toBeGreaterThan(20) // E2 shipped 33–35 a word
    for (const e of assoc.slice(0, 5)) {
      expect(ev.sim(e.da, 'da:mor')).toBeGreaterThanOrEqual(e.s)
      expect(ev.sim(e.en, 'da:mor')).toBeGreaterThanOrEqual(e.s)
    }
  })

  it('a word the data has never heard of scores zero everywhere', async () => {
    const ev = await loadEvaluator()
    expect(ev.sim('xylofonkoncert', 'da:mor')).toBe(0)
    expect(ev.sim('mor', 'da:ikke-et-ord')).toBe(0)
  })

  it('sim stays on the 0–3 scale in half steps', async () => {
    const ev = await loadEvaluator()
    const probes = ['familie', 'dyr', 'hjem', 'drikke', 'farve', 'water', 'pet']
    for (const clue of probes) {
      for (const id of ev.ids.slice(0, 30)) {
        const s = ev.sim(clue, id)
        expect(s).toBeGreaterThanOrEqual(0)
        expect(s).toBeLessThanOrEqual(3)
        expect((s / TWO_HOP_DISCOUNT) % 1).toBe(0)
      }
    }
  })
})

// ---------------------------------------------------------------------------
// Engine-vs-engine on real city-1 boards. The mirror trick lets one engine
// play both seats: swap the keys, flip every reveal's `against` and the
// history's `by`, and the player's seat becomes an ai-clue view the same
// search can answer. The flip must be exact or the directional rule above is
// silently violated for the mirrored seat.
// ---------------------------------------------------------------------------

const flip = (side: Side): Side => (side === 'player' ? 'ai' : 'player')

function mirror(s: GameState): GameState {
  return {
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
  }
}

interface EnginePlayed {
  won: boolean
  clues: number
  coverageSum: number
  belowTheta: number
}

async function playEngineGame(
  seed: number,
  opts: { theta?: number; lastClueTheta?: number; assertClues?: boolean } = {},
): Promise<EnginePlayed> {
  const ev = await loadEvaluator()
  const companion = new EngineCompanion()
  let s = createGame({ config: BOARD, words: cityOneBoard(seed), seed })
  let clues = 0
  let coverageSum = 0
  let belowTheta = 0
  let safety = 300

  const giveClue = (state: GameState, by: Side): GameState => {
    const view = buildAiClueView(by === 'ai' ? state : mirror(state), 'target')
    const plan = searchClue(ev, view, opts)
    expect(plan).not.toBeNull()
    clues++
    coverageSum += plan!.coverage
    if (plan!.belowTheta) belowTheta++
    if (opts.assertClues) {
      // The acceptance pins: never an illegal clue, never a margin under the
      // bar (θ, or the last-clue bar prompts.ts already teaches).
      expect(checkClueLegality(plan!.text, state.words, danish).legal).toBe(true)
      expect(plan!.belowTheta).toBe(false)
      const bar = view.turnsLeft <= 2 ? LAST_CLUE_THETA : THETA
      expect(plan!.margin).toBeGreaterThanOrEqual(bar)
    }
    return applyEvent(state, {
      type: 'SUBMIT_CLUE',
      by,
      text: plan!.text,
      number: plan!.coverage,
      targets: plan!.targets,
    })
  }

  const guess = async (state: GameState, seat: Side): Promise<GameState> => {
    const phase = seat === 'ai' ? 'aiGuessing' : 'playerGuessing'
    const res = await companion.getGuesses(
      buildAiGuessView(seat === 'ai' ? state : mirror(state), 'target'),
    )
    const plan = planGuessExecution(res.guesses, currentClue(state)!.number)
    let st = state
    for (const g of plan) {
      if (st.phase !== phase) break
      if (!isGuessable(st, g.wordId)) continue
      st = applyEvent(st, { type: 'GUESS', wordId: g.wordId })
    }
    if (st.phase === phase) st = applyEvent(st, { type: 'STOP_GUESSING' })
    return st
  }

  while (s.phase !== 'finished' && safety-- > 0) {
    switch (s.phase) {
      case 'playerClueInput':
        s = giveClue(s, 'player')
        break
      case 'aiClueInput':
        s = giveClue(s, 'ai')
        break
      case 'aiGuessing':
        s = await guess(s, 'ai')
        break
      case 'playerGuessing':
        s = await guess(s, 'player')
        break
      case 'suddenDeath': {
        const open = s.words.filter((w) => isGuessable(s, w.wordId))
        if (open.length === 0) {
          s = applyEvent(s, { type: 'STOP_GUESSING' })
          break
        }
        // No giver, no new clue: name the best sim under the last clue heard.
        const last = currentClue(s)
        const pick = [...open].sort(
          (a, b) =>
            ev.sim(last?.text ?? '', b.wordId) - ev.sim(last?.text ?? '', a.wordId) ||
            (a.wordId < b.wordId ? -1 : 1),
        )[0]!
        s = applyEvent(s, { type: 'GUESS', wordId: pick.wordId })
        break
      }
    }
  }
  expect(safety).toBeGreaterThan(0)
  return { won: s.outcome?.result === 'won', clues, coverageSum, belowTheta }
}

const GAMES = Number(envVar('ENGINE_GAMES') ?? 25)

describe('the engine on real city-1 boards', () => {
  it('never clues an illegal word, never below θ, and terminates', async () => {
    let wins = 0
    for (let seed = 1; seed <= GAMES; seed++) {
      const g = await playEngineGame(seed, { assertClues: true })
      if (g.won) wins++
    }
    // The honest floor is the mock's 0–1.6%; the sweep behind THETA measured
    // 64.5% at 400 games. Pinned as a loose band — E4 owns the real number —
    // but far enough above the floor that a hash in sim's place fails it.
    expect(wins / GAMES).toBeGreaterThan(0.3)
  }, 120_000)

  it('legality thins the candidate list, mostly on English glosses — measured', async () => {
    const ev = await loadEvaluator()
    const boards = 50
    const totals: SearchStats = { candidates: 0, illegal: 0, illegalOnGloss: 0 }
    for (let seed = 1; seed <= boards; seed++) {
      const s = createGame({ config: BOARD, words: cityOneBoard(seed), seed })
      const stats: SearchStats = { candidates: 0, illegal: 0, illegalOnGloss: 0 }
      searchClue(ev, buildAiClueView(mirror(s), 'target'), { stats })
      totals.candidates += stats.candidates
      totals.illegal += stats.illegal
      totals.illegalOnGloss += stats.illegalOnGloss
    }
    if (envVar('ENGINE_REPORT')) {
      const per = (n: number) => (n / boards).toFixed(1)
      console.log(
        `legality thinning over ${boards} opening city-1 boards: ` +
          `${per(totals.candidates)} candidates/board, ${per(totals.illegal)} illegal ` +
          `(${((100 * totals.illegal) / totals.candidates).toFixed(1)}%), ` +
          `of which ${per(totals.illegalOnGloss)} via an English gloss ` +
          `(${((100 * totals.illegalOnGloss) / Math.max(1, totals.illegal)).toFixed(1)}% of the illegal)`,
      )
    }
    expect(totals.candidates).toBeGreaterThan(0)
    expect(totals.illegal).toBeLessThan(totals.candidates)
  }, 60_000)

  it('sweeps θ when asked — the measurement THETA quotes', async () => {
    if (!envVar('ENGINE_THETA_SWEEP')) return
    const games = Number(envVar('ENGINE_GAMES') ?? 400)
    for (const theta of [0, 0.5, 1, 1.5, 2]) {
      let wins = 0
      let clues = 0
      let coverage = 0
      let below = 0
      for (let seed = 1; seed <= games; seed++) {
        const g = await playEngineGame(seed, { theta, lastClueTheta: Math.min(theta, LAST_CLUE_THETA) })
        if (g.won) wins++
        clues += g.clues
        coverage += g.coverageSum
        below += g.belowTheta
      }
      console.log(
        `θ=${theta.toFixed(1)}  win ${((100 * wins) / games).toFixed(1)}%  ` +
          `coverage/clue ${(coverage / clues).toFixed(2)}  belowθ ${below}/${clues} clues`,
      )
    }
  }, 1_800_000)
})
