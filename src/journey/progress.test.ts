import { describe, expect, it } from 'vitest'
import { WORDS } from '../data/words'
import type { WordEntry } from '../data/types'
import { mulberry32 } from '../engine/rng'
import { applyRoundResults, newStats } from '../srs/scheduler'
import type { SrsMap, WordStats } from '../srs/types'
import {
  CITIES,
  GATES_PER_CITY,
  GATE_SIZE,
  STUDY_UNTIL_CITY,
  UNLIMITED_TRIALS_AT,
  WORDS_PER_CITY,
} from './cities'
import {
  GREENS_PER_TRIAL,
  LEARN_REPS,
  canTravel,
  cityBand,
  countCollection,
  examComposition,
  examTrials,
  examUnlocked,
  greensToNextTrial,
  examWords,
  isJourneyComplete,
  isLearned,
  stampsFor,
  studyPhaseEnabled,
  unlockedWords,
  wordState,
  wordsForCity,
  type JourneyState,
} from './progress'

const NOW = 1_700_000_000_000
const stats = (over: Partial<WordStats> = {}): WordStats => ({ ...newStats(NOW), ...over })
const journey = (over: Partial<JourneyState> = {}): JourneyState => ({
  cityIndex: 0,
  stamps: {},
  banked: {},
  trialsSpent: {},
  ...over,
})

const srsWith = (words: readonly WordEntry[], over: Partial<WordStats>): SrsMap =>
  Object.fromEntries(words.map((w) => [w.id, stats(over)]))

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
    expect(cityBand(9)).toEqual([901, 1000])
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
      expect(Math.max(...pool.map((w) => w.freqRank))).toBe((c + 1) * WORDS_PER_CITY)
    }
  })
})

describe('the three collection states', () => {
  const cases: [WordStats | undefined, boolean, string, string][] = [
    [undefined, false, 'undiscovered', 'never met'],
    [stats(), false, 'discovered', 'seen but never handled'],
    [stats({ correctGuesses: 1 }), false, 'discovered', 'handled once'],
    [stats({ correctGuesses: LEARN_REPS - 1 }), false, 'discovered', 'one short'],
    [stats({ correctGuesses: LEARN_REPS }), false, 'learned', 'handled enough'],
    [stats({ correctGuesses: 0 }), true, 'learned', 'banked by an exam'],
    [undefined, true, 'learned', 'banked even if never played'],
    [stats({ correctGuesses: LEARN_REPS, misses: 9 }), false, 'learned', 'misses do not unlearn'],
  ]
  it.each(cases)('%#: %s', (s, banked, expected) => {
    expect(wordState(s, banked)).toBe(expected)
  })

  it('never regresses across many rounds of real SRS updates', () => {
    const city = wordsForCity(WORDS, 0)
    let srs: SrsMap = {}
    let learned = 0
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
      const now = countCollection(city, srs, {}).learned
      expect(now).toBeGreaterThanOrEqual(learned)
      learned = now
    }
    expect(learned).toBeGreaterThan(0)
  })

  it('counts split cleanly and always sum to the whole', () => {
    const city = wordsForCity(WORDS, 0)
    const srs = {
      ...srsWith(city.slice(0, 10), { correctGuesses: LEARN_REPS }),
      ...srsWith(city.slice(10, 35), { correctGuesses: 1 }),
    }
    const banked = Object.fromEntries(city.slice(90, 95).map((w) => [w.id, NOW]))
    const counts = countCollection(city, srs, banked)
    expect(counts.learned).toBe(15) // 10 by play + 5 banked
    expect(counts.discovered).toBe(25)
    expect(counts.undiscovered).toBe(60)
    expect(counts.learned + counts.discovered + counts.undiscovered).toBe(counts.total)
  })
})

