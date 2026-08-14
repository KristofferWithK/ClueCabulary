import { describe, expect, it } from 'vitest'
import type { WordEntry } from '../data/types'
import { WORDS } from '../data/words'
import { WRAPUP_CONFIG } from '../engine/config'
import { generateKeys } from '../engine/keygen'
import { mulberry32 } from '../engine/rng'
import { conflicts } from '../srs/sampler'
import { newStats } from '../srs/scheduler'
import type { SrsMap } from '../srs/types'
import { wordsForCity } from './progress'
import { WRAP_UP_UNLOCK, wrapUpBias, wrapUpPool, wrapUpUnlocked, wrapUpWords } from './wrapup'

const NOW = 1_700_000_000_000
const city = wordsForCity(WORDS, 0)

/**
 * A conflict-free slice of the city, so "a pool of N seats N" holds exactly.
 * The real first-twenty contains sharing pairs (measured: a pool of 20 seats
 * 19), which is the draw's business to survive — the boundary tests' fixtures
 * must not depend on it.
 */
const clean: WordEntry[] = []
for (const w of city) {
  if (clean.every((c) => !conflicts(w, c))) clean.push(w)
  if (clean.length >= 45) break
}

/** The given words collected — a green earned each way. */
const collectedOf = (words: readonly WordEntry[]): SrsMap =>
  Object.fromEntries(
    words.map((w) => [w.id, { ...newStats(NOW), greenByClue: 1, greenByGuess: 1 }]),
  )

/** The first n city words collected. */
const collectedStats = (n: number): SrsMap => collectedOf(city.slice(0, n))

const wrappedOf = (ids: readonly string[]): Record<string, number> =>
  Object.fromEntries(ids.map((id) => [id, NOW]))

describe('the wrap-up pool', () => {
  it('holds exactly the collected-or-better words of the city', () => {
    const srs = collectedStats(25)
    const pool = wrapUpPool(WORDS, srs, {}, 0)
    expect(pool.length).toBe(25)
    // A wrapped word without stats still belongs — the ledger outranks them.
    const wrapped = wrappedOf([city[80]!.id])
    expect(wrapUpPool(WORDS, srs, wrapped, 0).length).toBe(26)
  })

  it('never reaches into another city', () => {
    const srs = collectedStats(25)
    expect(wrapUpPool(WORDS, srs, {}, 1).length).toBe(0)
  })
})

