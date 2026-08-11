import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { applyRoundResults } from '../srs/scheduler'
import type { RoundWordResult, SrsMap } from '../srs/types'

interface SrsState {
  stats: SrsMap
  recordRound: (results: RoundWordResult[], now: number) => void
  reset: () => void
}

export const useSrs = create<SrsState>()(
  persist(
    (set) => ({
      stats: {},
      recordRound: (results, now) =>
        set((s) => ({ stats: applyRoundResults(s.stats, results, now) })),
      reset: () => set({ stats: {} }),
    }),
    { name: 'cluecab-srs-v1', version: 1 },
  ),
)
