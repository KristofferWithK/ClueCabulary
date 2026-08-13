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
