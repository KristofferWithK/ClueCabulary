import type { GridConfig } from './config'

export type CardRole = 'green' | 'bystander' | 'forbidden'
export type Side = 'player' | 'ai'

/** The subset of dictionary data the engine needs about a board word. */
export interface BoardWord {
  wordId: string
  da: string
  en: string[]
  pos: string
  /**
   * Danish gender article, nouns only. Carried on the board because gender is
   * learned as a collocation — "et hus", not "hus (neuter)" — so the card has
   * to show the pair. Optional: verbs and adjectives have none, and a game
   * persisted before this existed simply renders without it.
   */
  article?: 'en' | 'et'
}

export type Reveal =
  | { kind: 'hidden' }
  | { kind: 'green' } // global: found, done for both sides
  | { kind: 'forbidden' } // global: triggered redemption
  /**
   * Directional, Duet-style: `against` lists the CLUE-GIVER sides under which
   * this word was revealed as a bystander. It stays guessable under the other
   * side's clues (it may even be green there).
   */
  | { kind: 'bystander'; against: Side[] }

export interface GuessRecord {
  wordId: string
  result: CardRole
}

export interface Clue {
  by: Side
  text: string
  number: number
  /** AI's intended wordIds — stored but hidden until the debrief. */
  targets?: string[]
  /** AI's reasoning — stored but hidden until the debrief. */
  rationale?: string
  guesses: GuessRecord[]
}

export type Phase =
  | 'playerClueInput' // player composes a clue; AI will guess
  | 'aiGuessing'
  | 'aiClueInput' // waiting for the AI's clue; player will guess
  | 'playerGuessing'
  | 'redemption'
  | 'finished'

export interface RedemptionResult {
  wordId: string
  given: string
  accepted: boolean
  matchedGloss?: string
}

export type Outcome =
  | { result: 'won'; reason: 'all-greens' | 'redeemed' }
  | { result: 'lost'; reason: 'timeout' | 'forbidden-failed' }

export interface GameState {
  config: GridConfig
  seed: number
  words: BoardWord[]
  reveals: Record<string, Reveal>
  playerKey: Record<string, CardRole>
  aiKey: Record<string, CardRole>
  phase: Phase
  turnsLeft: number
  clueHistory: Clue[]
  redemption?: {
    /** Words the player must translate: everything not already revealed green. */
    promptWordIds: string[]
    results?: RedemptionResult[]
  }
  outcome?: Outcome
}

export type GameEvent =
  | {
      type: 'SUBMIT_CLUE'
      by: Side
      text: string
      number: number
      targets?: string[]
      rationale?: string
    }
  | { type: 'GUESS'; wordId: string }
  | { type: 'STOP_GUESSING' }
  | {
      type: 'SUBMIT_REDEMPTION'
      answers: Record<string, string>
      /**
       * Tells the grader which strings are real English words for something
       * else, so a near-miss cannot pass one word off as another. Supplied by
       * the caller because the engine holds no dataset; omitted, grading falls
       * back to distance alone.
       */
      isKnownWord?: (normalized: string) => boolean
    }
