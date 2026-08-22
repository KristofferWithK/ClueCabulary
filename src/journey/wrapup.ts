import type { WordEntry } from '../data/types'
import { BOARD, distinctGreens } from '../engine/config'
import type { KeyBias } from '../engine/keygen'
import { shuffle, type Rng } from '../engine/rng'
import type { Outcome } from '../engine/types'
import { conflicts } from '../srs/sampler'
import type { SrsMap } from '../srs/types'
import { isCollected, wordsForCity, type WrappedWords } from './progress'

/**
 * The wrap-up round: `BOARD`, dealt from the current city, with the collected
 * words on it starting English-side up. The player packs each of those by
 * typing its Danish word; the round then plays like any other, and every
 * packed word that ends the round green is wrapped — safe in the suitcase for
 * good.
 *
 * Since N2 this deals the SAME board every other round does — there is no
 * wrap-up-shaped config left to import. What is still specific to this deal:
 * `maxNewWordsPerBoard` is 0 for it, not because a config field says so but
 * because this function never reaches the sampler that field steers
 * (`dealBoard` in gameStore.ts).
 *
 * ── ONE GATE (W1) ───────────────────────────────────────────────────────────
 *
 * There used to be two, and they were different in kind: a wrap-up had to be
 * EARNED by winning, and the city had to hold a whole board's worth of
 * collected words before one could be dealt at all. The second is gone. A
 * board needs eighteen words, not eighteen *collected* words — only collected
 * ones were ever wrappable (`finishRound` wraps packed ∧ green), and the five
 * cards a wrap-up board never greens were already collected words that could
 * not wrap that round. So the board is TOPPED UP: collected words first, then
 * the city's discovered words, then its undiscovered ones, and the rule is
 * that **only a word collected before the deal can be wrapped**. Filler plays
 * like any other card and counts toward the win; it just goes nowhere
 * afterwards.
 *
 * That is what makes the owner's tip true rather than nagging: a token spent
 * on eight collected words packs at most eight, spent on thirteen it packs
 * thirteen. The suitcase states it and refuses nothing.
 */

/**
 * The one thing a wrap-up board still needs from the city: something to pack.
 *
 * Not a gate in the old sense — it is the arithmetic floor under a round whose
 * entire purpose is packing collected words, and a wrap-up dealt with zero of
 * them would be an ordinary round with the dictionary shut. Everything above
 * one word is the player's call, advised by the suitcase's honest count.
 */
export const WRAP_UP_FLOOR = 1

/**
 * The most one wrap-up round can put in the suitcase: the board's distinct
 * greens, since a word is wrapped by being packed AND found green.
 *
 * Thirteen since N2 moved the round onto `BOARD` (the retired 4x5 gave
 * sixteen). Derived rather than written down, because the suitcase says this
 * number out loud to the player and a board change that left the sentence
 * behind would be a lie on the one screen the economy is explained on.
 */
export const MAX_WRAPPED_PER_ROUND = distinctGreens(BOARD)

/**
 * How many won normal rounds buy one wrap-up round.
 *
 * MEASURED (2026-08-22, re-run on N2's board — see the table below); the
 * number itself was the owner's from play, and the harness settles that it is
 * safe and says something the arithmetic did not predict.
 */
export const WINS_PER_WRAP_UP = 3

/**
 * Which kind of round was played. Wrap-ups earn nothing; see below. The
 * tutorial (O2's scripted first round) records no game at all — `finishRound`
 * skips `recordGame` for it — but the type keeps `bankAfterRound` honest
 * anyway: `mode !== 'normal'` earns nothing even if that call ever returns.
 */
export type RoundMode = 'normal' | 'wrapup' | 'tutorial'

