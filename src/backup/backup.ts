import { z } from 'zod'
import { CITIES } from '../journey/cities'
import type { LanguageCode } from '../lang/types'
import { LEARN_REPS } from '../journey/progress'
import type { GamesTally } from '../stores/srsStore'
import type { SrsMap, WordStats } from '../srs/types'

/**
 * The collection lives in one phone's localStorage and nowhere else. Clearing
 * site data, reinstalling, or changing phone loses months of work with no
 * warning and no way back — the one irreversible failure in the app. This
 * module is the way out: a single JSON file, and a merge that cannot lose
 * ground.
 *
 * Deliberately NOT exported: the Ollama API key. A backup file gets mailed to
 * yourself and synced to three clouds; a secret must not ride along.
 */
export const BACKUP_FORMAT = 2
// Named for the old title on purpose, like the `app: 'cluecabulary'` literal
// inside the file: a player's existing export is already called this, and a
// file named 900words whose contents say cluecabulary is the confusing pair.
// The import matches on the literal, never on the filename.
export const BACKUP_FILENAME = 'cluecabulary-collection.json'

const WordStatsSchema = z
  .object({
    box: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
    lastSeenAt: z.number(),
    seen: z.number(),
    correctGuesses: z.number(),
    misses: z.number(),
    lookups: z.number(),
    redemptionRight: z.number(),
    redemptionWrong: z.number(),
    // Absent from files written before the directional counters existed.
    greenByClue: z.number().optional(),
    greenByGuess: z.number().optional(),
  })
  // Same seeding rule as migrateSrs (srsStore.ts): a record the old model
  // called learned restores as collected; anything short arrives with zeroes.
  .transform((s) => ({
    ...s,
    greenByClue: s.greenByClue ?? (s.correctGuesses >= LEARN_REPS ? 1 : 0),
    greenByGuess: s.greenByGuess ?? (s.correctGuesses >= LEARN_REPS ? 1 : 0),
  }))

const TallySchema = z.object({
  played: z.number(),
  won: z.number(),
  redeemed: z.number(),
  lost: z.number(),
})

// Bounded, not just numeric: cityAt throws outside the route, and a restore
// writes this straight into the store, so an out-of-range value would blank
// the app on every load with no way back in.
const CityIndexSchema = z.number().int().min(0).max(CITIES.length - 1)

const JourneySchema = z.object({
  cityIndex: CityIndexSchema,
  wrapped: z.record(z.string(), z.number()),
  arrivedAt: z.record(z.string(), z.number()),
})

/**
 * The journey as format-1 files carry it. Read so an old file still restores
 * in full: banked words become wrapped by the same rule the store migration
 * uses, and the exam economy (stamps, attempts) has nothing to become.
 */
const JourneyV1Schema = z.object({
  cityIndex: CityIndexSchema,
  stamps: z.record(z.string(), z.number()),
  banked: z.record(z.string(), z.number()),
  trialsSpent: z.record(z.string(), z.number()),
  arrivedAt: z.record(z.string(), z.number()),
})

/** Preferences worth carrying across. Never the API key. */
const PrefsSchema = z.object({
  // Enumerated, not free strings: these are cast straight into settings, and a
  // bad gridSize makes every new game throw when it looks up its config.
  gridSize: z.enum(['beginner', 'middle', 'standard']),
  // 'da' is what every file written before settings v9 carries, and it meant
  // "the language being learned". Read and rewritten rather than rejected: a
  // backup is the one artefact a player keeps for years.
  clueLanguage: z.enum(['da', 'target', 'en']).transform((v) => (v === 'da' ? 'target' : v)),
  studyPhase: z.enum(['auto', 'always', 'never']),
})

const SrsSchema = z.object({ stats: z.record(z.string(), WordStatsSchema), games: TallySchema })

/**
 * Which language the journey position in this file is a position ON.
 *
 * Absent from every file written before the seam, and those are all Danish, so
 * it defaults rather than failing. Deliberately NOT a format bump: an older
 * build reading a newer file ignores the extra key and restores exactly what it
 * would have restored anyway, and a format bump would make it refuse the file
 * instead. The field only ever makes a restore MORE careful.
 */
const LanguageSchema = z.enum(['da', 'de']).default('da')

