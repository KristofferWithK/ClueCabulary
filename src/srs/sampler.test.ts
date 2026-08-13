import { describe, expect, it } from 'vitest'
import type { WordEntry } from '../data/types'
import { mulberry32 } from '../engine/rng'
import { WORDS, curriculumRank } from '../data/words'
import { applyRoundResults, newStats } from './scheduler'
import type { SrsMap } from './types'
import { MAX_CARRY_OVER, selectBoardWords, selectDailyWords } from './sampler'

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

/**
 * "I'm getting a lot of the same words", reported from real play — and true.
 * Measured before this: 4.8 of 12 words carried over from one board to the
 * next in a sitting, and one word appeared on 8 boards out of 10.
 *
 * Two things fixed it. Box-0 words stopped counting as maximally overdue
 * seconds after being played (see scheduler.test.ts), and the sampler gained a
 * hard ceiling: at most MAX_CARRY_OVER words may come back from the board just
 * played, whatever the weights want.
 *
 * The ceiling is not a target. In practice, once a player has a pool to draw
 * from, consecutive boards share none at all — which is not a loss of review,
 * because the words still return a few boards later. That is better spacing
 * than back-to-back, not worse.
 */
describe('how much a board repeats the last one', () => {
  const city = [...WORDS].sort((a, b) => curriculumRank(a) - curriculumRank(b)).slice(0, 100)

  /** Rounds back to back, the way a person on a sofa plays them. */
  function sitting(rounds: number, minutesApart: number, seed: number, total = 12, maxNew = 4) {
    let srs: SrsMap = {}
    let now = Date.UTC(2026, 0, 1, 12)
    const boards: string[][] = []
    const rng = mulberry32(seed)
    let previous: string[] = []
    for (let r = 0; r < rounds; r++) {
      const board = selectBoardWords(
        city,
        srs,
        { totalWords: total, maxNewWordsPerBoard: maxNew, previousBoard: new Set(previous) },
        rng,
        now,
      )
      const ids = board.map((w) => w.id)
      boards.push(ids)
      previous = ids
      srs = applyRoundResults(
        srs,
        ids.map((id, i) => ({
          wordId: id,
          guessedGreen: i % 3 === 0,
          guessedWrong: i % 5 === 0,
          lookedUp: i % 7 === 0,
        })),
        now,
      )
      now += minutesApart * 60_000
    }
    const overlaps = boards.slice(1).map((b, i) => {
      const prev = new Set(boards[i]!)
      return b.filter((id) => prev.has(id)).length
    })
    const counts = new Map<string, number>()
    for (const b of boards) for (const id of b) counts.set(id, (counts.get(id) ?? 0) + 1)
    return {
      maxOverlap: Math.max(...overlaps),
      distinct: counts.size,
      totalSlots: rounds * total,
      worst: Math.max(...counts.values()),
    }
  }

  it('never shares more than three words with the board before it', () => {
    for (const [rounds, minutes, seed] of [
      [10, 5, 1],
      [25, 5, 3],
      [10, 60 * 24, 2],
    ] as const) {
      expect(sitting(rounds, minutes, seed).maxOverlap).toBeLessThanOrEqual(MAX_CARRY_OVER)
    }
  })

  it('on the bigger boards too, where there is more room to repeat', () => {
    expect(sitting(10, 5, 1, 20, 6).maxOverlap).toBeLessThanOrEqual(MAX_CARRY_OVER)
    expect(sitting(10, 5, 4, 15, 5).maxOverlap).toBeLessThanOrEqual(MAX_CARRY_OVER)
  })

  /**
   * The ceiling outranks maxNewWordsPerBoard, and has to. On round two every
   * word the player has seen IS the board they just played, so honouring the
   * cap means introducing more new words than the review budget wanted. If
   * this ever regresses, the cap silently becomes unenforceable exactly when
   * repetition is most obvious.
   */
  it('holds on the second round, when everything seen is what was just played', () => {
    let srs: SrsMap = {}
    const now = Date.UTC(2026, 0, 1, 12)
    const rng = mulberry32(9)
    const first = selectBoardWords(city, srs, { totalWords: 12, maxNewWordsPerBoard: 4 }, rng, now)
    srs = applyRoundResults(
      srs,
      first.map((w) => ({ wordId: w.id, guessedGreen: false, guessedWrong: true, lookedUp: false })),
      now,
    )
    const second = selectBoardWords(
      city,
      srs,
      { totalWords: 12, maxNewWordsPerBoard: 4, previousBoard: new Set(first.map((w) => w.id)) },
      rng,
      now + 60_000,
    )
    const shared = second.filter((w) => first.some((f) => f.id === w.id))
    expect(shared.length).toBeLessThanOrEqual(MAX_CARRY_OVER)
    expect(second).toHaveLength(12)
  })

  it('still brings words back, just not on the very next board', () => {
    const { distinct, totalSlots } = sitting(10, 5, 1)
    // 120 slots over 53 distinct words: review is happening, spread out.
    expect(distinct).toBeLessThan(totalSlots)
    expect(distinct).toBeGreaterThan(40)
  })

  it('and lets no single word dominate a sitting', () => {
    // Was 8 boards out of 10 before any of this.
    expect(sitting(10, 5, 1).worst).toBeLessThanOrEqual(5)
  })
})
