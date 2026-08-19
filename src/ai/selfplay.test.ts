import { describe, expect, it } from 'vitest'
import { GRID_CONFIGS, WRAPUP_CONFIG, distinctGreens, type GridConfig } from '../engine/config'
import {
  applyEvent,
  createGame,
  currentClue,
  giverOf,
  isGuessable,
  remainingGreenIds,
  targetableGreenIds,
} from '../engine/game'
import { checkClueLegality } from '../engine/legality'
import { mulberry32 } from '../engine/rng'
import type { BoardWord, GameState } from '../engine/types'
import { MockCompanion } from './mock/mockCompanion'
import { buildAiClueView, buildAiGuessView } from './projections'
import { planGuessExecution } from './companion'

const words = (n: number): BoardWord[] =>
  Array.from({ length: n }, (_, i) => ({
    wordId: `w${i}`,
    da: `dansk${i}ord${i}`,
    en: [`gloss${i}word${i}`],
    pos: 'noun',
  }))

function hash(s: string): number {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = (h * 33) ^ s.charCodeAt(i)
  return h >>> 0
}

/** A crude but legal player: hash-based guesses, generated legal clues. */
function playerClue(state: GameState, turn: number): string {
  for (let i = 0; i < 50; i++) {
    const candidate = `klods${turn}x${i}`
    if (checkClueLegality(candidate, state.words).legal) return candidate
  }
  throw new Error('could not produce a legal player clue')
}

type Grid = 'beginner' | 'middle' | 'standard' | 'wrapup'

const configFor = (grid: Grid): GridConfig =>
  grid === 'wrapup' ? WRAPUP_CONFIG : GRID_CONFIGS[grid]

interface Played {
  state: GameState
  won: boolean
  cluesUsed: number
  reachedSuddenDeath: boolean
  /** Distinct greens still hidden the moment the tokens ran out. */
  greensLeftAtTokenEnd: number
  /** Guesses that were not green on the clue-giver's key. */
  wrongGuesses: number
  /** Of those, the ones on a card that is green on neither key. */
  wrongOnDeadCard: number
}

/**
 * One know-nothing game.
 *
 * `walkAway` is the only choice here that is a PLAYER's rather than a board's:
 * in sudden death you may stop and take the loss. The legality fuzz below wants
 * that arm exercised; the measurements below want it off, because "how often is
 * this board won" should not be an average over how often a coin decided to
 * give up. Everything else is the same code either way.
 */
