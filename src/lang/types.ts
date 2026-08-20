import type { WordEntry } from '../data/types'
import type { City } from '../journey/route'

/**
 * THE LANGUAGE SEAM.
 *
 * Everything the game knows about the language it is teaching, in one value.
 * The engine, the data layer and the prompts take a pack as a parameter rather
 * than importing Danish; Danish is a pack like any other, and is the only one
 * that ships.
 *
 * The house style this follows is `packing.ts` and the retired `redemption.ts`:
 * the dataset is injected, never imported, so the rule can be tested against a
 * fake and cannot quietly grow a dependency on the real one. A pack is the same
 * idea widened from "the words" to "the language".
 *
 * ── WHAT H2 MUST SUPPLY TO ADD GERMAN ──────────────────────────────────────
 *
 * Every field below is required, so the type checker is the checklist. In the
 * order they will actually be built:
 *
 *  1. `words` — 900 `WordEntry` with ids `de:<headword>`, `curriculumRank`
 *     1..900 with no gaps (validate-words.mjs enforces both). The id prefix is
 *     load-bearing far beyond the dataset: it is what keeps a German save from
 *     colliding with a Danish one in the SRS map and the wrapped ledger, and it
 *     is what `wordAudioUrl` reads to find `audio/de/`. See `store-namespacing`
 *     in `src/lang/index.ts`.
 *  2. `grammar.genders` — three, not two: `masculine` (der/ein), `feminine`
 *     (die/eine), `neuter` (das/ein). Note that German's indefinite article is
 *     NOT one-to-one with gender — der and das both take `ein` — which is why
 *     `article` and the labels are separate fields per gender rather than one
 *     derived from the other. `WordEntry.gender` is a plain string checked
 *     against this table, so no engine type changes.
 *  3. `grammar.isUncountable` — German has the same mass/abstract problem
 *     (Milch, Blut, Liebe). Follow `da/grammar.ts`: state the rule, apply it to
 *     every noun, and list the deliberate exclusions.
 *  4. `orthography` — `fold` is ä→ae ö→oe ü→ue ß→ss, `distinctive` is
 *     /[äöüß]/. Both matter more in German than Danish: ß→ss is a real
 *     spelling, not a keyboard workaround, so check `foldsAreSpellings`.
 *  5. `morphology` — German is NOT suffix-only. `stem` must cope with the
 *     ge- prefix of the participle (gemacht → mach) and umlaut plurals
 *     (Haus/Häuser), and separable verbs mean `compound.linkers` has a partner
 *     problem Danish does not have (aufstehen contains stehen). Expect this to
 *     be the field that needs measuring rather than reasoning about — the
 *     Danish one names the count of real pairs it blocks, and the German one
 *     should too.
 *  6. `route` — nine German cities, `WORDS_PER_CITY` still 100, plus a map
 *     module in the shape of `src/lang/da/map.ts` (run `scripts/make-map.mjs`
 *     against German geodata).
 *  7. `speech` — `de-DE` and a German voice for `scripts/make-audio.mjs`;
 *     bake to `public/audio/de/`.
 *  8. `prompts.translateRules` — the German gender/article/countability rules
 *     Casey needs, in the shape of the Danish block.
 *
 * Then register it in `src/lang/index.ts` and it is playable. Nothing outside
 * `src/lang/` should need to change — if something does, the seam has a hole
 * and the hole is the bug.
 */
export interface LanguagePack {
  /**
   * The ISO 639-1 code, which is also the word-id prefix, the audio directory
   * and the store namespace. Two letters, lower case; `wordAudioUrl`'s regexp
   * assumes exactly that shape.
   */
  readonly code: LanguageCode
  /** English name, as the prompts and the picker say it: "Danish". */
  readonly name: string
  /** The language's own name, for the picker: "Dansk". */
  readonly endonym: string
  readonly words: readonly WordEntry[]
  readonly speech: SpeechSpec
  readonly orthography: Orthography
  readonly morphology: Morphology
  readonly grammar: Grammar
  readonly route: Route
  readonly prompts: PromptStrings
}

/**
 * Every language the seam knows how to talk about — which is NOT the same as
 * the ones that ship. `de` is a member here with no pack behind it, on purpose:
 * it makes the per-language store code, the picker and their tests real rather
 * than vacuous, and a union of one would let the type checker quietly agree
 * that `code !== 'da'` is impossible. `LANGUAGES` in `src/lang/index.ts` is the
 * list of what is actually playable, and it holds only Danish.
 */
export type LanguageCode = 'da' | 'de'

export interface SpeechSpec {
  /** BCP-47 tag for the device's own speech engine: "da-DK". */
  readonly tag: string
  /**
   * How much slower than default to read, for a learner. Measured per language
   * because the engines differ: 0.88 is where the Danish voice stopped running
   * words together.
   */
  readonly rate: number
}

/**
 * The letters this language has that English does not, and what to do when a
 * phone keyboard cannot produce them.
 */
