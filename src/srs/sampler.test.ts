import { describe, expect, it } from 'vitest'
import type { WordEntry } from '../data/types'
import { mulberry32 } from '../engine/rng'
import { WORDS, curriculumRank } from '../data/words'
import { applyRoundResults, newStats } from './scheduler'
import type { SrsMap } from './types'
import { CARRY_OVER, selectBoardWords, selectDailyWords } from './sampler'

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
 * seconds after being played (see scheduler.test.ts), and the sampler took
 * control of the overlap directly instead of hoping the weights would.
 *
 * The first attempt made it a ceiling — at most three — and that was the wrong
 * rule twice over. It measured at an average of 0.3 words in common, because
 * the fresh half of the pool was drawn first and spent the review budget before
 * the ceiling was ever near; and "at most three" was not what was asked for:
 * "It seems like a simple rule. Every board has 3 words from the previous
 * round." So it is a quota now, drawn first, and these tests assert the floor
 * as well as the ceiling.
 */
describe('how much a board repeats the last one', () => {
  const city = [...WORDS].sort((a, b) => curriculumRank(a) - curriculumRank(b)).slice(0, 100)

  /** Rounds back to back, the way a person on a sofa plays them. */
  function sitting(rounds: number, minutesApart: number, seed: number, total = 12, maxNew = 4) {
    let srs: SrsMap = {}
    let now = Date.UTC(2026, 0, 1, 12)
    const boards: string[][] = []
    const rng = mulberry32(seed)
    let recent: Set<string>[] = []
    for (let r = 0; r < rounds; r++) {
      const board = selectBoardWords(
        city,
        srs,
        { totalWords: total, maxNewWordsPerBoard: maxNew, recentBoards: recent },
        rng,
        now,
      )
      const ids = board.map((w) => w.id)
      boards.push(ids)
      recent = [new Set(ids), ...recent].slice(0, 2)
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
      minOverlap: Math.min(...overlaps),
      distinct: counts.size,
      totalSlots: rounds * total,
      worst: Math.max(...counts.values()),
    }
  }

  it('shares exactly three words with the board before it, every board', () => {
    for (const [rounds, minutes, seed] of [
      [10, 5, 1],
      [25, 5, 3],
      [10, 60 * 24, 2],
    ] as const) {
      const { minOverlap, maxOverlap } = sitting(rounds, minutes, seed)
      expect(maxOverlap).toBe(CARRY_OVER)
      expect(minOverlap).toBe(CARRY_OVER)
    }
  })

  it('on the bigger boards too, where there is more room to repeat', () => {
    for (const [total, maxNew, seed] of [
      [20, 6, 1],
      [15, 5, 4],
    ] as const) {
      const { minOverlap, maxOverlap } = sitting(10, 5, seed, total, maxNew)
      expect(maxOverlap).toBe(CARRY_OVER)
      expect(minOverlap).toBe(CARRY_OVER)
    }
  })

  /**
   * The quota outranks maxNewWordsPerBoard, and has to. On round two every word
   * the player has seen IS the board they just played, so keeping the other
   * nine slots off it means introducing more new words than the review budget
   * wanted. If this ever regresses, the rule silently stops holding exactly
   * when repetition is most obvious.
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
      { totalWords: 12, maxNewWordsPerBoard: 4, recentBoards: [new Set(first.map((w) => w.id))] },
      rng,
      now + 60_000,
    )
    const shared = second.filter((w) => first.some((f) => f.id === w.id))
    expect(shared.length).toBe(CARRY_OVER)
    expect(second).toHaveLength(12)
  })

  /**
   * WHICH three come back is the quota's one degree of freedom, and it is spent
   * on practice need: the three of the last board the player is shakiest on.
   * Here every word was answered wrong except one, and that one is the one that
   * does not come back — measured at 8.5% against the 25% an even draw gives it.
   *
   * The margin is a function of the gap, because most of what separates a
   * failed word from a passed one is that box 0 comes due in twenty minutes and
   * box 1 in a day. Five minutes later it is 8.5%; half an hour later, 2%; one
   * minute later, 18%, because that early both are still clamped to the same
   * floor. Five is the gap between two rounds played back to back, so that is
   * what this measures.
   */
  it('brings back the words that went worst, not an arbitrary three', () => {
    let srs: SrsMap = {}
    const now = Date.UTC(2026, 0, 1, 12)
    const first = selectBoardWords(
      city,
      srs,
      { totalWords: 12, maxNewWordsPerBoard: 4 },
      mulberry32(11),
      now,
    )
    const easy = first[0]!
    srs = applyRoundResults(
      srs,
      first.map((w) => ({
        wordId: w.id,
        guessedGreen: w.id === easy.id,
        guessedWrong: w.id !== easy.id,
        lookedUp: false,
      })),
      now,
    )
    // Repeated draws: the quota is weighted, not deterministic, so the claim is
    // about what the weighting does over a sitting, not about one lucky sample.
    let easyReturns = 0
    for (let i = 0; i < 100; i++) {
      const next = selectBoardWords(
        city,
        srs,
        { totalWords: 12, maxNewWordsPerBoard: 4, recentBoards: [new Set(first.map((w) => w.id))] },
        mulberry32(1000 + i),
        now + 5 * 60_000,
      )
      if (next.some((w) => w.id === easy.id)) easyReturns++
    }
    // Three of twelve is 25 in 100 for a word drawn evenly.
    expect(easyReturns).toBeLessThan(15)
  })

  /**
   * The quota chains if it is allowed to: three words carry to the next board,
   * and nothing stops the same three carrying again, and again. Measured at one
   * word on seven boards out of ten — which is the complaint that started all
   * of this, arriving by a different route. A word that has already carried
   * over sits the next board out, which is what the second entry in
   * recentBoards is for.
   */
  it('lets no word ride the quota board after board', () => {
    let srs: SrsMap = {}
    const now = Date.UTC(2026, 0, 1, 12)
    const rng = mulberry32(5)
    const boards: string[][] = []
    let recent: Set<string>[] = []
    for (let r = 0; r < 6; r++) {
      const board = selectBoardWords(
        city,
        srs,
        { totalWords: 12, maxNewWordsPerBoard: 4, recentBoards: recent },
        rng,
        now + r * 5 * 60_000,
      )
      const ids = board.map((w) => w.id)
      boards.push(ids)
      recent = [new Set(ids), ...recent].slice(0, 2)
      srs = applyRoundResults(
        srs,
        ids.map((id) => ({ wordId: id, guessedGreen: false, guessedWrong: true, lookedUp: false })),
        now + r * 5 * 60_000,
      )
    }
    // Every word answered wrong every time, so the weights want all of them
    // back: nothing but the rule itself is stopping a chain here.
    for (let i = 2; i < boards.length; i++) {
      const three = new Set(boards[i]!.filter((id) => boards[i - 1]!.includes(id)))
      expect(three.size).toBe(CARRY_OVER)
      for (const id of three) expect(boards[i - 2]).not.toContain(id)
    }
  })

  /**
   * The rule used to be written over the SEEN words only, and every test here
   * fed it an SRS map where everything was seen, so every test passed while the
   * app repeated ten of twelve words board after board. A browser drive found
   * it; this is the cheap version of that drive.
   *
   * The gap is worth naming, because it is not an oversight so much as a shape:
   * a word is "seen" once a round it appeared in has been FINISHED, so a player
   * who abandons rounds — or is simply on their second board ever — has an
   * empty SRS map and a previous board made entirely of words the rule did not
   * cover. Which is the first ten minutes of the game, for everybody.
   */
  it('holds when nothing has been recorded yet, which is everybody at first', () => {
    const rng = mulberry32(3)
    let recent: Set<string>[] = []
    let previousIds: string[] = []
    for (let r = 0; r < 5; r++) {
      // The SRS map stays empty on purpose: no round was ever finished.
      const board = selectBoardWords(
        city,
        {},
        { totalWords: 12, maxNewWordsPerBoard: 4, recentBoards: recent },
        rng,
        Date.UTC(2026, 0, 1, 12),
      )
      const ids = board.map((w) => w.id)
      if (r > 0) {
        expect(ids.filter((id) => previousIds.includes(id))).toHaveLength(CARRY_OVER)
      }
      expect(new Set(ids).size).toBe(12)
      previousIds = ids
      recent = [new Set(ids), ...recent].slice(0, 2)
    }
  })

  it('still brings words back later too, not only the quota', () => {
    const { distinct, totalSlots } = sitting(10, 5, 1)
    // 120 slots over a few dozen distinct words: review is happening, spread out.
    expect(distinct).toBeLessThan(totalSlots)
    expect(distinct).toBeGreaterThan(30)
  })

  /**
   * Was 8 boards out of 10 before any of this, and 5 under the ceiling that
   * came first. Six is the price of the quota, and it is worth being explicit
   * that it IS a price: three words a board must come back, so a hundred-word
   * city cannot spread ten boards as thinly as it could when zero had to. What
   * six looks like is a word the player keeps getting wrong returning every
   * other board, which is roughly what box 0 asks for anyway.
   */
  it('and lets no single word dominate a sitting', () => {
    expect(sitting(10, 5, 1).worst).toBeLessThanOrEqual(6)
  })
})

