import { describe, expect, it } from 'vitest'
import {
  BOARD,
  MAX_CLUE_NUMBER,
  TUTORIAL_CONFIG,
  WRAPUP_CONFIG,
  assertConfigConsistent,
  distinctGreens,
  type GridConfig,
} from './config'
import { applyEvent as applyEventIn, createGame, giverOf, remainingGreenIds } from './game'
import type { BoardWord } from './types'
import { danish } from '../lang/da'

/**
 * The engine takes the language pack now (H1). Wrapped here so the suite's
 * call sites stay exactly as they were and keep pinning what they pinned.
 */
const applyEvent = (s: Parameters<typeof applyEventIn>[0], e: Parameters<typeof applyEventIn>[1]) =>
  applyEventIn(s, e, danish)

const CONFIGS: Array<[string, GridConfig]> = [
  ['board', BOARD],
  ['tutorial', TUTORIAL_CONFIG],
  ['wrapup', WRAPUP_CONFIG],
]

describe('the shipped boards', () => {
  it('are internally consistent', () => {
    for (const [, c] of CONFIGS) assertConfigConsistent(c)
  })

  /**
   * THE board — there is one, since N1 — pinned by its shape rather than by
   * the win rate it produces. 3x6: eighteen cards, eight greens a side, three
   * of them shared, eight shared clue tokens.
   *
   * Pinned because every one of these numbers is a play-feel decision with a
   * measurement behind it in `config.ts`, and if one changes it should change
   * because someone meant it to.
   */
  it('are one board of eighteen cards, three across', () => {
    expect([BOARD.cols, BOARD.rows]).toEqual([3, 6])
    expect(BOARD.totalWords).toBe(18)
    expect(BOARD.greensPerSide).toBe(8)
    expect(BOARD.greenOverlap).toBe(3)
    expect(BOARD.turnTokens).toBe(8)
    // Thirteen distinct greens: three on both keys, five only-player, five
    // only-Casey. A shared green counts once, since finding it once is all the
    // game asks.
    expect(distinctGreens(BOARD)).toBe(13)
    // Five cards on nobody's key.
    expect(BOARD.totalWords - distinctGreens(BOARD)).toBe(5)
    // One never-seen word in three, the ratio every board has carried.
    expect(BOARD.maxNewWordsPerBoard).toBe(6)
  })

  /**
   * How much each clue has to carry: distinct greens over the shared token
   * pool. Codenames Duet, the game this is scaled from, sits at 15/9 = 1.67,
   * and the 3x5 this board replaces sat at 1.83 — the tightest budget the game
   * has ever had. 1.63 is a little kinder than either.
   */
  it('ask each clue to carry a known number of greens', () => {
    const load = (c: GridConfig) => +(distinctGreens(c) / c.turnTokens).toFixed(2)
    expect(load(BOARD)).toBe(1.63)
    expect(load(BOARD)).toBeLessThan(15 / 9)
    // The two modes are both at the beginner ratio on purpose; see config.ts.
    expect(load(TUTORIAL_CONFIG)).toBe(1.6)
    expect(load(WRAPUP_CONFIG)).toBe(1.6)
  })

  /**
   * The tutorial board's shape. It was `GRID_CONFIGS.beginner` and it is not a
   * size any more — it is the board the scripted first round is dealt on, and
   * `tutorial.test.ts` plays every scripted beat through the engine, so this is
   * really a second lock on the same door.
   */
  it('keep the 3x4 as a mode you enter rather than a difficulty you keep', () => {
    expect([TUTORIAL_CONFIG.cols, TUTORIAL_CONFIG.rows]).toEqual([3, 4])
    expect(distinctGreens(TUTORIAL_CONFIG)).toBe(8)
    expect(TUTORIAL_CONFIG.turnTokens).toBe(5)
    expect(TUTORIAL_CONFIG.totalWords - distinctGreens(TUTORIAL_CONFIG)).toBe(4)
  })

  /**
   * The wrap-up board's shape, pinned the same way: five clue-givings a side,
   * sixteen distinct greens over ten shared tokens. The packing phase is the
   * round's added difficulty, so the clue economy is deliberately forgiving.
   */
  it('give the wrap-up board the forgiving ratio on the big grid', () => {
    expect(WRAPUP_CONFIG.turnTokens).toBe(10)
    expect(distinctGreens(WRAPUP_CONFIG)).toBe(16)
    expect(WRAPUP_CONFIG.totalWords - distinctGreens(WRAPUP_CONFIG)).toBe(4)
    // Nothing on a wrap-up board is ever new — the pool is collected words.
    expect(WRAPUP_CONFIG.maxNewWordsPerBoard).toBe(0)
  })
})

