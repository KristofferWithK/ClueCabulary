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

const V1Schema = z.object({
  state: z.object({
    cityIndex: z.number().int().min(0).max(CITIES.length - 1).catch(0),
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
  recovered?: { cityIndex: number; stamps: number; banked: number }
}

/**
 * Pure half: given the raw v1 blob and the journey as it stands, decide what
 * the journey should become.
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
  const stampTotal = Object.values(old.stamps).reduce((a, n) => a + n, 0)
  const bankedCount = Object.keys(old.banked).length
  // Nothing worth rescuing is not a failure — most players never travelled.
  if (old.cityIndex === 0 && stampTotal === 0 && bankedCount === 0) {
    return { outcome: 'nothing-to-rescue' }
  }

  const merged = mergeJourney(current, old)
  const gained =
    merged.cityIndex > current.cityIndex ||
    Object.keys(merged.banked).length > Object.keys(current.banked).length ||
    Object.values(merged.stamps).reduce((a, n) => a + n, 0) >
      Object.values(current.stamps).reduce((a, n) => a + n, 0)
  if (!gained) return { outcome: 'nothing-to-rescue' }

  return {
    outcome: 'rescued',
    journey: merged,
    recovered: { cityIndex: old.cityIndex, stamps: stampTotal, banked: bankedCount },
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
