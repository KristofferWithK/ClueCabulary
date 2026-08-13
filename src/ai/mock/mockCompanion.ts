import { checkClueLegality } from '../../engine/legality'
import { AiError } from '../client'
import type { Companion } from '../companion'
import {
  aiGuessableIds,
  aiTargetableIds,
  type AiClueView,
  type AiGuessView,
  type DebriefView,
} from '../projections'
import type {
  ClueResponse,
  DebriefResponse,
  GuessResponse,
  TranslationResponse,
} from '../schemas'

/** djb2 — stable across runs so e2e tests can rely on mock behavior per seed. */
function hash(s: string): number {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = (h * 33) ^ s.charCodeAt(i)
  return h >>> 0
}

/**
 * Deterministic offline companion for development and e2e tests. It follows
 * the same information rules as the real one (own key when giving clues, no
 * keys when guessing) — its guesses are hash-scrambled rather than semantic.
 */
export class MockCompanion implements Companion {
  async getClue(view: AiClueView): Promise<ClueResponse> {
    const targetable = aiTargetableIds(view).sort()
    if (targetable.length === 0) {
      throw new AiError('invalid-response', 'Klaus has no words left to clue this round.')
    }
    const targets = targetable.slice(0, Math.min(2, targetable.length))

    const boardWords = view.words.map((w) => ({ wordId: w.id, da: w.da, en: w.en, pos: w.pos }))
    let clue = ''
    for (let i = 1; i < 100 && !clue; i++) {
      const candidate = `mok${i}`
      if (checkClueLegality(candidate, boardWords).legal) clue = candidate
    }

    return {
      clue,
      number: targets.length,
      targetWordIds: targets,
      rationale: `mock clue for ${targets.join(', ')}`,
    }
  }

  async getGuesses(view: AiGuessView): Promise<GuessResponse> {
    const confidences = [0.9, 0.55, 0.25]
    const guesses = aiGuessableIds(view)
      .map((wordId) => ({ wordId, score: hash(view.currentClue.text + wordId) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map((g, i) => ({
        wordId: g.wordId,
        confidence: confidences[i]!,
        reasoning: 'mock guess',
      }))
    return { guesses }
  }

  async translate(term: string): Promise<TranslationResponse> {
    return { da: `mok-${term}`, en: `mock translation of ${term}` }
  }

  async getDebrief(view: DebriefView): Promise<DebriefResponse> {
    const missed = view.words.filter((w) => w.reveal.kind !== 'green').slice(0, 3)
    return {
      summary: `Mock debrief: we ${view.outcome.result} (${view.outcome.reason}).`,
      takeaways: missed.length
        ? missed.map((w) => `${w.da} means "${w.en[0]}" — worth another look.`)
        : ['Flot klaret! Every word found.'],
    }
  }
}
