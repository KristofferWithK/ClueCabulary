export type PartOfSpeech =
  | 'noun'
  | 'verb'
  | 'adjective'
  | 'adverb'
  | 'numeral'
  | 'interjection'

export interface WordEntry {
  id: string
  /**
   * The citation form in the language being learned: nouns singular
   * indefinite, verbs bare infinitive, adjectives in the base gender.
   *
   * Still called `da` in every language, including German, and that is a
   * deliberate non-rename rather than an oversight. It is the JSON key in
   * `words.<lang>.json`, a field on `BoardWord`, part of the persisted game and
   * part of the AI response schema, so moving it costs a migration and forty
   * call sites to buy a better name for a field whose meaning is never in
   * doubt at the point of use. Read it as "the headword" — the same reasoning
   * CLAUDE.md records for `klausVerifiedAt` and the `cluey-*` classes.
   */
  da: string
  /** English glosses, most common first. Verbs in bare form ("run", not "to run"). */
  en: string[]
  pos: PartOfSpeech
  /**
   * The indefinite article, nouns only — and only where one exists. A few
   * nouns are plurale tantum (penge, bukser, briller): there is no "en penge",
   * so there is no article to show.
   *
   * A plain string rather than 'en' | 'et': which articles exist is the
   * language's business, and the pack's gender table is where they are
   * enumerated. `seam.test.ts` checks every gender the dataset uses has an
   * entry there, which is the check the union used to be doing.
   */
  article?: string
  /**
   * The gender, on every noun including the ones with no article.
   *
   * A learner needs the gender whether or not the word can be counted — it is
   * what decides the definite ending and every agreeing adjective. Showing
   * nothing at all beside «bukser» taught nothing; it now says (com), from the
   * singular that does exist (en buks).
   *
   * Danish has two and German three, so this is a plain string keyed into
   * `pack.grammar.genders` rather than a union that every new language would
   * have to widen.
   */
  gender?: string
  /**
   * False for a noun with no ordinary indefinite singular — mass and abstract
   * nouns, where "en mælk" / "et blod" promise a counting the language does not
   * do. Those show their gender instead. See countability.ts for the rule and
   * for the words deliberately left countable.
   */
  countable?: boolean
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
