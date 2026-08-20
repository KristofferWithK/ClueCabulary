import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { CITIES, FINAL_CITY_INDEX } from '../journey/cities'
import { ACTIVE } from '../lang/active'
import { DEFAULT_LANGUAGE } from '../lang/index'
import type { LanguageCode } from '../lang/types'
import type { JourneyState } from '../journey/progress'
import {
  alreadyRescued,
  markRescued,
  planRescue,
  readV1,
  type RescueResult,
} from '../journey/rescue'

/** Where a traveller stands on one language's route. */
export interface RoutePosition {
  cityIndex: number
  /** cityIndex -> arrival timestamp, for the travel log on the map. */
  arrivedAt: Record<number, number>
}

interface JourneyStore extends JourneyState {
  /** cityIndex -> arrival timestamp, for the travel log on the map. */
  arrivedAt: Record<number, number>
  /**
   * Which language's route `cityIndex` and `arrivedAt` above describe.
   *
   * A city index means nothing without the route it indexes: stop 4 is Aalborg
   * in Denmark and would be somewhere else entirely in Germany. So the position
   * is stamped, and a stamp that disagrees with the active language means the
   * save was written while playing something else.
   */
  routeLanguage: LanguageCode
  /**
   * Positions on the routes not currently being travelled. Swapped with the
   * live one on rehydrate when the language has changed, so a player who goes
   * to German and comes back finds Denmark exactly where they left it.
   *
   * `wrapped` is deliberately NOT in here. It is keyed by word id, every word
   * id carries its own language (`da:mor`, `de:Mutter`), so one ledger holds
   * both collections with no possibility of collision — proven in
   * src/lang/seam.test.ts. Splitting it would move real progress between
   * storage keys to buy nothing, and moving progress between storage keys is
   * the one mistake here that has actually cost a player their collection
   * (src/journey/rescue.ts is the apology).
   */
  parked: Partial<Record<LanguageCode, RoutePosition>>
  /** Pack words safely: add-only, first timestamp wins — like the old banking. */
  wrapWords: (wordIds: string[], now: number) => void
  travel: (now: number) => void
  reset: () => void
}

const initial = {
  cityIndex: 0,
  wrapped: {} as Record<string, number>,
  arrivedAt: {} as Record<number, number>,
  routeLanguage: ACTIVE.code,
  parked: {} as Partial<Record<LanguageCode, RoutePosition>>,
}

/**
 * Where Viborg stood: the fifth stop, index 4, between Aarhus and Aalborg.
 * Everything from here on shifted down one when it left the route.
 */
const VIBORG_INDEX = 4

/** A stop on the old ten-city route, placed on the nine-city one. */
function shiftPastViborg(index: number): number {
  if (!Number.isInteger(index) || index < 0) return 0
  // Viborg itself goes BACKWARD, to Aarhus. Never forward: forward would be a
  // stop whose hundred words this player may never have been shown, and the
  // road onward is gated on wrapping them. Backward cannot cost anything —
  // reaching stop i means every word before it is already wrapped, so the
  // stop they land on is one they have finished and travel is open at once.
  const shifted = index >= VIBORG_INDEX ? index - 1 : index
  return Math.min(shifted, FINAL_CITY_INDEX)
}

