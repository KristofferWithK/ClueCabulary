import { z } from 'zod'
import { mergeJourney, type JourneyBackup } from '../backup/backup'
import { CITIES } from './cities'

/**
 * The journey was persisted under `cluecab-journey-v1`, shipped, and then
 * renamed to v2 with no migration. Everyone who had travelled anywhere lost
 * their city, their stempler and their banked words on the next update —
 * silently, because zustand simply found nothing at the new key and started
 * from zero. Their word statistics survived, under a key that never moved.
 *
 * This reads the abandoned key and folds it back in. It runs at most once per
 * device, never deletes the old key, and merges by the same rules as a backup
 * restore, so it cannot cost anyone anything they have since earned.
 */
export const V1_KEY = 'cluecab-journey-v1'
export const RESCUE_KEY = 'cluecab-journey-rescued-v1'

/**
 * Clamped rather than rejected. A v1 blob was written when the route had ten
 * stops, so the last of them is a number this route does not have — and
 * failing the field sends it to 0, which hands a traveller who had reached the
 * end of Denmark a rescue that starts them over. The index is only ever a
 * floor here (mergeJourney takes the better of the two), so the safe reading
 * of an index past the end is the end.
 */
const clampedCity = z
  .number()
  .int()
  .catch(0)
  .transform((i) => Math.min(Math.max(i, 0), CITIES.length - 1))

const V1Schema = z.object({
  state: z.object({
    cityIndex: clampedCity,
    stamps: z.record(z.string(), z.number()).catch({}),
    banked: z.record(z.string(), z.number()).catch({}),
    trialsSpent: z.record(z.string(), z.number()).catch({}),
    arrivedAt: z.record(z.string(), z.number()).catch({}),
  }),
})

export type RescueOutcome = 'rescued' | 'nothing-to-rescue' | 'already-done'

export interface RescueResult {
  outcome: RescueOutcome
  journey?: JourneyBackup
  /** What was actually recovered, for telling the player. */
  recovered?: { cityIndex: number; banked: number }
}

/**
 * Pure half: given the raw v1 blob and the journey as it stands, decide what
 * the journey should become. The v1 blob predates the wrapped ledger, so its
 * banked words come back as wrapped — the same rule the store migration
 * applies — and its stamps and spent attempts have nothing to become.
 */
export function planRescue(raw: string | null, current: JourneyBackup): RescueResult {
  if (!raw) return { outcome: 'nothing-to-rescue' }
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { outcome: 'nothing-to-rescue' }
  }
  const v1 = V1Schema.safeParse(parsed)
  if (!v1.success) return { outcome: 'nothing-to-rescue' }

  const old = v1.data.state
  const bankedCount = Object.keys(old.banked).length
  // Nothing worth rescuing is not a failure — most players never travelled.
  if (old.cityIndex === 0 && bankedCount === 0) {
    return { outcome: 'nothing-to-rescue' }
  }

  const merged = mergeJourney(current, {
    cityIndex: old.cityIndex,
    wrapped: old.banked,
    arrivedAt: old.arrivedAt,
  })
  const gained =
    merged.cityIndex > current.cityIndex ||
    Object.keys(merged.wrapped).length > Object.keys(current.wrapped).length
  if (!gained) return { outcome: 'nothing-to-rescue' }

  return {
    outcome: 'rescued',
    journey: merged,
    recovered: { cityIndex: old.cityIndex, banked: bankedCount },
  }
}

/** Whether this device has already been through the rescue. */
export function alreadyRescued(storage: Storage): boolean {
  try {
    return storage.getItem(RESCUE_KEY) !== null
  } catch {
    return true
  }
}

export function markRescued(storage: Storage): void {
  try {
    storage.setItem(RESCUE_KEY, String(Date.now()))
  } catch {
    // A full or blocked storage is not worth failing a launch over.
  }
}

export function readV1(storage: Storage): string | null {
  try {
    return storage.getItem(V1_KEY)
  } catch {
    return null
  }
}
