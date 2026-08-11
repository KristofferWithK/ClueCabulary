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
  /** 1 = most common. Governs the order new words are introduced. */
  freqRank: number
}
