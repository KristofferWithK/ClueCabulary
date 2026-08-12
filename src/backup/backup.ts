import { z } from 'zod'
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
export const BACKUP_FORMAT = 1
export const BACKUP_FILENAME = 'cluecabulary-collection.json'

const WordStatsSchema = z.object({
  box: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  lastSeenAt: z.number(),
  seen: z.number(),
  correctGuesses: z.number(),
  misses: z.number(),
  lookups: z.number(),
  redemptionRight: z.number(),
  redemptionWrong: z.number(),
})

const TallySchema = z.object({
  played: z.number(),
  won: z.number(),
  redeemed: z.number(),
  lost: z.number(),
})

const JourneySchema = z.object({
  cityIndex: z.number(),
  stamps: z.record(z.string(), z.number()),
  banked: z.record(z.string(), z.number()),
  trialsSpent: z.record(z.string(), z.number()),
  arrivedAt: z.record(z.string(), z.number()),
})

/** Preferences worth carrying across. Never the API key. */
const PrefsSchema = z.object({
  gridSize: z.string(),
  clueLanguage: z.string(),
  studyPhase: z.string(),
})

export const BackupSchema = z.object({
  app: z.literal('cluecabulary'),
  format: z.number(),
  exportedAt: z.number(),
  srs: z.object({ stats: z.record(z.string(), WordStatsSchema), games: TallySchema }),
  journey: JourneySchema,
  prefs: PrefsSchema,
})

export type Backup = z.infer<typeof BackupSchema>
export type BackupPrefs = z.infer<typeof PrefsSchema>

export interface JourneyBackup {
  cityIndex: number
  stamps: Record<number, number>
  banked: Record<string, number>
  trialsSpent: Record<number, number>
  arrivedAt: Record<number, number>
}

export interface Snapshot {
  stats: SrsMap
  games: GamesTally
  journey: JourneyBackup
  prefs: BackupPrefs
}

export function buildBackup(s: Snapshot, now: number): Backup {
  return {
    app: 'cluecabulary',
    format: BACKUP_FORMAT,
    exportedAt: now,
    srs: { stats: s.stats, games: s.games },
    journey: {
      cityIndex: s.journey.cityIndex,
      stamps: numKeyed(s.journey.stamps),
      banked: { ...s.journey.banked },
      trialsSpent: numKeyed(s.journey.trialsSpent),
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
  if (!parsed.success) {
    const shape = json && typeof json === 'object' && 'app' in json ? '' : ' It may be from another app.'
    return { ok: false, error: `That file is not a ClueCabulary backup.${shape}` }
  }
  if (parsed.data.format > BACKUP_FORMAT) {
    return {
      ok: false,
      error: 'That backup was written by a newer version of ClueCabulary. Update the app first.',
    }
  }
  return { ok: true, backup: parsed.data }
}

/**
 * Which of two records for the same word to keep. Whole records, never a
 * field-by-field blend: the fields are internally consistent and mixing them
 * would invent a history that never happened.
 *
 * The tie-break order guarantees the invariant that matters — a merge can never
 * turn a green word back to grey — because correctGuesses is what greens it.
 */
export function betterRecord(a: WordStats, b: WordStats): WordStats {
  if (a.correctGuesses !== b.correctGuesses) return a.correctGuesses > b.correctGuesses ? a : b
  if (a.seen !== b.seen) return a.seen > b.seen ? a : b
  return a.lastSeenAt >= b.lastSeenAt ? a : b
}

const maxByKey = (
  a: Record<string, number>,
  b: Record<string, number>,
): Record<string, number> => {
  const out: Record<string, number> = { ...a }
  for (const [k, v] of Object.entries(b)) out[k] = Math.max(out[k] ?? v, v)
  return out
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
 * - banked words union, keeping the first time each was banked
 * - stamps and the furthest city take the maximum
 * - attempts spent take the maximum, so a restore cannot refund attempts
 * - the games tally takes the maximum, so restoring your own file twice does
 *   not double your record
 *
 * Preferences are not merged; a merge is about progress, and the device you are
 * holding should keep its own settings.
 */
export function mergeSnapshot(current: Snapshot, incoming: Backup): Snapshot {
  const stats: SrsMap = { ...current.stats }
  for (const [id, record] of Object.entries(incoming.srs.stats)) {
    const mine = stats[id]
    stats[id] = mine ? betterRecord(mine, record) : record
  }
  return {
    stats,
    games: {
      played: Math.max(current.games.played, incoming.srs.games.played),
      won: Math.max(current.games.won, incoming.srs.games.won),
      redeemed: Math.max(current.games.redeemed, incoming.srs.games.redeemed),
      lost: Math.max(current.games.lost, incoming.srs.games.lost),
    },
    journey: {
      cityIndex: Math.max(current.journey.cityIndex, incoming.journey.cityIndex),
      stamps: maxByKey(numKeyed(current.journey.stamps), incoming.journey.stamps),
      banked: earliestByKey(current.journey.banked, incoming.journey.banked),
      trialsSpent: maxByKey(numKeyed(current.journey.trialsSpent), incoming.journey.trialsSpent),
      arrivedAt: earliestByKey(numKeyed(current.journey.arrivedAt), incoming.journey.arrivedAt),
    },
    prefs: current.prefs,
  }
}

/** Wholesale restore: the file becomes the device, preferences included. */
export function replaceSnapshot(incoming: Backup): Snapshot {
  return {
    stats: incoming.srs.stats,
    games: incoming.srs.games,
    journey: {
      cityIndex: incoming.journey.cityIndex,
      stamps: incoming.journey.stamps,
      banked: incoming.journey.banked,
      trialsSpent: incoming.journey.trialsSpent,
      arrivedAt: incoming.journey.arrivedAt,
    },
    prefs: incoming.prefs,
  }
}

export interface BackupSummary {
  words: number
  learned: number
  banked: number
  stamps: number
  cityIndex: number
  exportedAt: number
  games: number
}

/** What the file holds, shown before anything is written. */
export function summarize(b: Backup, learnReps: number): BackupSummary {
  const stats = Object.values(b.srs.stats)
  const banked = Object.keys(b.journey.banked)
  const green = new Set(banked)
  for (const [id, s] of Object.entries(b.srs.stats)) {
    if (s.correctGuesses >= learnReps) green.add(id)
  }
  return {
    words: stats.length,
    learned: green.size,
    banked: banked.length,
    stamps: Object.values(b.journey.stamps).reduce((a, n) => a + n, 0),
    cityIndex: b.journey.cityIndex,
    exportedAt: b.exportedAt,
    games: b.srs.games.played,
  }
}
