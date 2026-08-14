import { articleLabel } from '../data/gender'
import { WORDS } from '../data/words'
import { unlockedWords } from '../journey/progress'

/**
 * What Cluey says on Home: gameplay tips and small true things about Danish,
 * plus the word of the day. Static and offline on purpose — the bubble opens
 * with the app, before any key is entered, and it must cost nothing.
 *
 * The rotation is deterministic by date so the bubble greets a new day with a
 * new line; tapping the bubble leafs onward from there.
 */

const TIPS: readonly string[] = [
  'Tap me to open the case — every word you collect travels in here.',
  'Collect a word by cluing it AND guessing it — one green each way.',
  'Collected words still break on the road. Wrap them up to keep them.',
  'In a wrap-up round the cards start in English. Type the Danish to pack them.',
  'Skipping a card in a wrap-up is allowed — but it cannot be wrapped that round.',
  'Your dashed cards are safe to tap. It is your CLUES that must keep away from them.',
  'Out of clues is not out of game: sudden death lets you keep naming words.',
  'æ, ø and å can only be Danish. A word with one of them is never English.',
  'Danish nouns carry their gender like luggage: learn «et hus», not just «hus».',
  'A compound of two words you know is a word you know: morgenmad, dyreliv.',
  'The definite article goes on the END in Danish: huset is “the house”.',
  'Danes count in twenties: halvtreds — fifty — is “half third times twenty”.',
  'Look a word up mid-round from the clue box — English in, Danish out.',
  'The last chance opens after three clues: translate the board, one shot.',
  'Wrap all hundred words of a city and the road onward opens.',
]

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

/** Everything Cluey can say today, word of the day first. */
export function clueyLines(cityIndex: number): string[] {
  const w = wordOfTheDay(cityIndex)
  const article = articleLabel(w) ? `${articleLabel(w)} ` : ''
  return [`Dagens ord: ${article}${w.da} — ${w.en[0]}.`, ...TIPS]
}

/** Where today's rotation starts; tapping the bubble leafs onward. */
export function dailyLineIndex(count: number): number {
  return dayKey() % count
}
