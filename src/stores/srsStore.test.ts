import { beforeEach, describe, expect, it } from 'vitest'
import { LEARN_REPS } from '../journey/progress'
import { WINS_PER_WRAP_UP, WRAP_UP_BANK_CAP } from '../journey/wrapup'
import { migrateSrs, useSrs } from './srsStore'

/**
 * A v1 save predates the directional green counters, and they cannot be
 * reconstructed from it — v1 only knows a word ended rounds green, not whose
 * work earned it. The migration's one promise is monotonicity: a word the old
 * model called learned arrives *collected* (one green credited each way), and
 * nothing arrives better than it left.
 */

/** A v1 record exactly as localStorage held it — no directional counters. */
const v1 = (correctGuesses: number) => ({
  box: 2 as const,
  lastSeenAt: 1_700_000_000_000,
  seen: correctGuesses + 1,
  correctGuesses,
  misses: 1,
  lookups: 2,
  redemptionRight: 0,
  redemptionWrong: 1,
})

describe('migrateSrs (v1 -> v2)', () => {
  it('seeds a legacy learned word as collected — one green each way', () => {
    const out = migrateSrs({ stats: { hus: v1(LEARN_REPS) }, games: { played: 9 } }, 1) as {
      stats: Record<string, { greenByClue: number; greenByGuess: number }>
    }
    expect(out.stats.hus).toMatchObject({ greenByClue: 1, greenByGuess: 1 })
  })

  it('a word short of learned arrives with zeroes — both interactions still to earn', () => {
    const out = migrateSrs({ stats: { kat: v1(LEARN_REPS - 1) } }, 1) as {
      stats: Record<string, { greenByClue: number; greenByGuess: number }>
    }
    expect(out.stats.kat).toMatchObject({ greenByClue: 0, greenByGuess: 0 })
  })

  it('touches nothing else on the record, and keeps the rest of the blob', () => {
    const blob = { stats: { hus: v1(4) }, games: { played: 9, won: 3, redeemed: 1, lost: 5 } }
    const out = migrateSrs(blob, 1) as typeof blob & {
      stats: Record<string, Record<string, number>>
    }
    expect(out.stats.hus).toMatchObject(v1(4))
    expect(out.games).toEqual(blob.games)
  })

  it('leaves the records of a v2 blob alone, and only adds the bank', () => {
    const blob = { stats: { hus: { ...v1(0), greenByClue: 2, greenByGuess: 0 } } }
    expect(migrateSrs(blob, 2)).toEqual({ ...blob, wrapUpsBanked: 0, winsTowardWrapUp: 0 })
  })

  it('survives an empty or absent state', () => {
    expect(migrateSrs(undefined, 1)).toEqual({
      stats: {},
      wrapUpsBanked: 0,
      winsTowardWrapUp: 0,
    })
    expect(migrateSrs({}, 1)).toEqual({ stats: {}, wrapUpsBanked: 0, winsTowardWrapUp: 0 })
  })
})

/**
 * v2 -> v3 hands a device its wrap-up bank. Every save written before this
 * build has none, and seeding zero would take something away — a player could
 * open a wrap-up yesterday and not today. So the seed is the bank they would
 * be holding if the rule had always existed and they had never spent one.
 */
