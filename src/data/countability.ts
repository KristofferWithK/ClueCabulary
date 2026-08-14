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
 * "fix" them: ost, øl, kaffe, te, vin, is, sodavand, brød, frugt, suppe, salat,
 * papir, glas, træ, hår, lyn, smerte, følelse, interesse, krig, sandhed,
 * forkølelse, venskab, ægteskab, skat, arbejde — every one has a common,
 * ordinary "en/et" reading.
 */

/** Substances and materials: measured, not counted. */
const SUBSTANCES = [
  'mad', 'mælk', 'vand', 'kød', 'smør', 'salt', 'sukker', 'peber', 'blod',
  'luft', 'jord', 'sne', 'regn', 'ild', 'græs', 'pasta', 'chokolade',
  'skinke', 'slik', 'sæbe',
]

/** Collectives: already plural or already the whole of the thing. */
const COLLECTIVES = ['tøj', 'undertøj', 'bagage', 'penge']

/** Weather and the natural world, as conditions rather than events. */
const CONDITIONS = ['vejr', 'vind', 'torden', 'tåge', 'solskin', 'varme', 'kulde', 'natur']

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
