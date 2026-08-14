import { describe, expect, it } from 'vitest'
import { LEARN_REPS } from '../journey/progress'
import { newStats } from '../srs/scheduler'
import type { SrsMap, WordStats } from '../srs/types'
import {
  BACKUP_FORMAT,
  betterRecord,
  buildBackup,
  mergeSnapshot,
  parseBackup,
  replaceSnapshot,
  summarize,
  type Snapshot,
} from './backup'

const NOW = 1_700_000_000_000
const DAY = 86_400_000

const stats = (patch: Partial<WordStats> = {}): WordStats => ({ ...newStats(NOW), ...patch })

const snapshot = (patch: Partial<Snapshot> = {}): Snapshot => ({
  stats: {},
  games: { played: 0, won: 0, redeemed: 0, lost: 0 },
  journey: { cityIndex: 0, stamps: {}, banked: {}, trialsSpent: {}, arrivedAt: {} },
  prefs: { gridSize: 'beginner', clueLanguage: 'en', studyPhase: 'auto' },
  ...patch,
})

const roundTrip = (s: Snapshot) => {
  const parsed = parseBackup(JSON.stringify(buildBackup(s, NOW)))
  if (!parsed.ok) throw new Error(parsed.error)
  return parsed.backup
}

describe('export and parse', () => {
  it('survives a round trip through JSON', () => {
    const s = snapshot({
      stats: { hus: stats({ correctGuesses: 2, seen: 4, box: 3 }) },
      games: { played: 9, won: 4, redeemed: 1, lost: 4 },
      journey: {
        cityIndex: 2,
        stamps: { 0: 5, 1: 5, 2: 1 },
        banked: { hus: NOW - DAY },
        trialsSpent: { 2: 3 },
        arrivedAt: { 1: NOW - 5 * DAY, 2: NOW - DAY },
      },
    })
    const back = roundTrip(s)
    expect(back.format).toBe(BACKUP_FORMAT)
    expect(back.srs.stats.hus).toEqual(s.stats.hus)
    expect(back.journey.stamps).toEqual({ 0: 5, 1: 5, 2: 1 })
    expect(back.journey.cityIndex).toBe(2)
    expect(back.srs.games.played).toBe(9)
  })

  it('never carries the API key, whatever is in the store', () => {
    const text = JSON.stringify(buildBackup(snapshot(), NOW))
    expect(text).not.toContain('apiKey')
    expect(text).not.toContain('baseUrl')
    // And the schema has no room for one to sneak in later.
    const parsed = parseBackup(JSON.stringify({ ...JSON.parse(text), apiKey: 'sk-secret' }))
    expect(parsed.ok).toBe(true)
    if (parsed.ok) expect(JSON.stringify(parsed.backup)).not.toContain('sk-secret')
  })

  it('rejects junk with a message a person can act on', () => {
    expect(parseBackup('not json at all')).toMatchObject({ ok: false })
    expect(parseBackup('{"hello":"world"}')).toMatchObject({ ok: false })
    expect(parseBackup('[]')).toMatchObject({ ok: false })
    const notMine = parseBackup('{"hello":"world"}')
    if (!notMine.ok) expect(notMine.error).toContain('another app')
  })

  it('rejects a backup from a future version rather than half-reading it', () => {
    const future = { ...buildBackup(snapshot(), NOW), format: BACKUP_FORMAT + 1 }
    const parsed = parseBackup(JSON.stringify(future))
    expect(parsed.ok).toBe(false)
    if (!parsed.ok) expect(parsed.error).toContain('newer version')
  })

  it('rejects a city index off the route, which a restore would write straight through', () => {
    // cityAt throws outside the route and the value goes into the store
    // unexamined, so this bound is the only thing between a bad file and a
    // permanently blank app.
    for (const bad of [99, -3, 10, 1.5]) {
      const file = buildBackup(snapshot(), NOW)
      file.journey.cityIndex = bad
      expect(parseBackup(JSON.stringify(file)).ok).toBe(false)
    }
    const good = buildBackup(snapshot(), NOW)
    good.journey.cityIndex = 9
    expect(parseBackup(JSON.stringify(good)).ok).toBe(true)
  })

  it('rejects preferences it would otherwise cast into settings', () => {
    // A gridSize that is not a real one makes every new game throw when it
    // looks up its config.
    const cases: [keyof ReturnType<typeof snapshot>['prefs'], string][] = [
      ['gridSize', 'enormous'],
      ['clueLanguage', 'fr'],
      ['studyPhase', 'sometimes'],
    ]
    for (const [field, value] of cases) {
      const file = buildBackup(snapshot(), NOW)
      ;(file.prefs as Record<string, string>)[field] = value
      expect(parseBackup(JSON.stringify(file)).ok).toBe(false)
    }
  })

  it('rejects a file whose word records are the wrong shape', () => {
    const bad = buildBackup(snapshot({ stats: { hus: stats() } }), NOW)
    // @ts-expect-error deliberately corrupting the record
    bad.srs.stats.hus.box = 9
    expect(parseBackup(JSON.stringify(bad)).ok).toBe(false)
  })

  /**
   * Files written before the directional counters existed have no
   * greenByClue/greenByGuess. They restore by the same rule migrateSrs uses
   * on a v1 store: a record the old model called learned arrives collected,
   * anything short arrives with zeroes.
   */
  it('normalizes a counter-less file with the migration seeding rule', () => {
    const file = buildBackup(
      snapshot({
        stats: {
          learned: stats({ correctGuesses: 3 }),
          part: stats({ correctGuesses: 2 }),
        },
      }),
      NOW,
    )
    const json = JSON.parse(JSON.stringify(file)) as {
      srs: { stats: Record<string, Record<string, number>> }
    }
    delete json.srs.stats.learned!.greenByClue
    delete json.srs.stats.learned!.greenByGuess
    delete json.srs.stats.part!.greenByClue
    delete json.srs.stats.part!.greenByGuess
    const parsed = parseBackup(JSON.stringify(json))
    expect(parsed.ok).toBe(true)
    if (parsed.ok) {
      expect(parsed.backup.srs.stats.learned).toMatchObject({ greenByClue: 1, greenByGuess: 1 })
      expect(parsed.backup.srs.stats.part).toMatchObject({ greenByClue: 0, greenByGuess: 0 })
    }
  })
})

