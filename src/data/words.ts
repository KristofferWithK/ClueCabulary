import { ACTIVE } from '../lang/active'
import { createDataset } from './dataset'

/**
 * The active language's word list and the indexes over it.
 *
 * Everything here used to be built directly over `words.da.json`. It is now the
 * same thing built over whichever pack is active — `createDataset` in
 * `dataset.ts` holds the logic and takes a pack, so the seam can be tested
 * against a fake language rather than only against the one that ships.
 *
 * The module-scope index build is the reason `ACTIVE` reads localStorage
 * directly rather than going through a store; see `src/lang/active.ts`.
 */
const dataset = createDataset(ACTIVE)

export type { ClueLanguage } from './dataset'
export { curriculumRank, normalizeGloss } from './dataset'

export const WORDS = dataset.words
export const wordById = dataset.wordById
export const conceptsOf = dataset.conceptsOf
export const isKnownGloss = dataset.isKnownGloss
export const classifyClue = dataset.classifyClue

/**
 * One of the shipped nine hundred, as a headword in the language being learned.
 * Called `isDanishWord` until the seam; the rule was never about Danish, only
 * about "is this string a word we ship".
 */
export const isHeadword = dataset.isHeadword

/** Kept for the tests that name it; the classifier is the thing to use. */
export const looksEnglish = (raw: string): boolean => dataset.classifyClue(raw) === 'english'
