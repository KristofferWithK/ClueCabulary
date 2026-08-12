import { describe, expect, it } from 'vitest'
import type { JourneyBackup } from '../backup/backup'
import { CITIES } from './cities'
import { planRescue } from './rescue'

const NOW = 1_700_000_000_000
const DAY = 86_400_000

const empty = (): JourneyBackup => ({
  cityIndex: 0,
  stamps: {},
  banked: {},
  trialsSpent: {},
  arrivedAt: {},
})

const v1 = (state: Partial<JourneyBackup>) =>
  JSON.stringify({ state: { ...empty(), ...state }, version: 1 })

describe('rescuing progress stranded by the v1 -> v2 key rename', () => {
  it('gives back a journey the rename abandoned', () => {
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
    expect(r.journey!.stamps).toEqual({ 0: 5, 1: 5, 2: 5, 3: 2 })
    expect(Object.keys(r.journey!.banked).sort()).toEqual(['hus', 'kat'])
    expect(r.recovered).toEqual({ cityIndex: 3, stamps: 17, banked: 2 })
  })

  it('can only add: progress made since the rename survives', () => {
    const since: JourneyBackup = {
      cityIndex: 5,
      stamps: { 0: 5, 4: 5, 5: 3 },
      banked: { ost: NOW },
      trialsSpent: { 5: 9 },
      arrivedAt: { 5: NOW },
    }
    const r = planRescue(
      v1({ cityIndex: 2, stamps: { 0: 5, 1: 5, 2: 1 }, banked: { hus: NOW - DAY }, trialsSpent: { 5: 1 } }),
      since,
    )
    expect(r.outcome).toBe('rescued')
    // Never travels the player backwards, and never refunds an attempt.
    expect(r.journey!.cityIndex).toBe(5)
    expect(r.journey!.trialsSpent[5]).toBe(9)
    // Keeps both sets of stamps and both banked words.
    expect(r.journey!.stamps).toEqual({ 0: 5, 1: 5, 2: 1, 4: 5, 5: 3 })
    expect(Object.keys(r.journey!.banked).sort()).toEqual(['hus', 'ost'])
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
      stamps: { 0: 5, 1: 5 },
      banked: { hus: NOW, kat: NOW },
      trialsSpent: {},
      arrivedAt: {},
    }
    const r = planRescue(v1({ cityIndex: 1, stamps: { 0: 5 }, banked: { hus: NOW } }), ahead)
    expect(r.outcome).toBe('nothing-to-rescue')
  })

  it('a paper drawn for the old city must not follow the player to the new one', () => {
    // The exam screen stamps the paper's own city, and the rescue drops any
    // paper that no longer belongs where the player stands — together those
    // stop a Sonderborg paper stamping Aarhus.
    const r = planRescue(v1({ cityIndex: 3, stamps: { 3: 1 } }), empty())
    expect(r.outcome).toBe('rescued')
    expect(r.journey!.cityIndex).toBe(3)
  })

  it('is idempotent: rescuing the result again changes nothing', () => {
    const blob = v1({ cityIndex: 3, stamps: { 0: 5, 3: 1 }, banked: { hus: NOW } })
    const once = planRescue(blob, empty())
    const twice = planRescue(blob, once.journey!)
    expect(twice.outcome).toBe('nothing-to-rescue')
  })

  it('clamps a city index that would blank the app', () => {
    // cityAt throws outside the route; a corrupted old blob must not become a
    // permanent white screen.
    const r = planRescue(v1({ cityIndex: 99, stamps: { 0: 5 } }), empty())
    expect(r.outcome).toBe('rescued')
    expect(r.journey!.cityIndex).toBeLessThanOrEqual(CITIES.length - 1)
    expect(r.journey!.cityIndex).toBeGreaterThanOrEqual(0)
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
    expect(Object.keys(r.journey!.banked)).toEqual(['hus'])
  })
})
