import { describe, expect, it } from 'vitest'
import type { WordEntry } from '../data/types'
import { WORDS } from '../data/words'
import { BOARD, distinctGreens } from '../engine/config'
import { generateKeys } from '../engine/keygen'
import { mulberry32 } from '../engine/rng'
import { conflicts } from '../srs/sampler'
import { newStats } from '../srs/scheduler'
import type { SrsMap } from '../srs/types'
import { wordsForCity } from './progress'
import {
  MAX_WRAPPED_PER_ROUND,
  WINS_PER_WRAP_UP,
  WRAP_UP_BANK_CAP,
  WRAP_UP_FLOOR,
  bankAfterRound,
  winsToNextWrapUp,
  wrapUpBias,
  wrapUpPool,
  wrapUpUnlocked,
  wrapUpWords,
} from './wrapup'

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

/** Seen but not collected — the middle pool a topped-up board reaches for. */
const discoveredOf = (words: readonly WordEntry[]): SrsMap =>
  Object.fromEntries(words.map((w) => [w.id, { ...newStats(NOW), seen: 1 }]))

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
  it('fills a full board from a pool far too thin to fill one (W1)', () => {
    // Eight collected words and a board of eighteen. Before W1 this could not
    // be dealt at all; now the eight are on it, they are the only wrappable
    // cards, and the other ten are ordinary city words.
    const srs = collectedStats(8)
    const deal = wrapUpWords(WORDS, srs, {}, 0, mulberry32(7))
    expect(deal.words.length).toBe(BOARD.totalWords)
    expect(deal.wrappable.length).toBe(8)
    const ids = new Set(deal.words.map((w) => w.id))
    for (const w of city.slice(0, 8)) expect(ids.has(w.id)).toBe(true)
    // Every card is a word of this city, wrappable or not.
    const cityIds = new Set(city.map((w) => w.id))
    for (const w of deal.words) expect(cityIds.has(w.id)).toBe(true)
  })

  it('takes the collected words first, then the discovered, then the unseen', () => {
    // 4 collected, 6 discovered, the rest of the city unseen. The board must
    // seat all four and all six before it reaches for a `?`.
    const srs: SrsMap = { ...collectedOf(clean.slice(0, 4)), ...discoveredOf(clean.slice(4, 10)) }
    const deal = wrapUpWords(WORDS, srs, {}, 0, mulberry32(11))
    const ids = new Set(deal.words.map((w) => w.id))
    for (const w of clean.slice(0, 10)) expect(ids.has(w.id)).toBe(true)
    expect(deal.wrappable.sort()).toEqual(clean.slice(0, 4).map((w) => w.id).sort())
  })

  it('every wrappable word is collected — the invariant the mode stands on', () => {
    const srs = collectedStats(40)
    const deal = wrapUpWords(WORDS, srs, {}, 0, mulberry32(7))
    expect(deal.words.length).toBe(BOARD.totalWords)
    // 40 collected against an 18-card board: nothing needs topping up.
    expect(deal.wrappable.length).toBe(BOARD.totalWords)
    const pool = new Set(wrapUpPool(WORDS, srs, {}, 0).map((w) => w.id))
    for (const id of deal.wrappable) expect(pool.has(id)).toBe(true)
  })

  it('unwrapped words come first; wrapped ones only pad', () => {
    // 22 unwrapped + 18 wrapped, against BOARD's 18-word board: the board must
    // seat every unwrapped word it can before a single wrapped one, and since
    // 22 unwrapped exceeds the board size the whole board should be unwrapped
    // bar the odd conflict exclusion.
    const srs = collectedStats(40)
    const wrapped = wrappedOf(city.slice(22, 40).map((w) => w.id))
    const deal = wrapUpWords(WORDS, srs, wrapped, 0, mulberry32(7))
    const unwrappedOnBoard = deal.words.filter((w) => !(w.id in wrapped)).length
    // Conflict exclusions may cost a seat or two, never more.
    expect(unwrappedOnBoard).toBeGreaterThanOrEqual(BOARD.totalWords - 2)
  })

  it('near the end of a city, wrapped words fill the board', () => {
    // Only 5 unwrapped left: a full board still deals.
    const srs = collectedStats(40)
    const wrapped = wrappedOf(city.slice(5, 40).map((w) => w.id))
    const deal = wrapUpWords(WORDS, srs, wrapped, 0, mulberry32(7))
    expect(deal.words.length).toBe(BOARD.totalWords)
    for (const w of city.slice(0, 5)) {
      expect(deal.words.some((b) => b.id === w.id)).toBe(true)
    }
  })

  it('a top-up card never displaces a collected one, even a repeated one', () => {
    // The avoid set IS the whole collected pool. A filler word is fresh and a
    // collected word is stale, and the collected word must still win the seat:
    // a repeat that can be wrapped beats a new word that cannot.
    const srs = collectedOf(clean.slice(0, 6))
    const avoid = new Set(clean.slice(0, 6).map((w) => w.id))
    const deal = wrapUpWords(WORDS, srs, {}, 0, mulberry32(5), avoid)
    expect(deal.wrappable.length).toBe(6)
  })

  it('the avoid set goes to the back of the queue, never dropped', () => {
    // A pool exactly BOARD.totalWords wide: the previous board IS the pool,
    // and a short board would be a worse answer than a repeat — the old exam
    // draw's lesson.
    const srs = collectedOf(clean.slice(0, BOARD.totalWords))
    const first = wrapUpWords(WORDS, srs, {}, 0, mulberry32(7))
    expect(first.words.length).toBe(BOARD.totalWords)
    const second = wrapUpWords(
      WORDS,
      srs,
      {},
      0,
      mulberry32(8),
      new Set(first.words.map((w) => w.id)),
    )
    expect(second.words.length).toBe(first.words.length)
    // Every collected word is still on it — the top-up may not push one off.
    expect(second.wrappable.length).toBe(BOARD.totalWords)

    // With words to spare, the previous board stays off the new one.
    const srsWide = collectedOf(clean)
    const a = wrapUpWords(WORDS, srsWide, {}, 0, mulberry32(7))
    const b = wrapUpWords(WORDS, srsWide, {}, 0, mulberry32(8), new Set(a.words.map((w) => w.id)))
    const repeats = b.words.filter((w) => a.words.some((x) => x.id === w.id))
    expect(repeats.length).toBe(0)
  })

  it('never seats two words the board rules call conflicting', () => {
    const srs = collectedStats(60)
    const deal = wrapUpWords(WORDS, srs, {}, 0, mulberry32(3))
    const glosses = deal.words.map((w) => w.en[0]!.toLowerCase())
    expect(new Set(glosses).size).toBe(glosses.length)
  })
})

