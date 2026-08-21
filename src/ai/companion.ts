import { checkClueLegality } from '../engine/legality'
import type { BoardWord } from '../engine/types'
import { AiError, chatJson, type AiSettings, type ChatFn } from './client'
import {
  aiGuessableIds,
  aiTargetableIds,
  type AiClueView,
  type AiGuessView,
  type StoryView,
} from './projections'
import {
  buildCluePrompt,
  buildGuessPrompt,
  buildStoryPrompt,
  buildTranslatePrompt,
  type ChatMessage,
} from './prompts'
import { ACTIVE } from '../lang/active'
import {
  ClueResponseSchema,
  GuessResponseSchema,
  StoryResponseSchema,
  TranslationResponseSchema,
  type ClueResponse,
  type GuessResponse,
  type StoryResponse,
  type TranslationResponse,
} from './schemas'

/**
 * Three calls, and there used to be a fourth: `getDebrief`, one request per
 * round, asking the model to narrate an ending the app already knew. The round
 * summary reads the board and the stores instead — what was said is in the turn
 * log verbatim, and what was learned is a count the SRS can answer — so the
 * round now ends without a network call at all.
 */
export interface Companion {
  getClue(view: AiClueView): Promise<ClueResponse>
  getGuesses(view: AiGuessView): Promise<GuessResponse>
  /** One word, either direction. Takes no view: it must not see the board. */
  translate(term: string): Promise<TranslationResponse>
  /**
   * The post-round story (H5). One call per finished round, in the seat the
   * debrief vacated — B1 deleted a call that narrated what the player could
   * already see, and this spends the same budget on the words no board can
   * hold. The round is over when it runs, so nothing about it is on the
   * critical path: a failure falls back to the shipped example sentences.
   */
  getStory(view: StoryView): Promise<StoryResponse>
}

/**
 * Words out of a sentence, the same way `scripts/measure-function-words.mjs`
 * cuts them: hyphens and apostrophes stay inside a token, every other mark is
 * a boundary. \p{L} rather than a Danish letter class, so the same knife works
 * for German without an edit.
 */
