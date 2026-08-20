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
const RULE_TIPS: readonly string[] = [
  'Tap me to open the case — every word you collect travels in here.',
  'Collect a word by cluing it AND guessing it — one green each way.',
  'Collected words still break on the road. Wrap them up to keep them.',
  `In a wrap-up round the cards start in English. Type the ${ACTIVE.name} to pack them.`,
  'Skipping a card in a wrap-up is allowed — but it cannot be wrapped that round.',
  "While you guess, it is Casey's greens that count — his key, not yours.",
  'Out of clues is not out of game: sudden death lets you keep naming words.',
  `Look a word up mid-round from the clue box — English in, ${ACTIVE.name} out.`,
  'Win a normal round to earn a wrap-up round. You can bank up to three.',
  'Wrap all hundred words of a city and the road onward opens.',
]

/**
 * Interleaved rather than appended: the rotation is one line a day, so
 * concatenating would give a player a fortnight of rules before the first
 * thing about the language they are learning.
 */
const TIPS: readonly string[] = RULE_TIPS.flatMap((tip, i) =>
  i < ACTIVE.copy.tips.length ? [tip, ACTIVE.copy.tips[i]!] : [tip],
)

/** Deterministic day number, local time — the same all day, new tomorrow. */
function dayKey(): number {
  const now = new Date()
  return now.getFullYear() * 372 + now.getMonth() * 31 + now.getDate()
}

/** Deterministic pick that changes daily — drawn from words already unlocked. */
export function wordOfTheDay(cityIndex: number) {
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