describe('the guard against a board that cannot be cleared', () => {
  it('refuses a token count no perfect player could survive', () => {
    // 13 greens, at most 4 taken per clue: three clues can never be enough.
    expect(() => assertConfigConsistent({ ...BOARD, turnTokens: 3 })).toThrow(/cannot clear/)
  })

  // Both of these assert what the CLEARING guard does, so they are written as
  // "not this complaint" rather than "no complaint". There was a second,
  // unrelated bound below them for a while — a board with no clue left after
  // the last chance opened — and a bare not.toThrow() would have quietly
  // started testing that one instead. It is gone with the last chance; the
  // narrow assertion is kept, because the next guard added here will do it
  // again.
  it('allows the arithmetic floor, tight as it is', () => {
    const floor = Math.ceil(distinctGreens(BOARD) / MAX_CLUE_NUMBER)
    expect(floor).toBe(4)
    expect(() => assertConfigConsistent({ ...BOARD, turnTokens: floor })).not.toThrow(
      /cannot clear/,
    )
  })

  it('is a bound on the impossible, not on the merely hard', () => {
    // Deliberately not an opinion about difficulty: 5 tokens for 13 greens is
    // a brutal game and a legal one. Only unwinnable configurations are
    // refused.
    expect(() => assertConfigConsistent({ ...BOARD, turnTokens: 5 })).not.toThrow(/cannot clear/)
  })

  it('refuses a key that does not fit the board', () => {
    // 18 cards cannot hold 9 + 9 distinct greens with nothing shared.
    expect(() =>
      assertConfigConsistent({ ...BOARD, greensPerSide: 10, greenOverlap: 0 }),
    ).toThrow(/key slots/)
  })

  it('refuses a grid whose rows and columns do not make its word count', () => {
    expect(() => assertConfigConsistent({ ...BOARD, rows: 5 })).toThrow(/!= totalWords/)
  })
})

/**
 * Is the token count actually enough? Play the board and find out.
 *
 * The first answer to this was measured with fixed-ambition strategies —
 * "always clue 2", "always clue 3" — and reported that cluing pairs loses
 * every board, which was true and was the wrong emphasis: nobody clues 2
 * while eight of their greens are still hidden. A person clues for what is
 * left, up to about three at a time. Both are worth playing, though, and it is
 * the pair-by-pair line that decides whether a token count is generous or
 * merely survivable.
 */
const makeWords = (n: number): BoardWord[] =>
  Array.from({ length: n }, (_, i) => ({ wordId: `w${i}`, da: `xq${i}`, en: [`zz${i}`], pos: 'noun' }))

function playClueingForWhatIsLeft(seed: number, cap: number, config: GridConfig = BOARD) {
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

describe('the board, played the way a person plays', () => {
  const seeds = Array.from({ length: 60 }, (_, i) => i * 7 + 1)

  it('clears every board, cluing at most three at a time', () => {
    const runs = seeds.map((s) => playClueingForWhatIsLeft(s, 3))
    expect(runs.every((r) => r.won)).toBe(true)
  })

  /**
   * Three, three, three, two, two — five clues, on all sixty seeds. Eight
   * greens a side with three shared is thirteen distinct, and whoever clues
   * first spends the overlap, so the tail comes out as two twos rather than a
   * three and a one. Five of the eight tokens, which leaves three spare: room
   * for two wrong guesses and a wasted clue.
   *
   * The 3x5 this replaced took three of its six and left two spare. The board
   * is a little longer AND a little more forgiving, which is the trade the
   * table in config.ts argues for — checked here rather than asserted in prose.
   */
  it('takes five of its eight clues when clued ambitiously', () => {
    const runs = seeds.map((s) => playClueingForWhatIsLeft(s, 3))
    const shapes = new Set(runs.map((r) => r.numbers.join('+')))
    expect([...shapes]).toEqual(['3+3+3+2+2'])
    expect(runs.every((r) => r.clues <= BOARD.turnTokens - 3)).toBe(true)
  })

  /**
   * And the pair-by-pair line, which is the one an arithmetic floor forbids
   * first: thirteen greens cluing nothing but 2s takes seven clues, and the
   * board gives eight. This is the check that once caught the 3x4 at four
   * tokens, where cluing in pairs was arithmetically impossible on the first
   * board a learner met — a whole way of playing forbidden by the budget
   * rather than by the board.
   *
   * Seven of eight, exactly: the eighth token is what makes pairs a play style
   * with a margin rather than a tightrope.
   */
  it('and clears it cluing nothing but pairs, which seven tokens would not', () => {
    const runs = seeds.map((s) => playClueingForWhatIsLeft(s, 2))
    expect(runs.every((r) => r.won)).toBe(true)
    expect(new Set(runs.map((r) => r.clues))).toEqual(new Set([7]))
    expect(BOARD.turnTokens).toBeGreaterThan(7)
  })

  /** The tutorial board still clears, since a scripted round is dealt on it. */
  it('and the tutorial board clears too', () => {
    const runs = seeds.map((s) => playClueingForWhatIsLeft(s, 3, TUTORIAL_CONFIG))
    expect(runs.every((r) => r.won)).toBe(true)
  })
})