describe('unlocking wrap-up rounds', () => {
  it('opens at the FLOOR — one word to pack, not a boardful (W1)', () => {
    expect(wrapUpUnlocked(WORDS, {}, {}, 0)).toBe(false)
    expect(wrapUpUnlocked(WORDS, collectedOf(clean.slice(0, WRAP_UP_FLOOR)), {}, 0)).toBe(true)
    // The old gate: a boardful of collected words. It is no longer the test —
    // one word short of it must now open, and that is the whole of W1.
    expect(wrapUpUnlocked(WORDS, collectedOf(clean.slice(0, BOARD.totalWords - 1)), {}, 0)).toBe(
      true,
    )
  })

  it('a pool that cannot seat a whole board still opens one, because the board tops up', () => {
    // BOARD.totalWords collected words, two of which conflict — the fixture
    // that used to be the counter-example to counting instead of dealing. The
    // board fills from the city now, so it deals either way.
    const seatable = BOARD.totalWords - 1
    const conflicted = city.find((w) => clean.slice(0, seatable).some((c) => conflicts(w, c)))!
    const srs = collectedOf([...clean.slice(0, seatable), conflicted])
    expect(wrapUpUnlocked(WORDS, srs, {}, 0)).toBe(true)
    expect(wrapUpWords(WORDS, srs, {}, 0, mulberry32(2)).words.length).toBe(BOARD.totalWords)
  })
})

/**
 * THE STRUCTURAL HALF OF W1, and the one that can silently not work.
 *
 * `weightedOrder` in keygen is a weighted shuffle — a probability, not a rule
 * — so a bias alone would put a filler card on a green slot on some seeds and
 * quietly cost that round a word it could have banked. `greenPool` is the rule.
 *
 * MUTATION-CHECKED, by dropping the `greenPool` argument from the
 * `generateKeys` call below and leaving the bias in place — which is exactly
 * the "steer it with a big weight" version of this. Seeds out of 200 that come
 * out wrong: 123 with thirteen collected, 60 with twelve, 5 with eight. (With
 * a board that is ALL collected there is nothing to leak, which is why the
 * first case below is an invariant rather than the guard; the boundary case is
 * where a probability stops being good enough, and it fails on two seeds in
 * three.)
 */
describe('the wrap-up deal puts collected words on the keys first', () => {
  const boardOf = (srs: SrsMap, wrapped: Record<string, number>, seed: number) => {
    const deal = wrapUpWords(WORDS, srs, wrapped, 0, mulberry32(seed))
    const pool = new Set(deal.wrappable)
    const keys = generateKeys(
      BOARD,
      deal.words.map((w) => w.id),
      mulberry32(seed),
      wrapUpBias(deal.words, wrapped, pool),
      pool,
    )
    const greens = deal.words
      .map((w) => w.id)
      .filter((id) => keys.playerKey[id] === 'green' || keys.aiKey[id] === 'green')
    return { deal, greens, pool }
  }

  it('with a board full of collected words every green is wrappable (invariant)', () => {
    const srs = collectedStats(40)
    for (let seed = 1; seed <= 200; seed++) {
      const { deal, greens } = boardOf(srs, {}, seed)
      expect(deal.wrappable.length).toBe(BOARD.totalWords)
      expect(greens.length).toBe(distinctGreens(BOARD))
    }
  })

  it('with at least MAX_WRAPPED_PER_ROUND collected, no filler is green — on every seed', () => {
    // Exactly the boundary: thirteen collected on an eighteen-card board.
    const srs = collectedStats(MAX_WRAPPED_PER_ROUND)
    for (let seed = 1; seed <= 200; seed++) {
      const { greens, pool } = boardOf(srs, {}, seed)
      expect(pool.size).toBe(MAX_WRAPPED_PER_ROUND)
      for (const id of greens) expect(pool.has(id)).toBe(true)
    }
  })

  it('with fewer, filler fills exactly the green slots left over', () => {
    for (const n of [1, 8, 12]) {
      const srs = collectedStats(n)
      for (let seed = 1; seed <= 60; seed++) {
        const { greens, pool } = boardOf(srs, {}, seed)
        expect(greens.length).toBe(distinctGreens(BOARD))
        // Every collected word on the board is green...
        for (const id of pool) expect(greens).toContain(id)
        // ...and the filler greens are exactly the remainder.
        const fillerGreens = greens.filter((id) => !pool.has(id))
        expect(fillerGreens.length).toBe(distinctGreens(BOARD) - pool.size)
      }
    }
  })
})

