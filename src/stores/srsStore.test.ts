import { describe, expect, it } from 'vitest'
import { LEARN_REPS } from '../journey/progress'
import { migrateSrs } from './srsStore'

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

  it('passes a v2 blob through untouched', () => {
    const blob = { stats: { hus: { ...v1(0), greenByClue: 2, greenByGuess: 0 } } }
    expect(migrateSrs(blob, 2)).toBe(blob)
  })

  it('survives an empty or absent state', () => {
    expect(migrateSrs(undefined, 1)).toEqual({ stats: {} })
    expect(migrateSrs({}, 1)).toEqual({ stats: {} })
  })
})
