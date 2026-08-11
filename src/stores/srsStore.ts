import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Outcome } from '../engine/types'
import { applyRoundResults } from '../srs/scheduler'
import type { RoundWordResult, SrsMap } from '../srs/types'

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
    { name: 'cluecab-srs-v1', version: 1 },
  ),
)
