import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { CITIES } from '../journey/cities'
import type { JourneyState } from '../journey/progress'
import {
  alreadyRescued,
  markRescued,
  planRescue,
  readV1,
  type RescueResult,
} from '../journey/rescue'

interface JourneyStore extends JourneyState {
  /** cityIndex -> arrival timestamp, for the travel log on the map. */
  arrivedAt: Record<number, number>
  /** Pack words safely: add-only, first timestamp wins — like the old banking. */
  wrapWords: (wordIds: string[], now: number) => void
  travel: (now: number) => void
  reset: () => void
}

const initial = {
  cityIndex: 0,
  wrapped: {} as Record<string, number>,
  arrivedAt: {} as Record<number, number>,
}

/**
 * v2 -> v3: the exam economy ceased to be. `banked` becomes `wrapped` with
 * every timestamp intact — a word banked by a passed rejseprøve was packed by
 * the only route that existed, so it stays packed. Stamps, spent attempts and
 * any open paper have nothing to become and are dropped.
 *
 * The STORAGE KEY does not change. The last time this store moved keys it
 * shipped without a migration and silently wiped every traveller's progress
 * (src/journey/rescue.ts is the apology); versions move, keys do not.
 *
 * Exported so it can be tested directly: under vitest there is no
 * localStorage, persist quietly becomes a passthrough, and a test reaching
 * through the middleware would be testing nothing.
 */
export function migrateJourney(persisted: unknown, from: number): unknown {
  if (from >= 3) return persisted
  const { banked, stamps, trialsSpent, activeExam, lastPaper, ...rest } = (persisted ?? {}) as {
    banked?: Record<string, number>
    stamps?: unknown
    trialsSpent?: unknown
    activeExam?: unknown
    lastPaper?: unknown
  } & Record<string, unknown>
  void stamps, trialsSpent, activeExam, lastPaper
  return { ...rest, wrapped: banked ?? {} }
}

export const useJourney = create<JourneyStore>()(
  persist(
    (set) => ({
      ...initial,
      wrapWords: (wordIds, now) =>
        set((s) => {
          const wrapped = { ...s.wrapped }
          for (const id of wordIds) if (!(id in wrapped)) wrapped[id] = now
          return { wrapped }
        }),
      travel: (now) =>
        set((s) => {
          const next = s.cityIndex + 1
          // The map only offers travel where a next city exists; refusing here
          // too keeps a stray call from walking off the route.
          if (next >= CITIES.length) return s
          return { cityIndex: next, arrivedAt: { ...s.arrivedAt, [next]: now } }
        }),
      reset: () => set({ ...initial }),
    }),
    { name: 'cluecab-journey-v2', version: 3, migrate: migrateJourney },
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
    wrapped: s.wrapped,
    arrivedAt: s.arrivedAt,
  })
  markRescued(localStorage)
  if (result.outcome !== 'rescued' || !result.journey) return result
  const j = result.journey
  const numeric = (r: Record<string, number>): Record<number, number> =>
    Object.fromEntries(Object.entries(r).map(([k, v]) => [Number(k), v]))
  useJourney.setState({
    cityIndex: j.cityIndex,
    wrapped: j.wrapped,
    arrivedAt: numeric(j.arrivedAt as unknown as Record<string, number>),
  })
  return result
}