async function playOneGame(
  seed: number,
  grid: Grid,
  opts: { walkAway: boolean } = { walkAway: true },
): Promise<Played> {
  const companion = new MockCompanion()
  const config = configFor(grid)
  let s = createGame({ config, words: words(config.totalWords), seed })
  let safety = 200
  let reachedSuddenDeath = false
  let greensLeftAtTokenEnd = 0
  let wrongGuesses = 0
  let wrongOnDeadCard = 0
  /** Score a guess against the giver's key before the engine consumes it. */
  const scoreMiss = (st: GameState, id: string) => {
    const giver = giverOf(st.phase)
    const keys = giver === 'player' ? [st.playerKey, st.aiKey] : [st.aiKey, st.playerKey]
    if (keys[0]![id] !== 'green') {
      wrongGuesses += 1
      if (keys[1]![id] !== 'green') wrongOnDeadCard += 1
    }
  }

  while (s.phase !== 'finished' && safety-- > 0) {
    if (s.phase === 'suddenDeath' && !reachedSuddenDeath) {
      // First sight of the phase is the instant the last token was spent.
      reachedSuddenDeath = true
      greensLeftAtTokenEnd = remainingGreenIds(s).length
    }
    switch (s.phase) {
      case 'playerClueInput': {
        expect(targetableGreenIds(s, 'player').length).toBeGreaterThan(0)
        s = applyEvent(s, {
          type: 'SUBMIT_CLUE',
          by: 'player',
          text: playerClue(s, s.clueHistory.length),
          number: 1 + (hash(`n${seed}${s.clueHistory.length}`) % 3),
        })
        break
      }
      case 'aiGuessing': {
        const res = await companion.getGuesses(buildAiGuessView(s, 'en'))
        const plan = planGuessExecution(res.guesses, currentClue(s)!.number)
        for (const g of plan) {
          if (s.phase !== 'aiGuessing') break
          if (!isGuessable(s, g.wordId)) continue
          scoreMiss(s, g.wordId)
          s = applyEvent(s, { type: 'GUESS', wordId: g.wordId })
        }
        if (s.phase === 'aiGuessing') s = applyEvent(s, { type: 'STOP_GUESSING' })
        break
      }
      case 'aiClueInput': {
        // Engine invariant: a side is only asked to clue while it can.
        expect(targetableGreenIds(s, 'ai').length).toBeGreaterThan(0)
        const clue = await companion.getClue(buildAiClueView(s, 'en'))
        s = applyEvent(s, {
          type: 'SUBMIT_CLUE',
          by: 'ai',
          text: clue.clue,
          number: clue.number,
          targets: clue.targetWordIds,
          rationale: clue.rationale,
        })
        break
      }
      case 'playerGuessing': {
        const clue = currentClue(s)!
        const open = s.words.filter((w) => isGuessable(s, w.wordId))
        const pick = open[hash(`${seed}${clue.text}${clue.guesses.length}`) % open.length]!
        scoreMiss(s, pick.wordId)
        s = applyEvent(s, { type: 'GUESS', wordId: pick.wordId })
        if (s.phase === 'playerGuessing' && hash(`stop${seed}${clue.guesses.length}`) % 2 === 0) {
          s = applyEvent(s, { type: 'STOP_GUESSING' })
        }
        break
      }
      /**
       * Clues spent, board unfinished. The player names words until the board
       * is clear or one of them is not green. Played here at random, which is
       * the point: whatever it picks, the engine must stay in a legal state
       * and the game must still terminate.
       */
      case 'suddenDeath': {
        const open = s.words.filter((w) => isGuessable(s, w.wordId))
        if (open.length === 0 || (opts.walkAway && hash(`sd${seed}${open.length}`) % 7 === 0)) {
          s = applyEvent(s, { type: 'STOP_GUESSING' })
          break
        }
        const pick = open[hash(`sd${seed}${open.length}`) % open.length]!
        s = applyEvent(s, { type: 'GUESS', wordId: pick.wordId })
        break
      }
      // There was a 'redemption' arm here, playing the translate-everything
      // last chance and flunking one word on half the seeds. The phase no
      // longer exists.
    }
  }
  expect(safety).toBeGreaterThan(0)
  return {
    state: s,
    won: s.outcome?.result === 'won',
    cluesUsed: s.clueHistory.length,
    reachedSuddenDeath,
    greensLeftAtTokenEnd,
    wrongGuesses,
    wrongOnDeadCard,
  }
}

/**
 * The wrap-up board rides the same harness — its packing phase lives above the
 * engine, so an engine round on WRAPUP_CONFIG is just a round.
 */
describe('self-play: engine + mock companion never reach an illegal state', () => {
  it.each(['beginner', 'middle', 'standard', 'wrapup'] as const)(
    '50 full %s games all terminate',
    async (grid) => {
      const outcomes: Record<string, number> = {}
      for (let seed = 1; seed <= 50; seed++) {
        const end = (await playOneGame(seed, grid)).state
        expect(end.outcome).toBeDefined()
        const key = `${end.outcome!.result}:${end.outcome!.reason}`
        outcomes[key] = (outcomes[key] ?? 0) + 1
      }
      // Random-ish play must at least produce game-overs of more than one kind.
      expect(Object.keys(outcomes).length).toBeGreaterThan(1)
    },
  )
})

