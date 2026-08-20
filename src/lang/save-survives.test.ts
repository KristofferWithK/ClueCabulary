import { describe, expect, it } from 'vitest'
import { canTravel, countCollection, wordState } from '../journey/progress'
import { WORDS } from '../data/words'
import { migrateGame } from '../stores/gameStore'
import { migrateJourney } from '../stores/journeyStore'
import { migrateSettings } from '../stores/settingsStore'
import { migrateSrs } from '../stores/srsStore'
import type { SrsMap } from '../srs/types'

/**
 * THE ONE THAT MATTERS: a save written before the language seam loads with
 * everything in it.
 *
 * The per-store suites check each migration on its own. This one takes a whole
 * coherent device — the four persisted blobs a real phone holds, at the
 * versions they were at yesterday — and pushes it through the seam in one go,
 * then asks the questions a player would: where am I, how many words do I have,
 * are they still packed, are my settings the ones I chose.
 *
 * There is exactly one irreversible failure in this app (see backup.ts): the
 * collection lives in one phone's localStorage and nowhere else. A seam that
 * costs a player one wrapped word is a worse outcome than no seam at all, and
 * this file is what says it did not.
 *
 * Mutation-checked: dropping `wrapped` from the journey migration fails four of
 * these, and dropping the v9 clue-language rewrite fails 'every setting is the
 * one the player chose'.
 */

const NOW = 1_755_000_000_000
const DAY = 86_400_000

/** 640 words met, 500 collected, 400 packed — a player five cities in. */
function realisticSave() {
  const met = WORDS.slice(0, 640)
  const stats: Record<string, unknown> = {}
  met.forEach((w, i) => {
    // Everything before 500 was collected the old way; the rest is half-met.
    const collected = i < 500
    stats[w.id] = {
      box: collected ? 3 : 1,
      lastSeenAt: NOW - (640 - i) * 3600_000,
      seen: collected ? 5 : 1,
      correctGuesses: collected ? 3 : 0,
      misses: collected ? 1 : 0,
      lookups: 0,
      redemptionRight: 0,
      redemptionWrong: 0,
      greenByClue: collected ? 2 : 0,
      greenByGuess: collected ? 1 : 0,
    }
  })
  return {
    // journey at v4 — the version shipped before the seam
    journey: {
      cityIndex: 4,
      wrapped: Object.fromEntries(WORDS.slice(0, 400).map((w, i) => [w.id, NOW - (400 - i) * DAY])),
      arrivedAt: { 0: NOW - 300 * DAY, 1: NOW - 200 * DAY, 4: NOW - 10 * DAY },
    },
    // srs at v3
    srs: {
      stats,
      games: { played: 61, won: 33, redeemed: 2, lost: 26 },
      wrapUpsBanked: 2,
    },
    // settings at v8: a player who chose the big board and turned sound off
    settings: {
      apiKey: '',
      baseUrl: 'https://cluecabulary-proxy.kristoffer-kai.workers.dev/v1',
      model: 'cluey',
      gridSize: 'standard',
      clueLanguage: 'da',
      studyPhase: 'always',
      useMock: false,
      sound: false,
      klausVerifiedAt: NOW - DAY,
    },
    // game at v5: a round put down mid-play
    game: {
      game: { words: [{ wordId: 'w1', da: 'hus' }], phase: 'playerClueInput' },
      lookedUp: ['da:hus'],
      recentBoards: [['da:hus', 'da:kat']],
      roundRecorded: false,
      mode: 'normal',
      newlyLearned: [],
      newlyDiscovered: [],
    },
  }
}

const loaded = () => {
  const save = realisticSave()
  return {
    journey: migrateJourney(save.journey, 4) as {
      cityIndex: number
      wrapped: Record<string, number>
      arrivedAt: Record<number, number>
      routeLanguage: string
      parked: Record<string, unknown>
    },
    srs: migrateSrs(save.srs, 3) as { stats: SrsMap; games: Record<string, number> },
    settings: migrateSettings(save.settings, 8) as Record<string, unknown>,
    game: migrateGame(save.game, 5) as Record<string, unknown>,
    before: save,
  }
}

describe('a save written before the language seam', () => {
  it('keeps every wrapped word, with the day it was packed', () => {
    const { journey, before } = loaded()
    expect(Object.keys(journey.wrapped)).toHaveLength(400)
    expect(journey.wrapped).toEqual(before.journey.wrapped)
  })

  it('keeps the journey position and the travel log', () => {
    const { journey, before } = loaded()
    expect(journey.cityIndex).toBe(4)
    expect(journey.arrivedAt).toEqual(before.journey.arrivedAt)
    expect(journey.routeLanguage).toBe('da')
  })

  it('still reads as the same collection, word for word', () => {
    const { journey, srs } = loaded()
    const counts = countCollection(WORDS, srs.stats, journey.wrapped)
    expect(counts.wrapped).toBe(400)
    expect(counts.collected).toBe(100) // 500 collected, 400 of them packed
    expect(counts.discovered).toBe(140) // 640 met, 500 collected
    expect(counts.total).toBe(900)
  })

  it('keeps the road open exactly where it was open', () => {
    const { journey, before } = loaded()
    // Four cities' worth packed, so the road out of the fourth is open and the
    // fifth — the one they are standing in — is not.
    expect(canTravel(WORDS, journey.wrapped, 3)).toBe(true)
    expect(canTravel(WORDS, journey.wrapped, 4)).toBe(false)
    expect(canTravel(WORDS, before.journey.wrapped, 3)).toBe(true)
  })

  it('keeps every word record, and none of them regresses', () => {
    const { srs, journey } = loaded()
    expect(Object.keys(srs.stats)).toHaveLength(640)
    for (const [id, s] of Object.entries(srs.stats)) {
      const wasCollected = s.greenByClue > 0 && s.greenByGuess > 0
      expect(wordState(s, id in journey.wrapped)).toBe(
        id in journey.wrapped ? 'wrapped' : wasCollected ? 'collected' : 'discovered',
      )
    }
  })

  it('keeps the games tally and the banked wrap-ups', () => {
    const { srs, before } = loaded()
    expect(srs.games).toEqual(before.srs.games)
    expect((srs as unknown as { wrapUpsBanked: number }).wrapUpsBanked).toBe(2)
  })

  it('keeps every setting the player chose', () => {
    const { settings, before } = loaded()
    expect(settings.gridSize).toBe('standard')
    expect(settings.studyPhase).toBe('always')
    expect(settings.sound).toBe(false)
    expect(settings.model).toBe('cluey')
    expect(settings.klausVerifiedAt).toBe(before.settings.klausVerifiedAt)
    // The one value that MOVES, and it means the same thing on both sides: the
    // player asked to be clued in the language they are learning, and still is.
    expect(settings.clueLanguage).toBe('target')
  })

  it('resumes the round they were in the middle of', () => {
    const { game, before } = loaded()
    expect(game.game).toEqual(before.game.game)
    expect(game.lookedUp).toEqual(['da:hus'])
    expect(game.gameLanguage).toBe('da')
  })

  it('lands nothing on another language', () => {
    // Nothing in a Danish save should have been filed under, or attributed to,
    // a language the player has never played.
    const { journey, srs } = loaded()
    expect(journey.parked).toEqual({})
    for (const id of Object.keys(srs.stats)) expect(id.startsWith('da:')).toBe(true)
    for (const id of Object.keys(journey.wrapped)) expect(id.startsWith('da:')).toBe(true)
  })
})
