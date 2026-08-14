import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Outcome } from '../engine/types'
import { LEARN_REPS } from '../journey/progress'
import { applyRoundResults } from '../srs/scheduler'
import type { RoundWordResult, SrsMap, WordStats } from '../srs/types'

export interface GamesTally {
  played: number
  won: number
  redeemed: number
  lost: number
}

const EMPTY_TALLY: GamesTally = { played: 0, won: 0, redeemed: 0, lost: 0 }

interface SrsState {
  stats: SrsMap
  games: GamesTally
  recordRound: (results: RoundWordResult[], now: number) => void
  recordGame: (outcome: Outcome) => void
  reset: () => void
}

/**
 * v1 -> v2: `greenByClue` / `greenByGuess` did not exist. They cannot be
 * reconstructed — a v1 save only knows a word ended rounds green, not whose
 * work earned it — so the seed is the fairest monotonic reading: a word the
 * old model called learned (correctGuesses >= LEARN_REPS) is credited one
 * green each way and arrives *collected*; anything short of that arrives with
 * zeroes and must earn both interactions in play. Nothing can regress: the
 * old states map to equal-or-better new ones.
 *
 * Exported so it can be tested directly: under vitest there is no
 * localStorage, persist quietly becomes a passthrough, and a test reaching
 * through the middleware would be testing nothing.
 */
export function migrateSrs(persisted: unknown, from: number): unknown {
  if (from >= 2) return persisted
  const p = (persisted ?? {}) as {
    stats?: Record<string, Omit<WordStats, 'greenByClue' | 'greenByGuess'>>
  }
  const seeded = Object.fromEntries(
    Object.entries(p.stats ?? {}).map(([id, s]) => [
      id,
      {
        ...s,
        greenByClue: s.correctGuesses >= LEARN_REPS ? 1 : 0,
        greenByGuess: s.correctGuesses >= LEARN_REPS ? 1 : 0,
      },
    ]),
  )
  return { ...p, stats: seeded }
}

export const useSrs = create<SrsState>()(
  persist(
    (set) => ({
      stats: {},
      games: EMPTY_TALLY,
      recordRound: (results, now) =>
        set((s) => ({ stats: applyRoundResults(s.stats, results, now) })),
      recordGame: (outcome) =>
        set((s) => ({
          games: {
            played: s.games.played + 1,
            won: s.games.won + (outcome.result === 'won' ? 1 : 0),
            redeemed: s.games.redeemed + (outcome.reason === 'redeemed' ? 1 : 0),
            lost: s.games.lost + (outcome.result === 'lost' ? 1 : 0),
          },
        })),
      reset: () => set({ stats: {}, games: EMPTY_TALLY }),
    }),
    { name: 'cluecab-srs-v1', version: 2, migrate: migrateSrs },
  ),
)
