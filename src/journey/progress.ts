import type { WordEntry } from '../data/types'
import type { SrsMap, WordStats } from '../srs/types'
import { CITIES, GATES_PER_CITY, GATE_SIZE, WORDS_PER_CITY } from './cities'

export type GateStatus = 'locked' | 'ready' | 'passed'

export interface JourneyState {
  cityIndex: number
  /** cityIndex -> indices of gates already passed. */
  gatesPassed: Record<number, number[]>
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
 * Collected = proven in play: two correct guesses, or one if the word had
 * never been looked up at that moment.
 *
 * NOTE: the second clause is not monotonic on its own — looking a word up
 * later would revoke it. Never read this predicate directly for progress;
 * read the latch built by `mergeCollected`, which only ever adds.
 */
export function isCollected(stats: WordStats | undefined): boolean {
  if (!stats) return false
  if (stats.correctGuesses >= 2) return true
  return stats.correctGuesses >= 1 && stats.lookups === 0
}

/** wordId -> the moment it was first collected. Add-only. */
export type CollectedLatch = Record<string, number>

/**
 * Fold the current SRS state into the latch. Returns the same object when
 * nothing changed, so stores can skip needless updates. Because entries are
 * only ever added, collection progress can never go backwards — and the first
 * call after upgrading credits everything the player had already proven.
 */
export function mergeCollected(latch: Readonly<CollectedLatch>, srs: SrsMap, now: number): CollectedLatch {
  let added = false
  const next: CollectedLatch = { ...latch }
  for (const [wordId, stats] of Object.entries(srs)) {
    if (wordId in next) continue
    if (isCollected(stats)) {
      next[wordId] = now
      added = true
    }
  }
  return added ? next : (latch as CollectedLatch)
}

export function collectedCount(
  words: readonly WordEntry[],
  collected: ReadonlySet<string>,
): number {
  return words.reduce((n, w) => n + (collected.has(w.id) ? 1 : 0), 0)
}

/** The 20 words of one gate: wave G is the G-th slice of the city's band. */
export function waveWords(
  all: readonly WordEntry[],
  cityIndex: number,
  gateIndex: number,
): WordEntry[] {
  if (gateIndex < 0 || gateIndex >= GATES_PER_CITY) {
    throw new Error(`gate ${gateIndex} out of range`)
  }
  const start = gateIndex * GATE_SIZE
  return wordsForCity(all, cityIndex).slice(start, start + GATE_SIZE)
}

export function isGatePassed(journey: JourneyState, cityIndex: number, gateIndex: number): boolean {
  return (journey.gatesPassed[cityIndex] ?? []).includes(gateIndex)
}

/** A gate opens once every word in its wave has been collected. */
export function gateStatus(
  all: readonly WordEntry[],
  collected: ReadonlySet<string>,
  journey: JourneyState,
  cityIndex: number,
  gateIndex: number,
): GateStatus {
  if (isGatePassed(journey, cityIndex, gateIndex)) return 'passed'
  const wave = waveWords(all, cityIndex, gateIndex)
  return collectedCount(wave, collected) === wave.length ? 'ready' : 'locked'
}

export function cityGateStatuses(
  all: readonly WordEntry[],
  collected: ReadonlySet<string>,
  journey: JourneyState,
  cityIndex: number,
): GateStatus[] {
  return Array.from({ length: GATES_PER_CITY }, (_, g) =>
    gateStatus(all, collected, journey, cityIndex, g),
  )
}

/** Travel unlocks when every gate of the current city has been passed. */
export function canTravel(journey: JourneyState, cityIndex: number): boolean {
  const passed = journey.gatesPassed[cityIndex] ?? []
  return Array.from({ length: GATES_PER_CITY }, (_, g) => g).every((g) => passed.includes(g))
}

export function isJourneyComplete(journey: JourneyState): boolean {
  return journey.cityIndex >= CITIES.length - 1 && canTravel(journey, CITIES.length - 1)
}

/** The next wave still being collected — what boards should focus on. */
export function currentGateIndex(
  all: readonly WordEntry[],
  collected: ReadonlySet<string>,
  journey: JourneyState,
  cityIndex: number,
): number {
  const statuses = cityGateStatuses(all, collected, journey, cityIndex)
  const next = statuses.findIndex((s) => s !== 'passed')
  return next === -1 ? GATES_PER_CITY - 1 : next
}
