import { beforeEach, describe, expect, it } from 'vitest'
import { CITIES } from '../journey/cities'
import { WORDS } from '../data/words'
import { canTravel, wordsForCity } from '../journey/progress'
import { migrateJourney, switchRoute, useJourney } from './journeyStore'

const NOW = 1_700_000_000_000
const DAY = 86_400_000

describe('journeyStore', () => {
  beforeEach(() => useJourney.getState().reset())

  describe('wrapping words', () => {
    it('packs them with a timestamp', () => {
      useJourney.getState().wrapWords(['a', 'b'], NOW)
      expect(useJourney.getState().wrapped).toEqual({ a: NOW, b: NOW })
    })

    it('is add-only: a re-wrap keeps the first time', () => {
      useJourney.getState().wrapWords(['a'], NOW)
      useJourney.getState().wrapWords(['a', 'b'], NOW + 5000)
      expect(useJourney.getState().wrapped).toEqual({ a: NOW, b: NOW + 5000 })
    })
  })

  describe('travel', () => {
    it('moves one stop and records the arrival', () => {
      useJourney.getState().travel(NOW)
      const s = useJourney.getState()
      expect(s.cityIndex).toBe(1)
      expect(s.arrivedAt[1]).toBe(NOW)
    })

    it('stops at the end of the road', () => {
      for (let i = 0; i < 20; i++) useJourney.getState().travel(NOW + i)
      expect(useJourney.getState().cityIndex).toBe(CITIES.length - 1)
    })
  })
})

/**
 * v2 -> v3 is the exam economy ceasing to be, and it runs against real saved
 * blobs on real phones. The fixture below is the v2 shape byte-for-byte: every
 * field the store persisted, exactly as `persist` stored it. Mutation-checked:
 * dropping the `wrapped: banked` line in migrateJourney fails the first test.
 *
 * A v2 blob now runs the whole chain to v4. This fixture sits at stop 2, ahead
 * of the stop that left, so the second step is a no-op on it and these
 * assertions still say what they said.
 */
describe('migrateJourney (v2 -> v4)', () => {
  const v2Blob = () => ({
    cityIndex: 2,
    stamps: { 0: 5, 1: 5, 2: 1 },
    banked: { hus: NOW - DAY, kat: NOW },
    trialsSpent: { 2: 3 },
    arrivedAt: { 1: NOW - 5 * DAY, 2: NOW - DAY },
    activeExam: { cityIndex: 2, wordIds: ['hus'], answers: { hus: 'house' } },
    lastPaper: ['hus'],
  })

  it('banked words become wrapped, timestamps intact', () => {
    const out = migrateJourney(v2Blob(), 2) as { wrapped: Record<string, number> }
    expect(out.wrapped).toEqual({ hus: NOW - DAY, kat: NOW })
  })

  it('keeps the city and the travel log', () => {
    const out = migrateJourney(v2Blob(), 2) as Record<string, unknown>
    expect(out.cityIndex).toBe(2)
    expect(out.arrivedAt).toEqual({ 1: NOW - 5 * DAY, 2: NOW - DAY })
  })

  it('the exam economy has nothing to become, and is gone', () => {
    const out = migrateJourney(v2Blob(), 2) as Record<string, unknown>
    for (const dead of ['stamps', 'banked', 'trialsSpent', 'activeExam', 'lastPaper']) {
      expect(out).not.toHaveProperty(dead)
    }
  })

  it('passes a v5 blob through untouched', () => {
    const blob = {
      cityIndex: 1,
      wrapped: { hus: NOW },
      arrivedAt: {},
      routeLanguage: 'da',
      parked: {},
    }
    expect(migrateJourney(blob, 5)).toBe(blob)
  })

  it('survives an empty or absent state', () => {
    const empty = { wrapped: {}, cityIndex: 0, arrivedAt: {}, routeLanguage: 'da', parked: {} }
    expect(migrateJourney(undefined, 2)).toEqual(empty)
    expect(migrateJourney({}, 2)).toEqual(empty)
  })
})

/**
 * v3 -> v4 is Viborg leaving the route, and it is the migration with a person
 * standing in it. A stop is a stored index, so removing the fifth city renames
 * every index from four up, and a save written yesterday points at the wrong
 * town today.
 *
 * The rule is: at Viborg or past it, go back one. Backward is the direction
 * that cannot cost anything, and the last test here is the reason — a stop is
 * only reachable by wrapping every word before it, so the stop a shifted
 * player lands on is always one they have already finished, and the road on is
 * open the moment they look at it.
 *
 * Mutation-checked, both halves: making the shift `index > VIBORG_INDEX`
 * (leaving Viborg where it stands) fails 'Viborg itself falls back to Aarhus',
 * and dropping the `Math.min(shifted, FINAL_CITY_INDEX)` clamp fails 'the old
 * final stop lands on the new one'.
 */
