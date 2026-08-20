import type { PromptStrings } from '../types'

/**
 * The Danish half of what Casey is told.
 *
 * Everything here is a rule OF DANISH rather than a rule of the game — the
 * game's own rules stay in `src/ai/prompts.ts` and are shared verbatim by every
 * language. Splitting them this way is what keeps a second language from having
 * to fork the prompt: German changes these three strings and nothing else.
 */

/**
 * How gender, articles and countability work, for the translate prompt.
 *
 * The countability paragraph is the same rule `grammar.ts` applies to the
 * dataset, said to a model instead of to a validator — and it has to be said,
 * because the obvious reading strips the article off "en øl" and "et brød",
 * which are things Danes say.
 */
const translateRules = `- Give the citation form: a noun in the singular indefinite, a verb as the bare infinitive, an adjective in the common gender.
- For a NOUN, always give the gender: "common" (en-word) or "neuter" (et-word). Give "article" as well ONLY when the noun has an ordinary indefinite singular — most do.
- Mass and abstract nouns do not: nobody says "en trafik", "et blod", "en mælk", "en kærlighed". For those set "countable": false and give no article, just the gender. Where BOTH readings are ordinary Danish the noun IS countable and keeps its article — "en øl" (a beer), "et brød" (a loaf), "en ost" (a whole cheese), "et hår" (a single hair) are all things Danes say, so do not strip those.

Respond with ONLY a JSON object: {"da": string, "en": string, "article": "en" | "et" (countable nouns only), "gender": "common" | "neuter" (all nouns), "countable": boolean (nouns only), "note": string (optional)}

Example for "cykel": {"da": "cykel", "en": "bicycle", "article": "en", "gender": "common", "countable": true}
Example for "afternoon": {"da": "eftermiddag", "en": "afternoon", "article": "en", "gender": "common", "countable": true}
Example for "trafik": {"da": "trafik", "en": "traffic", "gender": "common", "countable": false}
Example for "at cykle": {"da": "cykle", "en": "to cycle"}`

export const danishPrompts: PromptStrings = {
  translateRules,
  spellingRule: 'Write Danish with æ, ø and å — never ae, oe or aa.',
  functionWordNote:
    'op, ind, ud, ned, så, lige, jo, gang, samme, anden, altid, igen and the like. Association clues do not reach these, so never hang one on the back of a real clue. Take one only alone, with number 1, pointing at the everyday phrase it lives in (stå op, en gang til, lige nu)',
  clueExampleWord: 'kæledyr',
  // Chosen because each is a word a learner meets early AND has a completely
  // unrelated English sense, which is the case where reading the clue the
  // wrong way costs the turn rather than merely slowing it down.
  homographNote:
    'Danish "foster" is a fetus, English "foster" is to raise a child; Danish "kind" is a cheek, English "kind" is friendly; Danish "sky" is a cloud or gravy.',
  compoundExample: 'with "værelse" on the board, "soveværelse" is illegal',
  reasoningExample:
    '"æble is the fruit; pære is also a fruit but the clue said one, and æble is the commoner word" — not "æble is a fruit"',
  guessExample: `Example of a well-calibrated reply, from a DIFFERENT board where the clue was "frugt" (2):
{"guesses": [{"wordId": "w2", "confidence": 0.9, "reasoning": "æble (apple) is literally a fruit; the nearest decoy is træ (tree), which is where fruit grows rather than a fruit"}, {"wordId": "w9", "confidence": 0.8, "reasoning": "pære (pear) is also a fruit, and the clue says two — apple and pear are the pair meant"}, {"wordId": "w5", "confidence": 0.3, "reasoning": "træ (tree) is only loosely related — it is where fruit grows, not a fruit, and naming it would end the turn and spend a token, so stop above it"}, {"wordId": "w11", "confidence": 0.15, "reasoning": "sød (sweet) describes fruit but is not one"}]}`,
}