describe('drawing a wrap-up board', () => {
  it('every word on the board is collected — the invariant the mode stands on', () => {
    const srs = collectedStats(40)
    const board = wrapUpWords(WORDS, srs, {}, 0, mulberry32(7))
    expect(board.length).toBe(WRAPUP_CONFIG.totalWords)
    const pool = new Set(wrapUpPool(WORDS, srs, {}, 0).map((w) => w.id))
    for (const w of board) expect(pool.has(w.id)).toBe(true)
  })

  it('unwrapped words come first; wrapped ones only pad', () => {
    // 22 unwrapped + 18 wrapped: the board must seat every unwrapped word it
    // can before a single wrapped one.
    const srs = collectedStats(40)
    const wrapped = wrappedOf(city.slice(22, 40).map((w) => w.id))
    const board = wrapUpWords(WORDS, srs, wrapped, 0, mulberry32(7))
    const unwrappedOnBoard = board.filter((w) => !(w.id in wrapped)).length
    // Conflict exclusions may cost a seat or two, never more.
    expect(unwrappedOnBoard).toBeGreaterThanOrEqual(20)
  })

  it('near the end of a city, wrapped words fill the board', () => {
    // Only 5 unwrapped left: a full board still deals.
    const srs = collectedStats(40)
    const wrapped = wrappedOf(city.slice(5, 40).map((w) => w.id))
    const board = wrapUpWords(WORDS, srs, wrapped, 0, mulberry32(7))
    expect(board.length).toBe(WRAPUP_CONFIG.totalWords)
    for (const w of city.slice(0, 5)) {
      expect(board.some((b) => b.id === w.id)).toBe(true)
    }
  })

  it('the avoid set goes to the back of the queue, never dropped', () => {
    // Pool of exactly 20: the previous board IS the pool, and a short board
    // would be a worse answer than a repeat — the old exam draw's lesson.
    const srs = collectedOf(clean.slice(0, 20))
    const first = wrapUpWords(WORDS, srs, {}, 0, mulberry32(7))
    expect(first.length).toBe(WRAPUP_CONFIG.totalWords)
    const second = wrapUpWords(WORDS, srs, {}, 0, mulberry32(8), new Set(first.map((w) => w.id)))
    expect(second.length).toBe(first.length)

    // With words to spare, the previous board stays off the new one.
    const srsWide = collectedOf(clean)
    const a = wrapUpWords(WORDS, srsWide, {}, 0, mulberry32(7))
    const b = wrapUpWords(WORDS, srsWide, {}, 0, mulberry32(8), new Set(a.map((w) => w.id)))
    const repeats = b.filter((w) => a.some((x) => x.id === w.id))
    expect(repeats.length).toBe(0)
  })

  it('never seats two words the board rules call conflicting', () => {
    const srs = collectedStats(60)
    const board = wrapUpWords(WORDS, srs, {}, 0, mulberry32(3))
    const glosses = board.map((w) => w.en[0]!.toLowerCase())
    expect(new Set(glosses).size).toBe(glosses.length)
  })
})

describe('unlocking wrap-up rounds', () => {
  it('opens at a full dealable board, not one word sooner', () => {
    expect(wrapUpUnlocked(WORDS, collectedOf(clean.slice(0, WRAP_UP_UNLOCK - 1)), {}, 0)).toBe(false)
    expect(wrapUpUnlocked(WORDS, collectedOf(clean.slice(0, WRAP_UP_UNLOCK)), {}, 0)).toBe(true)
  })

  it('a pool that cannot SEAT a board does not open it, whatever it counts', () => {
    // Twenty collected words two of which conflict: nineteen seats is not a
    // board. This is why the check deals rather than counts.
    const conflicted = city.find((w) => clean.slice(0, 19).some((c) => conflicts(w, c)))!
    const srs = collectedOf([...clean.slice(0, 19), conflicted])
    expect(wrapUpUnlocked(WORDS, srs, {}, 0)).toBe(false)
  })
})

describe('the wrap-up deal bias', () => {
  it('routes unwrapped words into the green tiers, wrapped padding away from them', () => {
    // 12 unwrapped and 8 wrapped on one board. Unbiased, the unwrapped words
    // would hold their share of the greens — 60%. Biased, measured at ~74%
    // over these forty seeds: a lean, not a rule, same as normal dealing.
    const srs = collectedOf(clean.slice(0, 40))
    const wrapped = wrappedOf(clean.slice(12, 40).map((w) => w.id))
    const greenShare = (useBias: boolean): number => {
      let unwrappedGreens = 0
      let totalGreens = 0
      for (let seed = 1; seed <= 40; seed++) {
        const board = wrapUpWords(WORDS, srs, wrapped, 0, mulberry32(seed))
        const bias = useBias ? wrapUpBias(board, wrapped) : undefined
        const keys = generateKeys(WRAPUP_CONFIG, board.map((w) => w.id), mulberry32(seed), bias)
        for (const w of board) {
          const green = keys.playerKey[w.id] === 'green' || keys.aiKey[w.id] === 'green'
          if (!green) continue
          totalGreens++
          if (!(w.id in wrapped)) unwrappedGreens++
        }
      }
      return unwrappedGreens / totalGreens
    }
    const biased = greenShare(true)
    expect(biased).toBeGreaterThan(0.7)
    expect(biased).toBeGreaterThan(greenShare(false) + 0.08)
  })
})
