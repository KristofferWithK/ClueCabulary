import type { WordEntry } from '../data/types'
import { WRAPUP_CONFIG } from '../engine/config'
import type { KeyBias } from '../engine/keygen'
import { shuffle, type Rng } from '../engine/rng'
import type { Outcome } from '../engine/types'
import { conflicts } from '../srs/sampler'
import type { SrsMap } from '../srs/types'
import { isCollected, wordsForCity, type WrappedWords } from './progress'

/**
 * The wrap-up round: a 4×5 board dealt entirely from the current city's
 * collected words, every card starting English-side up. The player packs each
 * card by typing its Danish word; the round then plays like any other, and
 * every packed word that ends the round green is wrapped — safe in the
 * suitcase for good.
 *
 * Two separate things have to be true before one can be played, and they are
 * different in kind. The board must be DEALABLE — twenty collected words that
 * can sit on one board — which is arithmetic and cannot be waived. And one
 * must have been EARNED by winning a normal round, which is policy and is the
 * whole of the reward economy below.
 */

/**
 * A wrap-up board needs a full board's worth of collected words.
 *
 * This is an alias, not a second gate: it is `WRAPUP_CONFIG.totalWords` under
 * a name that says what the number means where the UI counts against it. It
 * keeps its keep for exactly that — «Collect 4 more» has to name something —
 * and for nothing else. Lowering it would not lower the gate, because
 * `wrapUpUnlocked` answers by dealing an actual board; it would only make the
 * suitcase's hint lie about how many more words are needed.
 */
export const WRAP_UP_UNLOCK = WRAPUP_CONFIG.totalWords

/** Which kind of round was played. Wrap-ups earn nothing; see below. */
export type RoundMode = 'normal' | 'wrapup'

/**
 * How many earned wrap-up rounds the suitcase will hold.
 *
 * UNMEASURED — this is a guess made before the numbers that would settle it
 * existed, and it is here rather than in engine/config because it is an
 * economy rule rather than a board. What would change it:
 *
 *  - The win rate per board (card A3 is measuring it). A bank of three is a
 *    buffer against a cold run; if wins turn out to be rare the buffer is
 *    never full and the cap is irrelevant, and if they are common the cap is
 *    all that rations anything.
 *  - WHICH of the two gates binds, which is not the same answer twice.
 *    Measured, by dealing real boards through the sampler and greening every
 *    card (flawless play, every round won): a city's first dealable wrap-up
 *    board is a median of 13 rounds away on beginner and 11 on middle and
 *    standard, twelve trials each. A player winning every round hits this cap
 *    of three after three of them and then sits at it for eight more, so at
 *    the start of a city the COLLECTED-WORDS gate binds and this number is
 *    doing nothing. After it opens it never shuts again — the pool only grows
 *    within a city — so from then until the next city the WIN gate is the only
 *    live one, and the cap is the whole of the rationing. Tightening it would
 *    only ever bite in that second phase. Nothing here may make a losing run
 *    unable to wrap at all: wrap-ups are how words get packed, packing is how
 *    the road opens, and a door that locks is a worse failure than a reward
 *    that never binds.
 */
export const WRAP_UP_BANK_CAP = 3

/**
 * The bank after a round ends: a won normal round earns one, up to the cap.
 *
 * Losing costs nothing — deliberately, and this is the line that keeps the
 * economy from being able to lock anyone out. A wrap-up win earns nothing
 * either: if it did, one win would chain into an unbroken run of wrap-ups and
 * the rationing would evaporate.
 */
export function bankAfterRound(
  banked: number,
  result: Outcome['result'],
  mode: RoundMode,
): number {
  if (mode !== 'normal' || result !== 'won') return banked
  return Math.min(banked + 1, WRAP_UP_BANK_CAP)
}

/** The current city's collected-or-better words — all a wrap-up may deal. */
export function wrapUpPool(
  all: readonly WordEntry[],
  srs: SrsMap,
  wrapped: WrappedWords,
  cityIndex: number,
): WordEntry[] {
  return wordsForCity(all, cityIndex).filter((w) => isCollected(srs[w.id], w.id in wrapped))
}

/**
 * Draw a wrap-up board. Unwrapped words first — they are what the round is
 * for — padded with already-wrapped ones when the city runs short of fresh
 * candidates. `avoid` is the previous wrap-up board, pushed to the back of
 * each queue rather than dropped (the old exam draw learned this the hard
 * way): near the end of a city the pool IS the avoid set, and a short board
 * would be a worse answer than a repeat.
 */
export function wrapUpWords(
  all: readonly WordEntry[],
  srs: SrsMap,
  wrapped: WrappedWords,
  cityIndex: number,
  rng: Rng,
  avoid: ReadonlySet<string> = new Set(),
): WordEntry[] {
  const pool = wrapUpPool(all, srs, wrapped, cityIndex)
  const unwrapped = pool.filter((w) => !(w.id in wrapped))
  const packed = pool.filter((w) => w.id in wrapped)
  const fresh = (ws: WordEntry[]) => ws.filter((w) => !avoid.has(w.id))
  const stale = (ws: WordEntry[]) => ws.filter((w) => avoid.has(w.id))

  const board: WordEntry[] = []
  for (const group of [fresh(unwrapped), fresh(packed), stale(unwrapped), stale(packed)]) {
    if (board.length >= WRAPUP_CONFIG.totalWords) break
    for (const w of shuffle(group, rng)) {
      if (board.length >= WRAPUP_CONFIG.totalWords) break
      if (board.every((c) => !conflicts(w, c))) board.push(w)
    }
  }
  return board
}

/**
 * Whether the city can offer a wrap-up round at all: a full board must be
 * dealable, conflicts included — a pool of twenty that cannot seat twenty
 * words is not enough. Checked by dealing, with a fixed rng, because that is
 * the one honest answer to "can a board be dealt".
 */
export function wrapUpUnlocked(
  all: readonly WordEntry[],
  srs: SrsMap,
  wrapped: WrappedWords,
  cityIndex: number,
): boolean {
  const fixed = () => 0.5
  return wrapUpWords(all, srs, wrapped, cityIndex, fixed).length >= WRAP_UP_UNLOCK
}

/**
 * Key bias for the wrap-up deal: unwrapped words weigh what an unseen word
 * weighs in normal play, wrapped ones what a collected word is damped to —
 * so keygen's green tiers (recall, then produce) fill with the words the
 * round exists to pack, and the padding drifts toward filler and hazard.
 */
export function wrapUpBias(entries: readonly WordEntry[], wrapped: WrappedWords): KeyBias {
  return {
    need: Object.fromEntries(entries.map((w) => [w.id, w.id in wrapped ? 0.4 : 3])),
  }
}
