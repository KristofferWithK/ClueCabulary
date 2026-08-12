import { describe, expect, it } from 'vitest'
import { WORDS } from '../data/words'
import type { WordEntry } from '../data/types'
import { applyRoundResults, newStats } from '../srs/scheduler'
import type { SrsMap, WordStats } from '../srs/types'
import { CITIES, GATES_PER_CITY, GATE_SIZE, WORDS_PER_CITY } from './cities'
import {
  canTravel,
  cityBand,
  cityGateStatuses,
  collectedCount,
  currentGateIndex,
  gateStatus,
  isCollected,
  isJourneyComplete,
  mergeCollected,
  unlockedWords,
  waveWords,
  wordsForCity,
  type JourneyState,
} from './progress'

const NOW = 1_700_000_000_000
const stats = (over: Partial<WordStats> = {}): WordStats => ({ ...newStats(NOW), ...over })
const journey = (over: Partial<JourneyState> = {}): JourneyState => ({
  cityIndex: 0,
  gatesPassed: {},
  ...over,
})

/** Collect every given word so gates open. */
const collectAll = (words: readonly WordEntry[]): Set<string> =>
  new Set(words.map((w) => w.id))

const srsAll = (words: readonly WordEntry[]): SrsMap =>
  Object.fromEntries(words.map((w) => [w.id, stats({ correctGuesses: 2 })]))

describe('city bands', () => {
  it('cover the dataset exactly once, 100 words per city', () => {
    const seen = new Set<string>()
    for (let c = 0; c < CITIES.length; c++) {
      const words = wordsForCity(WORDS, c)
      expect(words.length).toBe(WORDS_PER_CITY)
      for (const w of words) {
        expect(seen.has(w.id)).toBe(false)
        seen.add(w.id)
      }
    }
    expect(seen.size).toBe(WORDS.length)
    expect(CITIES.length * WORDS_PER_CITY).toBe(WORDS.length)
  })

  it('band ranges are contiguous and ordered', () => {
    expect(cityBand(0)).toEqual([1, 100])
    expect(cityBand(9)).toEqual([901, 1000])
    for (let c = 1; c < CITIES.length; c++) {
      expect(cityBand(c)[0]).toBe(cityBand(c - 1)[1] + 1)
    }
  })

  it('the first city teaches the most frequent words', () => {
    const first = wordsForCity(WORDS, 0)
    expect(Math.max(...first.map((w) => w.freqRank))).toBe(100)
  })
})

describe('unlockedWords', () => {
  it('grows by exactly one band per city and never leaks locked words', () => {
    for (let c = 0; c < CITIES.length; c++) {
      const pool = unlockedWords(WORDS, c)
      expect(pool.length).toBe((c + 1) * WORDS_PER_CITY)
      expect(Math.max(...pool.map((w) => w.freqRank))).toBe((c + 1) * WORDS_PER_CITY)
    }
  })

  it('is a superset of every earlier city', () => {
    const early = new Set(unlockedWords(WORDS, 2).map((w) => w.id))
    const later = new Set(unlockedWords(WORDS, 5).map((w) => w.id))
    for (const id of early) expect(later.has(id)).toBe(true)
  })
})

describe('isCollected', () => {
  const cases: [WordStats | undefined, boolean, string][] = [
    [undefined, false, 'never seen'],
    [stats(), false, 'seen but never guessed'],
    [stats({ correctGuesses: 1, lookups: 0 }), true, 'one clean correct guess'],
    [stats({ correctGuesses: 1, lookups: 1 }), false, 'correct but looked up'],
    [stats({ correctGuesses: 2, lookups: 3 }), true, 'proven twice despite lookups'],
    [stats({ correctGuesses: 0, lookups: 9 }), false, 'only looked up'],
    [stats({ correctGuesses: 5, misses: 4 }), true, 'misses do not uncollect'],
  ]
  it.each(cases)('%#: %s', (s, expected) => {
    expect(isCollected(s)).toBe(expected)
  })

  it('never regresses when a word is later missed', () => {
    const before = stats({ correctGuesses: 2 })
    expect(isCollected(before)).toBe(true)
    // A later bad round only raises misses / lowers box — collection holds.
    expect(isCollected({ ...before, misses: 3, box: 0 })).toBe(true)
  })
})

describe('waves and gates', () => {
  it('five disjoint waves of 20 cover a city in frequency order', () => {
    const city = wordsForCity(WORDS, 3)
    const seen: string[] = []
    for (let g = 0; g < GATES_PER_CITY; g++) {
      const wave = waveWords(WORDS, 3, g)
      expect(wave.length).toBe(GATE_SIZE)
      seen.push(...wave.map((w) => w.id))
      // Waves ascend through the band.
      expect(wave[0]!.freqRank).toBe(city[g * GATE_SIZE]!.freqRank)
    }
    expect(new Set(seen).size).toBe(WORDS_PER_CITY)
  })

  it('rejects out-of-range gates', () => {
    expect(() => waveWords(WORDS, 0, -1)).toThrow()
    expect(() => waveWords(WORDS, 0, GATES_PER_CITY)).toThrow()
  })

  it('a gate stays locked until every word of its wave is collected', () => {
    const wave = waveWords(WORDS, 0, 0)
    const almost = collectAll(wave.slice(0, GATE_SIZE - 1))
    expect(gateStatus(WORDS, almost, journey(), 0, 0)).toBe('locked')

    expect(gateStatus(WORDS, collectAll(wave), journey(), 0, 0)).toBe('ready')
  })

  it('a passed gate reports passed even if words are later missed', () => {
    const j = journey({ gatesPassed: { 0: [0] } })
    expect(gateStatus(WORDS, new Set(), j, 0, 0)).toBe('passed')
  })

  it('gate statuses are independent within a city', () => {
    const collected = collectAll(waveWords(WORDS, 0, 2))
    const statuses = cityGateStatuses(WORDS, collected, journey(), 0)
    expect(statuses).toEqual(['locked', 'locked', 'ready', 'locked', 'locked'])
  })
})