describe('migrateSrs (v2 -> v3): the wrap-up bank', () => {
  it('seeds the bank from wins already earned', () => {
    const out = migrateSrs({ stats: {}, games: { played: 6, won: 2, redeemed: 0, lost: 4 } }, 2) as {
      wrapUpsBanked: number
    }
    expect(out.wrapUpsBanked).toBe(2)
  })

  it('caps a long winning history at the bank size', () => {
    const out = migrateSrs({ stats: {}, games: { played: 90, won: 60, redeemed: 0, lost: 30 } }, 2) as {
      wrapUpsBanked: number
    }
    expect(out.wrapUpsBanked).toBe(WRAP_UP_BANK_CAP)
  })

  it('a device that never won arrives at zero — the unlock is still ahead of it', () => {
    const out = migrateSrs({ stats: {}, games: { played: 4, won: 0, redeemed: 0, lost: 4 } }, 2) as {
      wrapUpsBanked: number
    }
    expect(out.wrapUpsBanked).toBe(0)
  })

  it('carries a v1 save all the way, greens and bank together', () => {
    const out = migrateSrs(
      { stats: { hus: v1(LEARN_REPS) }, games: { played: 3, won: 1, redeemed: 0, lost: 2 } },
      1,
    ) as { stats: Record<string, { greenByClue: number }>; wrapUpsBanked: number }
    expect(out.stats.hus).toMatchObject({ greenByClue: 1 })
    expect(out.wrapUpsBanked).toBe(1)
  })

  it('adds only the win counter to a v3 blob, and keeps its bank', () => {
    const blob = { stats: {}, games: { played: 1, won: 1, redeemed: 0, lost: 0 }, wrapUpsBanked: 2 }
    expect(migrateSrs(blob, 3)).toEqual({ ...blob, winsTowardWrapUp: 0 })
  })
})

/**
 * v3 -> v4 is W1: a token costs three won rounds instead of one.
 *
 * The bump is not the CLAUDE.md trap (a default that changed under saves that
 * already carry the field) — no save carries `winsTowardWrapUp`, so the
 * initial 0 would have been taken anyway. What the migration is FOR is the
 * other half, and it is a policy: the bank a player earned under the one-win
 * rule is kept as it stands. Generous over strict, R1's precedent, and the
 * same reading as v2 -> v3.
 *
 * Mutation-checked: recomputing the bank as `floor(won / 3)` here — the
 * "charge the new price retroactively" version — fails "a token already
 * earned is not taken back"; seeding the counter from `won % 3` fails "the
 * counter starts at zero, not part-way".
 */
describe('migrateSrs (v3 -> v4): the win counter', () => {
  it('a token already earned is not taken back', () => {
    const out = migrateSrs(
      { stats: {}, games: { played: 4, won: 2, redeemed: 0, lost: 2 }, wrapUpsBanked: 2 },
      3,
    ) as { wrapUpsBanked: number; winsTowardWrapUp: number }
    expect(out.wrapUpsBanked).toBe(2)
  })

  it('the counter starts at zero, not part-way through the new price', () => {
    // Two wins under the old rule already BOUGHT two tokens. Reading them as
    // two thirds of a third would be paying for them twice.
    const out = migrateSrs(
      { stats: {}, games: { played: 4, won: 2, redeemed: 0, lost: 2 }, wrapUpsBanked: 2 },
      3,
    ) as { winsTowardWrapUp: number }
    expect(out.winsTowardWrapUp).toBe(0)
  })

  it('carries a v1 save all the way to v4', () => {
    const out = migrateSrs(
      { stats: { hus: v1(LEARN_REPS) }, games: { played: 3, won: 1, redeemed: 0, lost: 2 } },
      1,
    ) as {
      stats: Record<string, { greenByClue: number }>
      wrapUpsBanked: number
      winsTowardWrapUp: number
    }
    expect(out.stats.hus).toMatchObject({ greenByClue: 1 })
    expect(out.wrapUpsBanked).toBe(1)
    expect(out.winsTowardWrapUp).toBe(0)
  })

  it('passes a v4 blob through untouched', () => {
    const blob = {
      stats: {},
      games: { played: 1, won: 1, redeemed: 0, lost: 0 },
      wrapUpsBanked: 0,
      winsTowardWrapUp: 2,
    }
    expect(migrateSrs(blob, 4)).toBe(blob)
  })
})

/**
 * The earn side of the economy, at the one call that learns a round ended.
 * The spend side is in gameStore.test.ts, where dealing the board is.
 *
 * Mutation-checked: dropping the `mode !== 'normal'` guard from
 * `bankAfterRound` fails "a wrap-up win earns nothing"; banking on every win
 * (the pre-W1 rule) fails the first case; dropping the `Math.min` fails the
 * cap; letting the counter run on at the cap fails "wins at the cap are not
 * stored up behind it".
 */
