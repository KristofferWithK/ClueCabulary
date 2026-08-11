export interface WordStats {
  /** Leitner box 0-4; higher = better known, longer review interval. */
  box: 0 | 1 | 2 | 3 | 4
  lastSeenAt: number
  seen: number
  correctGuesses: number
  misses: number
  lookups: number
  redemptionRight: number
  redemptionWrong: number
}

export type SrsMap = Record<string, WordStats>

/** Learning signals collected for one board word over one round. */
export interface RoundWordResult {
  wordId: string
  /** Guessed and revealed green (by either side — the word was understood in play). */
  guessedGreen: boolean
  /** Guessed and revealed bystander/forbidden — confused with something else. */
  guessedWrong: boolean
  lookedUp: boolean
  redemption?: 'right' | 'wrong'
}
