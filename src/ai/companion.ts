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
import { buildCluePrompt, buildDebriefPrompt, buildGuessPrompt, type ChatMessage } from './prompts'
import {
  ClueResponseSchema,
  DebriefResponseSchema,
  GuessResponseSchema,
  type ClueResponse,
  type DebriefResponse,
  type GuessResponse,
} from './schemas'

export interface Companion {
  getClue(view: AiClueView): Promise<ClueResponse>
  getGuesses(view: AiGuessView): Promise<GuessResponse>
  getDebrief(view: DebriefView): Promise<DebriefResponse>
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
        const targets = [...new Set(parsed.data.targetWordIds)]
          .filter((id) => targetable.has(id))
          .slice(0, 4)
        if (targets.length === 0) {
          return { ok: false, problem: 'targetWordIds must be unrevealed GREEN words from your key' }
        }
        return {
          ok: true,
          value: {
            ...parsed.data,
            targetWordIds: targets,
            number: Math.min(Math.max(1, targets.length), 4),
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
