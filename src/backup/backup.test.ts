import { describe, expect, it } from 'vitest'
import { CITIES } from '../journey/cities'
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

/** One green each way — the collected threshold. */
const COLLECTED: Partial<WordStats> = { greenByClue: 1, greenByGuess: 1, correctGuesses: 2 }

const snapshot = (patch: Partial<Snapshot> = {}): Snapshot => ({
  stats: {},
  games: { played: 0, won: 0, redeemed: 0, lost: 0 },
  journey: { cityIndex: 0, wrapped: {}, arrivedAt: {} },
  prefs: { gridSize: 'beginner', clueLanguage: 'en', studyPhase: 'auto' },
  language: 'da',
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
        wrapped: { hus: NOW - DAY },
        arrivedAt: { 1: NOW - 5 * DAY, 2: NOW - DAY },
      },
    })
    const back = roundTrip(s)
    expect(back.format).toBe(BACKUP_FORMAT)
    expect(back.srs.stats.hus).toEqual(s.stats.hus)
    expect(back.journey.wrapped).toEqual({ hus: NOW - DAY })
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
    // Written against the route rather than against 9 and 10, because the
    // route got shorter once already and these numbers did not follow it.
    for (const bad of [99, -3, CITIES.length, 1.5]) {
      const file = buildBackup(snapshot(), NOW)
      file.journey.cityIndex = bad
      expect(parseBackup(JSON.stringify(file)).ok).toBe(false)
    }
    const good = buildBackup(snapshot(), NOW)
    good.journey.cityIndex = CITIES.length - 1
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
   * A format-1 file is months of someone's progress. It restores upgraded in
   * memory: banked -> wrapped by the store-migration rule, stamps and spent
   * attempts dropped, counter-less records seeded like migrateSrs.
   */
  it('upgrades a format-1 file: banked words arrive wrapped', () => {
    const v1 = {
      app: 'cluecabulary',
      format: 1,
      exportedAt: NOW,
      srs: {
        stats: {
          learned: {
            box: 3,
            lastSeenAt: NOW,
            seen: 5,
            correctGuesses: 3,
            misses: 0,
            lookups: 0,
            redemptionRight: 0,
            redemptionWrong: 0,
          },
        },
        games: { played: 9, won: 4, redeemed: 1, lost: 4 },
      },
      journey: {
        cityIndex: 2,
        stamps: { 0: 5, 1: 5, 2: 1 },
        banked: { hus: NOW - DAY, kat: NOW },
        trialsSpent: { 2: 3 },
        arrivedAt: { 2: NOW - DAY },
      },
      prefs: { gridSize: 'middle', clueLanguage: 'target', studyPhase: 'never' },
    }
    const parsed = parseBackup(JSON.stringify(v1))
    expect(parsed.ok).toBe(true)
    if (parsed.ok) {
      expect(parsed.backup.journey.wrapped).toEqual({ hus: NOW - DAY, kat: NOW })
      expect(parsed.backup.journey).not.toHaveProperty('stamps')
      // The legacy learned record restores collected, per the seeding rule.
      expect(parsed.backup.srs.stats.learned).toMatchObject({ greenByClue: 1, greenByGuess: 1 })
      expect(parsed.backup.prefs.gridSize).toBe('middle')
    }
  })

  it('normalizes a counter-less current-format file with the migration seeding rule', () => {
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
  it('collectedness outranks raw greens — a merge must never un-collect', () => {
    // Three greens all earned one way against a green each way: the second
    // record is the collected one, whatever the totals say. Mutation check:
    // put correctGuesses back in front and this fails.
    const oneWay = stats({ correctGuesses: 3, greenByClue: 3, greenByGuess: 0, seen: 9 })
    const eachWay = stats({ correctGuesses: 2, greenByClue: 1, greenByGuess: 1, seen: 2 })
    expect(betterRecord(oneWay, eachWay)).toBe(eachWay)
    expect(betterRecord(eachWay, oneWay)).toBe(eachWay)
  })

  it('prefers the record that knows the word better at equal collectedness', () => {
    const weak = stats({ correctGuesses: 1, greenByGuess: 1, seen: 9 })
    const strong = stats({ correctGuesses: 3, greenByGuess: 3, seen: 3 })
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
    const a = stats({ correctGuesses: 3, greenByClue: 2, greenByGuess: 1, seen: 3, box: 4 })
    const b = stats({ correctGuesses: 1, seen: 20, misses: 12, box: 0 })
    expect(betterRecord(a, b)).toEqual(a)
  })
})

