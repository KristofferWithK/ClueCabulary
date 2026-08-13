import { describe, expect, it } from 'vitest'
import {
  GRID_CONFIGS,
  MAX_CLUE_NUMBER,
  assertConfigConsistent,
  distinctGreens,
  type GridConfig,
} from './config'

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