export const BackupSchema = z.object({
  app: z.literal('cluecabulary'),
  format: z.number(),
  exportedAt: z.number(),
  language: LanguageSchema,
  srs: SrsSchema,
  journey: JourneySchema,
  prefs: PrefsSchema,
})

const BackupV1Schema = z.object({
  app: z.literal('cluecabulary'),
  format: z.number(),
  exportedAt: z.number(),
  language: LanguageSchema,
  srs: SrsSchema,
  journey: JourneyV1Schema,
  prefs: PrefsSchema,
})

export type Backup = z.infer<typeof BackupSchema>
export type BackupPrefs = z.infer<typeof PrefsSchema>

export interface JourneyBackup {
  cityIndex: number
  wrapped: Record<string, number>
  arrivedAt: Record<number, number>
}

export interface Snapshot {
  stats: SrsMap
  games: GamesTally
  journey: JourneyBackup
  prefs: BackupPrefs
  /** The language this device is playing — see `LanguageSchema`. */
  language: LanguageCode
}

export function buildBackup(s: Snapshot, now: number): Backup {
  return {
    app: 'cluecabulary',
    format: BACKUP_FORMAT,
    exportedAt: now,
    language: s.language,
    srs: { stats: s.stats, games: s.games },
    journey: {
      cityIndex: s.journey.cityIndex,
      wrapped: { ...s.journey.wrapped },
      arrivedAt: numKeyed(s.journey.arrivedAt),
    },
    prefs: s.prefs,
  }
}

const numKeyed = (r: Record<number, number>): Record<string, number> =>
  Object.fromEntries(Object.entries(r))

export type ParseResult =
  | { ok: true; backup: Backup }
  | { ok: false; error: string }

/**
 * Parse a file the user chose. Everything here is attacker-adjacent only in the
 * sense that it is unvalidated input from a text file, but a malformed restore
 * would corrupt the collection silently, which is the thing to avoid.
 */
export function parseBackup(text: string): ParseResult {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    return { ok: false, error: 'That file is not JSON. Pick the file you exported from here.' }
  }
  const parsed = BackupSchema.safeParse(json)
  if (parsed.success) {
    if (parsed.data.format > BACKUP_FORMAT) {
      return {
        ok: false,
        error: 'That backup was written by a newer version of 900words. Update the app first.',
      }
    }
    return { ok: true, backup: parsed.data }
  }
  // Not the current shape — a format-1 file restores upgraded in memory.
  const v1 = BackupV1Schema.safeParse(json)
  if (v1.success && v1.data.format <= 1) {
    const { stamps, trialsSpent, banked, ...journey } = v1.data.journey
    void stamps, trialsSpent
    return { ok: true, backup: { ...v1.data, journey: { ...journey, wrapped: banked } } }
  }
  const shape = json && typeof json === 'object' && 'app' in json ? '' : ' It may be from another app.'
  return { ok: false, error: `That file is not a 900words backup.${shape}` }
}

/**
 * Which of two records for the same word to keep. Whole records, never a
 * field-by-field blend: the fields are internally consistent and mixing them
 * would invent a history that never happened.
 *
 * Collectedness leads the tie-break, because it is now what the collection
 * runs on. Ordered by correctGuesses alone — the old rule — a record with
 * three greens all earned one way could replace one with a green each way,
 * and the merge would quietly un-collect the word.
 */
export function betterRecord(a: WordStats, b: WordStats): WordStats {
  const collected = (s: WordStats) => (s.greenByClue > 0 ? 1 : 0) + (s.greenByGuess > 0 ? 1 : 0)
  if (collected(a) !== collected(b)) return collected(a) > collected(b) ? a : b
  if (a.correctGuesses !== b.correctGuesses) return a.correctGuesses > b.correctGuesses ? a : b
  if (a.seen !== b.seen) return a.seen > b.seen ? a : b
  return a.lastSeenAt >= b.lastSeenAt ? a : b
}

const earliestByKey = (
  a: Record<string, number>,
  b: Record<string, number>,
): Record<string, number> => {
  const out: Record<string, number> = { ...a }
  for (const [k, v] of Object.entries(b)) out[k] = Math.min(out[k] ?? v, v)
  return out
}

