import type { GridConfig } from './config'

/**
 * Two roles, not three. A key used to carry `forbidden` as well — Duet's
 * assassin — and a guess landing on one ended the round (or opened the
 * translate-everything last chance, late enough in the round). Both are gone:
 * a card is either a target on this key or it is not.
 */
export type CardRole = 'green' | 'bystander'
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
  /** False for a mass noun: the card shows the gender, not an article. */
  countable?: boolean
}

export type Reveal =
  | { kind: 'hidden' }
  | { kind: 'green' } // global: found, done for both sides
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
   * the round is over, like a clue's rationale.
   *
   * The model has always produced both and the engine always threw them away,
   * so the one thing a player could never find out was why Casey named the word
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
  /** AI's intended wordIds — stored but hidden until the round is over. */
  targets?: string[]
  /** AI's reasoning — stored but hidden until the round is over. */
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
  | 'finished'

/**
 * Three endings, down from six. Gone with the forbidden words: 'forbidden-hit'
 * (the round ending on the spot), 'forbidden-failed' (the last chance opening
 * and being failed) and 'redeemed' (it being passed). Old saves may still hold
 * those strings — nothing reads a stored outcome back into this type, and the
 * game store's v4 migration throws away any in-flight round rather than trying.
 */
export type Outcome =
  | { result: 'won'; reason: 'all-greens' }
  | { result: 'lost'; reason: 'timeout' | 'sudden-death' }

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
