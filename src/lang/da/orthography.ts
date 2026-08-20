import type { Orthography } from '../types'

/**
 * Danish written on an English keyboard: æ→ae, ø→oe, å→aa.
 *
 * Applied only where a pack asks for it — inside the legality check, and as a
 * second reading of a typed answer — and never in `normalize()`: legality
 * erring strict costs a model one retry, whereas folding in the shared
 * normalizer would also loosen the wrap-up packing grader, where "hus" must not
 * be accepted for "hös".
 *
 * Without this, "sovevaerelse" is a legal clue on a board holding "værelse"
 * while "soveværelse" is not — a compound clue slips through purely by being
 * typed without the Danish letters, which is exactly how a model spells it.
 */
const fold = (s: string): string =>
  s.replace(/æ/g, 'ae').replace(/ø/g, 'oe').replace(/å/g, 'aa')

/**
 * The reverse, tried as a second reading of a player's ANSWER only: the target
 * comes from the dataset and is spelled properly.
 */
const unfold = (s: string): string =>
  s.replace(/aa/g, 'å').replace(/ae/g, 'æ').replace(/oe/g, 'ø')

export const danishOrthography: Orthography = {
  distinctive: /[æøå]/,
  fold,
  unfold,
  // No Dane writes "oel" for "øl", so a folded spelling is always a keyboard
  // workaround here and never the word spelled correctly. German is the other
  // case — "ss" for "ß" is real Swiss orthography — which is why the grader
  // asks rather than assuming.
  foldsAreSpellings: false,
}