describe('the travel exam is never locked', () => {
  const city = wordsForCity(WORDS, 0)
  const rng = () => mulberry32(99)

  it('always offers a full paper, even on an untouched city', () => {
    expect(examWords(WORDS, {}, {}, 0, rng()).length).toBe(GATE_SIZE)
  })

  it('takes every green first, then fills with grey, then the unknown', () => {
    const greens = [city[70]!, city[40]!, city[95]!, city[12]!]
    const greys = city.slice(0, 6)
    const srs = {
      ...srsWith(greens, { correctGuesses: LEARN_REPS }),
      ...srsWith(greys, { correctGuesses: 1 }),
    }
    const paper = examWords(WORDS, srs, {}, 0, rng())
    const ids = new Set(paper.map((w) => w.id))
    // All four greens and all six greys make the cut before any unknown word.
    for (const w of [...greens, ...greys]) expect(ids.has(w.id)).toBe(true)
    expect(paper.length).toBe(GATE_SIZE)

    const comp = examComposition(WORDS, srs, {}, 0)
    expect(comp).toEqual({ learned: 4, discovered: 6, undiscovered: 10, total: GATE_SIZE })
  })

  it('is a fair test once twenty words are green', () => {
    const srs = srsWith(city.slice(0, 25), { correctGuesses: LEARN_REPS })
    const comp = examComposition(WORDS, srs, {}, 0)
    expect(comp).toEqual({ learned: 20, discovered: 0, undiscovered: 0, total: GATE_SIZE })
    const paper = examWords(WORDS, srs, {}, 0, rng())
    for (const w of paper) expect(isLearned(srs[w.id], false)).toBe(true)
  })

  it('never re-tests a banked word', () => {
    const banked = Object.fromEntries(city.slice(0, 20).map((w) => [w.id, NOW]))
    const paper = examWords(WORDS, {}, banked, 0, rng())
    expect(paper.length).toBe(GATE_SIZE)
    for (const w of paper) expect(w.id in banked).toBe(false)
  })

  it('shrinks its paper only when a city is nearly exhausted', () => {
    const banked = Object.fromEntries(city.slice(0, 95).map((w) => [w.id, NOW]))
    expect(examWords(WORDS, {}, banked, 0, rng()).length).toBe(5)
    expect(examComposition(WORDS, {}, banked, 0).total).toBe(5)
  })

  it('varies which unknown words it draws between attempts', () => {
    const a = examWords(WORDS, {}, {}, 0, mulberry32(1)).map((w) => w.id).join()
    const b = examWords(WORDS, {}, {}, 0, mulberry32(2)).map((w) => w.id).join()
    expect(a).not.toBe(b)
  })
})

describe('stamps and travel', () => {
  it('needs a full passport page', () => {
    for (let n = 0; n < GATES_PER_CITY; n++) {
      expect(canTravel(journey({ stamps: { 0: n } }), 0)).toBe(false)
    }
    expect(canTravel(journey({ stamps: { 0: GATES_PER_CITY } }), 0)).toBe(true)
  })

  it('is tracked per city', () => {
    const j = journey({ cityIndex: 1, stamps: { 0: GATES_PER_CITY } })
    expect(canTravel(j, 0)).toBe(true)
    expect(canTravel(j, 1)).toBe(false)
    expect(stampsFor(j, 1)).toBe(0)
  })

  it('the journey completes only after the final city', () => {
    const last = CITIES.length - 1
    expect(isJourneyComplete(journey({ cityIndex: last }))).toBe(false)
    expect(
      isJourneyComplete(journey({ cityIndex: last, stamps: { [last]: GATES_PER_CITY } })),
    ).toBe(true)
  })

  it('five full papers bank a whole city', () => {
    expect(GATES_PER_CITY * GATE_SIZE).toBe(WORDS_PER_CITY)
  })
})

describe('isLearned', () => {
  it('matches wordState', () => {
    expect(isLearned(stats({ correctGuesses: LEARN_REPS }), false)).toBe(true)
    expect(isLearned(stats({ correctGuesses: 1 }), false)).toBe(false)
    expect(isLearned(undefined, true)).toBe(true)
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
      expect(c.blurbDa.length).toBeGreaterThan(10)
    }
  })

  it('starts in the far south and ends in the capital', () => {
    expect(CITIES[0]!.name).toBe('Sønderborg')
    expect(CITIES[CITIES.length - 1]!.name).toBe('København')
    expect(Math.min(...CITIES.map((c) => c.lat))).toBe(CITIES[0]!.lat)
  })
})