/**
 * "I want a reroll button at the beginning to reroll the board if I have no
 * idea on how to connect the words."
 *
 * The reroll is not the carry-over rule wearing a different hat, and the first
 * version of it got that wrong: it passed the rejected board through the
 * recentBoards window, which asks the sampler to bring three words BACK, and
 * otherwise had no opinion about the words on screen. Measured through the app,
 * a 3x4 reroll returned 7 of the same 12 words — the button re-shuffled a board
 * the player had just said they could not read.
 *
 * `avoid` is the other request, stated separately because it is the opposite
 * one: keep these off, and the rejected board is what a reroll passes to it.
 */
describe('a board dealt to replace one the player rejected', () => {
  const city = [...WORDS].sort((a, b) => curriculumRank(a) - curriculumRank(b)).slice(0, 100)

  /** An SRS where every city word has been seen, so the review pool is real. */
  const allSeen = (): SrsMap =>
    Object.fromEntries(city.map((w) => [w.id, newStats(NOW - 5 * DAY)]))

  it('keeps the rejected words off entirely when the pool has room', () => {
    const rejected = selectBoardWords(city, allSeen(), OPTS, mulberry32(1), NOW)
    const replacement = selectBoardWords(
      city,
      allSeen(),
      { ...OPTS, avoid: new Set(rejected.map((w) => w.id)) },
      mulberry32(2),
      NOW,
    )
    expect(replacement).toHaveLength(12)
    expect(replacement.filter((w) => rejected.some((r) => r.id === w.id))).toEqual([])
  })

  /**
   * Both rules at once, which is the shape a real reroll has: three words come
   * back from the board actually PLAYED, and none from the one just rejected —
   * except where those overlap, since the rejected board carried three from the
   * same place.
   */
  it('still owes its three to the last board played', () => {
    const srs = allSeen()
    const played = selectBoardWords(city, srs, OPTS, mulberry32(1), NOW)
    const playedIds = new Set(played.map((w) => w.id))
    const rejected = selectBoardWords(
      city,
      srs,
      { ...OPTS, recentBoards: [playedIds] },
      mulberry32(2),
      NOW,
    )
    const replacement = selectBoardWords(
      city,
      srs,
      { ...OPTS, recentBoards: [playedIds], avoid: new Set(rejected.map((w) => w.id)) },
      mulberry32(3),
      NOW,
    )
    expect(replacement).toHaveLength(12)
    expect(replacement.filter((w) => playedIds.has(w.id))).toHaveLength(CARRY_OVER)
    // Zero, not "at most three". The carry-over pool honours `avoid` too, and
    // it can always afford to: the rejected board took only CARRY_OVER words
    // from the played one, so at least nine are left to draw the quota from.
    // Without that the three would come back unchanged — they are drawn by
    // practice need, and the need has not moved since the board was rejected —
    // and the reroll would read as a shuffle of the same three.
    expect(replacement.filter((w) => rejected.some((r) => r.id === w.id))).toEqual([])
  })

  /**
   * Soft, not absolute. A pool too small to honour it must still deal a board:
   * a familiar word is a disappointment, an app that cannot deal is a bug.
   */
  it('is given up rather than starving a board that cannot be filled without it', () => {
    const tiny = makeDataset(14)
    const board = selectBoardWords(
      tiny,
      {},
      { ...OPTS, avoid: new Set(tiny.slice(0, 10).map((w) => w.id)) },
      mulberry32(4),
      NOW,
    )
    expect(board).toHaveLength(12)
    expect(new Set(board.map((w) => w.id)).size).toBe(12)
  })

  it('and changes nothing at all when it is not passed', () => {
    const withOut = selectBoardWords(city, allSeen(), OPTS, mulberry32(7), NOW)
    const withEmpty = selectBoardWords(
      city,
      allSeen(),
      { ...OPTS, avoid: new Set() },
      mulberry32(7),
      NOW,
    )
    expect(withEmpty.map((w) => w.id)).toEqual(withOut.map((w) => w.id))
  })
})
