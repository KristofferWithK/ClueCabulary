import { describe, expect, it } from 'vitest'
import { WORDS, curriculumRank } from '../data/words'
import type { WordEntry } from '../data/types'
import { applyRoundResults, newStats } from '../srs/scheduler'
import type { SrsMap, WordStats } from '../srs/types'
import { CITIES, STUDY_UNTIL_CITY, WORDS_PER_CITY } from './cities'
import {
  WRAP_TO_TRAVEL,
  canTravel,
  cityBand,
  countCollection,
  countWrapped,
  isCollected,
  isJourneyComplete,
  studyPhaseEnabled,
  unlockedWords,
  wordState,
  wordsForCity,
} from './progress'

const NOW = 1_700_000_000_000
const stats = (over: Partial<WordStats> = {}): WordStats => ({ ...newStats(NOW), ...over })

const srsWith = (words: readonly WordEntry[], over: Partial<WordStats>): SrsMap =>
  Object.fromEntries(words.map((w) => [w.id, stats(over)]))

/** A word that has earned its green each way. */
const COLLECTED: Partial<WordStats> = { greenByClue: 1, greenByGuess: 1 }

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
  })

  it('band ranges are contiguous and ordered', () => {
    expect(cityBand(0)).toEqual([1, 100])
    // cityBand is pure arithmetic and will answer for a stop that does not
    // exist, so the last one is asked for by name — otherwise this line went
    // on cheerfully describing a tenth city after the tenth city was gone.
    expect(cityBand(CITIES.length - 1)).toEqual([801, 900])
    for (let c = 1; c < CITIES.length; c++) {
      expect(cityBand(c)[0]).toBe(cityBand(c - 1)[1] + 1)
    }
  })
})

describe('unlockedWords', () => {
  it('grows by exactly one band per city and never leaks locked words', () => {
    for (let c = 0; c < CITIES.length; c++) {
      const pool = unlockedWords(WORDS, c)
      expect(pool.length).toBe((c + 1) * WORDS_PER_CITY)
      // Cities slice the TEACHING order, which the first city departs from
      // deliberately: its hundred words are curated for clueability.
      expect(Math.max(...pool.map(curriculumRank))).toBe((c + 1) * WORDS_PER_CITY)
    }
  })
})

describe('the four collection states', () => {
  const cases: [WordStats | undefined, boolean, string, string][] = [
    [undefined, false, 'undiscovered', 'never met'],
    [stats(), false, 'discovered', 'seen but never green'],
    [stats({ greenByClue: 2 }), false, 'discovered', 'clued twice, never guessed'],
    [stats({ greenByGuess: 2 }), false, 'discovered', 'guessed twice, never clued'],
    [stats({ correctGuesses: 9 }), false, 'discovered', 'greens alone do not collect'],
    [stats(COLLECTED), false, 'collected', 'one green each way'],
    [stats({ ...COLLECTED, misses: 9 }), false, 'collected', 'misses cannot uncollect'],
    [stats(), true, 'wrapped', 'the ledger outranks the counters'],
    [undefined, true, 'wrapped', 'wrapped even with no stats'],
  ]
  it.each(cases)('%#: %s', (s, wrapped, expected) => {
    expect(wordState(s, wrapped)).toBe(expected)
  })

  it('isCollected is collected-or-better', () => {
    expect(isCollected(stats(COLLECTED), false)).toBe(true)
    expect(isCollected(stats(), true)).toBe(true)
    expect(isCollected(stats({ greenByClue: 3 }), false)).toBe(false)
    expect(isCollected(undefined, false)).toBe(false)
  })

  it('never regresses across many rounds of real SRS updates', () => {
    const order = ['undiscovered', 'discovered', 'collected', 'wrapped']
    let srs: SrsMap = {}
    let best = 0
    for (let round = 0; round < 50; round++) {
      srs = applyRoundResults(
        srs,
        [
          {
            wordId: 'w',
            guessedGreen: round % 3 !== 0,
            guessedWrong: round % 3 === 0,
            greenByOwnClue: round % 2 === 0 && round % 3 !== 0,
            greenByOwnGuess: round % 2 !== 0 && round % 3 !== 0,
            lookedUp: false,
          },
        ],
        NOW + round * 1000,
      )
      const now = order.indexOf(wordState(srs.w, false))
      expect(now).toBeGreaterThanOrEqual(best)
      best = now
    }
    expect(best).toBe(order.indexOf('collected'))
  })

  it('counts split cleanly and always sum to the whole', () => {
    const city = wordsForCity(WORDS, 0)
    const srs = {
      ...srsWith(city.slice(0, 10), COLLECTED),
      ...srsWith(city.slice(10, 35), { greenByGuess: 1 }),
    }
    const wrapped = Object.fromEntries(city.slice(90, 95).map((w) => [w.id, NOW]))
    const counts = countCollection(city, srs, wrapped)
    expect(counts.collected).toBe(10)
    expect(counts.wrapped).toBe(5)
    expect(counts.discovered).toBe(25)
    expect(counts.undiscovered).toBe(60)
    expect(
      counts.collected + counts.wrapped + counts.discovered + counts.undiscovered,
    ).toBe(counts.total)
  })

  it('a collected word that gets wrapped counts once, as wrapped', () => {
    const city = wordsForCity(WORDS, 0)
    const srs = srsWith(city.slice(0, 3), COLLECTED)
    const wrapped = { [city[0]!.id]: NOW }
    const counts = countCollection(city.slice(0, 3), srs, wrapped)
    expect(counts).toMatchObject({ wrapped: 1, collected: 2, total: 3 })
  })
})