describe('betterRecord', () => {
  it('prefers the record that knows the word better', () => {
    const weak = stats({ correctGuesses: 1, seen: 9 })
    const strong = stats({ correctGuesses: 3, seen: 3 })
    expect(betterRecord(weak, strong)).toBe(strong)
    expect(betterRecord(strong, weak)).toBe(strong)
  })

  it('falls back to more history, then to more recent', () => {
    const seenMore = stats({ correctGuesses: 2, seen: 8 })
    const seenLess = stats({ correctGuesses: 2, seen: 2 })
    expect(betterRecord(seenLess, seenMore)).toBe(seenMore)

    const older = stats({ correctGuesses: 2, seen: 2, lastSeenAt: NOW - DAY })
    const newer = stats({ correctGuesses: 2, seen: 2, lastSeenAt: NOW })
    expect(betterRecord(older, newer)).toBe(newer)
  })

  it('returns a whole record, never a blend of two', () => {
    const a = stats({ correctGuesses: 3, seen: 3, misses: 0, box: 4 })
    const b = stats({ correctGuesses: 1, seen: 20, misses: 12, box: 0 })
    expect(betterRecord(a, b)).toEqual(a)
  })
})

describe('merge', () => {
  it('cannot turn a green word grey — in either direction', () => {
    const green = stats({ correctGuesses: LEARN_REPS })
    const grey = stats({ correctGuesses: 1 })

    const fromFile = mergeSnapshot(
      snapshot({ stats: { hus: grey } }),
      roundTrip(snapshot({ stats: { hus: green } })),
    )
    expect(fromFile.stats.hus!.correctGuesses).toBe(LEARN_REPS)

    const onDevice = mergeSnapshot(
      snapshot({ stats: { hus: green } }),
      roundTrip(snapshot({ stats: { hus: grey } })),
    )
    expect(onDevice.stats.hus!.correctGuesses).toBe(LEARN_REPS)
  })

  it('keeps words that exist on only one side', () => {
    const merged = mergeSnapshot(
      snapshot({ stats: { hus: stats({ seen: 1 }) } }),
      roundTrip(snapshot({ stats: { kat: stats({ seen: 1 }) } })),
    )
    expect(Object.keys(merged.stats).sort()).toEqual(['hus', 'kat'])
  })

  it('unions banked words and keeps the first time each was banked', () => {
    const merged = mergeSnapshot(
      snapshot({ journey: { cityIndex: 0, stamps: {}, trialsSpent: {}, arrivedAt: {}, banked: { hus: NOW } } }),
      roundTrip(
        snapshot({
          journey: {
            cityIndex: 0,
            stamps: {},
            trialsSpent: {},
            arrivedAt: {},
            banked: { hus: NOW - DAY, kat: NOW },
          },
        }),
      ),
    )
    expect(merged.journey.banked).toEqual({ hus: NOW - DAY, kat: NOW })
  })

  it('takes the furthest city and the most stamps', () => {
    const merged = mergeSnapshot(
      snapshot({ journey: { cityIndex: 1, stamps: { 0: 5, 1: 2 }, banked: {}, trialsSpent: {}, arrivedAt: {} } }),
      roundTrip(
        snapshot({
          journey: { cityIndex: 3, stamps: { 0: 5, 1: 5, 2: 5 }, banked: {}, trialsSpent: {}, arrivedAt: {} },
        }),
      ),
    )
    expect(merged.journey.cityIndex).toBe(3)
    expect(merged.journey.stamps).toEqual({ 0: 5, 1: 5, 2: 5 })
  })

  it('never refunds spent attempts', () => {
    const merged = mergeSnapshot(
      snapshot({ journey: { cityIndex: 0, stamps: {}, banked: {}, trialsSpent: { 0: 7 }, arrivedAt: {} } }),
      roundTrip(
        snapshot({ journey: { cityIndex: 0, stamps: {}, banked: {}, trialsSpent: { 0: 1 }, arrivedAt: {} } }),
      ),
    )
    expect(merged.journey.trialsSpent).toEqual({ 0: 7 })
  })

  it('restoring your own file twice does not double your record', () => {
    const s = snapshot({ games: { played: 12, won: 7, redeemed: 2, lost: 3 } })
    const file = roundTrip(s)
    const once = mergeSnapshot(s, file)
    const twice = mergeSnapshot(once, file)
    expect(twice.games).toEqual(s.games)
  })

  it('leaves this device its own preferences', () => {
    const merged = mergeSnapshot(
      snapshot({ prefs: { gridSize: 'standard', clueLanguage: 'da', studyPhase: 'never' } }),
      roundTrip(snapshot()),
    )
    expect(merged.prefs).toEqual({ gridSize: 'standard', clueLanguage: 'da', studyPhase: 'never' })
  })

  it('is idempotent: merging the same file twice changes nothing', () => {
    const mine = snapshot({
      stats: { hus: stats({ correctGuesses: 1 }), kat: stats({ correctGuesses: 3 }) },
      journey: { cityIndex: 1, stamps: { 0: 5 }, banked: { kat: NOW }, trialsSpent: { 1: 2 }, arrivedAt: { 1: NOW } },
      games: { played: 4, won: 2, redeemed: 0, lost: 2 },
    })
    const file = roundTrip(
      snapshot({
        stats: { hus: stats({ correctGuesses: 3 }), ost: stats({ correctGuesses: 2 }) },
        journey: { cityIndex: 2, stamps: { 0: 5, 1: 3 }, banked: { hus: NOW - DAY }, trialsSpent: { 1: 5 }, arrivedAt: { 2: NOW } },
        games: { played: 9, won: 5, redeemed: 1, lost: 3 },
      }),
    )
    const once = mergeSnapshot(mine, file)
    const twice = mergeSnapshot(once, file)
    expect(twice).toEqual(once)
  })
})