describe('migrateJourney (v3 -> v4): Viborg leaves the route', () => {
  const v3 = (over: Record<string, unknown> = {}) => ({
    cityIndex: 0,
    wrapped: {},
    arrivedAt: {},
    ...over,
  })
  const shift = (cityIndex: number) =>
    (migrateJourney(v3({ cityIndex }), 3) as { cityIndex: number }).cityIndex

  it('leaves the stops before Viborg exactly where they were', () => {
    for (const i of [0, 1, 2, 3]) expect(shift(i)).toBe(i)
  })

  it('Viborg itself falls back to Aarhus, never on to Aalborg', () => {
    expect(shift(4)).toBe(3)
    expect(CITIES[3]!.name).toBe('Aarhus')
  })

  it('every stop after Viborg keeps its city under a new number', () => {
    // The old route, from Viborg's neighbour to the capital.
    const after = ['Aalborg', 'Skagen', 'Odense', 'Roskilde', 'København']
    for (const [n, name] of after.entries()) {
      expect(CITIES[shift(5 + n)]!.name).toBe(name)
    }
  })

  it('the old final stop lands on the new one', () => {
    expect(shift(9)).toBe(CITIES.length - 1)
    expect(shift(99)).toBe(CITIES.length - 1)
  })

  it('the wrapped ledger is not rewritten — it is keyed by word, not by city', () => {
    const wrapped = { 'da:hus': NOW, 'da:appelsin': NOW - DAY }
    const out = migrateJourney(v3({ cityIndex: 7, wrapped }), 3) as {
      wrapped: Record<string, number>
    }
    // 'appelsin' was trimmed with the tenth city's hundred. It stops counting
    // toward anything and it is still left alone, because a ledger that starts
    // deleting is one the dataset can never grow back into.
    expect(out.wrapped).toEqual(wrapped)
  })

  it('the travel log follows the cities it describes', () => {
    const out = migrateJourney(
      v3({ cityIndex: 6, arrivedAt: { 1: 101, 2: 102, 3: 103, 5: 105, 6: 106 } }),
      3,
    ) as { arrivedAt: Record<number, number> }
    expect(out.arrivedAt).toEqual({ 1: 101, 2: 102, 3: 103, 4: 105, 5: 106 })
  })

  it('an arrival at Viborg never overwrites the real arrival at Aarhus', () => {
    const out = migrateJourney(v3({ cityIndex: 4, arrivedAt: { 3: 103, 4: 104 } }), 3) as {
      arrivedAt: Record<number, number>
    }
    expect(out.arrivedAt).toEqual({ 3: 103 })
  })

  /**
   * The one that matters. Two travellers, both standing in Viborg: one who had
   * packed its whole hundred, one who was halfway through. Neither may end up
   * stuck behind a gate, and neither may be carried past words they have not
   * been shown.
   */
  describe('a traveller who was standing in Viborg', () => {
    const bandIds = (city: number) => wordsForCity(WORDS, city).map((w) => w.id)
    /** Everything up to and including the old Viborg band, or part of it. */
    const packed = (throughOldViborg: number) => {
      const ids = [0, 1, 2, 3].flatMap(bandIds).concat(bandIds(4).slice(0, throughOldViborg))
      return Object.fromEntries(ids.map((id) => [id, NOW]))
    }

    it('having packed all hundred, walks out in two taps and skips nothing', () => {
      const wrapped = packed(100)
      const out = migrateJourney(v3({ cityIndex: 4, wrapped }), 3) as { cityIndex: number }
      expect(out.cityIndex).toBe(3)
      // Aarhus: finished long ago, so the road is open the moment they arrive.
      expect(canTravel(WORDS, wrapped, 3)).toBe(true)
      // Aalborg now owns the hundred Viborg owned, and they are packed too.
      expect(canTravel(WORDS, wrapped, 4)).toBe(true)
      // Skagen is where the new words start. Nobody was carried past them.
      expect(canTravel(WORDS, wrapped, 5)).toBe(false)
    })

    it('having packed half of them, resumes on exactly those words', () => {
      const wrapped = packed(50)
      const out = migrateJourney(v3({ cityIndex: 4, wrapped }), 3) as { cityIndex: number }
      expect(out.cityIndex).toBe(3)
      expect(canTravel(WORDS, wrapped, 3)).toBe(true)
      // One tap forward and the half-packed hundred is in front of them again,
      // still half-packed: same words, same progress, new name over the door.
      expect(canTravel(WORDS, wrapped, 4)).toBe(false)
      expect(bandIds(4).filter((id) => id in wrapped)).toHaveLength(50)
    })
  })
})