describe('wrapping and travel', () => {
  const city = wordsForCity(WORDS, 0)
  const wrappedOf = (n: number) => Object.fromEntries(city.slice(0, n).map((w) => [w.id, NOW]))

  it('the road opens at exactly WRAP_TO_TRAVEL wrapped words, not one sooner', () => {
    expect(canTravel(WORDS, wrappedOf(WRAP_TO_TRAVEL - 1), 0)).toBe(false)
    expect(canTravel(WORDS, wrappedOf(WRAP_TO_TRAVEL), 0)).toBe(true)
  })

  it('counts only the city in question', () => {
    // A packed Sønderborg says nothing about Ribe.
    expect(canTravel(WORDS, wrappedOf(WRAP_TO_TRAVEL), 1)).toBe(false)
    expect(countWrapped(wordsForCity(WORDS, 1), wrappedOf(WRAP_TO_TRAVEL))).toBe(0)
  })

  it('the journey completes only after the final city packs its suitcase', () => {
    const last = CITIES.length - 1
    const lastCity = wordsForCity(WORDS, last)
    const wrapped = Object.fromEntries(lastCity.map((w) => [w.id, NOW]))
    expect(isJourneyComplete(WORDS, {}, last)).toBe(false)
    expect(isJourneyComplete(WORDS, wrapped, last)).toBe(true)
    expect(isJourneyComplete(WORDS, wrapped, last - 1)).toBe(false)
  })
})

describe('studyPhaseEnabled', () => {
  it('auto: scaffolds the early stops, then withdraws', () => {
    for (let city = 0; city < CITIES.length; city++) {
      expect(studyPhaseEnabled('auto', city)).toBe(city < STUDY_UNTIL_CITY)
    }
  })

  it('the setting overrides the ramp in both directions', () => {
    expect(studyPhaseEnabled('always', CITIES.length - 1)).toBe(true)
    expect(studyPhaseEnabled('never', 0)).toBe(false)
  })
})

describe('cities data', () => {
  it('has unique ids and plausible coordinates', () => {
    expect(new Set(CITIES.map((c) => c.id)).size).toBe(CITIES.length)
    for (const c of CITIES) {
      expect(c.lat).toBeGreaterThan(54.5)
      expect(c.lat).toBeLessThan(58)
      expect(c.lon).toBeGreaterThan(8)
      expect(c.lon).toBeLessThan(13)
      expect(c.blurbTarget.length).toBeGreaterThan(10)
    }
  })

  it('starts in the far south and ends in the capital', () => {
    expect(CITIES[0]!.name).toBe('Sønderborg')
    expect(CITIES[CITIES.length - 1]!.name).toBe('København')
    expect(Math.min(...CITIES.map((c) => c.lat))).toBe(CITIES[0]!.lat)
  })
})
