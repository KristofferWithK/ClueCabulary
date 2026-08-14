import { describe, expect, it } from 'vitest'
import {
  GRID_CONFIGS,
  MAX_CLUE_NUMBER,
  REDEMPTION_AFTER_ROUND,
  WRAPUP_CONFIG,
  assertConfigConsistent,
  distinctGreens,
  type GridConfig,
} from './config'
import { applyEvent, createGame, giverOf, remainingGreenIds } from './game'
import type { BoardWord } from './types'

describe('the shipped boards', () => {
  it('are internally consistent', () => {
    for (const c of Object.values(GRID_CONFIGS)) assertConfigConsistent(c)
    assertConfigConsistent(WRAPUP_CONFIG)
  })

  /**
   * The wrap-up board's shape, pinned like the others: five clue-givings a
   * side, sixteen distinct greens over ten shared tokens = the beginner ratio.
   * The packing phase is the round's added difficulty, so the clue economy is
   * deliberately the forgiving one — and its know-nothing forbidden floor was
   * measured (config.ts) at 6.4% of guesses against standard 4x5's 16.0%.
   */
  it('give the wrap-up board the beginner ratio on the big grid', () => {
    expect(WRAPUP_CONFIG.turnTokens).toBe(10)
    expect(distinctGreens(WRAPUP_CONFIG)).toBe(16)
    expect(+(distinctGreens(WRAPUP_CONFIG) / WRAPUP_CONFIG.turnTokens).toFixed(2)).toBe(1.6)
    // Nothing on a wrap-up board is ever new — the pool is collected words.
    expect(WRAPUP_CONFIG.maxNewWordsPerBoard).toBe(0)
  })

  /**
   * Pinned because it is a play-feel decision, not an implementation detail —
   * if it changes, it should change because someone meant it to. It was four
   * for a build, which reads tidier (two clues each) and quietly forbids a
   * whole play style: eight greens cannot be cleared by clues of 2 in four
   * turns, so the board insisted on ambition.
   */
  it('give the beginner board five clues', () => {
    expect(GRID_CONFIGS.beginner.turnTokens).toBe(5)
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
      middle: load(GRID_CONFIGS.middle),
      standard: load(GRID_CONFIGS.standard),
    }).toEqual({ beginner: 1.6, middle: 1.83, standard: 1.5 })
    // Codenames Duet, the game this is scaled from, sits at 15/9 = 1.67. The
    // first board a player meets should not be the hardest of the three.
    expect(load(GRID_CONFIGS.beginner)).toBeLessThan(15 / 9)
  })

  it('count a shared green once, since finding it once is all the game asks', () => {
    // beginner: 2 on both keys + 3 only-player + 3 only-Cluey
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

  // Both of these assert what the CLEARING guard does, so they are written as
  // "not this complaint" rather than "no complaint": assertConfigConsistent
  // now carries a second, unrelated bound (below), and a bare not.toThrow()
  // would quietly start testing that one instead.
  it('allows the arithmetic floor, tight as it is', () => {
    const floor = Math.ceil(distinctGreens(beginner) / (MAX_CLUE_NUMBER + 1))
    expect(floor).toBe(2)
    expect(() => assertConfigConsistent({ ...beginner, turnTokens: floor })).not.toThrow(
      /cannot clear/,
    )
  })

  it('is a bound on the impossible, not on the merely hard', () => {
    // Deliberately not an opinion about difficulty: 2 tokens for 8 greens is a
    // brutal game and a legal one. Only unwinnable configurations are refused.
    expect(() => assertConfigConsistent({ ...beginner, turnTokens: 4 })).not.toThrow(/cannot clear/)
  })
})

/**
 * The last chance opens after REDEMPTION_AFTER_ROUND clues, so a board with no
 * more clues than that can never reach it. Nothing would break loudly: the
 * phase, RedemptionView, the grader and the 'redeemed' ending would all still
 * ship, and none of them would be reachable.
 *
 * Not a hypothetical. beginner ran on four tokens until recently, and the same
 * conversation that set this threshold also asked for four rounds on that
 * board — so the two numbers have already been on a collision course once.
 */
describe('the guard against a board where the last chance never opens', () => {
  const beginner = GRID_CONFIGS.beginner

  it('every shipped board can reach it', () => {
    for (const config of Object.values(GRID_CONFIGS)) {
      expect(config.turnTokens).toBeGreaterThan(REDEMPTION_AFTER_ROUND)
    }
  })

  it('refuses a board with no clue after the threshold', () => {
    expect(() =>
      assertConfigConsistent({ ...beginner, turnTokens: REDEMPTION_AFTER_ROUND }),
    ).toThrow(/never opens/)
  })

  it('and says how to fix it, since either number is the one to move', () => {
    try {
      assertConfigConsistent({ ...beginner, turnTokens: REDEMPTION_AFTER_ROUND })
    } catch (e) {
      expect((e as Error).message).toMatch(/REDEMPTION_AFTER_ROUND/)
      expect((e as Error).message).toMatch(/another clue/)
    }
  })

  it('accepts one clue past it', () => {
    expect(() =>
      assertConfigConsistent({ ...beginner, turnTokens: REDEMPTION_AFTER_ROUND + 1 }),
    ).not.toThrow()
  })
})

/**
 * Is the token count actually enough? Play the boards and find out.
 *
 * The first answer to this was measured with fixed-ambition strategies —
 * "always clue 2", "always clue 3" — and reported that cluing pairs loses
 * every board, which was true and was the wrong emphasis: nobody clues 2
 * while five of their greens are still hidden. A person clues for what is
 * left, up to about three at a time. Both are worth playing, though, and at
 * four tokens the pair-by-pair line really was impossible rather than merely
 * slow — which is what the fifth token is for.
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

describe('the beginner board, played the way a person plays', () => {
  const seeds = Array.from({ length: 60 }, (_, i) => i * 7 + 1)

  it('clears every board, cluing at most three at a time', () => {
    const runs = seeds.map((s) => playClueingForWhatIsLeft(s, 3))
    expect(runs.every((r) => r.won)).toBe(true)
  })

  /**
   * Three-then-three-then-two, on all sixty. Five greens a side and two of
   * them shared, so whoever clues first spends the overlap and leaves the
   * other side three. The perfect line is three clues and the budget is five,
   * so two are spare — room for a wrong guess and a wasted clue, rather than
   * the one mistake four allowed.
   */
  it('takes three of its five clues when clued ambitiously', () => {
    const runs = seeds.map((s) => playClueingForWhatIsLeft(s, 3))
    const shapes = new Set(runs.map((r) => r.numbers.join('+')))
    expect([...shapes]).toEqual(['3+3+2'])
    expect(runs.every((r) => r.clues <= GRID_CONFIGS.beginner.turnTokens - 2)).toBe(true)
  })

  /**
   * The reason for the fifth token. Eight greens need five clues of 2, and at
   * four this line could not be played at all — a whole way of playing the
   * game was arithmetically forbidden on the first board a learner meets.
   */
  it('and clears it cluing nothing but pairs, which four clues could not', () => {
    const runs = seeds.map((s) => playClueingForWhatIsLeft(s, 2))
    expect(runs.every((r) => r.won)).toBe(true)
    expect(runs.every((r) => r.clues <= GRID_CONFIGS.beginner.turnTokens)).toBe(true)
    // Four would have run out one clue short of the board.
    expect(Math.max(...runs.map((r) => r.clues))).toBeGreaterThan(4)
  })
})