/**
 * v4 -> v5: the journey position learns which route it is on.
 *
 * THE THING THAT MUST NOT HAPPEN: a player loses a wrapped word. The whole
 * collection lives in one phone's localStorage, months of work with no way
 * back, and moving progress between storage keys is the one mistake here that
 * has actually cost somebody theirs (src/journey/rescue.ts).
 *
 * So the migration adds two fields and names none of the existing ones, and
 * this suite checks that against a full save rather than a toy one.
 */
describe('migrateJourney (v4 -> v5): the route gets a language', () => {
  /** A realistic mid-journey save: five cities done, 500 words packed. */
  const fullSave = () => ({
    cityIndex: 5,
    wrapped: Object.fromEntries(
      WORDS.slice(0, 500).map((w, i) => [w.id, NOW - (500 - i) * DAY]),
    ),
    arrivedAt: { 0: NOW - 400 * DAY, 1: NOW - 300 * DAY, 5: NOW - DAY },
  })

  it('keeps every wrapped word, byte for byte', () => {
    const before = fullSave()
    const after = migrateJourney(structuredClone(before), 4) as {
      wrapped: Record<string, number>
    }
    expect(Object.keys(after.wrapped)).toHaveLength(500)
    expect(after.wrapped).toEqual(before.wrapped)
  })

  it('keeps the journey position and the travel log', () => {
    const before = fullSave()
    const after = migrateJourney(structuredClone(before), 4) as Record<string, unknown>
    expect(after.cityIndex).toBe(5)
    expect(after.arrivedAt).toEqual(before.arrivedAt)
  })

  it('adds the stamp and nothing else at all', () => {
    const before = fullSave()
    const after = migrateJourney(structuredClone(before), 4) as Record<string, unknown>
    expect(after).toEqual({ ...before, routeLanguage: 'da', parked: {} })
  })

  it('still travels from where it left off', () => {
    const before = fullSave()
    const after = migrateJourney(structuredClone(before), 4) as {
      cityIndex: number
      wrapped: Record<string, number>
    }
    // Five cities of a hundred are packed, so the road out of the fifth is
    // open and the sixth is untouched — exactly as before the migration.
    expect(canTravel(WORDS, after.wrapped, 4)).toBe(true)
    expect(canTravel(WORDS, after.wrapped, 5)).toBe(false)
  })

  it('carries a pre-Viborg save all the way through and still loses nothing', () => {
    // The long road: a v2 blob crosses the exam economy, Viborg's removal and
    // now the language stamp, in one call.
    const wrapped = Object.fromEntries(WORDS.slice(0, 300).map((w) => [w.id, NOW]))
    const out = migrateJourney({ cityIndex: 6, banked: wrapped, arrivedAt: { 6: NOW } }, 2) as {
      cityIndex: number
      wrapped: Record<string, number>
      routeLanguage: string
    }
    expect(out.cityIndex).toBe(5)
    expect(Object.keys(out.wrapped)).toHaveLength(300)
    expect(out.routeLanguage).toBe('da')
  })
})

/**
 * Parking one route to travel another.
 *
 * Tested with 'de', which has no pack behind it, because that is the only way
 * to test it at all while Danish is the only language that ships — and a seam
 * only Danish ever exercises is a seam that will not fit German.
 */
describe('switchRoute', () => {
  const start = () => ({
    cityIndex: 5,
    arrivedAt: { 0: NOW, 5: NOW + DAY },
    routeLanguage: 'da' as const,
    parked: {} as Partial<Record<'da' | 'de', { cityIndex: number; arrivedAt: Record<number, number> }>>,
    wrapped: { 'da:hus': NOW },
  })

  it('is a no-op for the route already being travelled', () => {
    const s = start()
    expect(switchRoute(s, 'da')).toBe(s)
  })

  it('starts an untravelled route at its first stop', () => {
    const out = switchRoute(start(), 'de')
    expect(out.cityIndex).toBe(0)
    expect(out.arrivedAt).toEqual({})
    expect(out.routeLanguage).toBe('de')
  })

  it('parks the route it left, and gives it back unchanged on return', () => {
    const before = start()
    const away = switchRoute(before, 'de')
    expect(away.parked.da).toEqual({ cityIndex: 5, arrivedAt: before.arrivedAt })
    const back = switchRoute({ ...away, cityIndex: 2, arrivedAt: { 0: NOW, 2: NOW } }, 'da')
    expect(back.cityIndex).toBe(5)
    expect(back.arrivedAt).toEqual(before.arrivedAt)
    // And the German position is now the parked one.
    expect(back.parked.de).toEqual({ cityIndex: 2, arrivedAt: { 0: NOW, 2: NOW } })
    expect(back.parked.da).toBeUndefined()
  })

  it('never touches the wrapped ledger, in either direction', () => {
    const before = start()
    const away = switchRoute(before, 'de')
    expect(away.wrapped).toEqual(before.wrapped)
    expect(switchRoute(away, 'da').wrapped).toEqual(before.wrapped)
  })
})