/**
 * How many earned wrap-up rounds the suitcase will hold.
 *
 * MEASURED, 2026-08-22, on the board N2 left behind (3x6, thirteen distinct
 * greens; the retired 4x5 gave sixteen) and under W1's one gate. The harness
 * is `pacing.test.ts` — whole cities through the real sampler, the real
 * `createGame` deal, the real engine and the real scheduler, crediting greens
 * exactly the way `finishRound` does, median of twelve runs a cell, with a
 * GREEDY player who spends a token the moment it holds one:
 *
 * ```
 * skill  wins/token   rounds to collect 100   rounds to wrap 100   wrap-ups   idle-token rounds
 *   0.6           1                      82                   83         34                   3
 *   0.6           2                      62                   66         17                   1
 *   0.6           3                      56                   59         12                   0
 *   0.7           1                      81                   83         39                   3
 *   0.7           2                      65                   67         21                   1
 *   0.7           3                      59                   62         14                   0
 *   0.8           1                      85                   86         43                   3
 *   0.8           2                      56                   58         19                   1
 *   0.8           3                      63                   65         16                   0
 * ```
 *
 * Reproduce with `WRAPUP_PACING=1 npx vitest run src/journey/pacing.test.ts`.
 *
 * Four things it settles, and the first two are why the number is three.
 *
 * **Collecting binds at every setting.** Wrapping finishes one to four rounds
 * after collecting does, never before, so the win gate is nowhere near the
 * door and three wins a token is safe.
 *
 * **Three is not merely safe, it is FASTER than one** — 59 rounds against 83
 * at p=0.6 — which is the opposite of what the arithmetic predicts. A token
 * spent on a thin pool wastes most of its thirteen green slots, so rationing
 * makes each wrap-up fatter: twelve wrap-ups do what thirty-four did. That is
 * the measured case for the "economical to wait" tip AND for having no floor.
 * The tip advises; a player who ignores it spends a token thinly rather than
 * being refused one.
 *
 * **A city is 56–86 rounds**, which is the number M1's pricing session turns
 * on. It was 69–103 when this was measured under the OLD two-gate rule on the
 * same board, and W1 is why it moved: a topped-up wrap-up board plays eighteen
 * city words rather than eighteen already-collected ones, so a wrap-up round
 * now advances collecting like any other round instead of standing still.
 * That was not predicted anywhere on the card.
 *
 * **The idle-token window is gone**, which is what this cap used to ration
 * against. Under two gates a player banked wins early in a city against a
 * board that could not yet be dealt — four to eight such rounds a city. Under
 * one gate it is three at a token a win and ZERO at the shipped price, because
 * a token can always be spent. So the cap now bites only in the second half of
 * a city, on a run of wins with nothing worth spending them on, and nothing
 * here may make a losing run unable to wrap at all: wrap-ups are how words get
 * packed, packing is how the road opens, and a door that locks is a worse
 * failure than a reward that never binds.
 *
 * Honest limits, because this is a simulation: the guesser is a hash with a
 * probability rather than a person, packing is assumed to succeed on every
 * collected card, and no lookups are charged. Real play is slower than every
 * figure above — these are a floor and an ordering, not a forecast.
 */
export const WRAP_UP_BANK_CAP = 3

/** The reward economy's whole state: tokens held, and progress toward the next. */
export interface WrapUpBank {
  banked: number
  /** Won normal rounds since the last token, 0..WINS_PER_WRAP_UP - 1. */
  wins: number
}

/**
 * The bank after a round ends: three won normal rounds earn one, up to the cap.
 *
 * Losing costs nothing — deliberately, and this is the line that keeps the
 * economy from being able to lock anyone out. A wrap-up win earns nothing
 * either: if it did, one win would chain into an unbroken run of wrap-ups and
 * the rationing would evaporate.
 *
 * At the cap the counter is held at zero rather than allowed to run on. A
 * counter that kept climbing while the bank was full would pay out the moment
 * a token was spent, which is a fourth token by another name; holding it means
 * the next token is three wins away from the spend, which is what the cap is
 * for.
 */
export function bankAfterRound(
  bank: WrapUpBank,
  result: Outcome['result'],
  mode: RoundMode,
): WrapUpBank {
  if (mode !== 'normal' || result !== 'won') return bank
  if (bank.banked >= WRAP_UP_BANK_CAP) return { banked: bank.banked, wins: 0 }
  const wins = bank.wins + 1
  if (wins < WINS_PER_WRAP_UP) return { banked: bank.banked, wins }
  return { banked: Math.min(bank.banked + 1, WRAP_UP_BANK_CAP), wins: 0 }
}

/** Wins still owed before the next token — what the suitcase and summary say. */
export function winsToNextWrapUp(bank: WrapUpBank): number {
  return Math.max(1, WINS_PER_WRAP_UP - bank.wins)
}

/** The current city's collected-or-better words — all a wrap-up may WRAP. */
export function wrapUpPool(
  all: readonly WordEntry[],
  srs: SrsMap,
  wrapped: WrappedWords,
  cityIndex: number,
): WordEntry[] {
  return wordsForCity(all, cityIndex).filter((w) => isCollected(srs[w.id], w.id in wrapped))
}

