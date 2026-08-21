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
 *  1. `words` — 900 `WordEntry` in `src/data/words.de.json`, with ids
 *     `de:<headword>` and `curriculumRank` 1..900 with no gaps
 *     (validate-words.mjs enforces both). Note the field names do not change:
 *     the headword is `da`, its sentence is `exampleDa` — see "what was
 *     deliberately not renamed" below. The id prefix is load-bearing far beyond
 *     the dataset: it is what keeps a German save from colliding with a Danish
 *     one in the SRS map and the wrapped ledger, and it is what `wordAudioUrl`
 *     reads to find `audio/de/`. See the note at the bottom of
 *     `src/lang/index.ts`.
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
 *     (Haus/Häuser), and separable verbs mean `morphology.linkers` has a
 *     partner problem Danish does not have (aufstehen contains stehen). Expect
 *     this to be the field that needs measuring rather than reasoning about —
 *     the Danish one names the count of real pairs it blocks, and the German
 *     one should too.
 *  6. `route` — a country name, nine German cities (`WORDS_PER_CITY` stays
 *     100), and a map module in the shape of `src/lang/da/map.ts`: run
 *     `scripts/make-map.mjs` against German geodata, then package the consts
 *     it writes the way `src/lang/da/route.ts` does.
 *  7. `speech` — `de-DE`, a `rate` (1 unless a German device gives a reason to
 *     drop it) and a `slowRate` chosen by ear on that device rather than
 *     inherited from Danish's 0.6.
 *  8. `prompts` — eight strings, each quoted into a fixed sentence in
 *     `src/ai/prompts.ts`. Read how each is used before writing it; they are
 *     clauses, not paragraphs. `seam.test.ts` asserts a prompt built for
 *     another language contains no Danish letter, which is how the last three
 *     of them were found.
 *  9. `copy` — the four places the UI speaks the language rather than English,
 *     plus the tips. Those tips are NOT translations of the Danish ones:
 *     German's would be about cases, capitalised nouns and separable verbs.
 * 10. `functionWords` — the closed classes in full, in
 *     `src/data/function-words.de.json`, hand-built the way the Danish one
 *     was (see the essay atop `scripts/measure-function-words.mjs`). The
 *     post-round story is written TO this list, so a class left out is a
 *     class the game stops trying to teach. Order matters twice: classes are
 *     walked in priority order when picking story targets, and words within a
 *     class in list order — put the connectives a single-clause example can
 *     never contain (weil, obwohl, falls) early.
 *
 * ── AND FOUR THINGS OUTSIDE `src/lang/`, ALL OF THEM TABLES ────────────────
 *
 * Each is a one-line entry keyed by language code, and each already has a `de`
 * slot or errors clearly when it does not:
 *
 *  - `scripts/audio-slug.mjs` FOLDS — ALREADY WRITTEN for German, and it must
 *    stay byte-identical to `orthography.fold`. This is the one that fails
 *    silently: without ä→ae, Mädchen and Madchen are one file, and ß survives
 *    the ASCII filter as a hyphen. `speak.test.ts` compares the two over the
 *    whole dataset.
 *  - `scripts/make-audio.mjs` LOCALES and each provider's `voices` — the
 *    locale is not derivable from the code (da is da-DK, not da-DA), so the
 *    pairs are stated. Google's `de-DE-Neural2-F` is listed already; audition
 *    it before trusting it.
 *  - `scripts/validate-words.mjs` ALPHABETS — `äöüß` and their capitals.
 *    German capitalises its nouns, so the existing upper-case allowance is the
 *    rule there rather than a looseness.
 *  - `src/backup/backup.ts` `LanguageSchema` — already accepts 'de'.
 *
 * Then register the pack in `src/lang/index.ts` and it is playable, and the
 * Settings picker appears by itself. If anything ELSE needs changing, the seam
 * has a hole and the hole is the bug.
 *
 * ── WHAT WAS DELIBERATELY NOT RENAMED ──────────────────────────────────────
 *
 * `WordEntry.da` and `BoardWord.da` keep the name `da` in every language —
 * `words.de.json` will have `"da": "Haus"`. It is the JSON key, a field on the
 * persisted board and part of the AI response schema, so moving it costs a
 * migration and forty call sites to buy a better name for a field whose
 * meaning is never in doubt where it is used. Read it as "the headword". Same
 * reasoning as `klausVerifiedAt` and the `cluey-*` classes in CLAUDE.md.
 *
 * The store keys stay `cluecab-*` and are shared, not split per language —
 * see the note at the bottom of `src/lang/index.ts` for which parts of a save
 * are per-language and which are deliberately not.
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
  readonly copy: TargetCopy
  /**
   * The language's closed classes — pronouns, prepositions, conjunctions,
   * auxiliaries, the particles, and now the numerals and the greetings —
   * grouped by class. Nothing in the nine hundred is one of these, because
   * none of them can be clued; they reach a learner only as scenery inside a
   * sentence.
   *
   * That first sentence was FALSE from the day it was written until
   * docs/word-selection.md: 69 card words were on this very list, 66 of them
   * in cities 2 to 4, so Ribe asked the player to collect and type «også»
   * before Kolding would open. It is true now because a headword that is also
   * on the ledger is a hard error in `scripts/validate-words.mjs` — a claim
   * this load-bearing should be checked rather than asserted, and it is the
   * one rule of that file with a mutation recorded against it.
   *
   * The shipped example sentences reach 139 of the Danish 252
   * (`scripts/measure-function-words.mjs`), which is worse than the 147 of 209
   * they reached before: the words that left took their sentences with them,
   * and writing the scenery back in is T3's card.
   * The post-round story is written TO this list: the coverage store picks the
   * least-met entries as targets and the story must weave them in. Class order
   * is the target-picking priority; word order breaks ties within a class.
   */
  readonly functionWords: Readonly<Record<string, readonly string[]>>
}

