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
  /**
   * Carried alongside the article because a few nouns have no article at all
   * (plurale tantum: penge, bukser, briller) and the card still has to say what
   * gender they are. See src/data/gender.ts for what gets printed.
   */
  gender?: 'common' | 'neuter'
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
  /**
   * Why the AI named this word, and how sure it was — stored but hidden until
   * the debrief, like a clue's rationale.
   *
   * The model has always produced both and the engine always threw them away,
   * so the one thing a player could never find out was why Klaus named the word
   * he named. That is the question they kept asking, and it is the question a
   * companion in a LEARNING game exists to answer: the association he saw is
   * worth as much as the word.
   *
   * Absent on the player's own guesses — nobody is asked to justify a tap.
   */
  reasoning?: string
  confidence?: number
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
  /**
   * Clues are gone but the board is not finished. Codenames Duet's ending:
   * no more clues, keep naming words, one wrong name and it is over.
   */
  | 'suddenDeath'
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
  /**
   * 'forbidden-hit' is the word ending the round on the spot, before the last
   * chance opens; 'forbidden-failed' is the last chance opening and being
   * failed. Two different endings, and they must stay two, because every
   * sentence written for the second one — "the forbidden word won this round",
   * "you lost on the translation challenge" — describes a quiz that never
   * happened in the first.
   */
  | { result: 'lost'; reason: 'timeout' | 'sudden-death' | 'forbidden-hit' | 'forbidden-failed' }

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
  /** `reasoning`/`confidence` carry the AI's own account of the guess. */
  | { type: 'GUESS'; wordId: string; reasoning?: string; confidence?: number }
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
