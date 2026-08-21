import {
  TUTORIAL_AI_CLUES,
  TUTORIAL_AI_GUESSES,
} from '../onboarding/tutorial'
import { AiError } from './client'
import type { Companion } from './companion'
import type { AiClueView, AiGuessView, StoryView } from './projections'
import type { ClueResponse, GuessResponse, StoryResponse, TranslationResponse } from './schemas'

/**
 * Casey during the tutorial round (O2): fully scripted, offline by
 * construction — the first impression must never depend on the proxy. Selected
 * by mode at the single `companion()` seam in gameStore, exactly like the
 * practice companion; it plays only the fixed board `newTutorialGame` deals,
 * so "which clue is next" is nothing more than how many clues he has given.
 *
 * The script itself lives in src/onboarding/tutorial.ts, pinned against the
 * engine by tutorial.test.ts — this class only reads it back.
 */
export class TutorialCompanion implements Companion {
  async getClue(view: AiClueView): Promise<ClueResponse> {
    const given = view.history.filter((c) => c.by === 'ai').length
    const scripted = TUTORIAL_AI_CLUES[given]
    if (!scripted) {
      // The script wins the round on the last clue, so a fourth request means
      // the board is not the tutorial board. Refuse rather than improvise.
      throw new AiError('invalid-response', 'The tutorial script has no clue left to give.')
    }
    return {
      clue: scripted.text,
      number: scripted.number,
      targetWordIds: [...scripted.targetWordIds],
      rationale: scripted.rationale,
    }
  }

  async getGuesses(_view: AiGuessView): Promise<GuessResponse> {
    // The one player-clue turn in the script. Confidences descend, so
    // planGuessExecution keeps this order and the cap (the clue's number, 3)
    // takes all three.
    return {
      guesses: TUTORIAL_AI_GUESSES.map((g) => ({
        wordId: g.wordId,
        confidence: g.confidence,
        reasoning: g.reasoning,
      })),
    }
  }

  async translate(_term: string): Promise<TranslationResponse> {
    // Only reached for a word OUTSIDE the shipped dictionary — the dataset
    // answers the other nine hundred locally before the companion is asked,
    // which is why the tutorial's own clues never land here. Offline by
    // construction means an honest no, said kindly.
    throw new AiError(
      'invalid-response',
      'I only know my nine hundred words until we finish boarding — tap ⓘ on a card instead.',
    )
  }

  async getStory(_view: StoryView): Promise<StoryResponse> {
    // Never called: requestStory turns itself off for tutorial rounds. The
    // throw keeps the interface honest if a future path forgets that.
    throw new AiError('invalid-response', 'The tutorial round has no story call.')
  }
}