describe('srsStore: earning wrap-up rounds', () => {
  const won = { result: 'won', reason: 'all-greens' } as const
  const lost = { result: 'lost', reason: 'sudden-death' } as const
  const winRounds = (n: number) => {
    for (let i = 0; i < n; i++) useSrs.getState().recordGame(won)
  }

  beforeEach(() => useSrs.getState().reset())

  it(`banks one after ${WINS_PER_WRAP_UP} won rounds, and not before`, () => {
    winRounds(WINS_PER_WRAP_UP - 1)
    expect(useSrs.getState().wrapUpsBanked).toBe(0)
    expect(useSrs.getState().winsTowardWrapUp).toBe(WINS_PER_WRAP_UP - 1)
    useSrs.getState().recordGame(won)
    expect(useSrs.getState().wrapUpsBanked).toBe(1)
    expect(useSrs.getState().winsTowardWrapUp).toBe(0)
    expect(useSrs.getState().games.won).toBe(WINS_PER_WRAP_UP)
  })

  it('a loss costs nothing — it neither earns nor rewinds the counter', () => {
    winRounds(2)
    useSrs.getState().recordGame(lost)
    useSrs.getState().recordGame(lost)
    expect(useSrs.getState().winsTowardWrapUp).toBe(2)
    expect(useSrs.getState().wrapUpsBanked).toBe(0)
    expect(useSrs.getState().games.lost).toBe(2)
    // And the third win still pays out across the two losses.
    useSrs.getState().recordGame(won)
    expect(useSrs.getState().wrapUpsBanked).toBe(1)
  })

  it('a wrap-up win earns nothing — not even a step toward one', () => {
    useSrs.getState().recordGame(won, 'wrapup')
    expect(useSrs.getState().wrapUpsBanked).toBe(0)
    expect(useSrs.getState().winsTowardWrapUp).toBe(0)
    // The round still counts as a round played and won.
    expect(useSrs.getState().games).toMatchObject({ played: 1, won: 1 })
  })

  it(`banks at most ${WRAP_UP_BANK_CAP}`, () => {
    winRounds(WINS_PER_WRAP_UP * 10)
    expect(useSrs.getState().wrapUpsBanked).toBe(WRAP_UP_BANK_CAP)
  })

  it('wins at the cap are not stored up behind it', () => {
    winRounds(WINS_PER_WRAP_UP * WRAP_UP_BANK_CAP)
    expect(useSrs.getState().wrapUpsBanked).toBe(WRAP_UP_BANK_CAP)
    winRounds(5)
    expect(useSrs.getState().winsTowardWrapUp).toBe(0)
    // Spending one must not pay a token straight back out.
    expect(useSrs.getState().spendWrapUp()).toBe(true)
    expect(useSrs.getState().wrapUpsBanked).toBe(WRAP_UP_BANK_CAP - 1)
    useSrs.getState().recordGame(won)
    expect(useSrs.getState().wrapUpsBanked).toBe(WRAP_UP_BANK_CAP - 1)
    expect(useSrs.getState().winsTowardWrapUp).toBe(1)
  })

  it('spends one at a time, and refuses when the bank is empty', () => {
    winRounds(WINS_PER_WRAP_UP * 2)
    expect(useSrs.getState().wrapUpsBanked).toBe(2)
    expect(useSrs.getState().spendWrapUp()).toBe(true)
    expect(useSrs.getState().wrapUpsBanked).toBe(1)
    expect(useSrs.getState().spendWrapUp()).toBe(true)
    expect(useSrs.getState().spendWrapUp()).toBe(false)
    expect(useSrs.getState().wrapUpsBanked).toBe(0)
  })

  it('a reset takes the tokens and the counter with the wins that earned them', () => {
    winRounds(WINS_PER_WRAP_UP + 1)
    useSrs.getState().reset()
    expect(useSrs.getState().wrapUpsBanked).toBe(0)
    expect(useSrs.getState().winsTowardWrapUp).toBe(0)
  })
})
