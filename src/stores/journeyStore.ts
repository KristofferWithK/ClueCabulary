import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { CITIES, GATES_PER_CITY } from '../journey/cities'
import type { JourneyState } from '../journey/progress'
import {
  alreadyRescued,
  markRescued,
  planRescue,
  readV1,
  type RescueResult,
} from '../journey/rescue'

/** Answers survive a phone killing the app mid-exam. */
export interface ActiveExam {
  cityIndex: number
  /** The exact words drawn when the exam was opened. */
  wordIds: string[]
  answers: Record<string, string>
  /**
   * Set the moment the paper is marked. Persisted, because the results screen
   * lives in component state: without this, a reload after passing would put
   * the filled-in paper back on screen, and submitting it again would award a
   * second stempel from one correct paper, over and over.
   */
  gradedAt?: number
}

interface JourneyStore extends JourneyState {
  /** cityIndex -> arrival timestamp, for the travel log on the map. */
  arrivedAt: Record<number, number>
  activeExam: ActiveExam | null
  /** Drawing a paper spends one attempt, pass or fail. */
  startExam: (cityIndex: number, wordIds: string[]) => void
  setExamAnswer: (wordId: string, text: string) => void
  /** Marks the paper as spent, so it can never be handed in twice. */
  markExamGraded: (now: number) => void
  endExam: () => void
  /** A passed exam: bank its words and stamp the passport. */
  awardStamp: (cityIndex: number, wordIds: string[], now: number) => void
  travel: (now: number) => void
  reset: () => void
}

const initial = {
  cityIndex: 0,
  stamps: {} as Record<number, number>,
  banked: {} as Record<string, number>,
  trialsSpent: {} as Record<number, number>,
  arrivedAt: {} as Record<number, number>,
  activeExam: null as ActiveExam | null,
}

export const useJourney = create<JourneyStore>()(
  persist(
    (set) => ({
      ...initial,
      // Charged here, at the one place a paper is drawn, so no route — opening,
      // retrying, or any future one — can hand out a free attempt. Resuming an
      // exam does not come through here, and so is free, as it should be.
      startExam: (cityIndex, wordIds) =>
        set((s) => ({
          activeExam: { cityIndex, wordIds, answers: {} },
          trialsSpent: { ...s.trialsSpent, [cityIndex]: (s.trialsSpent[cityIndex] ?? 0) + 1 },
        })),
      setExamAnswer: (wordId, text) =>
        set((s) =>
          s.activeExam
            ? { activeExam: { ...s.activeExam, answers: { ...s.activeExam.answers, [wordId]: text } } }
            : s,
        ),
      markExamGraded: (now) =>
        set((s) => (s.activeExam ? { activeExam: { ...s.activeExam, gradedAt: now } } : s)),
      endExam: () => set({ activeExam: null }),
      awardStamp: (cityIndex, wordIds, now) =>
        set((s) => {
          const banked = { ...s.banked }
          for (const id of wordIds) if (!(id in banked)) banked[id] = now
          // activeExam deliberately survives: the results screen still needs
          // its words, and the player leaves it themselves.
          return {
            banked,
            stamps: {
              ...s.stamps,
              [cityIndex]: Math.min((s.stamps[cityIndex] ?? 0) + 1, GATES_PER_CITY),
            },
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
    { name: 'cluecab-journey-v2', version: 2 },
  ),
)

/**
 * Recover progress stranded by the v1 -> v2 key rename. Runs once per device,
 * after the store has rehydrated, and merges rather than replaces so it can
 * only ever add. See src/journey/rescue.ts for why this is needed at all.
 */
export function rescueStrandedJourney(): RescueResult {
  if (typeof localStorage === 'undefined') return { outcome: 'nothing-to-rescue' }
  if (alreadyRescued(localStorage)) return { outcome: 'already-done' }
  const s = useJourney.getState()
  const result = planRescue(readV1(localStorage), {
    cityIndex: s.cityIndex,
    stamps: s.stamps,
    banked: s.banked,
    trialsSpent: s.trialsSpent,
    arrivedAt: s.arrivedAt,
  })
  markRescued(localStorage)
  if (result.outcome !== 'rescued' || !result.journey) return result
  const j = result.journey
  const numeric = (r: Record<string, number>): Record<number, number> =>
    Object.fromEntries(Object.entries(r).map(([k, v]) => [Number(k), v]))
  // A paper drawn for a city the player is no longer in would stamp the wrong
  // page. The attempt is already spent either way, so the paper goes.
  const stale = s.activeExam && s.activeExam.cityIndex !== j.cityIndex
  useJourney.setState({
    ...(stale ? { activeExam: null } : {}),
    cityIndex: j.cityIndex,
    stamps: numeric(j.stamps as unknown as Record<string, number>),
    banked: j.banked,
    trialsSpent: numeric(j.trialsSpent as unknown as Record<string, number>),
    arrivedAt: numeric(j.arrivedAt as unknown as Record<string, number>),
  })
  return result
}
