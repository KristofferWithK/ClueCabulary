import { describe, expect, it } from 'vitest'
import type { WordEntry } from '../data/types'
import { mulberry32 } from '../engine/rng'
import { newStats } from './scheduler'
import type { SrsMap } from './types'
import { selectBoardWords, selectDailyWords } from './sampler'

const NOW = 1_700_000_000_000
const DAY = 24 * 60 * 60 * 1000

// Names constructed so no two entries collide on stems, distance-1 or glosses.
const makeDataset = (n: number): WordEntry[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `id${i}`,
    da: `dansk${i}ord${i}`,
    en: [`gloss${i}word${i}`],
    pos: 'noun' as const,
    exampleDa: 'x',
    exampleEn: 'x',
    freqRank: i + 1,
  }))

const OPTS = { totalWords: 12, maxNewWordsPerBoard: 4 }

describe('selectBoardWords', () => {
  it('bootstrap: empty SRS fills the whole board from the front of the frequency list', () => {
    const all = makeDataset(100)
    const board = selectBoardWords(all, {}, OPTS, mulberry32(1), NOW)
    expect(board.length).toBe(12)
    expect(new Set(board.map((w) => w.id)).size).toBe(12)
    // All picks come from the frontier window at the front of the ranking.
    expect(Math.max(...board.map((w) => w.freqRank))).toBeLessThanOrEqual(15)
  })

  it('caps new words once enough words have been seen', () => {
    const all = makeDataset(100)
    const srs: SrsMap = {}
    for (let i = 0; i < 40; i++) srs[`id${i}`] = { ...newStats(NOW - 2 * DAY), seen: 1 }
    for (let seed = 1; seed <= 20; seed++) {
      const board = selectBoardWords(all, srs, OPTS, mulberry32(seed), NOW)
      const newWords = board.filter((w) => !(w.id in srs))
      expect(newWords.length).toBeLessThanOrEqual(OPTS.maxNewWordsPerBoard)
      // New words are introduced along the ranking: from the unseen frontier.
      for (const w of newWords) expect(w.freqRank).toBeLessThanOrEqual(40 + 15 + 3)
    }
  })

  it('oversamples overdue/struggling words', () => {
    const all = makeDataset(60)
    const srs: SrsMap = {}
    for (let i = 0; i < 60; i++) {
      srs[`id${i}`] =
        i < 5
          ? { ...newStats(NOW - 10 * DAY), box: 1, seen: 3, misses: 3 } // overdue + struggling
          : { ...newStats(NOW - 1 * DAY), box: 4, seen: 5, misses: 0 } // well known, fresh
    }
    let strugglingHits = 0
    let smoothHits = 0
    for (let seed = 1; seed <= 100; seed++) {
      const board = selectBoardWords(all, srs, OPTS, mulberry32(seed), NOW)
      for (const w of board) {
        const i = Number(w.id.slice(2))
        if (i < 5) strugglingHits++
        else smoothHits++
      }
    }
    // 5 struggling vs 55 smooth words: per-word inclusion must be far higher for struggling.
    expect(strugglingHits / 5).toBeGreaterThan((smoothHits / 55) * 2)
  })

  it('never co-selects conflicting words (stems, distance-1, shared gloss)', () => {
    const all = makeDataset(30)
    // Inject conflict pairs.
    all[0] = { ...all[0]!, da: 'hus', en: ['house'] }
    all[1] = { ...all[1]!, da: 'huset', en: ['building'] } // shared stem with hus
    all[2] = { ...all[2]!, da: 'kat', en: ['cat'] }
    all[3] = { ...all[3]!, da: 'hat', en: ['hat'] } // distance 1 from kat
    all[4] = { ...all[4]!, da: 'dreng', en: ['boy'] }
    all[5] = { ...all[5]!, da: 'knægt', en: ['boy', 'lad'] } // shared gloss
    for (let seed = 1; seed <= 60; seed++) {
      const board = selectBoardWords(all, {}, OPTS, mulberry32(seed), NOW)
      const ids = new Set(board.map((w) => w.id))
      expect(ids.has('id0') && ids.has('id1')).toBe(false)
      expect(ids.has('id2') && ids.has('id3')).toBe(false)
      expect(ids.has('id4') && ids.has('id5')).toBe(false)
    }
  })

  it('is deterministic for a given seed', () => {
    const all = makeDataset(50)
    const a = selectBoardWords(all, {}, OPTS, mulberry32(42), NOW)
    const b = selectBoardWords(all, {}, OPTS, mulberry32(42), NOW)
    expect(a.map((w) => w.id)).toEqual(b.map((w) => w.id))
  })

  it('throws when the dataset is too small', () => {
    expect(() => selectBoardWords(makeDataset(5), {}, OPTS, mulberry32(1), NOW)).toThrow()
  })

  describe('banked words', () => {
    // Every word seen and identically scheduled, so the only thing that can
    // separate them in the draw is whether they are banked.
    const all = makeDataset(60)
    const srs: SrsMap = {}
    for (const w of all) srs[w.id] = { ...newStats(NOW - 2 * DAY), seen: 1 }
    const collected = new Set(all.slice(0, 30).map((w) => w.id))

    const bankedShare = (opts: typeof OPTS & { collected?: ReadonlySet<string> }) => {
      let banked = 0
      let total = 0
      for (let seed = 1; seed <= 300; seed++) {
        const board = selectBoardWords(all, srs, opts, mulberry32(seed), NOW)
        for (const w of board) {
          total++
          if (collected.has(w.id)) banked++
        }
      }
      return banked / total
    }

    it('draws banked words less often than unbanked ones', () => {
      // Half the pool is banked, so an unaware sampler sits at ~0.5.
      expect(bankedShare(OPTS)).toBeGreaterThan(0.45)
      expect(bankedShare({ ...OPTS, collected })).toBeLessThan(0.35)
    })

    it('still brings banked words back — damped, not excluded', () => {
      expect(bankedShare({ ...OPTS, collected })).toBeGreaterThan(0.15)
    })

    it('fills a full board even when every word is banked', () => {
      const allBanked = new Set(all.map((w) => w.id))
      const board = selectBoardWords(all, srs, { ...OPTS, collected: allBanked }, mulberry32(7), NOW)
      expect(board.length).toBe(OPTS.totalWords)
      expect(new Set(board.map((w) => w.id)).size).toBe(OPTS.totalWords)
    })
  })
})

