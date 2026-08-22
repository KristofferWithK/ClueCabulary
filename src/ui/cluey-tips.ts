import { articleLabel } from '../data/gender'
import { ACTIVE } from '../lang/active'
import { WORDS } from '../data/words'
import { unlockedWords } from '../journey/progress'

/**
 * What Casey says on Home: gameplay tips and small true things about Danish,
 * plus the word of the day. Static and offline on purpose — the bubble opens
 * with the app, before any key is entered, and it must cost nothing.
 *
 * The rotation is deterministic by date so the bubble greets a new day with a
 * new line; tapping the bubble leafs onward from there.
 */

/**
 * How the game works. True in any language, so they live here.
 *
 * The tips that are ABOUT the language — æøå, the suffixed definite article,
 * counting in twenties — moved to the pack (`copy.tips`). They are not
 * translatable: German's would be about cases and capitalised nouns, which is
 * a different set of facts rather than the same set in another language.
 */

/**
 * The tips a new player must not wait a fortnight of rotation for, in priority
 * order: the rule easiest to get backwards first, then how a word is
 * collected, then what wrap-ups are for, then how one is earned. The first
 * sessions open the bubble on these, in order (see `openingLineIndex`), before
 * they take their place at the head of the ordinary rotation.
 */
export const CRITICAL_TIPS: readonly string[] = [
  "While you guess, it is Casey's greens that count — her key, not yours.",
  'Collect a word by cluing it AND guessing it — one green each way.',
  'Collected words still break on the road. Wrap them up to keep them.',
  'Three won rounds earn a wrap-up round. Bank up to three, and spend one when you have plenty collected — it packs up to thirteen.',
]

const RULE_TIPS: readonly string[] = [
  'Tap me to open the case — every word you collect travels in here.',
  `In a wrap-up round the cards start in English. Type the ${ACTIVE.name} to pack them.`,
  'Skipping a card in a wrap-up is allowed — but it cannot be wrapped that round.',
  'Out of clues is not out of game: last chance lets you keep naming words.',
  `Look a word up mid-round from the clue box — English in, ${ACTIVE.name} out.`,
  'Wrap all hundred words of a city and the road onward opens.',
]

/**
 * Interleaved rather than appended: the rotation is one line a day, so
 * concatenating would give a player a fortnight of rules before the first
 * thing about the language they are learning. The critical tips lead the list
 * — that is what makes leafing during the intro window walk them in priority
 * order — and the pack's language tips interleave with the rest. RULE_TIPS
 * must stay at least as long as any pack's `copy.tips` or the tail of the
 * pack's tips would be dropped; cluey-tips.test.ts pins that nothing is.
 */
const TIPS: readonly string[] = [
  ...CRITICAL_TIPS,
  ...RULE_TIPS.flatMap((tip, i) => (i < ACTIVE.copy.tips.length ? [tip, ACTIVE.copy.tips[i]!] : [tip])),
]

/** Deterministic day number, local time — the same all day, new tomorrow. */
function dayKey(): number {
  const now = new Date()
  return now.getFullYear() * 372 + now.getMonth() * 31 + now.getDate()
}

/** Deterministic pick that changes daily — drawn from words already unlocked. */
export function wordOfTheDay(cityIndex: number) {
  // A display pool, not a board pool: E0 kept "everything reached" here on
  // purpose (docs/clue-engine.md §5) even though ordinary boards went
  // city-only, since the word of the day is meant to range over all of it.
  const pool = unlockedWords(WORDS, cityIndex)
  return pool[(dayKey() * 2654435761) % pool.length]!
}

/** Everything Casey can say today, word of the day first. */
export function clueyLines(cityIndex: number): string[] {
  const w = wordOfTheDay(cityIndex)
  const article = articleLabel(w) ? `${articleLabel(w)} ` : ''
  // The label is chrome and the word is content: "Word of the day: et hus —
  // house." Per-language, so H1's seam will want the label from the pack and
  // the word from the dataset.
  return [`Word of the day: ${article}${w.da} — ${w.en[0]}.`, ...TIPS]
}

/** Where today's rotation starts; tapping the bubble leafs onward. */
export function dailyLineIndex(count: number): number {
  return dayKey() % count
}

/**
 * ── The intro window (O4) ───────────────────────────────────────────────────
 *
 * For the first few days a device opens the bubble on the critical tips, in
 * priority order, one per day — and only then joins the daily rotation. A day,
 * not an app-open, because the bubble's whole contract is "the same all day,
 * new tomorrow"; a per-open cursor would burn all four tips in one curious
 * evening. Deterministic and offline like the rest of this file: the state is
 * one localStorage key of its own (the HOWTO_KEY pattern — no settingsStore
 * field, no partialize trap, no migration), and anything unreadable in it
 * falls back to the rotation, ties toward veteran, the gate's own rule.
 */
const INTRO_KEY = 'cluecab-tips-intro'

type ReadableWritableStorage = Pick<Storage, 'getItem' | 'setItem'>

const local = (): Storage | undefined =>
  typeof localStorage === 'undefined' ? undefined : localStorage

/**
 * Which critical tip fronts today, advancing one per distinct day; null once
 * the window has passed (or storage cannot carry it). Counts days it was
 * ASKED on rather than subtracting dayKeys — dayKey is not day arithmetic
 * across a month boundary, and a skipped day should not skip a tip.
 */
function introTipIndex(storage: ReadableWritableStorage | undefined, today: number): number | null {
  if (!storage) return null
  try {
    const raw = storage.getItem(INTRO_KEY)
    let st: { n: number; d: number } | null = null
    if (raw !== null) {
      const parsed: unknown = JSON.parse(raw)
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        typeof (parsed as { n?: unknown }).n === 'number' &&
        typeof (parsed as { d?: unknown }).d === 'number'
      ) {
        st = parsed as { n: number; d: number }
      } else {
        return null
      }
    }
    if (!st) st = { n: 0, d: today }
    else if (st.d !== today) st = { n: Math.min(st.n + 1, CRITICAL_TIPS.length), d: today }
    const next = JSON.stringify(st)
    if (next !== raw) storage.setItem(INTRO_KEY, next)
    return st.n < CRITICAL_TIPS.length ? st.n : null
  } catch {
    return null
  }
}

/**
 * Where the bubble opens: during the intro window, today's critical tip (they
 * lead TIPS, so leafing onward walks the rest in priority order and then the
 * rotation); afterwards, the daily rotation exactly as before. `storage` and
 * `today` are injectable for tests only.
 */
export function openingLineIndex(
  count: number,
  storage: ReadableWritableStorage | undefined = local(),
  today: number = dayKey(),
): number {
  const n = introTipIndex(storage, today)
  // clueyLines puts the word of the day at 0; the critical tips start at 1.
  if (n !== null) return (1 + n) % count
  return today % count
}