describe('travel', () => {
  it('needs all five gates', () => {
    expect(canTravel(journey({ gatesPassed: { 0: [0, 1, 2, 3] } }), 0)).toBe(false)
    expect(canTravel(journey({ gatesPassed: { 0: [0, 1, 2, 3, 4] } }), 0)).toBe(true)
  })

  it('is tracked per city', () => {
    const j = journey({ cityIndex: 1, gatesPassed: { 0: [0, 1, 2, 3, 4] } })
    expect(canTravel(j, 0)).toBe(true)
    expect(canTravel(j, 1)).toBe(false)
  })

  it('the journey completes only after the final city', () => {
    const last = CITIES.length - 1
    expect(isJourneyComplete(journey({ cityIndex: last, gatesPassed: {} }))).toBe(false)
    expect(
      isJourneyComplete(journey({ cityIndex: last, gatesPassed: { [last]: [0, 1, 2, 3, 4] } })),
    ).toBe(true)
  })
})

describe('currentGateIndex', () => {
  it('points at the first unpassed gate', () => {
    const j = journey({ gatesPassed: { 0: [0, 1] } })
    expect(currentGateIndex(WORDS, new Set(), j, 0)).toBe(2)
  })

  it('clamps to the last gate when all are passed', () => {
    const j = journey({ gatesPassed: { 0: [0, 1, 2, 3, 4] } })
    expect(currentGateIndex(WORDS, new Set(), j, 0)).toBe(GATES_PER_CITY - 1)
  })
})

describe('collectedCount', () => {
  it('counts only collected words', () => {
    const city = wordsForCity(WORDS, 0)
    expect(collectedCount(city, collectAll(city.slice(0, 42)))).toBe(42)
  })
})

describe('mergeCollected — the monotonic latch', () => {
  const city = wordsForCity(WORDS, 0)

  it('credits words already proven before the journey existed', () => {
    const latch = mergeCollected({}, srsAll(city.slice(0, 30)), NOW)
    expect(Object.keys(latch).length).toBe(30)
  })

  it('returns the same object when nothing new was collected', () => {
    const srs = srsAll(city.slice(0, 5))
    const first = mergeCollected({}, srs, NOW)
    expect(mergeCollected(first, srs, NOW + 1)).toBe(first)
  })

  it('never drops a word — a later lookup cannot revoke a clean guess', () => {
    const word = city[0]!
    // Collected by the "one clean correct guess" clause…
    const before: SrsMap = { [word.id]: stats({ correctGuesses: 1, lookups: 0 }) }
    const latch = mergeCollected({}, before, NOW)
    expect(latch[word.id]).toBeDefined()

    // …then the player looks it up, which flips the raw predicate false.
    const after: SrsMap = { [word.id]: stats({ correctGuesses: 1, lookups: 1 }) }
    expect(isCollected(after[word.id])).toBe(false)
    expect(mergeCollected(latch, after, NOW + 1)[word.id]).toBeDefined()
  })

  it('grows monotonically across many rounds of real SRS updates', () => {
    let srs: SrsMap = {}
    let latch = mergeCollected({}, srs, NOW)
    let size = 0
    for (let round = 0; round < 200; round++) {
      const picks = city.slice((round * 7) % 80, ((round * 7) % 80) + 12)
      srs = applyRoundResults(
        srs,
        picks.map((w, i) => ({
          wordId: w.id,
          guessedGreen: (round + i) % 3 !== 0,
          guessedWrong: (round + i) % 3 === 0,
          lookedUp: (round + i) % 5 === 0,
        })),
        NOW + round * 1000,
      )
      latch = mergeCollected(latch, srs, NOW + round * 1000)
      expect(Object.keys(latch).length).toBeGreaterThanOrEqual(size)
      size = Object.keys(latch).length
    }
    expect(size).toBeGreaterThan(0)
  })
})

describe('cities data', () => {
  it('has one city per band with unique ids and plausible coordinates', () => {
    expect(new Set(CITIES.map((c) => c.id)).size).toBe(CITIES.length)
    for (const c of CITIES) {
      expect(c.lat).toBeGreaterThan(54.5)
      expect(c.lat).toBeLessThan(58)
      expect(c.lon).toBeGreaterThan(8)
      expect(c.lon).toBeLessThan(13)
      expect(c.blurbDa.length).toBeGreaterThan(10)
      expect(c.blurbEn.length).toBeGreaterThan(10)
    }
  })

  it('starts in the far south and ends in the capital', () => {
    expect(CITIES[0]!.name).toBe('Sønderborg')
    expect(CITIES[CITIES.length - 1]!.name).toBe('København')
    // Sønderborg is the southernmost stop on the route.
    expect(Math.min(...CITIES.map((c) => c.lat))).toBe(CITIES[0]!.lat)
  })
})