describe('selectDailyWords', () => {
  // The daily challenge is sold on being the same board for everyone on the
  // same date, drawn from the whole dataset rather than one player's history.
  const all = makeDataset(400)

  it('is the same board for the same seed, and a different one otherwise', () => {
    const a = selectDailyWords(all, 20, mulberry32(20260812)).map((w) => w.id)
    const b = selectDailyWords(all, 20, mulberry32(20260812)).map((w) => w.id)
    const c = selectDailyWords(all, 20, mulberry32(20260813)).map((w) => w.id)
    expect(a).toEqual(b)
    expect(a).not.toEqual(c)
  })

  it('draws from the whole dataset, not the front of the ranking', () => {
    let deepest = 0
    for (let seed = 1; seed <= 40; seed++) {
      for (const w of selectDailyWords(all, 20, mulberry32(seed))) {
        deepest = Math.max(deepest, w.freqRank)
      }
    }
    expect(deepest).toBeGreaterThan(200)
  })

  it('ignores the player entirely — no SRS argument exists to pass', () => {
    expect(selectDailyWords.length).toBe(3)
  })

  it('fills a full board of distinct words', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const board = selectDailyWords(all, 20, mulberry32(seed))
      expect(board.length).toBe(20)
      expect(new Set(board.map((w) => w.id)).size).toBe(20)
    }
  })

  it('throws when the dataset is too small', () => {
    expect(() => selectDailyWords(makeDataset(5), 20, mulberry32(1))).toThrow()
  })
})
