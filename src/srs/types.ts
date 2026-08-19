export interface WordStats {
  /** Leitner box 0-4; higher = better known, longer review interval. */
  box: 0 | 1 | 2 | 3 | 4
  lastSeenAt: number
  seen: number
  correctGuesses: number
  misses: number
  lookups: number
  /**
   * Frozen history. The redemption round — translate every unsolved word, one
   * shot — is retired, so nothing increments these any more. They stay on the
   * record because they are persisted per word and validated by the backup
   * schema: dropping them would be a store migration and a backup format
   * change to delete two numbers that already describe rounds the player
   * really played.
   */
  redemptionRight: number
  redemptionWrong: number
  /**
   * Directional green counts. `correctGuesses` says a word ended a round
   * green; these say which side's work earned it — Cluey finding it under the
   * player's clue (`greenByClue`) or the player naming it under Cluey's
   * (`greenByGuess`). A word is *collected* once both are non-zero: it has
   * been given as a clue target and recognised as a guess, one interaction of
   * each kind.
   */
  greenByClue: number
  greenByGuess: number
}

export type SrsMap = Record<string, WordStats>

/** Learning signals collected for one board word over one round. */
export interface RoundWordResult {
  wordId: string
  /** Guessed and revealed green (by either side — the word was understood in play). */
  guessedGreen: boolean
  /** Guessed and revealed a bystander — confused with something else. */
  guessedWrong: boolean
  /** Revealed green under the player's own clue — Cluey was led to it. */
  greenByOwnClue: boolean
  /** Revealed green by the player's own tap — under Cluey's clue, or in sudden death. */
  greenByOwnGuess: boolean
  lookedUp: boolean
  /** Wrap-up packing: the first translation attempt on this word missed. */
  packingMissed?: boolean
}
