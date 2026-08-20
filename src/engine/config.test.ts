import { describe, expect, it } from 'vitest'
import {
  GRID_CONFIGS,
  MAX_CLUE_NUMBER,
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
   * deliberately the forgiving one.
   *
   * The know-nothing forbidden floor that used to be quoted here as the second
   * half of the argument — 6.4% of guesses against standard 4x5's 16.0% — no
   * longer describes anything: no board has forbidden words. What replaces it
   * is a plain measurement of the same claim. This is now the softest board in
   * the game, 84.8% at p=0.6 against the 3x5's 67.1% (2000 seeded games), and
   * that is the forgiving clue economy doing exactly what it says.
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
   * How much each clue has to carry. Beginner is the gentlest board on
   * purpose; this records what that costs so a later tuning is an argument
   * with a number in it rather than a shrug.
   */
  it('ask each clue to carry a known number of greens', () => {
    const load = (c: GridConfig) => +(distinctGreens(c) / c.turnTokens).toFixed(2)
    expect({
      beginner: load(GRID_CONFIGS.beginner),
      middle: load(GRID_CONFIGS.middle),
      standard: load(GRID_CONFIGS.standard),
    }).toEqual({ beginner: 1.6, middle: 1.83, standard: 1.71 })
    // Codenames Duet, the game this is scaled from, sits at 15/9 = 1.67. The
    // first board a player meets should not be the hardest of the three.
    expect(load(GRID_CONFIGS.beginner)).toBeLessThan(15 / 9)
  })

  /**
   * Standard's seven, pinned like beginner's five, because it is the one
   * number the forbidden-word removal actually forced.
   *
   * It was eight, which was Duet's ratio and the loosest budget in the game —
   * affordable only because standard was the one board dealt three forbidden
   * words a side, so its difficulty sat in the hazards instead. With them gone
   * it measured EASIER than the middle board it escalates from (71.3% against
   * 67.1% at p=0.6, 2000 seeded games). Seven puts it back behind middle at
   * 58.1% without touching a single card on the board; `selfplay.test.ts`
   * asserts that ordering directly, and config.ts carries the full table.
   */
  it('give the standard board seven clues, one fewer than Duet would', () => {
    expect(GRID_CONFIGS.standard.turnTokens).toBe(7)
    // Still slack enough for a perfect pair, which spends 4.44 of them.
    expect(GRID_CONFIGS.standard.turnTokens).toBeGreaterThan(5)
  })

  it('count a shared green once, since finding it once is all the game asks', () => {
    // beginner: 2 on both keys + 3 only-player + 3 only-Casey
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
  // "not this complaint" rather than "no complaint". There was a second,
  // unrelated bound below them for a while — a board with no clue left after
  // the last chance opened — and a bare not.toThrow() would have quietly
  // started testing that one instead. It is gone with the last chance; the
  // narrow assertion is kept, because the next guard added here will do it
  // again.
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
 * How much of each board does nothing.
 *
 * Removing forbidden words freed a card or three on every board and they became
 * bystanders, because leaving the green counts alone was the cautious move —
 * the ratios above are the ones that were played and measured. The cost is
 * here: 3x4 and 3x5 went from two dead cards to four, and 4x5 from five to
 * eight.
 *
 * The re-tune measured that cost and left it standing. Of every guess that
 * misses, the share landing on a card that is on nobody's key is 72.5% on the
 * 3x4, 67.9% on the 3x5 and 76.2% on the 4x5 (p=0.7, 2000 seeded games). The
 * obvious fix — deal those slots as greens — was measured too and does the
 * opposite of what it promises: it makes a board harder and longer, because a
 * dead card is a card nobody ever has to point at. config.ts's `standard`
 * comment carries that table.
 *
 * Pinned so a redistribution is a deliberate edit with an argument attached
 * rather than something that drifts. If these numbers change, the greens
 * changed.
 */
describe('the cards that are on nobody key', () => {
  const neutrals = (c: GridConfig) => c.totalWords - distinctGreens(c)

  it.each([
    ['beginner', 12, 8, 4],
    ['middle', 15, 11, 4],
    ['standard', 20, 12, 8],
  ] as const)('%s: %i cards, %i greens, %i neutral', (grid, total, greens, dead) => {
    const c = GRID_CONFIGS[grid]
    expect(c.totalWords).toBe(total)
    expect(distinctGreens(c)).toBe(greens)
    expect(neutrals(c)).toBe(dead)
  })

  it('and the wrap-up board, four of twenty', () => {
    expect(neutrals(WRAPUP_CONFIG)).toBe(4)
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
