import { describe, expect, it } from 'vitest'
import {
  GRID_CONFIGS,
  MAX_CLUE_NUMBER,
  assertConfigConsistent,
  distinctGreens,
  type GridConfig,
} from './config'
import { applyEvent, createGame, giverOf, remainingGreenIds } from './game'
import type { BoardWord } from './types'

describe('the shipped boards', () => {
  it('are internally consistent', () => {
    for (const c of Object.values(GRID_CONFIGS)) assertConfigConsistent(c)
  })

  /**
   * Beginner is four clues: you, Klaus, you, Klaus. Both sides guess twice and
   * the round is over quickly, which is the shape it was asked for. Pinned
   * because it is a play-feel decision, not an implementation detail — if it
   * changes, it should change because someone meant it to.
   */
  it('give the beginner board four clues, two each', () => {
    expect(GRID_CONFIGS.beginner.turnTokens).toBe(4)
  })

  /**
   * How much each clue has to carry. Beginner is the tightest board on
   * purpose; this records what that costs so a later tuning is an argument
   * with a number in it rather than a shrug.
   */
  it('ask each clue to carry a known number of greens', () => {
    const load = (c: GridConfig) => +(distinctGreens(c) / c.turnTokens).toFixed(2)
    expect({
      beginner: load(GRID_CONFIGS.beginner),
      standard: load(GRID_CONFIGS.standard),
    }).toEqual({ beginner: 2, standard: 1.5 })
    // Codenames Duet, the game this is scaled from, sits at 15/9 = 1.67.
    expect(load(GRID_CONFIGS.beginner)).toBeGreaterThan(15 / 9)
  })

  it('count a shared green once, since finding it once is all the game asks', () => {
    // beginner: 2 on both keys + 3 only-player + 3 only-Klaus
    expect(distinctGreens(GRID_CONFIGS.beginner)).toBe(8)
    expect(distinctGreens(GRID_CONFIGS.standard)).toBe(12)
  })
})

describe('the guard against a board that cannot be cleared', () => {
  const beginner = GRID_CONFIGS.beginner

  it('refuses a token count no perfect player could survive', () => {
    // 8 greens, 5 guesses per clue at most: one clue can never be enough.
    expect(() => assertConfigConsistent({ ...beginner, turnTokens: 1 })).toThrow(/cannot clear/)
  })

  it('allows the arithmetic floor, tight as it is', () => {
    const floor = Math.ceil(distinctGreens(beginner) / (MAX_CLUE_NUMBER + 1))
    expect(floor).toBe(2)
    expect(() => assertConfigConsistent({ ...beginner, turnTokens: floor })).not.toThrow()
  })

  it('is a bound on the impossible, not on the merely hard', () => {
    // Deliberately not an opinion about difficulty: 2 tokens for 8 greens is a
    // brutal game and a legal one. Only unwinnable configurations are refused.
    expect(() => assertConfigConsistent({ ...beginner, turnTokens: 4 })).not.toThrow()
  })
})

/**
 * Is four clues actually enough? Play the boards and find out.
 *
 * The first answer to this was measured with fixed-ambition strategies —
 * "always clue 2", "always clue 3" — which said cluing pairs loses every
 * board. True, and the wrong question: nobody clues 2 while five of their
 * greens are still hidden. A person clues for what is left, up to about three
 * at a time, and that is what this plays.
 */
const makeWords = (n: number): BoardWord[] =>
  Array.from({ length: n }, (_, i) => ({ wordId: `w${i}`, da: `xq${i}`, en: [`zz${i}`], pos: 'noun' }))

function playClueingForWhatIsLeft(seed: number, cap: number) {
  const config = GRID_CONFIGS.beginner
  let s = createGame({ config, words: makeWords(config.totalWords), seed })
  const numbers: number[] = []
  for (let guard = 0; s.phase !== 'finished' && guard < 30; guard++) {
    if (s.phase !== 'playerClueInput' && s.phase !== 'aiClueInput') break
    const giver = giverOf(s.phase)
    const key = giver === 'player' ? s.playerKey : s.aiKey
    const mine = remainingGreenIds(s).filter((id) => key[id] === 'green')
    if (mine.length === 0) break
    const n = Math.min(cap, mine.length)
    numbers.push(n)
    s = applyEvent(s, { type: 'SUBMIT_CLUE', by: giver, text: 'klods', number: n })
    for (const id of mine.slice(0, n)) {
      if (s.phase !== 'playerGuessing' && s.phase !== 'aiGuessing') break
      s = applyEvent(s, { type: 'GUESS', wordId: id })
    }
    if (s.phase === 'playerGuessing' || s.phase === 'aiGuessing') {
      s = applyEvent(s, { type: 'STOP_GUESSING' })
    }
  }
  return { won: s.outcome?.result === 'won', clues: s.clueHistory.length, numbers }
}

describe('four clues, played the way a person plays', () => {
  const seeds = Array.from({ length: 60 }, (_, i) => i * 7 + 1)

  it('clears every board, cluing at most three at a time', () => {
    const runs = seeds.map((s) => playClueingForWhatIsLeft(s, 3))
    expect(runs.every((r) => r.won)).toBe(true)
  })

  /**
   * Three-then-three-then-two, on all sixty. Five greens a side and two of
   * them shared, so whoever clues first spends the overlap and leaves the
   * other side three. The fourth clue is slack: the perfect line is three, and
   * the budget is four, which is exactly one mistake's worth of room.
   */
  it('takes three of its four clues, leaving one for a mistake', () => {
    const runs = seeds.map((s) => playClueingForWhatIsLeft(s, 3))
    const shapes = new Set(runs.map((r) => r.numbers.join('+')))
    expect([...shapes]).toEqual(['3+3+2'])
    expect(runs.every((r) => r.clues < GRID_CONFIGS.beginner.turnTokens)).toBe(true)
  })
})
