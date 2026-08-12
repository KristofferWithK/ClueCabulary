/**
 * The semantic vocabulary the curated first city is tagged with.
 *
 * A board is twelve words drawn from a hundred, and a clue is only worth more
 * than one word if several of them belong to the same everyday domain. These
 * ids are how that property is written down and, in concepts.test.ts, how it
 * is kept true as words change: a city where no concept has four members deals
 * boards on which every clue is a 1.
 */
export const CONCEPT_IDS = [
  'people',
  'family',
  'body',
  'food',
  'drink',
  'kitchen',
  'home',
  'furniture',
  'school',
  'work',
  'money',
  'time',
  'colour',
  'animal',
  'nature',
  'weather',
  'vehicle',
  'building',
  'place',
  'movement',
  'speech',
  'thought',
  'emotion',
  'senses',
  'size',
  'age',
  'clothing',
  'health',
  'leisure',
  'nationality',
] as const

export type ConceptId = (typeof CONCEPT_IDS)[number]

const CONCEPT_SET: ReadonlySet<string> = new Set(CONCEPT_IDS)
export const isConceptId = (s: string): s is ConceptId => CONCEPT_SET.has(s)
