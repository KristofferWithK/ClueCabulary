import { describe, expect, it } from 'vitest'
import type { WordEntry } from '../data/types'
import { mulberry32 } from '../engine/rng'
import { newStats } from './scheduler'
import type { SrsMap } from './types'
import { selectBoardWords } from './sampler'

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
})
