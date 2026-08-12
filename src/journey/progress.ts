import type { WordEntry } from '../data/types'
import { shuffle, type Rng } from '../engine/rng'
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
 * Green words that earn one attempt at a travel exam. The first arrives at ten
 * greens — half a paper — so an exam is never twenty words you have never met,
 * and every ten after that buys another try.
 */
export const GREENS_PER_TRIAL = GATE_SIZE / 2

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
  /** cityIndex -> failed attempts, each of which spent a trial. */
  trialsSpent: Record<number, number>
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

/** Unbanked words of a city, split by how well the player knows them. */
function unbankedByState(
  all: readonly WordEntry[],
  srs: SrsMap,
  banked: BankedWords,
  cityIndex: number,
) {
  const pool = wordsForCity(all, cityIndex).filter((w) => !(w.id in banked))
  return {
    learned: pool.filter((w) => wordState(srs[w.id], false) === 'learned'),
    discovered: pool.filter((w) => wordState(srs[w.id], false) === 'discovered'),
    undiscovered: pool.filter((w) => wordState(srs[w.id], false) === 'undiscovered'),
  }
}

/**
 * What the next paper will hold, without drawing it — so the player can judge
 * the risk before committing. Green words come first, then grey, then words
 * never met, which makes the exam self-balancing: at twenty greens the paper is
 * entirely green and a fair test; take it earlier and you are gambling on words
 * you may not know.
 */
export function examComposition(
  all: readonly WordEntry[],
  srs: SrsMap,
  banked: BankedWords,
  cityIndex: number,
): { learned: number; discovered: number; undiscovered: number; total: number } {
  const pool = unbankedByState(all, srs, banked, cityIndex)
  const learned = Math.min(pool.learned.length, GATE_SIZE)
  const discovered = Math.min(pool.discovered.length, GATE_SIZE - learned)
  const undiscovered = Math.min(
    pool.undiscovered.length,
    GATE_SIZE - learned - discovered,
  )
  return { learned, discovered, undiscovered, total: learned + discovered + undiscovered }
}

export interface ExamTrials {
  earned: number
  spent: number
  available: number
  /** True when the paper would be entirely green — always worth allowing. */
  certain: boolean
}

/**
 * Attempts at a travel exam: one per ten green words in the city, banked ones
 * included, minus the attempts already failed. Passing costs nothing — success
 * should never be punished — so only a failure spends a trial.
 *
 * The `certain` escape hatch matters: a player who has greened every remaining
 * word but burnt all their trials would otherwise be stuck forever, refused a
 * test they would certainly pass.
 */
export function examTrials(
  all: readonly WordEntry[],
  srs: SrsMap,
  banked: BankedWords,
  journey: JourneyState,
  cityIndex: number,
): ExamTrials {
  const learned = countCollection(wordsForCity(all, cityIndex), srs, banked).learned
  const earned = Math.floor(learned / GREENS_PER_TRIAL)
  const spent = journey.trialsSpent[cityIndex] ?? 0
  const paper = examComposition(all, srs, banked, cityIndex)
  return {
    earned,
    spent,
    available: Math.max(0, earned - spent),
    certain: paper.total > 0 && paper.learned === paper.total,
  }
}

/** An exam may be sat with a trial in hand, or when the paper is all green. */
export function examUnlocked(
  all: readonly WordEntry[],
  srs: SrsMap,
  banked: BankedWords,
  journey: JourneyState,
  cityIndex: number,
): boolean {
  const trials = examTrials(all, srs, banked, journey, cityIndex)
  return trials.available > 0 || trials.certain
}

/** Green words still needed before the next trial is earned. */
export function greensToNextTrial(
  all: readonly WordEntry[],
  srs: SrsMap,
  banked: BankedWords,
  cityIndex: number,
): number {
  const learned = countCollection(wordsForCity(all, cityIndex), srs, banked).learned
  return GREENS_PER_TRIAL - (learned % GREENS_PER_TRIAL)
}

/**
 * Draw the paper. Green words are taken by frequency (stable), while the grey
 * and unknown filler is sampled, so a second attempt is not the same test
 * twice. Never re-tests a banked word.
 */
export function examWords(
  all: readonly WordEntry[],
  srs: SrsMap,
  banked: BankedWords,
  cityIndex: number,
  rng: Rng,
): WordEntry[] {
  const pool = unbankedByState(all, srs, banked, cityIndex)
  const paper = pool.learned.slice(0, GATE_SIZE)
  for (const group of [pool.discovered, pool.undiscovered]) {
    if (paper.length >= GATE_SIZE) break
    paper.push(...shuffle(group, rng).slice(0, GATE_SIZE - paper.length))
  }
  return paper.sort((a, b) => a.freqRank - b.freqRank)
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