describe('the wrap-up deal bias', () => {
  it('routes unwrapped words into the green tiers, wrapped padding away from them', () => {
    // 12 unwrapped and 8 wrapped on one board, every card collected so the
    // green pool is the whole board and the bias is the only thing ordering
    // them. Unbiased, the unwrapped words would hold their share of the greens
    // — 60%. Biased, measured at ~74% over these forty seeds: a lean, not a
    // rule, same as normal dealing.
    const srs = collectedOf(clean.slice(0, 40))
    const wrapped = wrappedOf(clean.slice(12, 40).map((w) => w.id))
    const greenShare = (useBias: boolean): number => {
      let unwrappedGreens = 0
      let totalGreens = 0
      for (let seed = 1; seed <= 40; seed++) {
        const deal = wrapUpWords(WORDS, srs, wrapped, 0, mulberry32(seed))
        const pool = new Set(deal.wrappable)
        const bias = useBias ? wrapUpBias(deal.words, wrapped, pool) : undefined
        const keys = generateKeys(
          BOARD,
          deal.words.map((w) => w.id),
          mulberry32(seed),
          bias,
        )
        for (const w of deal.words) {
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

/**
 * THE ECONOMY. Three won normal rounds buy one token, up to three banked.
 *
 * MUTATION-CHECKED: making `bankAfterRound` bank on every win (the pre-W1
 * rule) fails "three wins buy one"; letting the counter run on at the cap
 * fails "the counter does not bank a fourth token behind the cap".
 */
describe('earning a wrap-up round', () => {
  const win = (b: Parameters<typeof bankAfterRound>[0]) => bankAfterRound(b, 'won', 'normal')

  it('three wins buy one', () => {
    let b = { banked: 0, wins: 0 }
    b = win(b)
    expect(b).toEqual({ banked: 0, wins: 1 })
    b = win(b)
    expect(b).toEqual({ banked: 0, wins: 2 })
    b = win(b)
    expect(b).toEqual({ banked: 1, wins: 0 })
    expect(WINS_PER_WRAP_UP).toBe(3)
  })

  it('losing costs nothing and advances nothing', () => {
    const b = { banked: 1, wins: 2 }
    expect(bankAfterRound(b, 'lost', 'normal')).toEqual(b)
  })

  it('a wrap-up win earns nothing — not even a step toward one', () => {
    const b = { banked: 0, wins: 2 }
    expect(bankAfterRound(b, 'won', 'wrapup')).toEqual(b)
    expect(bankAfterRound(b, 'won', 'tutorial')).toEqual(b)
  })

  it('caps the bank', () => {
    let b = { banked: 0, wins: 0 }
    for (let i = 0; i < 30; i++) b = win(b)
    expect(b.banked).toBe(WRAP_UP_BANK_CAP)
  })

  it('the counter does not bank a fourth token behind the cap', () => {
    // At the cap a win holds the counter at zero. Were it allowed to run on,
    // the next spend would pay out immediately — a fourth token by another
    // name, and the cap would ration nothing.
    let b = { banked: WRAP_UP_BANK_CAP, wins: 0 }
    for (let i = 0; i < 5; i++) b = win(b)
    expect(b).toEqual({ banked: WRAP_UP_BANK_CAP, wins: 0 })
    const spent = { banked: WRAP_UP_BANK_CAP - 1, wins: b.wins }
    expect(win(spent)).toEqual({ banked: WRAP_UP_BANK_CAP - 1, wins: 1 })
  })

  it('says how many wins are left, never zero', () => {
    expect(winsToNextWrapUp({ banked: 0, wins: 0 })).toBe(3)
    expect(winsToNextWrapUp({ banked: 0, wins: 1 })).toBe(2)
    expect(winsToNextWrapUp({ banked: 0, wins: 2 })).toBe(1)
  })
})

describe('what one wrap-up can hold', () => {
  it('is the board’s distinct greens, so the suitcase can say it out loud', () => {
    expect(MAX_WRAPPED_PER_ROUND).toBe(distinctGreens(BOARD))
    expect(MAX_WRAPPED_PER_ROUND).toBe(13)
  })
})