/** A dealt wrap-up board and, of it, which cards this round may actually pack. */
export interface WrapUpDeal {
  words: WordEntry[]
  /** Word ids collected BEFORE the deal — the only ones that can be wrapped. */
  wrappable: string[]
}

/**
 * Draw a wrap-up board.
 *
 * Four queues in strict order, and the order is the whole rule. Collected
 * words come first because they are the only ones the round can bank, and
 * within them unwrapped before wrapped — the unwrapped are what the round is
 * FOR, and already-wrapped ones only pad when the city runs short of fresh
 * candidates. Then the top-up, which is what W1 added: the city's discovered
 * words, then its undiscovered ones. Filler is playable and counts toward the
 * win; it is simply not in `wrappable`.
 *
 * `avoid` is the previous wrap-up board, pushed to the back of its own queue
 * rather than dropped (the old exam draw learned this the hard way): near the
 * end of a city the pool IS the avoid set, and a short board would be a worse
 * answer than a repeat. It never lets a filler word overtake a collected one —
 * a repeat that can be wrapped beats a fresh word that cannot.
 */
export function wrapUpWords(
  all: readonly WordEntry[],
  srs: SrsMap,
  wrapped: WrappedWords,
  cityIndex: number,
  rng: Rng,
  avoid: ReadonlySet<string> = new Set(),
): WrapUpDeal {
  const city = wordsForCity(all, cityIndex)
  const collected = city.filter((w) => isCollected(srs[w.id], w.id in wrapped))
  const collectedIds = new Set(collected.map((w) => w.id))
  const filler = city.filter((w) => !collectedIds.has(w.id))

  const unwrapped = collected.filter((w) => !(w.id in wrapped))
  const packed = collected.filter((w) => w.id in wrapped)
  const discovered = filler.filter((w) => w.id in srs)
  const unseen = filler.filter((w) => !(w.id in srs))
  const fresh = (ws: WordEntry[]) => ws.filter((w) => !avoid.has(w.id))
  const stale = (ws: WordEntry[]) => ws.filter((w) => avoid.has(w.id))

  const queues = [
    fresh(unwrapped),
    fresh(packed),
    stale(unwrapped),
    stale(packed),
    fresh(discovered),
    fresh(unseen),
    stale(discovered),
    stale(unseen),
  ]

  const board: WordEntry[] = []
  for (const group of queues) {
    if (board.length >= BOARD.totalWords) break
    for (const w of shuffle(group, rng)) {
      if (board.length >= BOARD.totalWords) break
      if (board.every((c) => !conflicts(w, c))) board.push(w)
    }
  }
  return { words: board, wrappable: board.filter((w) => collectedIds.has(w.id)).map((w) => w.id) }
}

/**
 * Whether the city can offer a wrap-up round at all.
 *
 * One condition now, and it is the floor: something to pack. The old check
 * dealt a board and asked whether it came out full, because the board could
 * only be built from collected words and a pool of eighteen that could not
 * SEAT eighteen was not enough. The board tops up from the whole city now, so
 * seating is no longer in question and the collected pool is the only thing
 * this can be about. `newWrapUpGame` still refuses a short board, which is
 * belt to this brace.
 */
export function wrapUpUnlocked(
  all: readonly WordEntry[],
  srs: SrsMap,
  wrapped: WrappedWords,
  cityIndex: number,
): boolean {
  return wrapUpPool(all, srs, wrapped, cityIndex).length >= WRAP_UP_FLOOR
}

/**
 * Key bias for the wrap-up deal, UNDER the structural rule rather than instead
 * of it. `greenPool` (see keygen) decides that collected words take the greens;
 * this decides the order WITHIN each group. Unwrapped collected words weigh
 * what an unseen word weighs in normal play, already-wrapped ones what a
 * collected word is damped to, and the top-up lowest of all — so the greens go
 * to the words the round exists to pack, then to the padding, and a filler card
 * is green only when there were not thirteen collected words to green instead.
 */
export function wrapUpBias(
  entries: readonly WordEntry[],
  wrapped: WrappedWords,
  wrappable: ReadonlySet<string>,
): KeyBias {
  return {
    need: Object.fromEntries(
      entries.map((w) => [w.id, !wrappable.has(w.id) ? 0.2 : w.id in wrapped ? 0.4 : 3]),
    ),
  }
}