describe('merge', () => {
  it('cannot un-collect a word — in either direction', () => {
    const collected = stats(COLLECTED)
    const grey = stats({ correctGuesses: 1 })

    const fromFile = mergeSnapshot(
      snapshot({ stats: { hus: grey } }),
      roundTrip(snapshot({ stats: { hus: collected } })),
    )
    expect(fromFile.stats.hus).toMatchObject({ greenByClue: 1, greenByGuess: 1 })

    const onDevice = mergeSnapshot(
      snapshot({ stats: { hus: collected } }),
      roundTrip(snapshot({ stats: { hus: grey } })),
    )
    expect(onDevice.stats.hus).toMatchObject({ greenByClue: 1, greenByGuess: 1 })
  })

  it('keeps words that exist on only one side', () => {
    const merged = mergeSnapshot(
      snapshot({ stats: { hus: stats({ seen: 1 }) } }),
      roundTrip(snapshot({ stats: { kat: stats({ seen: 1 }) } })),
    )
    expect(Object.keys(merged.stats).sort()).toEqual(['hus', 'kat'])
  })

  it('unions wrapped words and keeps the first time each was packed', () => {
    const merged = mergeSnapshot(
      snapshot({ journey: { cityIndex: 0, arrivedAt: {}, wrapped: { hus: NOW } } }),
      roundTrip(
        snapshot({
          journey: { cityIndex: 0, arrivedAt: {}, wrapped: { hus: NOW - DAY, kat: NOW } },
        }),
      ),
    )
    expect(merged.journey.wrapped).toEqual({ hus: NOW - DAY, kat: NOW })
  })

  it('takes the furthest city', () => {
    const merged = mergeSnapshot(
      snapshot({ journey: { cityIndex: 1, wrapped: {}, arrivedAt: {} } }),
      roundTrip(snapshot({ journey: { cityIndex: 3, wrapped: {}, arrivedAt: {} } })),
    )
    expect(merged.journey.cityIndex).toBe(3)
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
      snapshot({ prefs: { gridSize: 'standard', clueLanguage: 'target', studyPhase: 'never' } }),
      roundTrip(snapshot()),
    )
    expect(merged.prefs).toEqual({ gridSize: 'standard', clueLanguage: 'target', studyPhase: 'never' })
  })

  it('is idempotent: merging the same file twice changes nothing', () => {
    const mine = snapshot({
      stats: { hus: stats({ correctGuesses: 1 }), kat: stats(COLLECTED) },
      journey: { cityIndex: 1, wrapped: { kat: NOW }, arrivedAt: { 1: NOW } },
      games: { played: 4, won: 2, redeemed: 0, lost: 2 },
    })
    const file = roundTrip(
      snapshot({
        stats: { hus: stats(COLLECTED), ost: stats({ correctGuesses: 2 }) },
        journey: { cityIndex: 2, wrapped: { hus: NOW - DAY }, arrivedAt: { 2: NOW } },
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
        prefs: { gridSize: 'standard', clueLanguage: 'target', studyPhase: 'never' },
        journey: { cityIndex: 4, wrapped: { hus: NOW }, arrivedAt: {} },
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
  it('splits the collection into collected and wrapped', () => {
    const srs: SrsMap = {
      loose: stats(COLLECTED),
      halfway: stats({ greenByGuess: 1 }),
      packed: stats(COLLECTED),
    }
    const file = roundTrip(
      snapshot({
        stats: srs,
        journey: { cityIndex: 1, wrapped: { packed: NOW }, arrivedAt: {} },
      }),
    )
    const sum = summarize(file)
    expect(sum.words).toBe(3)
    expect(sum.collected).toBe(1)
    expect(sum.wrapped).toBe(1)
    expect(sum.cityIndex).toBe(1)
  })

  it('does not double-count a word that is both collected in stats and wrapped', () => {
    const file = roundTrip(
      snapshot({
        stats: { hus: stats(COLLECTED) },
        journey: { cityIndex: 0, wrapped: { hus: NOW }, arrivedAt: {} },
      }),
    )
    const sum = summarize(file)
    expect(sum.collected).toBe(0)
    expect(sum.wrapped).toBe(1)
  })
})

/**
 * A backup carries the language its journey position belongs to.
 *
 * The words are safe to move between languages — every id carries its own —
 * but a city index is a number counting a particular route, and restoring a
 * Danish stop 7 onto a German journey would put the player in a city whose
 * hundred words they have never seen, with the road out of it shut.
 */
describe('backups across languages', () => {
  it('defaults a file written before the seam to Danish', () => {
    // A real pre-seam file: no `language` key at all.
    const file = JSON.parse(JSON.stringify(buildBackup(snapshot(), NOW))) as Record<string, unknown>
    delete file.language
    const parsed = parseBackup(JSON.stringify(file))
    expect(parsed.ok).toBe(true)
    if (parsed.ok) expect(parsed.backup.language).toBe('da')
  })

  it('round-trips the language it was written with', () => {
    expect(roundTrip(snapshot({ language: 'de' })).language).toBe('de')
  })

  it('merges the words of a foreign file but not its position', () => {
    const here = snapshot({
      language: 'da',
      journey: { cityIndex: 3, wrapped: { 'da:hus': NOW }, arrivedAt: { 3: NOW } },
    })
    const foreign = roundTrip(
      snapshot({
        language: 'de',
        journey: { cityIndex: 7, wrapped: { 'de:Haus': NOW }, arrivedAt: { 7: NOW } },
      }),
    )
    const merged = mergeSnapshot(here, foreign)
    // Both collections, one ledger.
    expect(merged.journey.wrapped).toEqual({ 'da:hus': NOW, 'de:Haus': NOW })
    // The traveller has not moved.
    expect(merged.journey.cityIndex).toBe(3)
    expect(merged.journey.arrivedAt).toEqual({ 3: NOW })
    expect(merged.language).toBe('da')
  })

  it('still merges the position when the languages agree', () => {
    const here = snapshot({
      language: 'da',
      journey: { cityIndex: 3, wrapped: {}, arrivedAt: {} },
    })
    const mine = roundTrip(
      snapshot({ language: 'da', journey: { cityIndex: 7, wrapped: {}, arrivedAt: {} } }),
    )
    expect(mergeSnapshot(here, mine).journey.cityIndex).toBe(7)
  })

  it('merges word records across languages either way', () => {
    const here = snapshot({ language: 'da', stats: { 'da:hus': stats(COLLECTED) } })
    const foreign = roundTrip(snapshot({ language: 'de', stats: { 'de:Haus': stats(COLLECTED) } }))
    const merged = mergeSnapshot(here, foreign)
    expect(Object.keys(merged.stats).sort()).toEqual(['da:hus', 'de:Haus'])
  })
})
