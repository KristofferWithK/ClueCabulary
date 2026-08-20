import type { LanguagePack } from '../lang/types'
import { normalize } from './text'
import type { BoardWord } from './types'

export interface LegalityVerdict {
  legal: boolean
  reason?: string
  conflictWord?: string
}

/**
 * Clue legality, with the language's own rules injected.
 *
 * The ALGORITHM here is language-neutral — exact match, containment, shared
 * stem, inflection of a short word, derived form, irregular pair — and every
 * one of those steps asks the pack what counts. What used to be a file of
 * Danish suffix lists is now a file of questions; the Danish answers live in
 * `src/lang/da/morphology.ts` and are unchanged, which is why this refactor
 * moves no behaviour.
 */

/**
 * The general guards below all require length >= 4, so short words like gå, år,
 * by, se would otherwise only be blocked on exact equality — 'går' would be a
 * legal clue for 'gå'. The pack supplies the endings that count, and the
 * gemination step is shared: a doubled final consonant before an ending is a
 * Germanic habit, not a Danish one (øl → øllet, æg → ægget).
 */
function isInflectionOfShort(
  longer: string,
  short: string,
  suffixes: ReadonlySet<string>,
): boolean {
  if (!longer.startsWith(short)) return false
  let rest = longer.slice(short.length)
  if (rest.length === 0) return true
  if (rest[0] === short[short.length - 1]) rest = rest.slice(1) // gemination
  return suffixes.has(rest)
}

/**
 * The same test, also in the folded ASCII spelling — because every other guard
 * here folds and this one did not, so with "dør" on the board "døren" was
 * rejected while "doeren" was legal. 41 board words are three letters or fewer
 * and contain a Danish letter, so that is not a corner: øl/oellet, æg/aegget,
 * søn/soennen.
 *
 * Two details the obvious version gets wrong, both measured against the whole
 * dataset. The fold is applied only when the SHORT word really contains a
 * language-specific letter, and the length test stays on the unfolded spelling
 * — folding unconditionally lengthens the short word into a prefix it never
 * was, and blocks four real pairs: "to" swallows "tør", "ko" swallows "køre",
 * "sko" swallows "skøn", "ro" swallows "røre". Guarded this way it catches all
 * twelve ASCII forms and adds no new block anywhere in the set.
 */
function inflectionOfShort(longer: string, short: string, lang: LanguagePack): boolean {
  if (short.length > 3) return false
  const suffixes = lang.morphology.legality.shortInflections
  if (isInflectionOfShort(longer, short, suffixes)) return true
  const fold = lang.orthography.fold
  const folded = fold(short)
  return folded !== short && isInflectionOfShort(fold(longer), folded, suffixes)
}

function isIrregularFormOf(a: string, b: string, lang: LanguagePack): boolean {
  return lang.morphology.legality.irregularPairs.some(
    ([one, other]) => (a === one && b === other) || (a === other && b === one),
  )
}

/** Does either string contain the other, in plain or folded spelling? */
function overlaps(a: string, b: string, fold: (s: string) => string): boolean {
  if (a.includes(b) || b.includes(a)) return true
  const fa = fold(a)
  const fb = fold(b)
  return fa !== a || fb !== b ? fa.includes(fb) || fb.includes(fa) : false
}

/**
 * A clue is illegal when it is too close to ANY board word — its form in the
 * language being learned or any English gloss. Checked identically for the
 * player's and the AI's clues.
 */
export function checkClueLegality(
  clue: string,
  words: readonly BoardWord[],
  lang: LanguagePack,
): LegalityVerdict {
  const c = normalize(clue)
  if (!c) return { legal: false, reason: 'empty clue' }
  if (/\s/.test(c)) return { legal: false, reason: 'clue must be a single word' }

  const { fold } = lang.orthography
  const { stem } = lang.morphology
  const { isDerivedForm } = lang.morphology.legality
  const cStem = stem(c)

  for (const w of words) {
    for (const candidate of [w.da, ...w.en]) {
      const b = normalize(candidate)
      if (!b) continue
      // Translations are hidden by default, so an error about a gloss must
      // name the board word the player can actually see.
      const isGloss = b !== normalize(w.da)
      const what = isGloss ? `"${candidate}" — the translation of "${w.da}"` : `"${candidate}"`
      if (c === b || (fold(c) === fold(b) && c !== b)) {
        return {
          legal: false,
          reason: isGloss
            ? `"${clue}" is the English translation of "${w.da}" on the board`
            : `"${clue}" is a word on the board`,
          conflictWord: w.da,
        }
      }
      if (b.length >= 4 && overlaps(c, b, fold)) {
        return { legal: false, reason: `"${clue}" contains or is contained in ${what}`, conflictWord: w.da }
      }
      if (cStem === stem(b) || stem(fold(c)) === stem(fold(b))) {
        return { legal: false, reason: `"${clue}" is a form of ${what}`, conflictWord: w.da }
      }
      if (inflectionOfShort(c, b, lang) || inflectionOfShort(b, c, lang)) {
        return { legal: false, reason: `"${clue}" is a form of ${what}`, conflictWord: w.da }
      }
      if (isDerivedForm(c, b, w.pos) || isIrregularFormOf(c, b, lang)) {
        return { legal: false, reason: `"${clue}" is a form of ${what}`, conflictWord: w.da }
      }
      // There was an edit-distance rule here — one letter apart counted as too
      // close — and it was wrong for this language. Danish runs on minimal
      // pairs: hund/hånd, bord/jord, læse/næse, lige/pige, mand/mund,
      // skole/stole, fisk/frisk. Across the thousand words the dataset held at
      // the time it blocked 271
      // pairs of entirely unrelated words, every one of them a clue a person
      // would reasonably give. The inflections it was meant to catch are
      // already caught above, by the stem and short-word guards, which is
      // where that job belongs. Codenames bans the board word and its forms,
      // not words that merely rhyme with it.
      //
      // Worth knowing for a second language: whether that verdict holds is a
      // fact about the language's phonology, not about this rule. Measure it
      // against the German set before assuming either way.
    }
  }
  return { legal: true }
}
