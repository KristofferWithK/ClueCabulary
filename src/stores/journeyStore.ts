import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { CITIES } from '../journey/cities'
import { mergeCollected, type CollectedLatch, type JourneyState } from '../journey/progress'
import type { SrsMap } from '../srs/types'

/** Answers survive a phone killing the app mid-exam. */
export interface ActiveExam {
  cityIndex: number
  gateIndex: number
  answers: Record<string, string>
}

interface JourneyStore extends JourneyState {
  /** Add-only record of when each word was collected. */
  collectedAt: CollectedLatch
  /** cityIndex -> arrival timestamp, for the travel log on the map. */
  arrivedAt: Record<number, number>
  activeExam: ActiveExam | null
  syncCollected: (srs: SrsMap, now: number) => void
  startExam: (cityIndex: number, gateIndex: number) => void
  setExamAnswer: (wordId: string, text: string) => void
  endExam: () => void
  passGate: (cityIndex: number, gateIndex: number) => void
  travel: (now: number) => void
  reset: () => void
}

const initial = {
  cityIndex: 0,
  gatesPassed: {} as Record<number, number[]>,
  collectedAt: {} as CollectedLatch,
  arrivedAt: {} as Record<number, number>,
  activeExam: null as ActiveExam | null,
}

export const useJourney = create<JourneyStore>()(
  persist(
    (set) => ({
      ...initial,
      syncCollected: (srs, now) =>
        set((s) => {
          const next = mergeCollected(s.collectedAt, srs, now)
          return next === s.collectedAt ? s : { collectedAt: next }
        }),
      startExam: (cityIndex, gateIndex) => set({ activeExam: { cityIndex, gateIndex, answers: {} } }),
      setExamAnswer: (wordId, text) =>
        set((s) =>
          s.activeExam
            ? { activeExam: { ...s.activeExam, answers: { ...s.activeExam.answers, [wordId]: text } } }
            : s,
        ),
      endExam: () => set({ activeExam: null }),
      passGate: (cityIndex, gateIndex) =>
        set((s) => {
          const passed = s.gatesPassed[cityIndex] ?? []
          if (passed.includes(gateIndex)) return s
          return {
            gatesPassed: { ...s.gatesPassed, [cityIndex]: [...passed, gateIndex].sort() },
          }
        }),
      travel: (now) =>
        set((s) => {
          const next = Math.min(s.cityIndex + 1, CITIES.length - 1)
          if (next === s.cityIndex) return s
          return { cityIndex: next, arrivedAt: { ...s.arrivedAt, [next]: now }, activeExam: null }
        }),
      reset: () => set({ ...initial }),
    }),
    { name: 'cluecab-journey-v1', version: 1 },
  ),
)

/** The collected set, for the pure progress functions. */
export function collectedSet(latch: CollectedLatch): Set<string> {
  return new Set(Object.keys(latch))
}