/**
 * Read a knob from the environment WITHOUT naming `process`.
 *
 * `tsconfig.app.json` compiles src/ with DOM libs and no node types, so a bare
 * `process.env` here fails `tsc -b` even though vitest runs it happily — and
 * the fix is not to add @types/node, which would make node globals look
 * available to every file that ships to a phone. `npx tsc --noEmit` reports
 * nothing about any of this; see CLAUDE.md.
 */
const envVar = (name: string): string | undefined =>
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[name]

/**
 * How many seeded games each measurement below plays.
 *
 * The seeds are 1..GAMES, so a run is reproducible — but NOT independent of
 * this number: change it and every figure shifts a little, which is why the
 * pins are bands rather than points. The default keeps `npm test` quick; the
 * figures quoted in `config.ts` and README were taken at 2000, and every pin
 * here was checked at both.
 */
const GAMES = Number(envVar('SELFPLAY_GAMES') ?? 300)

interface Summary {
  games: number
  winRate: number
  suddenDeathRate: number
  wonInSuddenDeath: number
  meanClues: number
  meanGreensLeftAtTokenEnd: number
  /** Share of missed guesses that hit a card on neither key. */
  deadCardShareOfMisses: number
}

const pct = (x: number) => +(100 * x).toFixed(1)
const mean = (xs: number[]) => (xs.length ? +(xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(2) : 0)

async function measure(grid: Grid, games: number): Promise<Summary> {
  const runs: Played[] = []
  for (let seed = 1; seed <= games; seed++) {
    runs.push(await playOneGame(seed, grid, { walkAway: false }))
  }
  return summarise(runs)
}

/**
 * WHAT THESE BOARDS DO TO A GUESSER THAT KNOWS NOTHING.
 *
 * This is a FLOOR, not a forecast. Both sides here clue nonsense and guess by
 * hash — the numbers are what the board arithmetic alone produces, before any
 * word association helps anyone. A real player beats every one of them, and the
 * gap between a floor and a real round is the game. Read them as "no board can
 * be harder than this", never as "this is how often you will win".
 *
 * With nothing fatal left on a board this floor is nearly degenerate — every
 * board runs its tokens out and almost no game is won — which is itself the
 * finding, and it answers exactly one question: how much board is still unfound
 * when the clues stop. The skill sweep below carries the rest, from this floor
 * up to perfect play, and the two together bracket what the tokens are worth.
 *
 * Recorded numbers come from `SELFPLAY_GAMES=2000 SELFPLAY_REPORT=1 npx vitest
 * run src/ai/selfplay.test.ts`, which prints the table.
 */
describe('the know-nothing floor, per board', () => {
  const boards = ['beginner', 'middle', 'standard', 'wrapup'] as const

  it(
    'measures the same thing every time it is asked',
    async () => {
      const rows: Record<string, Summary> = {}
      for (const grid of boards) rows[grid] = await measure(grid, GAMES)

      if (envVar('SELFPLAY_REPORT')) {
        const cfg = (g: Grid) => configFor(g)
        console.log(
          `\nknow-nothing floor, ${GAMES} seeded games per board\n` +
            'board     cards greens tokens  win%   SD%  won-in-SD%  clues  greens left at SD\n' +
            boards
              .map((g) => {
                const r = rows[g]!
                const c = cfg(g)
                return (
                  `${g.padEnd(9)} ${String(c.totalWords).padStart(5)} ${String(distinctGreens(c)).padStart(6)} ` +
                  `${String(c.turnTokens).padStart(6)} ${r.winRate.toFixed(1).padStart(5)} ` +
                  `${r.suddenDeathRate.toFixed(1).padStart(5)} ${r.wonInSuddenDeath.toFixed(1).padStart(11)} ` +
                  `${r.meanClues.toFixed(2).padStart(6)} ${r.meanGreensLeftAtTokenEnd.toFixed(2).padStart(18)}`
                )
              })
              .join('\n'),
        )
      }

      /**
       * Pinned as bands, not points: the exact figure moves with the sample
       * size and these have to hold at 300 games and at 2000. What each band
       * is defending is a shape, and the shape is the argument.
       *
       * 1. Nothing ends a round early any more, so a guesser this bad spends
       *    every token on every board — sudden death is all but certain.
       * 2. Winning from there means naming every remaining green blind, which
       *    is why the floor win rate is single digits and why it is NOT an
       *    argument that the boards are hard.
       * 3. The tokens run out with most of the board still hidden. That number
       *    is the one worth watching when tuning: it is the distance a real
       *    player's word associations have to cover.
       */
      for (const grid of boards) {
        const r = rows[grid]!
        expect(r.suddenDeathRate).toBeGreaterThan(95)
        expect(r.winRate).toBeLessThan(10)
        expect(r.meanGreensLeftAtTokenEnd).toBeGreaterThan(distinctGreens(configFor(grid)) / 3)
      }

      // Clues used is the token budget almost exactly, because the budget is
      // always spent: an honest reading of "mean clues" on these boards.
      for (const grid of boards) {
        expect(rows[grid]!.meanClues).toBeCloseTo(configFor(grid).turnTokens, 0)
      }
    },
    120_000,
  )
})

/**
 * THE SAME BOARDS WITH THE SKILL TURNED UP.
 *
 * The floor above is one end of a line and perfect play (config.test.ts) is the
 * other; neither is a round anybody plays. This walks between them.
 *
 * One dial, `skill`: the chance that a guess finds a word the clue-giver
 * actually meant. At 0 it is the floor — guess anything that is still face up.
 * At 1 every guess is right and the only question left is whether the tokens
 * cover the board. In between it is a player who reads most clues and misreads
 * some, which is the only part of this game a number can stand in for.
 *
 * Both sides clue for what is left, up to `cap` at a time — the line the
 * beginner board was tuned against, because nobody clues 2 while five of their
 * greens are hidden. Neither side stops short of the number; deciding to bank
 * two of three is a real move and a second dial, and one dial is enough to
 * answer what these boards are being asked.
 *
 * What this is NOT: a prediction of anybody's win rate. Danish word association
 * is not a coin with a bias. It is a way to ask whether a board still has a
 * losing side to it once the guessing gets good, which is exactly the question
 * that removing forbidden words opened.
 */
function playSkilled(seed: number, config: GridConfig, skill: number, cap = 3): Played {
  let s = createGame({ config, words: words(config.totalWords), seed })
  const rng = mulberry32(seed ^ Math.round(skill * 1000))
  let reachedSuddenDeath = false
  let greensLeftAtTokenEnd = 0
  let wrongGuesses = 0
  let wrongOnDeadCard = 0

  const guessable = (st: GameState) => st.words.filter((w) => isGuessable(st, w.wordId))
  const pick = <T,>(xs: T[]): T => xs[Math.floor(rng() * xs.length)]!

  for (let guard = 0; s.phase !== 'finished' && guard < 400; guard++) {
    if (s.phase === 'suddenDeath' && !reachedSuddenDeath) {
      reachedSuddenDeath = true
      greensLeftAtTokenEnd = remainingGreenIds(s).length
    }
    if (s.phase === 'playerClueInput' || s.phase === 'aiClueInput') {
      const giver = giverOf(s.phase)
      const mine = targetableGreenIds(s, giver)
      s = applyEvent(s, {
        type: 'SUBMIT_CLUE',
        by: giver,
        text: playerClue(s, s.clueHistory.length),
        number: Math.min(cap, mine.length),
      })
      continue
    }
    if (s.phase === 'playerGuessing' || s.phase === 'aiGuessing') {
      const giver = giverOf(s.phase)
      const meant = targetableGreenIds(s, giver)
      const open = guessable(s)
      const right = meant.length > 0 && rng() < skill
      const id = right ? pick(meant) : pick(open).wordId
      // What a miss costs depends on what it lands on: a card that is the
      // other side's green is only burned in this direction and can still be
      // found under their clue, while a card on neither key is gone for good.
      const keys = giver === 'player' ? [s.playerKey, s.aiKey] : [s.aiKey, s.playerKey]
      if (keys[0]![id] !== 'green') {
        wrongGuesses += 1
        if (keys[1]![id] !== 'green') wrongOnDeadCard += 1
      }
      s = applyEvent(s, { type: 'GUESS', wordId: id })
      continue
    }
    // Sudden death: no giver, so a green on either key counts. Played out
    // rather than walked away from — see playOneGame's note.
    const alive = remainingGreenIds(s).filter((id) => isGuessable(s, id))
    const open = guessable(s)
    const right = alive.length > 0 && rng() < skill
    s = applyEvent(s, { type: 'GUESS', wordId: right ? pick(alive) : pick(open).wordId })
  }

  return {
    state: s,
    won: s.outcome?.result === 'won',
    cluesUsed: s.clueHistory.length,
    reachedSuddenDeath,
    greensLeftAtTokenEnd,
    wrongGuesses,
    wrongOnDeadCard,
  }
}

function summarise(runs: Played[]): Summary {
  const sd = runs.filter((r) => r.reachedSuddenDeath)
  const misses = runs.reduce((a, r) => a + r.wrongGuesses, 0)
  const dead = runs.reduce((a, r) => a + r.wrongOnDeadCard, 0)
  return {
    games: runs.length,
    winRate: pct(runs.filter((r) => r.won).length / runs.length),
    suddenDeathRate: pct(sd.length / runs.length),
    wonInSuddenDeath: pct(sd.filter((r) => r.won).length / Math.max(sd.length, 1)),
    meanClues: mean(runs.map((r) => r.cluesUsed)),
    meanGreensLeftAtTokenEnd: mean(sd.map((r) => r.greensLeftAtTokenEnd)),
    deadCardShareOfMisses: pct(dead / Math.max(misses, 1)),
  }
}

const skillSweep = (config: GridConfig, skill: number, games: number, cap = 3): Summary =>
  summarise(Array.from({ length: games }, (_, i) => playSkilled(i + 1, config, skill, cap)))

describe('the boards across the whole range of guessing', () => {
  const boards = ['beginner', 'middle', 'standard', 'wrapup'] as const
  const SKILLS = [0, 0.5, 0.6, 0.7, 0.8, 0.9, 1]

  it(
    'still has a losing side at every skill short of perfect',
    () => {
      const table: Record<string, Record<number, Summary>> = {}
      for (const grid of boards) {
        table[grid] = {}
        for (const skill of SKILLS) table[grid]![skill] = skillSweep(configFor(grid), skill, GAMES)
      }

      if (envVar('SELFPLAY_REPORT')) {
        console.log(
          `\nwin% by guessing skill, ${GAMES} seeded games per cell, cluing up to 3\n` +
            `board     ${SKILLS.map((s) => `p=${s.toFixed(2)}`.padStart(6)).join(' ')}\n` +
            boards
              .map(
                (g) =>
                  `${g.padEnd(9)} ${SKILLS.map((s) => table[g]![s]!.winRate.toFixed(1).padStart(6)).join(' ')}`,
              )
              .join('\n') +
            `\n\nmean clues spent (budget in brackets)\n` +
            boards
              .map(
                (g) =>
                  `${g.padEnd(9)} [${String(configFor(g).turnTokens).padStart(2)}] ` +
                  SKILLS.map((s) => table[g]![s]!.meanClues.toFixed(2).padStart(6)).join(' '),
              )
              .join('\n') +
            `\n\nsudden-death rate\n` +
            boards
              .map(
                (g) =>
                  `${g.padEnd(9)} ${SKILLS.map((s) => table[g]![s]!.suddenDeathRate.toFixed(1).padStart(6)).join(' ')}`,
              )
              .join('\n') +
            `\n\nshare of missed guesses landing on a card that is nobody's green\n` +
            boards
              .map(
                (g) =>
                  `${g.padEnd(9)} ${SKILLS.map((s) => table[g]![s]!.deadCardShareOfMisses.toFixed(1).padStart(6)).join(' ')}`,
              )
              .join('\n') +
            `\n\ngreens still hidden when the tokens ran out\n` +
            boards
              .map(
                (g) =>
                  `${g.padEnd(9)} ${SKILLS.map((s) => table[g]![s]!.meanGreensLeftAtTokenEnd.toFixed(2).padStart(6)).join(' ')}`,
              )
              .join('\n'),
        )
      }

      /**
       * The shape being defended, on every board:
       *
       * - a perfect guesser wins outright. The tokens are not a trap; if you
       *   read every clue the board is yours. That is the ceiling and it should
       *   be a certainty, or the budget is too tight to be fair.
       * - a guesser who misreads two clues in five does NOT. The board still
       *   has a losing side once the guessing is decent, which is the whole
       *   question that removing forbidden words opened. Pinned at p=0.6
       *   rather than higher because above p=0.8 every board saturates and the
       *   assertion would be about rounding.
       */
      for (const grid of boards) {
        expect(table[grid]![1]!.winRate).toBe(100)
        // The wrap-up board is allowed to be the soft one; see below.
        expect(table[grid]![0.6]!.winRate).toBeLessThan(grid === 'wrapup' ? 95 : 85)
      }

      /**
       * And the escalation, which is the thing this card was opened to fix.
       * Removing forbidden words hit standard hardest — it was the only board
       * with three forbidden a side — and left it easier than the middle board
       * it is supposed to escalate from (71.3% against 67.1% at p=0.6, 2000
       * games). One token off standard restores the order.
       *
       * Checked at p=0.6, where the boards are still far enough apart to be
       * telling them apart rather than measuring noise: by p=0.8 they are all
       * within three points of each other and of 100.
       */
      const at = (g: Grid) => table[g]![0.6]!.winRate
      expect(at('beginner')).toBeGreaterThan(at('middle'))
      expect(at('middle')).toBeGreaterThan(at('standard'))
      // The wrap-up board is deliberately outside that order: its difficulty
      // is the packing gate, which lives above the engine and is invisible
      // here, so its clue economy is the most forgiving in the game.
      expect(at('wrapup')).toBeGreaterThan(at('beginner'))
    },
    120_000,
  )
})

/**
 * The counterfactual token counts quoted in `config.ts` — every "it was
 * measured against N" sentence there is this test, so the comments cannot
 * quietly drift away from the numbers they claim.
 *
 * Only the direction is asserted, not the figure: the point of each sentence
 * is "the alternative was worse in this direction", and pinning 50.0% exactly
 * would break on a sample-size change without telling anyone anything.
 */
describe('the token counts that were rejected', () => {
  const at = (c: GridConfig, p: number) => skillSweep(c, p, GAMES).winRate

  it(
    'were rejected for being harsher or flatter than what ships',
    () => {
      const m = GRID_CONFIGS.middle
      const b = GRID_CONFIGS.beginner
      const shippedMiddle = at(m, 0.6)
      // Five turns the default board into a coin flip; seven flattens it into
      // the beginner board, which measures 76.1% at this skill.
      expect(at({ ...m, turnTokens: 5 }, 0.6)).toBeLessThan(shippedMiddle - 10)
      expect(at({ ...m, turnTokens: 7 }, 0.6)).toBeGreaterThan(at(b, 0.6))
      // And the beginner board's fourth-token argument is not only arithmetic.
      expect(at({ ...b, turnTokens: 4 }, 0.6)).toBeLessThan(at(b, 0.6) - 10)
    },
    120_000,
  )
})