/**
 * v2 -> v3: the exam economy ceased to be. `banked` becomes `wrapped` with
 * every timestamp intact — a word banked by a passed rejseprøve was packed by
 * the only route that existed, so it stays packed. Stamps, spent attempts and
 * any open paper have nothing to become and are dropped.
 *
 * v3 -> v4: Viborg left the route and the dataset came down to nine hundred
 * words. A stop is stored as an index, so every index from Viborg's on now
 * names a different city and has to move. The `wrapped` ledger is keyed by
 * wordId and is left exactly as it is: the hundred words that went with the
 * tenth city simply stop being counted by anything, and every other wrap still
 * counts for the same word. Nothing is deleted from it — an add-only ledger
 * that starts subtracting is a bug waiting for the dataset to grow back.
 *
 * `arrivedAt` is keyed by index too, so it moves with the same rule, ascending
 * and first-write-wins. Viborg's own arrival lands on Aarhus, which normally
 * already has one and keeps it: a real arrival is never overwritten by the
 * arrival at a city that no longer exists.
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
  if (from >= 5) return persisted
  if (from === 4) return stampRoute(persisted, DEFAULT_LANGUAGE)
  let state = persisted
  if (from < 3) {
    const { banked, stamps, trialsSpent, activeExam, lastPaper, ...rest } = (persisted ?? {}) as {
      banked?: Record<string, number>
      stamps?: unknown
      trialsSpent?: unknown
      activeExam?: unknown
      lastPaper?: unknown
    } & Record<string, unknown>
    void stamps, trialsSpent, activeExam, lastPaper
    state = { ...rest, wrapped: banked ?? {} }
  }

  const { cityIndex, arrivedAt, ...rest } = (state ?? {}) as {
    cityIndex?: number
    arrivedAt?: Record<string, number>
  } & Record<string, unknown>

  const moved: Record<number, number> = {}
  for (const key of Object.keys(arrivedAt ?? {})
    .map(Number)
    .filter((n) => Number.isInteger(n) && n >= 0)
    .sort((a, b) => a - b)) {
    const to = shiftPastViborg(key)
    if (!(to in moved)) moved[to] = arrivedAt![key]!
  }

  return stampRoute(
    {
      ...rest,
      cityIndex: shiftPastViborg(cityIndex ?? 0),
      arrivedAt: moved,
    },
    DEFAULT_LANGUAGE,
  )
}

/**
 * v4 -> v5: the journey position learns which route it is a position ON.
 *
 * The whole migration is two fields added. `cityIndex`, `arrivedAt` and above
 * all `wrapped` are copied through untouched — and that is the point rather
 * than an economy. Every save in existence is Danish, so folding it into the
 * `da` namespace is exactly "say it is Danish and change nothing", and a
 * migration that names no existing field cannot lose one. A player's wrapped
 * words are safe here by construction, not by care.
 *
 * The obvious alternative was to nest the position under a
 * `routes: { da: {...} }` map. It reads tidier and it would have rewritten
 * every save to get there, for a save shape no second language needs: only one
 * route is ever live, and the others are parked.
 */
function stampRoute(persisted: unknown, code: LanguageCode): unknown {
  return { ...((persisted ?? {}) as Record<string, unknown>), routeLanguage: code, parked: {} }
}

/**
 * Park the position on the route being left and pick up the one on the route
 * being joined — or start that route at its first stop if it has never been
 * travelled.
 *
 * Pure and exported so it can be tested against a second language, which is
 * the only way to test it at all while Danish is the only pack that ships. A
 * seam that only Danish ever exercises is a seam that will not fit German.
 */
/** The shape `switchRoute` needs: a live position, its stamp, and the parked ones. */
type Travelling = RoutePosition & {
  routeLanguage: LanguageCode
  parked: Partial<Record<LanguageCode, RoutePosition>>
}

export function switchRoute<T extends Travelling>(state: T, to: LanguageCode): T {
  if (state.routeLanguage === to) return state
  const resumed = state.parked[to] ?? { cityIndex: 0, arrivedAt: {} }
  const parked = { ...state.parked }
  delete parked[to]
  parked[state.routeLanguage] = { cityIndex: state.cityIndex, arrivedAt: state.arrivedAt }
  return {
    ...state,
    cityIndex: resumed.cityIndex,
    arrivedAt: resumed.arrivedAt,
    routeLanguage: to,
    parked,
  }
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
    {
      name: 'cluecab-journey-v2',
      version: 5,
      migrate: migrateJourney,
      /**
       * The language may have changed since this save was written — the picker
       * reloads the app, so by the time we get here `ACTIVE` is already the new
       * one. Swapping at rehydrate rather than at the moment of the tap means
       * there is exactly one place the two positions ever trade, and it runs
       * before any screen has read the store.
       */
      onRehydrateStorage: () => (state) => {
        if (state && state.routeLanguage !== ACTIVE.code) {
          useJourney.setState(switchRoute(state, ACTIVE.code))
        }
      },
    },
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