export interface Orthography {
  /**
   * Letters that can ONLY be this language, so a clue containing one needs no
   * further evidence. Empty for a language with no such letters, and the
   * classifier degrades gracefully to its other two tests.
   */
  readonly distinctive: RegExp
  /**
   * The ASCII spelling of those letters: æ→ae, ø→oe, å→aa. Used for legality
   * (a model that types "sovevaerelse" must not slip a compound past the check)
   * and for grading a typed answer on a keyboard that lacks them.
   */
  fold(s: string): string
  /**
   * The reverse reading: ae→æ, oe→ø, aa→å. Tried as a SECOND reading of a
   * player's answer only — never of a dataset word, which is spelled properly.
   */
  unfold(s: string): string
  /**
   * Whether a folded form is also a real spelling in this language.
   *
   * False for Danish: nobody writes "oel" for "øl", so folding is purely a
   * keyboard workaround and may be applied freely. TRUE for German, where "ss"
   * for "ß" is correct Swiss orthography and "ue" for "ü" is an accepted
   * transcription — which means a German pack cannot treat a folded match as a
   * typo to forgive, because it may be the word spelled correctly. Read by the
   * packing grader; the Danish path is unaffected either way.
   */
  readonly foldsAreSpellings: boolean
}

export interface Morphology {
  /**
   * Strip one inflectional ending, longest match first. Deliberately shared by
   * legality and the packing grader, and deliberately CONSERVATIVE: loosening
   * it makes the grader start accepting one real word as the answer for
   * another. A language that needs a looser rule for legality alone should put
   * it in `legality` below, the way Danish's past tense is.
   */
  stem(word: string): string
  /**
   * Endings that turn a headword into another form of itself, for the clue
   * classifier. Wider than `stem`'s list is allowed: this one only decides
   * "is this word plausibly of this language", never what a word means.
   */
  readonly inflections: readonly string[]
  /**
   * How this language builds compounds, which is most of what a good clue is
   * in Danish and German alike. `linkers` are the morphemes that go between the
   * halves — Danish hus-e-lejer, German Arbeit-s-tag — and `''` must be in the
   * list for the plain juxtaposition both languages also allow.
   */
  readonly linkers: readonly string[]
  /**
   * Extra legality tests no suffix rule reaches. Each returns "these two words
   * are forms of one another"; the check is symmetric at the call site, so a
   * pack need only state each pair once.
   */
  readonly legality: LegalityRules
}

export interface LegalityRules {
  /**
   * Endings that count as an inflection of a word of three letters or fewer,
   * which the general guards (length >= 4) do not reach. Without it "går" is a
   * legal clue for "gå".
   */
  readonly shortInflections: ReadonlySet<string>
  /**
   * Whether `clue` is a form of `board` that the stemmer misses. Danish uses it
   * for the past tense of -e verbs, guarded to verbs because the same shape
   * blocks real unrelated pairs on other parts of speech. Given the board
   * word's part of speech so a pack can make that guard.
   */
  isDerivedForm(clue: string, board: string, boardPos: string): boolean
  /**
   * Irregular pairs, both directions, where the vowel changes and no rule
   * reaches them: mand/mænd, Haus/Häuser. Only the ones actually in the shipped
   * dataset, so the list stays checkable.
   */
  readonly irregularPairs: ReadonlyArray<readonly [string, string]>
}

export interface Grammar {
  /**
   * The genders this language has, keyed by the value `WordEntry.gender`
   * carries. Danish has two, German three, and the engine has no opinion about
   * how many — it reads this table and prints what it finds.
   */
  readonly genders: Readonly<Record<string, GenderSpec>>
  /**
   * Whether a noun has no ordinary indefinite singular — mass and abstract
   * nouns, where "en mælk" promises a counting the language does not do. Those
   * print their gender instead of an article. State the rule in the pack and
   * apply it to every noun; do not keep a list of complaints.
   */
  isUncountable(headword: string): boolean
  /**
   * Filler a player may type in front of an answer and should not be marked
   * wrong for: Danish "en/et/at", German "der/die/das/ein/eine/zu". Anchored
   * and space-terminated at the call site.
   */
  readonly answerFiller: readonly string[]
}

export interface GenderSpec {
  /**
   * The indefinite article printed in front of a countable noun. Not derivable
   * from the gender name: German der and das both take "ein".
   */
  readonly article: string
  /** Short enough for a 64px card at 360px, where no article can be printed. */
  readonly short: string
  /** The same thing in full, for a screen reader and the dictionary sheet. */
  readonly full: string
}

export interface Route {
  /** The journey's stops, in order. Nine of them, at WORDS_PER_CITY each. */
  readonly cities: readonly City[]
  /** The country drawn by hand, in the shape `src/lang/da/map.ts` exports. */
  readonly map: MapArt
}

export interface MapArt {
  readonly width: number
  readonly height: number
  /** Place a real coordinate on the same projection as the coastline. */
  project(lon: number, lat: number): { x: number; y: number }
  /** The land: filled, and the coastline you read. */
  readonly path: string
  /** The second pencil line over it. Two lines that nearly agree is the trick. */
  readonly sketch: string
  /** Pencil shading on the coasts a 45° stroke runs into. */
  readonly hatch: string
}

export interface PromptStrings {
  /**
   * The language-specific half of the translate prompt: how gender, articles
   * and countability work, with worked examples. The rest of that prompt is
   * language-neutral and lives in `prompts.ts`.
   */
  readonly translateRules: string
  /**
   * One sentence telling Casey how to spell, for the clue prompt's hard
   * constraints: "Write Danish with æ, ø and å — never ae, oe or aa." Empty
   * string for a language with nothing to say here.
   */
  readonly spellingRule: string
  /**
   * Grammatical words in this language that no association clue can reach —
   * op, ind, ud, så, lige — named in the clue prompt so Casey does not hang one
   * on the back of a real clue. Two or three examples of the everyday phrases
   * they live in, in the shape "stå op, en gang til, lige nu".
   */
  readonly functionWordNote: string
}