describe('replace', () => {
  it('makes the device the file, preferences included', () => {
    const file = roundTrip(
      snapshot({
        stats: { hus: stats({ correctGuesses: 3 }) },
        prefs: { gridSize: 'standard', clueLanguage: 'da', studyPhase: 'never' },
        journey: { cityIndex: 4, stamps: { 0: 5 }, banked: {}, trialsSpent: {}, arrivedAt: {} },
      }),
    )
    const out = replaceSnapshot(file)
    expect(Object.keys(out.stats)).toEqual(['hus'])
    expect(out.journey.cityIndex).toBe(4)
    expect(out.prefs.studyPhase).toBe('never')
  })

  it('drops progress the file does not have — that is the point of it', () => {
    const out = replaceSnapshot(roundTrip(snapshot()))
    expect(out.stats).toEqual({})
    expect(out.journey.cityIndex).toBe(0)
  })
})

describe('summarize', () => {
  it('counts a word green whether it was played or banked', () => {
    const srs: SrsMap = {
      played: stats({ correctGuesses: LEARN_REPS }),
      halfway: stats({ correctGuesses: 1 }),
      banked: stats({ correctGuesses: 0 }),
    }
    const file = roundTrip(
      snapshot({
        stats: srs,
        journey: { cityIndex: 1, stamps: { 0: 5, 1: 2 }, banked: { banked: NOW }, trialsSpent: {}, arrivedAt: {} },
      }),
    )
    const sum = summarize(file, LEARN_REPS)
    expect(sum.words).toBe(3)
    expect(sum.learned).toBe(2)
    expect(sum.banked).toBe(1)
    expect(sum.stamps).toBe(7)
    expect(sum.cityIndex).toBe(1)
  })

  it('does not double-count a word that is both played green and banked', () => {
    const file = roundTrip(
      snapshot({
        stats: { hus: stats({ correctGuesses: LEARN_REPS }) },
        journey: { cityIndex: 0, stamps: {}, banked: { hus: NOW }, trialsSpent: {}, arrivedAt: {} },
      }),
    )
    expect(summarize(file, LEARN_REPS).learned).toBe(1)
  })
})
