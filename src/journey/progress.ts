import type { WordEntry } from '../data/types'
import { curriculumRank } from '../data/words'
import type { SrsMap, WordStats } from '../srs/types'
import { CITIES, STUDY_UNTIL_CITY, WORDS_PER_CITY } from './cities'

export type StudyMode = 'auto' | 'always' | 'never'

/** Whether a round should open with the whole board translated. */
export function studyPhaseEnabled(mode: StudyMode, cityIndex: number): boolean {
  if (mode === 'always') return true
  if (mode === 'never') return false
  return cityIndex < STUDY_UNTIL_CITY
}

/**
 * The old play-route threshold to green: clued or guessed this many times.
 * The lifecycle no longer counts to three, but every migration still reads
 * this — a v1 record at LEARN_REPS correct guesses is what arrives collected.
 */
export const LEARN_REPS = 3

/**
 * The four-state life of a word on its way into the suitcase:
 * - `undiscovered` — never met
 * - `discovered`   — seen on a board
 * - `collected`    — clued once AND guessed once (one green earned each way)
 * - `wrapped`      — packed safely in a wrap-up round; add-only, like the old
 *                    exam banking
 *
 * Monotonic: the counters only rise and the wrapped ledger only grows, so the
 * collection can never regress on its own.
 */
export type WordState = 'undiscovered' | 'discovered' | 'collected' | 'wrapped'

/** Words packed safely in wrap-up rounds: wordId -> when. Add-only. */
export type WrappedWords = Readonly<Record<string, number>>

export interface JourneyState {
  cityIndex: number
  wrapped: Record<string, number>
}

/** Inclusive curriculumRank range owned by a city. City 0 holds 1..100. */
export function cityBand(cityIndex: number): [number, number] {
  return [cityIndex * WORDS_PER_CITY + 1, (cityIndex + 1) * WORDS_PER_CITY]
}

const byRank = (a: WordEntry, b: WordEntry) => curriculumRank(a) - curriculumRank(b)

export function wordsForCity(all: readonly WordEntry[], cityIndex: number): WordEntry[] {
  const [lo, hi] = cityBand(cityIndex)
  return all.filter((w) => curriculumRank(w) >= lo && curriculumRank(w) <= hi).sort(byRank)
}

/** Everything the player may meet on a board: this city and all before it. */
export function unlockedWords(all: readonly WordEntry[], cityIndex: number): WordEntry[] {
  const [, hi] = cityBand(cityIndex)
  return all.filter((w) => curriculumRank(w) <= hi).sort(byRank)
}

export function wordState(stats: WordStats | undefined, wrapped: boolean): WordState {
  if (wrapped) return 'wrapped'
  if (!stats) return 'undiscovered'
  return stats.greenByClue >= 1 && stats.greenByGuess >= 1 ? 'collected' : 'discovered'
}

/** Collected or better — the pool a wrap-up round deals from. */
export function isCollected(stats: WordStats | undefined, wrapped: boolean): boolean {
  const state = wordState(stats, wrapped)
  return state === 'collected' || state === 'wrapped'
}

export interface CollectionCounts {
  total: number
  discovered: number // met, but an interaction still missing
  collected: number // clued and guessed, not yet packed
  wrapped: number
  undiscovered: number
}

export function countCollection(
  words: readonly WordEntry[],
  srs: SrsMap,
  wrapped: WrappedWords,
): CollectionCounts {
  let discovered = 0
  let collected = 0
  let packed = 0
  for (const w of words) {
    const state = wordState(srs[w.id], w.id in wrapped)
    if (state === 'wrapped') packed++
    else if (state === 'collected') collected++
    else if (state === 'discovered') discovered++
  }
  return {
    total: words.length,
    discovered,
    collected,
    wrapped: packed,
    undiscovered: words.length - discovered - collected - packed,
  }
}

/**
 * Wrapped words that open the road onward — THE pacing tunable. All hundred,
 * per the design: a city is left with its whole suitcase packed. Collecting
 * needs a green each way per word and wrapping needs a wrap-up round finding
 * it, so lowering this is the one-line lever if a city runs long.
 */
export const WRAP_TO_TRAVEL = WORDS_PER_CITY

export function countWrapped(words: readonly WordEntry[], wrapped: WrappedWords): number {
  let n = 0
  for (const w of words) if (w.id in wrapped) n++
  return n
}

/** The road onward opens when the city's words are packed. */
export function canTravel(
  all: readonly WordEntry[],
  wrapped: WrappedWords,
  cityIndex: number,
): boolean {
  return countWrapped(wordsForCity(all, cityIndex), wrapped) >= WRAP_TO_TRAVEL
}

export function isJourneyComplete(
  all: readonly WordEntry[],
  wrapped: WrappedWords,
  cityIndex: number,
): boolean {
  return cityIndex >= CITIES.length - 1 && canTravel(all, wrapped, CITIES.length - 1)
}
