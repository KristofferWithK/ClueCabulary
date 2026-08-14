import type { WordEntry } from '../data/types'
import { WRAPUP_CONFIG } from '../engine/config'
import type { KeyBias } from '../engine/keygen'
import { shuffle, type Rng } from '../engine/rng'
import { conflicts } from '../srs/sampler'
import type { SrsMap } from '../srs/types'
import { isCollected, wordsForCity, type WrappedWords } from './progress'

/**
 * The wrap-up round: a 4×5 board dealt entirely from the current city's
 * collected words, every card starting English-side up. The player packs each
 * card by typing its Danish word; the round then plays like any other, and
 * every packed word that ends the round green is wrapped — safe in the
 * suitcase for good.
 */

/** A wrap-up board needs a full board's worth of collected words. */
export const WRAP_UP_UNLOCK = WRAPUP_CONFIG.totalWords

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