describe('exam trials', () => {
  const city = wordsForCity(WORDS, 0)
  const greens = (n: number) => srsWith(city.slice(0, n), { correctGuesses: LEARN_REPS })

  it('earns one attempt per ten green words', () => {
    expect(examTrials(WORDS, {}, {}, journey(), 0).earned).toBe(0)
    expect(examTrials(WORDS, greens(GREENS_PER_TRIAL - 1), {}, journey(), 0).earned).toBe(0)
    expect(examTrials(WORDS, greens(GREENS_PER_TRIAL), {}, journey(), 0).earned).toBe(1)
    expect(examTrials(WORDS, greens(35), {}, journey(), 0).earned).toBe(3)
    expect(examTrials(WORDS, greens(100), {}, journey(), 0).earned).toBe(10)
  })

  it('the first attempt arrives at exactly half a paper green', () => {
    expect(examUnlocked(WORDS, greens(GREENS_PER_TRIAL - 1), {}, journey(), 0)).toBe(false)
    expect(examUnlocked(WORDS, greens(GREENS_PER_TRIAL), {}, journey(), 0)).toBe(true)
    expect(GREENS_PER_TRIAL).toBe(GATE_SIZE / 2)
  })

  it('an attempt taken shuts the exam again', () => {
    const srs = greens(GREENS_PER_TRIAL)
    const spent = journey({ trialsSpent: { 0: 1 } })
    expect(examTrials(WORDS, srs, {}, spent, 0).available).toBe(0)
    expect(examUnlocked(WORDS, srs, {}, spent, 0)).toBe(false)
  })

  it('passing pays for itself: each stamp banks twenty, earning two for one', () => {
    // Ten greens buys the first attempt. Passing banks the paper's twenty
    // words, which are worth two more attempts — so a clean run never stalls.
    let state = journey()
    let srs = greens(GREENS_PER_TRIAL)
    let banked: Record<string, number> = {}
    for (let stamp = 1; stamp <= GATES_PER_CITY; stamp++) {
      expect(examUnlocked(WORDS, srs, banked, state, 0)).toBe(true)
      state = journey({ trialsSpent: { 0: (state.trialsSpent[0] ?? 0) + 1 } })
      banked = {
        ...banked,
        ...Object.fromEntries(city.slice(0, stamp * GATE_SIZE).map((w) => [w.id, NOW])),
      }
      srs = {}
    }
    expect(examTrials(WORDS, srs, banked, state, 0).spent).toBe(GATES_PER_CITY)
  })

  it('banked words keep counting toward attempts', () => {
    const banked = Object.fromEntries(city.slice(0, 20).map((w) => [w.id, NOW]))
    expect(examTrials(WORDS, {}, banked, journey(), 0).earned).toBe(2)
  })

  it('stops counting once the city is nine-tenths green, however many were burnt', () => {
    const srs = greens(UNLIMITED_TRIALS_AT)
    const burnt = journey({ trialsSpent: { 0: 99 } })
    const trials = examTrials(WORDS, srs, {}, burnt, 0)
    expect(trials.available).toBe(0)
    expect(trials.unlimited).toBe(true)
    expect(examUnlocked(WORDS, srs, {}, burnt, 0)).toBe(true)
  })

  it('one green short of the threshold is still rationed', () => {
    const srs = greens(UNLIMITED_TRIALS_AT - 1)
    const burnt = journey({ trialsSpent: { 0: 99 } })
    expect(examTrials(WORDS, srs, {}, burnt, 0).unlimited).toBe(false)
    expect(examUnlocked(WORDS, srs, {}, burnt, 0)).toBe(false)
  })

  it('banked words count toward the threshold too', () => {
    const banked = Object.fromEntries(
      city.slice(0, UNLIMITED_TRIALS_AT).map((w) => [w.id, NOW]),
    )
    expect(examTrials(WORDS, {}, banked, journey({ trialsSpent: { 0: 99 } }), 0).unlimited).toBe(
      true,
    )
  })

  it('play can always buy another attempt, so no city can strand a player', () => {
    // Every attempt burnt at every green count below the threshold: greening
    // ten more words always reopens the exam.
    const burnt = (n: number) => journey({ trialsSpent: { 0: n } })
    for (let learned = 0; learned < UNLIMITED_TRIALS_AT; learned += GREENS_PER_TRIAL) {
      const srs = greens(learned)
      const allSpent = burnt(Math.floor(learned / GREENS_PER_TRIAL))
      expect(examUnlocked(WORDS, srs, {}, allSpent, 0)).toBe(false)
      // ...and ten more greens opens it again.
      expect(
        examUnlocked(WORDS, greens(learned + GREENS_PER_TRIAL), {}, allSpent, 0),
      ).toBe(true)
    }
  })

  it('reports how many greens remain before the next attempt', () => {
    expect(greensToNextTrial(WORDS, {}, {}, 0)).toBe(GREENS_PER_TRIAL)
    expect(greensToNextTrial(WORDS, greens(7), {}, 0)).toBe(3)
  })
})