export const storyTokens = (text: string): string[] =>
  text
    .toLowerCase()
    .split(/[^\p{L}'-]+/u)
    .filter(Boolean)

/**
 * Does the story actually contain what it was asked for? Split out of the
 * companion and exported because this check IS the feature: a story that
 * merely claims to contain «hvis» would still be marked as teaching it, so
 * whatever the tracker records must have been verified here first.
 *
 * Targets are matched exactly — the closed classes are asked for in a fixed
 * form and mostly do not inflect. Round words are matched through the pack's
 * stemmer, because «huset» is «hus» doing its job in a sentence and rejecting
 * it would teach the model to write unnaturally bare Danish.
 */
export function storyProblem(story: StoryResponse, view: StoryView): string | null {
  const tokens = new Set(storyTokens(story.sentences.map((s) => s.da).join(' ')))
  const missingTarget = view.targets.filter((t) => !tokens.has(t.toLowerCase()))
  if (missingTarget.length > 0) {
    return (
      `the story does not contain ${missingTarget.map((t) => `«${t}»`).join(', ')} — ` +
      `each listed small word must appear exactly as written; a subordinate clause is the natural home for a connective`
    )
  }
  const stem = ACTIVE.morphology.stem
  const stems = new Set([...tokens].map(stem))
  const missingWord = view.words.filter(
    (w) => !tokens.has(w.da.toLowerCase()) && !stems.has(stem(w.da.toLowerCase())),
  )
  if (missingWord.length > 0) {
    return `the story does not use ${missingWord.map((w) => `«${w.da}»`).join(', ')} — every listed round word must appear, inflected freely`
  }
  return null
}

/**
 * Guess execution plan: the model proposes, this disposes. Confidence order,
 * hard cap at the clue number, stop below 0.35 — keeps any model fun to play.
 *
 * The cap follows the engine, which ends the turn on the number-th correct
 * guess. It used to allow a bonus (number+1)-th when the model was sure; with
 * the bonus gone from the rules, planning one would only queue a guess the
 * engine refuses, in a phase that has already moved on.
 */
export function planGuessExecution(
  guesses: GuessResponse['guesses'],
  clueNumber: number,
): GuessResponse['guesses'] {
  const ordered = [...guesses].sort((a, b) => b.confidence - a.confidence)
  const plan: GuessResponse['guesses'] = []
  for (const g of ordered) {
    if (plan.length >= clueNumber) break
    if (plan.length >= 1 && g.confidence < 0.35) break
    plan.push(g)
  }
  if (plan.length === 0 && ordered.length > 0) plan.push(ordered[0]!) // must guess at least once
  return plan
}

/**
 * How many corrective attempts a call gets before the round gives up.
 *
 * One was not enough. The clue check rejects a reply whose targets are not all
 * Casey's own unrevealed greens, and on the boards where that fires the model
 * usually makes the same mistake twice: the strongest association on the board
 * belongs to a word that is not his, and asking again in the same breath gets
 * the same word back. A player reported the consequence — the round stopping on
 * an internal validation string — and three corrections is what it takes for the
 * second thought to be a different thought. They cost a few seconds each and
 * only ever happen on a reply that was going to be thrown away anyway.
 */
const MAX_CORRECTIONS = 3

const correctionTurn = (problem: string): ChatMessage => ({
  role: 'user',
  content: `That response was invalid: ${problem}. Reply again with ONLY a corrected JSON object.`,
})

async function askValidated<T>(
  chat: ChatFn,
  settings: AiSettings,
  messages: ChatMessage[],
  parse: (raw: unknown) => { ok: true; value: T } | { ok: false; problem: string },
  temperature: number,
  /**
   * What the player reads if every attempt fails. The validator's own words are
   * written for the model — "w2 (strand) is not an unrevealed GREEN word on your
   * key" is a sentence about the prompt contract, and it used to reach the
   * screen verbatim, under "The AI kept answering invalidly". The player is told
   * what happened to their game; the diagnostic goes to the console.
   */
  giveUpMessage: string,
): Promise<T> {
  // The rejected replies stay in the conversation. A model that is told only
  // "that was invalid" cannot see which of its own answers was meant, and the
  // second mistake is usually a variation on the first.
  const conversation: ChatMessage[] = [...messages]
  let problem = 'no reply was ever valid'

  for (let attempt = 0; attempt <= MAX_CORRECTIONS; attempt++) {
    // Repeating the same question at the same temperature tends to repeat the
    // same answer, which is exactly what a second correction means it must not
    // do — so the later attempts are allowed to wander further from it.
    const temp = Math.min(1, temperature + Math.max(0, attempt - 1) * 0.2)
    /**
     * THE CASCADE, and this loop is the whole of it: every retry asks the proxy
     * for its better model.
     *
     * This is where the escalation decision belongs, because this is where the
     * facts are. Reaching a retry at all means something verifiable went wrong
     * — the reply was not JSON, or the schema refused it, or
     * `checkClueLegality` did, or the clue named a word that is not one of
     * Casey's unrevealed greens, or every guessed id was revealed or invented.
     * Those are checks against the board and the key, and the proxy has
     * neither: projections.ts exists to keep key data out of the request, so a
     * worker-side cascade would have to judge a clue with the information the
     * app deliberately withholds from it. See the long note in proxy/worker.js.
     *
     * It also costs nothing. This retry was already going to happen and already
     * costs a call; sending it to a better model does not add a round trip, so
     * the round is no slower than it is today, and the common case — a first
     * answer that is fine — gets FASTER, because the cheap tier is the quick
     * one. A cascade inside the worker would have put two model calls in series
     * behind one "Casey is thinking…".
     *
     * From the FIRST retry rather than the second, on the evidence in
     * MAX_CORRECTIONS above: on the boards where the clue check fires, the same
     * model usually makes the same mistake twice, because the strongest
     * association on the board belongs to a word that is not his. A second
     * cheap attempt is the attempt most likely to be wasted.
     *
     * Escalation is per attempt, never sticky: the next call in the round
     * starts again on the cheap tier. And with no cascade configured on the
     * proxy the flag resolves to the same model, which is exactly today.
     */
    let raw: unknown
    try {
      raw = await chat(settings, conversation, { temperature: temp, escalate: attempt > 0 })
    } catch (e) {
      // A non-JSON reply (prose around the object) deserves the same corrective
      // retry as a schema-invalid one — both are fixed by "reply with only
      // JSON". Anything else is a real failure: no key, no network, no model.
      if (!(e instanceof AiError) || e.kind !== 'invalid-response') throw e
      problem = 'the reply was not a single valid JSON object'
      conversation.push(correctionTurn(problem))
      continue
    }
    const parsed = parse(raw)
    if (parsed.ok) return parsed.value
    problem = parsed.problem
    conversation.push({ role: 'assistant', content: JSON.stringify(raw) }, correctionTurn(problem))
  }

  console.warn(`[cluey] gave up after ${MAX_CORRECTIONS} corrections: ${problem}`)
  throw new AiError('invalid-response', giveUpMessage)
}

export class OllamaCompanion implements Companion {
  constructor(
    private settings: AiSettings,
    private chat: ChatFn = chatJson,
  ) {}

  async getClue(view: AiClueView): Promise<ClueResponse> {
    const targetable = new Set(aiTargetableIds(view))
    if (targetable.size === 0) {
      // The engine's turn rotation prevents this; guard against a doomed call.
      throw new AiError('invalid-response', 'Casey has no words left to clue this round.')
    }
    const boardWords: BoardWord[] = view.words.map((w) => ({
      wordId: w.id,
      da: w.da,
      en: w.en,
      pos: w.pos,
    }))

    return askValidated(
      this.chat,
      this.settings,
      buildCluePrompt(view, ACTIVE),
      (raw) => {
        const parsed = ClueResponseSchema.safeParse(raw)
        if (!parsed.success) return { ok: false, problem: parsed.error.issues[0]?.message ?? 'schema mismatch' }
        const verdict = checkClueLegality(parsed.data.clue, boardWords, ACTIVE)
        if (!verdict.legal) return { ok: false, problem: `illegal clue: ${verdict.reason}` }
        /**
         * A clue is only worth what its targets are worth, so a reply naming a
         * word that is not Casey's green is rejected rather than trimmed.
         *
         * Trimming is what this used to do, and it produced the worst kind of
         * clue: the text stayed, the words it was chosen for were dropped, and
         * the number was quietly rewritten to whatever survived. Casey would
         * mean "ocean" for water, fish and beach, only beach would be green on
         * his key, and the player was shown «ocean» (1) on a board where water
         * and fish sit in plain sight and score nothing. The clue actively
         * pointed away from the only word it could pay for.
         *
         * That is not a rare shape either: the deal makes Casey's greens the
         * words the player knows least and the hazards the ones they know
         * best, so the obvious referent of any clue is disproportionately NOT
         * his to give. He has to pick a clue that fits the words he actually
         * holds, and askValidated gives him a corrective retry to do it.
         */
        const asked = [...new Set(parsed.data.targetWordIds)]
        const notMine = asked.filter((id) => !targetable.has(id))
        if (notMine.length > 0) {
          const name = (id: string) => {
            const w = view.words.find((x) => x.id === id)
            return w ? `${id} (${w.da})` : id
          }
          const legal = [...targetable].map(name).join(', ')
          return {
            ok: false,
            problem:
              `${notMine.map(name).join(', ')} ${notMine.length === 1 ? 'is' : 'are'} not an unrevealed GREEN word on your key, ` +
              `so your clue would point at a word that scores nothing. Do not simply drop it — a clue chosen for it is the wrong clue. ` +
              `Choose a clue for the words you actually hold and list only those. You may target: ${legal}`,
          }
        }
        if (asked.length > 4) {
          return { ok: false, problem: 'at most 4 targets — give a clue for a smaller set' }
        }
        return {
          ok: true,
          value: {
            ...parsed.data,
            targetWordIds: asked,
            // The targets are the truth; the number is how many there are.
            number: asked.length,
          },
        }
      },
      0.6,
      'Casey could not settle on a clue for the words she is holding.',
    )
  }

  async getGuesses(view: AiGuessView): Promise<GuessResponse> {
    const guessable = new Set(aiGuessableIds(view))
    return askValidated(
      this.chat,
      this.settings,
      buildGuessPrompt(view, ACTIVE),
      (raw) => {
        const parsed = GuessResponseSchema.safeParse(raw)
        if (!parsed.success) return { ok: false, problem: parsed.error.issues[0]?.message ?? 'schema mismatch' }
        const guesses = parsed.data.guesses.filter((g) => guessable.has(g.wordId))
        if (guesses.length === 0) return { ok: false, problem: 'every wordId was revealed or unknown' }
        return { ok: true, value: { guesses } }
      },
      0.3,
      'Casey could not work out which words your clue points at.',
    )
  }

  async getStory(view: StoryView): Promise<StoryResponse> {
    return askValidated(
      this.chat,
      this.settings,
      buildStoryPrompt(view, ACTIVE),
      (raw) => {
        const parsed = StoryResponseSchema.safeParse(raw)
        if (!parsed.success) return { ok: false, problem: parsed.error.issues[0]?.message ?? 'schema mismatch' }
        const problem = storyProblem(parsed.data, view)
        return problem ? { ok: false, problem } : { ok: true, value: parsed.data }
      },
      // The highest temperature in the file: a story is the one reply where
      // sameness is a defect, and the checks above catch anything that wanders
      // off the contract.
      0.8,
      'Casey could not put this round into a story.',
    )
  }

  async translate(term: string): Promise<TranslationResponse> {
    return askValidated(
      this.chat,
      this.settings,
      buildTranslatePrompt(term, ACTIVE),
      (raw) => {
        const parsed = TranslationResponseSchema.safeParse(raw)
        return parsed.success
          ? { ok: true, value: parsed.data }
          : { ok: false, problem: parsed.error.issues[0]?.message ?? 'schema mismatch' }
      },
      // A dictionary should not be imaginative.
      0.1,
      'The translation came back in a form the app could not read.',
    )
  }
}
