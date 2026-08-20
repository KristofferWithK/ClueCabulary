import type { Grammar } from '../types'

/**
 * Which Danish nouns have no ordinary indefinite singular.
 *
 * THE RULE, applied to every noun in the dataset rather than to the ones
 * somebody complained about:
 *
 *   A noun is UNCOUNTABLE here when "en X" / "et X" would be wrong or clearly
 *   odd in everyday Danish. Where both readings are ordinary the article stays,
 *   because "et brød" (a loaf), "en øl" (a beer), "en is" (an ice cream), "et
 *   hår" (a single hair), "en ost" (a whole cheese) and "et papir" (a document)
 *   are all good Danish AND they teach the gender in the form a learner meets.
 *   Danish counts drinks and portions freely; that is not an error to fix.
 *
 * So this list is the mass and abstract core, where the indefinite singular is
 * not something a Dane says. Those cards print (com) / (neut) instead — the
 * gender without the false promise that you can count it.
 *
 * Deliberately NOT included, and each for a reason, so the next reader does not
 * "fix" them: ost, øl, kaffe, te, vin, is, brød, frugt, suppe, salat, papir,
 * glas, træ, hår, smerte, følelse, interesse, krig, sandhed, forkølelse, skat,
 * arbejde — every one has a common, ordinary "en/et" reading.
 *
 * The list holds only nouns the game actually ships, and gender.test.ts fails
 * on any that is not one. Peber, græs, skinke, slik, bagage, torden and tåge
 * left with the hundred words that went when the dataset came down to nine
 * hundred, and sodavand, lyn, venskab and ægteskab left the note above with
 * them. Every one of those calls was right about Danish and would be right
 * again, so this is the place to look first if the dataset ever grows back.
 *
 * German needs its own version of this file, not a translation of this list.
 */

/** Substances and materials: measured, not counted. */
const SUBSTANCES = [
  'mad', 'mælk', 'vand', 'kød', 'smør', 'salt', 'sukker', 'blod',
  'luft', 'jord', 'sne', 'regn', 'ild', 'pasta', 'chokolade', 'sæbe',
]

/** Collectives: already plural or already the whole of the thing. */
const COLLECTIVES = ['tøj', 'undertøj', 'penge']

/** Weather and the natural world, as conditions rather than events. */
const CONDITIONS = ['vejr', 'vind', 'solskin', 'varme', 'kulde', 'natur']

/** States of mind and other abstractions you have rather than have one of. */
const ABSTRACTIONS = [
  'kærlighed', 'lykke', 'sorg', 'fred', 'viden', 'hjælp', 'vrede', 'frygt',
  'angst', 'humør', 'stolthed', 'skam', 'ensomhed', 'tillid', 'tvivl', 'mod',
  'ro', 'sundhed', 'lyst', 'håb', 'glæde', 'tid', 'fritid',
]

/** Fields and pursuits, and the illnesses you simply have. */
const DOMAINS = [
  'musik', 'kultur', 'motion', 'træning', 'svømning', 'internet',
  'feber', 'influenza', 'medicin', 'hoste',
]

export const UNCOUNTABLE: ReadonlySet<string> = new Set([
  ...SUBSTANCES,
  ...COLLECTIVES,
  ...CONDITIONS,
  ...ABSTRACTIONS,
  ...DOMAINS,
])

/** The classes, named, so a validator can report which one a word came from. */
export const UNCOUNTABLE_CLASSES: ReadonlyArray<readonly [string, readonly string[]]> = [
  ['substance', SUBSTANCES],
  ['collective', COLLECTIVES],
  ['condition', CONDITIONS],
  ['abstraction', ABSTRACTIONS],
  ['domain', DOMAINS],
]

export const isUncountable = (da: string): boolean => UNCOUNTABLE.has(da.toLowerCase())

/**
 * Danish has two genders, and each prints three ways.
 *
 * The short forms are short because this sits on a 64px-wide card at 360px.
 * German's three go here unchanged in shape — and note that `article` is stated
 * per gender rather than derived from it, because German der and das both take
 * "ein" and a derivation would have to know that.
 *
 * Below the UNCOUNTABLE export on purpose: `scripts/validate-words.mjs` reads
 * the word lists out of this file by taking every quoted string ABOVE that
 * export, so anything up there that is not a headword poisons its set.
 */
const GENDERS = {
  common: { article: 'en', short: '(com)', full: 'common gender' },
  neuter: { article: 'et', short: '(neut)', full: 'neuter gender' },
} as const

export const danishGrammar: Grammar = {
  genders: GENDERS,
  isUncountable,
  // "et hus", "en kat", "at løbe" — the article, and the infinitive marker.
  answerFiller: ['en', 'et', 'at'],
}