/**
 * Fold a backup into what is already on this device without losing either.
 * Every rule here is chosen so that restoring cannot cost the player anything
 * they had a moment ago:
 *
 * - words keep whichever record knows them better
 * - wrapped words union, keeping the first time each was packed
 * - the furthest city wins
 * - the games tally takes the maximum, so restoring your own file twice does
 *   not double your record
 *
 * Preferences are not merged; a merge is about progress, and the device you are
 * holding should keep its own settings.
 *
 * ── ACROSS LANGUAGES ───────────────────────────────────────────────────────
 *
 * Word records and wrapped words merge whatever language the file came from:
 * they are keyed by word id, every id carries its language, so a Danish file
 * folded into a German device adds the Danish half of the collection and
 * touches nothing German. That is worth having — it is how one backup carries
 * everything a player has ever learned.
 *
 * The city index does NOT merge across languages. It is an index into a route,
 * and "the furthest city wins" compares two numbers that count different
 * cities; a Danish stop 7 restored onto a German journey would teleport the
 * player to Frankfurt with none of its words behind them. So a file from
 * another language keeps its words and leaves the position alone.
 */
export function mergeSnapshot(current: Snapshot, incoming: Backup): Snapshot {
  const stats: SrsMap = { ...current.stats }
  for (const [id, record] of Object.entries(incoming.srs.stats)) {
    const mine = stats[id]
    stats[id] = mine ? betterRecord(mine, record) : record
  }
  const sameLanguage = incoming.language === current.language
  return {
    stats,
    games: {
      played: Math.max(current.games.played, incoming.srs.games.played),
      won: Math.max(current.games.won, incoming.srs.games.won),
      redeemed: Math.max(current.games.redeemed, incoming.srs.games.redeemed),
      lost: Math.max(current.games.lost, incoming.srs.games.lost),
    },
    journey: sameLanguage
      ? mergeJourney(current.journey, incoming.journey)
      : // Words still merge — they are the part that is language-safe.
        { ...current.journey, wrapped: earliestByKey(current.journey.wrapped, incoming.journey.wrapped) },
    prefs: current.prefs,
    language: current.language,
  }
}

/**
 * Fold two journeys together without losing ground, by the rules above. Shared
 * with the rescue of progress stranded by an old storage key, so there is one
 * definition of "merging cannot cost you anything".
 */
export function mergeJourney(
  current: JourneyBackup,
  incoming: { cityIndex: number } & Record<string, unknown>,
): JourneyBackup {
  const j = incoming as unknown as {
    cityIndex: number
    wrapped: Record<string, number>
    arrivedAt: Record<string, number>
  }
  return {
    cityIndex: Math.max(current.cityIndex, j.cityIndex),
    wrapped: earliestByKey(current.wrapped, j.wrapped),
    arrivedAt: earliestByKey(numKeyed(current.arrivedAt), j.arrivedAt) as unknown as Record<
      number,
      number
    >,
  }
}

/**
 * Wholesale restore: the file becomes the device, preferences included.
 *
 * The language comes with it, and `applyBackup` does not switch to it: a
 * replace from another language's file writes that file's position, so the
 * caller is told which language the restored journey belongs to and can say so.
 * See `restore` in apply.ts.
 */
export function replaceSnapshot(incoming: Backup): Snapshot {
  return {
    stats: incoming.srs.stats,
    games: incoming.srs.games,
    journey: {
      cityIndex: incoming.journey.cityIndex,
      wrapped: incoming.journey.wrapped,
      arrivedAt: incoming.journey.arrivedAt as unknown as Record<number, number>,
    },
    prefs: incoming.prefs,
    language: incoming.language,
  }
}

export interface BackupSummary {
  words: number
  collected: number
  wrapped: number
  cityIndex: number
  exportedAt: number
  games: number
}

/** What the file holds, shown before anything is written. */
export function summarize(b: Backup): BackupSummary {
  const wrapped = new Set(Object.keys(b.journey.wrapped))
  let collected = 0
  for (const [id, s] of Object.entries(b.srs.stats)) {
    if (!wrapped.has(id) && s.greenByClue > 0 && s.greenByGuess > 0) collected++
  }
  return {
    words: Object.keys(b.srs.stats).length,
    collected,
    wrapped: wrapped.size,
    cityIndex: b.journey.cityIndex,
    exportedAt: b.exportedAt,
    games: b.srs.games.played,
  }
}