/**
 * The handful of places the UI speaks the language being learned rather than
 * English.
 *
 * The chrome is English by decision (D1) — everything a player must READ to
 * OPERATE the app. These four are the exceptions, and each is deliberate:
 * arriving somewhere is greeted in the local language, the last line of the
 * journey is said in the language you just learned, the answer box asks in the
 * language it wants, and the tips teach the language by being about it.
 */
export interface TargetCopy {
  /** Above the city name on the arrival screen: "Velkommen til". */
  readonly welcome: string
  /**
   * The end of the road, said in the language, followed in English by " — you
   * packed the last suitcase in <final city>". The last thing the game ever
   * says, and by nine hundred words it is a sentence you can read.
   */
  readonly journeyOver: string
  /** Placeholder in the wrap-up answer box: "dansk…". */
  readonly answerPlaceholder: string
  /**
   * Small true things about the language, for Casey's bubble on Home. Mixed in
   * with the language-neutral gameplay tips in `cluey-tips.ts`.
   *
   * These are not translations of the Danish ones. Danish's are about æøå, the
   * suffixed definite article and counting in twenties; German's would be about
   * cases, capitalised nouns and separable verbs. Write the ones that are true.
   */
  readonly tips: readonly string[]
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

/**
 * Which language Casey gives HIS clues in — not which language is being
 * learned, which is `LanguageCode` above and a different question entirely.
 *
 * 'target' means "whatever we are learning"; it was stored as the literal 'da'
 * until settings v9, which is exactly the kind of value that reads fine until
 * there are two languages and then means the wrong one. The player is always
 * asked for a target-language clue; this setting is the escape hatch for
 * Casey's half, and 'en' is what it escapes to.
 */
export type ClueLanguageSetting = 'target' | 'en'

export interface SpeechSpec {
  /** BCP-47 tag for the device's own speech engine: "da-DK". */
  readonly tag: string
  /**
   * How fast to read, for a device with no baked clip. 1 — the ordinary pace —
   * because the app now has a slow control instead of a slow default: Danish
   * spent a while at 0.88 for the sentence «hvad hedder du», which the engine
   * ran together, and hedging every word against that one is what `slowRate`
   * replaces.
   */
  readonly rate: number
  /**
   * What the dictionary sheet's 🐢 asks for. 0.6 in Danish, chosen by ear from
   * a rate audition (DECISIONS.md, «The voice is Aoede at 0.6») and the same
   * figure the slow bake uses, so the two speeds sound alike whether a word
   * has a clip or not.
   */
  readonly slowRate: number
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
  /**
   * The country travelled, in English, for the two screens that name it —
   * the map's accessible label and How to play.
   */
  readonly country: string
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

/**
 * The language-specific strings inside Casey's prompts.
 *
 * The GAME's rules are shared verbatim by every language and stay in
 * `src/ai/prompts.ts`; these are the parts that are facts about the language,
 * and every one of them is a place a German prompt would otherwise have had to
 * fork the file. Each is quoted into a fixed surrounding sentence, so a pack
 * writes the clause and not the paragraph — see how they are used before
 * writing a new one.
 */
export interface PromptStrings {
  /**
   * The language-specific half of the translate prompt: how gender, articles
   * and countability work, the JSON shape, and worked examples. The rest of
   * that prompt is language-neutral and lives in `prompts.ts`.
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
   * on the back of a real clue. Ends with two or three of the everyday phrases
   * they live in; the sentence it completes begins "Some greens are
   * grammatical words — ".
   */
  readonly functionWordNote: string
  /**
   * A one-word clue in this language for "pets", used in the clue prompt's
   * worked example. Only the word: the example around it is neutral.
   */
  readonly clueExampleWord: string
  /**
   * False friends between this language and English, for the guess prompt —
   * the guesser is told a learner's clue may arrive in either language, and
   * these are the pairs where reading it the wrong way is a real mistake.
   * Completes "…especially if it is a homograph with unrelated senses — ".
   */
  readonly homographNote: string
  /**
   * The guess prompt's worked example: a whole `{"guesses": [...]}` JSON reply
   * on an imaginary board, showing the confidence bands being used honestly.
   *
   * In the pack rather than shared because a prompt written in one language
   * that demonstrates itself with another's words is asking the model to reply
   * in the wrong one — and this example is long enough, and near enough the
   * end, to be the strongest thing in the prompt about what a reply looks like.
   */
  readonly guessExample: string
  /**
   * One quoted sentence showing the shape of a good reasoning: the word, the
   * board word it was weighed against, and what decided between them.
   * Completes "…name the board word you weighed it against and what decided
   * it. " and is followed by "— not …".
   *
   * Found by `seam.test.ts` rather than by reading the prompt: it is a Danish
   * example buried inside a rule rather than in the examples block, which is
   * exactly the kind of thing an audit by eye walks past.
   */
  readonly reasoningExample: string
  /**
   * A worked example of the compound rule: a board word, and a longer word
   * containing it that is therefore an illegal clue. Completes "A compound
   * contains its parts: " and is the single most useful line in the hard
   * constraints, because compounding is how both these languages build the
   * clues a model most wants to give.
   */
  readonly compoundExample: string
}
