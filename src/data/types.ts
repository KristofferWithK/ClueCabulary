export type PartOfSpeech =
  | 'noun'
  | 'verb'
  | 'adjective'
  | 'adverb'
  | 'numeral'
  | 'interjection'

export interface WordEntry {
  id: string
  /** Danish citation form: nouns singular indefinite, verbs bare infinitive, adjectives common gender. */
  da: string
  /** English glosses, most common first. Verbs in bare form ("run", not "to run"). */
  en: string[]
  pos: PartOfSpeech
  /** Danish gender article, nouns only. */
  article?: 'en' | 'et'
  exampleDa: string
  exampleEn: string
  /** 1 = most common in Danish. Real corpus frequency; never reordered. */
  freqRank: number
  /**
   * Position in the teaching order, 1-based, which is what decides the city a
   * word belongs to and the order new words are introduced. Frequency alone
   * put "ikke", "også" and "nu" on the first board, and no one-word clue can
   * point at those — so the first city is curated for clueability, and only
   * then by frequency. Absent means "fall back to freqRank".
   */
  curriculumRank?: number
  /**
   * What the word IS, for the offline companion: it clues by naming a concept
   * that covers several of its own words. Curated words carry these; the rest
   * of the dataset does not yet, and the companion simply cannot clue them.
   */
  concepts?: string[]
}
