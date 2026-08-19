import { describe, expect, it } from 'vitest'
import type { JourneyBackup } from '../backup/backup'
import { CITIES } from './cities'
import { planRescue } from './rescue'

const NOW = 1_700_000_000_000
const DAY = 86_400_000

const empty = (): JourneyBackup => ({ cityIndex: 0, wrapped: {}, arrivedAt: {} })

/** The raw v1 blob keeps its ORIGINAL shape — that is what the old key holds. */
const v1 = (state: Partial<Record<string, unknown>>) =>
  JSON.stringify({
    state: { cityIndex: 0, stamps: {}, banked: {}, trialsSpent: {}, arrivedAt: {}, ...state },
    version: 1,
  })

describe('rescuing progress stranded by the v1 -> v2 key rename', () => {
  it('gives back a journey the rename abandoned, banked words arriving wrapped', () => {
    const r = planRescue(
      v1({
        cityIndex: 3,
        stamps: { 0: 5, 1: 5, 2: 5, 3: 2 },
        banked: { hus: NOW - DAY, kat: NOW },
        trialsSpent: { 3: 4 },
        arrivedAt: { 3: NOW - DAY },
      }),
      empty(),
    )
    expect(r.outcome).toBe('rescued')
    expect(r.journey!.cityIndex).toBe(3)
    expect(r.journey!.wrapped).toEqual({ hus: NOW - DAY, kat: NOW })
    expect(r.recovered).toEqual({ cityIndex: 3, banked: 2 })
  })

  it('can only add: progress made since the rename survives', () => {
    const since: JourneyBackup = {
      cityIndex: 5,
      wrapped: { ost: NOW },
      arrivedAt: { 5: NOW },
    }
    const r = planRescue(v1({ cityIndex: 2, banked: { hus: NOW - DAY } }), since)
    expect(r.outcome).toBe('rescued')
    // Never travels the player backwards.
    expect(r.journey!.cityIndex).toBe(5)
    // Keeps both sets of packed words.
    expect(Object.keys(r.journey!.wrapped).sort()).toEqual(['hus', 'ost'])
  })

  it('does nothing when there is nothing to give back', () => {
    expect(planRescue(null, empty()).outcome).toBe('nothing-to-rescue')
    expect(planRescue(v1({}), empty()).outcome).toBe('nothing-to-rescue')
    expect(planRescue('not json', empty()).outcome).toBe('nothing-to-rescue')
    expect(planRescue('{"nope":1}', empty()).outcome).toBe('nothing-to-rescue')
  })

  it('does nothing when the old key holds less than the player already has', () => {
    const ahead: JourneyBackup = {
      cityIndex: 4,
      wrapped: { hus: NOW, kat: NOW },
      arrivedAt: {},
    }
    const r = planRescue(v1({ cityIndex: 1, banked: { hus: NOW } }), ahead)
    expect(r.outcome).toBe('nothing-to-rescue')
  })

  it('is idempotent: rescuing the result again changes nothing', () => {
    const blob = v1({ cityIndex: 3, banked: { hus: NOW } })
    const once = planRescue(blob, empty())
    const twice = planRescue(blob, once.journey!)
    expect(twice.outcome).toBe('nothing-to-rescue')
  })

  it('clamps a city index that would blank the app', () => {
    // cityAt throws outside the route; a corrupted old blob must not become a
    // permanent white screen.
    const r = planRescue(v1({ cityIndex: 99, banked: { hus: NOW } }), empty())
    expect(r.outcome).toBe('rescued')
    expect(r.journey!.cityIndex).toBeLessThanOrEqual(CITIES.length - 1)
    expect(r.journey!.cityIndex).toBeGreaterThanOrEqual(0)
  })

  /**
   * A v1 blob was written when the route ran to ten stops, so the last of them
   * is one past the end of this route. Clamping is the difference between
   * finishing at the capital and being started over.
   */
  it('a traveller at the old final stop lands on the new one, not back at the start', () => {
    const r = planRescue(v1({ cityIndex: 9, banked: { hus: NOW } }), empty())
    expect(r.outcome).toBe('rescued')
    expect(r.journey!.cityIndex).toBe(CITIES.length - 1)
  })

  it('survives a blob with fields of the wrong type', () => {
    const junk = JSON.stringify({
      state: { cityIndex: 'three', stamps: 'lots', banked: null, trialsSpent: [], arrivedAt: 7 },
    })
    // Every field falls back rather than throwing, and with nothing salvageable
    // there is nothing to rescue.
    expect(planRescue(junk, empty()).outcome).toBe('nothing-to-rescue')
  })

  it('salvages what it can from a partly-corrupt blob', () => {
    const half = JSON.stringify({
      state: { cityIndex: 4, stamps: 'lots', banked: { hus: NOW }, trialsSpent: {}, arrivedAt: {} },
    })
    const r = planRescue(half, empty())
    expect(r.outcome).toBe('rescued')
    expect(r.journey!.cityIndex).toBe(4)
    expect(Object.keys(r.journey!.wrapped)).toEqual(['hus'])
  })
})
