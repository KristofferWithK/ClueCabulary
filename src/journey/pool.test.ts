import { describe, expect, it } from 'vitest'
import { WORDS, curriculumRank } from '../data/words'
import { BOARD, TUTORIAL_CONFIG, WRAPUP_CONFIG, type GridConfig } from '../engine/config'
import { mulberry32 } from '../engine/rng'
import { levenshtein, normalize } from '../engine/text'
import { danish } from '../lang/da'

const danishStem = danish.morphology.stem
import { newStats } from '../srs/scheduler'
import { selectBoardWords } from '../srs/sampler'
import type { SrsMap } from '../srs/types'
import { CITIES } from './cities'
import { cityBand, unlockedWords, wordsForCity } from './progress'

const NOW = 1_700_000_000_000

/** The sampler must fill a full board from the smallest possible pool. */
describe('board sampling from a journey-restricted pool', () => {
  // Every config the app deals, not every board SIZE — there are none (N1).
  const CONFIGS: Array<[string, GridConfig]> = [
    ['board', BOARD],
    ['tutorial', TUTORIAL_CONFIG],
    ['wrapup', WRAPUP_CONFIG],
  ]

  it.each(CONFIGS)(
    'fills a %s board from the 100-word first city across 200 seeds',
    (_name, config) => {
      const pool = unlockedWords(WORDS, 0)
      expect(pool.length).toBe(100)
      for (let seed = 1; seed <= 200; seed++) {
        const board = selectBoardWords(
          pool,
          {},
          { totalWords: config.totalWords, maxNewWordsPerBoard: config.maxNewWordsPerBoard },
          mulberry32(seed),
          NOW,
        )
        expect(board.length).toBe(config.totalWords)
        expect(new Set(board.map((w) => w.id)).size).toBe(config.totalWords)
      }
    },
  )

  // Ordinary journey boards are now dealt from the CURRENT city only (owner
  // decision, docs/clue-engine.md §3.4): a word from an earlier city must not
  // appear either. Asserting the lower bound (rank >= lo), not just the upper
  // one, is what makes this fail if the pool were still built with
  // `unlockedWords` (which is cumulative and would let city 0's words through
  // once the player is in city 1+) — checked by hand before this landed.
  it('never returns a word from another city', () => {
    const config = BOARD
    for (let city = 0; city < CITIES.length; city++) {
      const pool = wordsForCity(WORDS, city)
      const allowed = new Set(pool.map((w) => w.id))
      const [lo, hi] = cityBand(city)
      for (let seed = 1; seed <= 25; seed++) {
        const board = selectBoardWords(
          pool,
          {},
          { totalWords: config.totalWords, maxNewWordsPerBoard: config.maxNewWordsPerBoard },
          mulberry32(seed),
          NOW,
        )
        for (const w of board) {
          expect(allowed.has(w.id)).toBe(true)
          expect(curriculumRank(w)).toBeGreaterThanOrEqual(lo)
          expect(curriculumRank(w)).toBeLessThanOrEqual(hi)
        }
      }
    }
  })

  it('keeps boards unambiguous: the relaxation fallback almost never fires', () => {
    // Exclusions (shared stem, distance-1, shared gloss) can in principle
    // starve a small pool; measure how often a conflicting pair slips through.
    const config = BOARD
    const pool = unlockedWords(WORDS, 0)
    let conflicted = 0
    const rounds = 200
    for (let seed = 1; seed <= rounds; seed++) {
      const board = selectBoardWords(
        pool,
        {},
        { totalWords: config.totalWords, maxNewWordsPerBoard: config.maxNewWordsPerBoard },
        mulberry32(seed),
        NOW,
      )
      const hasConflict = board.some((a, i) =>
        board.slice(i + 1).some((b) => {
          if (danishStem(normalize(a.da)) === danishStem(normalize(b.da))) return true
          if (levenshtein(normalize(a.da), normalize(b.da)) <= 1) return true
          const glosses = new Set(a.en.map(normalize))
          return b.en.some((g) => glosses.has(normalize(g)))
        }),
      )
      if (hasConflict) conflicted++
    }
    // 20 of 100 words with the tightest pool in the game: allow a small tail.
    expect(conflicted / rounds).toBeLessThan(0.1)
  })

  it('stays clean when every word in the city has already been seen', () => {
    // Late in a city nothing is unseen. Reserved new-word slots would then fall
    // through to the relaxed fill, which ignores the exclusion rules and picks
    // in dataset order — the same filler words on every board.
    const config = BOARD
    const pool = unlockedWords(WORDS, 0)
    const srs: SrsMap = {}
    for (const w of pool) srs[w.id] = { ...newStats(NOW - 2 * 864e5), seen: 3 }

    const signatures = new Set<string>()
    let conflicted = 0
    for (let seed = 1; seed <= 100; seed++) {
      const board = selectBoardWords(
        pool,
        srs,
        { totalWords: config.totalWords, maxNewWordsPerBoard: config.maxNewWordsPerBoard },
        mulberry32(seed),
        NOW,
      )
      expect(board.length).toBe(config.totalWords)
      expect(new Set(board.map((w) => w.id)).size).toBe(config.totalWords)
      signatures.add(
        board
          .map((w) => w.id)
          .sort()
          .join(),
      )
      const hasConflict = board.some((a, i) =>
        board.slice(i + 1).some((b) => {
          if (danishStem(normalize(a.da)) === danishStem(normalize(b.da))) return true
          if (levenshtein(normalize(a.da), normalize(b.da)) <= 1) return true
          const glosses = new Set(a.en.map(normalize))
          return b.en.some((g) => glosses.has(normalize(g)))
        }),
      )
      if (hasConflict) conflicted++
    }
    expect(conflicted).toBe(0)
    // Boards must stay varied rather than converging on the same filler.
    expect(signatures.size).toBeGreaterThan(80)
  })

  it('still respects the new-word cap once the player has history', () => {
    const config = BOARD
    const pool = wordsForCity(WORDS, 1) // 100 words: city 1 alone, not city 0 too
    const srs: SrsMap = {}
    for (const w of pool.slice(0, 60)) srs[w.id] = { ...newStats(NOW - 3 * 864e5), seen: 2 }
    for (let seed = 1; seed <= 50; seed++) {
      const board = selectBoardWords(
        pool,
        srs,
        { totalWords: config.totalWords, maxNewWordsPerBoard: config.maxNewWordsPerBoard },
        mulberry32(seed),
        NOW,
      )
      const fresh = board.filter((w) => !(w.id in srs))
      expect(fresh.length).toBeLessThanOrEqual(config.maxNewWordsPerBoard)
    }
  })
})
