import { checkClueLegality } from '../engine/legality'
import type { BoardWord } from '../engine/types'
import { AiError, chatJson, type AiSettings, type ChatFn } from './client'
import {
  aiGuessableIds,
  aiTargetableIds,
  type AiClueView,
  type AiGuessView,
  type DebriefView,
} from './projections'
import {
  buildCluePrompt,
  buildDebriefPrompt,
  buildGuessPrompt,
  buildTranslatePrompt,
  type ChatMessage,
} from './prompts'
import {
  ClueResponseSchema,
  DebriefResponseSchema,
  GuessResponseSchema,
  TranslationResponseSchema,
  type ClueResponse,
  type DebriefResponse,
  type GuessResponse,
  type TranslationResponse,
} from './schemas'

export interface Companion {
  getClue(view: AiClueView): Promise<ClueResponse>
  getGuesses(view: AiGuessView): Promise<GuessResponse>
  getDebrief(view: DebriefView): Promise<DebriefResponse>
  /** One word, either direction. Takes no view: it must not see the board. */
  translate(term: string): Promise<TranslationResponse>
}

/**
 * Guess execution plan: the model proposes, this disposes. Confidence order,
 * hard cap at number+1, stop below 0.35, and the bonus (number+1)-th guess
 * only when the model is genuinely sure (≥ 0.7) — keeps any model fun to play.
 */
export function planGuessExecution(
  guesses: GuessResponse['guesses'],
  clueNumber: number,
): GuessResponse['guesses'] {
  const ordered = [...guesses].sort((a, b) => b.confidence - a.confidence)
  const plan: GuessResponse['guesses'] = []
  for (const g of ordered) {
    if (plan.length >= clueNumber + 1) break
    if (plan.length >= clueNumber && g.confidence < 0.7) break
    if (plan.length >= 1 && g.confidence < 0.35) break
    plan.push(g)
  }
  if (plan.length === 0 && ordered.length > 0) plan.push(ordered[0]!) // must guess at least once
  return plan
}

async function askValidated<T>(
  chat: ChatFn,
  settings: AiSettings,
  messages: ChatMessage[],
  parse: (raw: unknown) => { ok: true; value: T } | { ok: false; problem: string },
  temperature: number,
): Promise<T> {
  // A non-JSON reply (prose around the object) deserves the same corrective
  // retry as a schema-invalid one — both are fixed by "reply with only JSON".
  let first: unknown
  let problem: string
  try {
    first = await chat(settings, messages, { temperature })
    const parsed = parse(first)
    if (parsed.ok) return parsed.value
    problem = parsed.problem
  } catch (e) {
    if (!(e instanceof AiError) || e.kind !== 'invalid-response') throw e
    problem = 'the reply was not a single valid JSON object'
  }

  const retryMessages: ChatMessage[] = [
    ...messages,
    ...(first !== undefined
      ? [{ role: 'assistant' as const, content: JSON.stringify(first) }]
      : []),
    {
      role: 'user',
      content: `That response was invalid: ${problem}. Reply again with ONLY a corrected JSON object.`,
    },
  ]
  const second = await chat(settings, retryMessages, { temperature })
  const reparsed = parse(second)
  if (reparsed.ok) return reparsed.value
  throw new AiError('invalid-response', `The AI kept answering invalidly: ${reparsed.problem}`)
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
      throw new AiError('invalid-response', 'Klaus has no words left to clue this round.')
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
      buildCluePrompt(view),
      (raw) => {
        const parsed = ClueResponseSchema.safeParse(raw)
        if (!parsed.success) return { ok: false, problem: parsed.error.issues[0]?.message ?? 'schema mismatch' }
        const verdict = checkClueLegality(parsed.data.clue, boardWords)
        if (!verdict.legal) return { ok: false, problem: `illegal clue: ${verdict.reason}` }
        /**
         * A clue is only worth what its targets are worth, so a reply naming a
         * word that is not Klaus's green is rejected rather than trimmed.
         *
         * Trimming is what this used to do, and it produced the worst kind of
         * clue: the text stayed, the words it was chosen for were dropped, and
         * the number was quietly rewritten to whatever survived. Klaus would
         * mean "ocean" for water, fish and beach, only beach would be green on
         * his key, and the player was shown «ocean» (1) on a board where water
         * and fish sit in plain sight and score nothing. The clue actively
         * pointed away from the only word it could pay for.
         *
         * That is not a rare shape either: the deal makes Klaus's greens the
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
    )
  }

  async getGuesses(view: AiGuessView): Promise<GuessResponse> {
    const guessable = new Set(aiGuessableIds(view))
    return askValidated(
      this.chat,
      this.settings,
      buildGuessPrompt(view),
      (raw) => {
        const parsed = GuessResponseSchema.safeParse(raw)
        if (!parsed.success) return { ok: false, problem: parsed.error.issues[0]?.message ?? 'schema mismatch' }
        const guesses = parsed.data.guesses.filter((g) => guessable.has(g.wordId))
        if (guesses.length === 0) return { ok: false, problem: 'every wordId was revealed or unknown' }
        return { ok: true, value: { guesses } }
      },
      0.3,
    )
  }

  async translate(term: string): Promise<TranslationResponse> {
    return askValidated(
      this.chat,
      this.settings,
      buildTranslatePrompt(term),
      (raw) => {
        const parsed = TranslationResponseSchema.safeParse(raw)
        return parsed.success
          ? { ok: true, value: parsed.data }
          : { ok: false, problem: parsed.error.issues[0]?.message ?? 'schema mismatch' }
      },
      // A dictionary should not be imaginative.
      0.1,
    )
  }

  async getDebrief(view: DebriefView): Promise<DebriefResponse> {
    return askValidated(
      this.chat,
      this.settings,
      buildDebriefPrompt(view),
      (raw) => {
        const parsed = DebriefResponseSchema.safeParse(raw)
        return parsed.success
          ? { ok: true, value: parsed.data }
          : { ok: false, problem: parsed.error.issues[0]?.message ?? 'schema mismatch' }
      },
      0.7,
    )
  }
}
