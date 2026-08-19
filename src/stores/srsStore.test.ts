import { beforeEach, describe, expect, it } from 'vitest'
import { LEARN_REPS } from '../journey/progress'
import { WRAP_UP_BANK_CAP } from '../journey/wrapup'
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
    expect(migrateSrs(blob, 2)).toEqual({ ...blob, wrapUpsBanked: 0 })
  })

  it('survives an empty or absent state', () => {
    expect(migrateSrs(undefined, 1)).toEqual({ stats: {}, wrapUpsBanked: 0 })
    expect(migrateSrs({}, 1)).toEqual({ stats: {}, wrapUpsBanked: 0 })
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

  it('passes a v3 blob through untouched', () => {
    const blob = { stats: {}, games: { played: 1, won: 1, redeemed: 0, lost: 0 }, wrapUpsBanked: 0 }
    expect(migrateSrs(blob, 3)).toBe(blob)
  })
})

/**
 * The earn side of the economy, at the one call that learns a round ended.
 * The spend side is in gameStore.test.ts, where dealing the board is.
 *
 * Mutation-checked: dropping the `mode !== 'normal'` guard from
 * `bankAfterRound` fails "a wrap-up win earns nothing"; dropping the
 * `Math.min` fails the cap; letting a loss through fails "a loss costs
 * nothing" only in its second half, so that one is asserted both ways.
 */
describe('srsStore: earning wrap-up rounds', () => {
  const won = { result: 'won', reason: 'all-greens' } as const
  const lost = { result: 'lost', reason: 'sudden-death' } as const

  beforeEach(() => useSrs.getState().reset())

  it('a won round banks exactly one', () => {
    useSrs.getState().recordGame(won)
    expect(useSrs.getState().wrapUpsBanked).toBe(1)
    expect(useSrs.getState().games.won).toBe(1)
  })

  it('a loss costs nothing — it neither earns nor takes away', () => {
    useSrs.getState().recordGame(won)
    useSrs.getState().recordGame(lost)
    useSrs.getState().recordGame(lost)
    expect(useSrs.getState().wrapUpsBanked).toBe(1)
    expect(useSrs.getState().games.lost).toBe(2)
  })

  it('a wrap-up win earns nothing — otherwise they chain forever', () => {
    useSrs.getState().recordGame(won, 'wrapup')
    expect(useSrs.getState().wrapUpsBanked).toBe(0)
    // The round still counts as a round played and won.
    expect(useSrs.getState().games).toMatchObject({ played: 1, won: 1 })
  })

  it(`banks at most ${WRAP_UP_BANK_CAP}`, () => {
    for (let i = 0; i < 10; i++) useSrs.getState().recordGame(won)
    expect(useSrs.getState().wrapUpsBanked).toBe(WRAP_UP_BANK_CAP)
  })

  it('spends one at a time, and refuses when the bank is empty', () => {
    useSrs.getState().recordGame(won)
    useSrs.getState().recordGame(won)
    expect(useSrs.getState().spendWrapUp()).toBe(true)
    expect(useSrs.getState().wrapUpsBanked).toBe(1)
    expect(useSrs.getState().spendWrapUp()).toBe(true)
    expect(useSrs.getState().spendWrapUp()).toBe(false)
    expect(useSrs.getState().wrapUpsBanked).toBe(0)
  })

  it('a reset takes the tokens with the wins that earned them', () => {
    useSrs.getState().recordGame(won)
    useSrs.getState().reset()
    expect(useSrs.getState().wrapUpsBanked).toBe(0)
  })
})
