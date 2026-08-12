import type { WordEntry } from '../data/types'
import type { SrsMap, WordStats } from '../srs/types'
import { CITIES, GATES_PER_CITY, GATE_SIZE, STUDY_UNTIL_CITY, WORDS_PER_CITY } from './cities'

export type StudyMode = 'auto' | 'always' | 'never'

/** Whether a round should open with the whole board translated. */
export function studyPhaseEnabled(mode: StudyMode, cityIndex: number): boolean {
  if (mode === 'always') return true
  if (mode === 'never') return false
  return cityIndex < STUDY_UNTIL_CITY
}

/** Successful handlings — clued or guessed — that turn a word green. */
export const LEARN_REPS = 3

/**
 * A word's place in the collection:
 * - `undiscovered` — never met
 * - `discovered`   — seen on a board, not yet secure
 * - `learned`      — handled LEARN_REPS times, or banked by passing an exam
 */
export type WordState = 'undiscovered' | 'discovered' | 'learned'

/** Words banked by a passed travel exam: wordId -> when. Add-only. */
export type BankedWords = Readonly<Record<string, number>>

export interface JourneyState {
  cityIndex: number
  /** cityIndex -> travel stamps earned (0..GATES_PER_CITY). */
  stamps: Record<number, number>
  banked: Record<string, number>
}

/** Inclusive freqRank range owned by a city. City 0 holds ranks 1..100. */
export function cityBand(cityIndex: number): [number, number] {
  return [cityIndex * WORDS_PER_CITY + 1, (cityIndex + 1) * WORDS_PER_CITY]
}

const byRank = (a: WordEntry, b: WordEntry) => a.freqRank - b.freqRank

export function wordsForCity(all: readonly WordEntry[], cityIndex: number): WordEntry[] {
  const [lo, hi] = cityBand(cityIndex)
  return all.filter((w) => w.freqRank >= lo && w.freqRank <= hi).sort(byRank)
}

/** Everything the player may meet on a board: this city and all before it. */
export function unlockedWords(all: readonly WordEntry[], cityIndex: number): WordEntry[] {
  const [, hi] = cityBand(cityIndex)
  return all.filter((w) => w.freqRank <= hi).sort(byRank)
}

/**
 * Both routes to green are monotonic — handling counts only rise and a banked
 * word stays banked — so the collection can never regress on its own.
 */
export function wordState(stats: WordStats | undefined, banked: boolean): WordState {
  if (banked) return 'learned'
  if (!stats) return 'undiscovered'
  return stats.correctGuesses >= LEARN_REPS ? 'learned' : 'discovered'
}

export function isLearned(stats: WordStats | undefined, banked: boolean): boolean {
  return wordState(stats, banked) === 'learned'
}

export interface CollectionCounts {
  total: number
  discovered: number // met but not yet learned
  learned: number
  undiscovered: number
}

export function countCollection(
  words: readonly WordEntry[],
  srs: SrsMap,
  banked: BankedWords,
): CollectionCounts {
  let discovered = 0
  let learned = 0
  for (const w of words) {
    const state = wordState(srs[w.id], w.id in banked)
    if (state === 'learned') learned++
    else if (state === 'discovered') discovered++
  }
  return {
    total: words.length,
    discovered,
    learned,
    undiscovered: words.length - discovered - learned,
  }
}

/**
 * The travel exam is never locked: it always draws the player's strongest
 * words in this city that no stamp has banked yet — most-handled first, then
 * by frequency. Taking it early is allowed and simply harder, so the player is
 * never stuck waiting for a particular word to come round.
 */
export function examWords(
  all: readonly WordEntry[],
  srs: SrsMap,
  banked: BankedWords,
  cityIndex: number,
): WordEntry[] {
  return wordsForCity(all, cityIndex)
    .filter((w) => !(w.id in banked))
    .map((w) => ({ w, handled: srs[w.id]?.correctGuesses ?? 0 }))
    .sort((a, b) => b.handled - a.handled || a.w.freqRank - b.w.freqRank)
    .slice(0, GATE_SIZE)
    .map((x) => x.w)
}

/** How many of the next exam's words are already green — the readiness hint. */
export function examReadiness(
  all: readonly WordEntry[],
  srs: SrsMap,
  banked: BankedWords,
  cityIndex: number,
): { ready: number; total: number } {
  const words = examWords(all, srs, banked, cityIndex)
  const ready = words.filter((w) => isLearned(srs[w.id], w.id in banked)).length
  return { ready, total: words.length }
}

export function stampsFor(journey: JourneyState, cityIndex: number): number {
  return journey.stamps[cityIndex] ?? 0
}

/** A full passport page opens the road onward. */
export function canTravel(journey: JourneyState, cityIndex: number): boolean {
  return stampsFor(journey, cityIndex) >= GATES_PER_CITY
}

export function isJourneyComplete(journey: JourneyState): boolean {
  return journey.cityIndex >= CITIES.length - 1 && canTravel(journey, CITIES.length - 1)
}
