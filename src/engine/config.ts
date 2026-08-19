export type GridSize = 'beginner' | 'middle' | 'standard'

export interface GridConfig {
  rows: number
  cols: number
  totalWords: number
  /** Greens on each side's key. */
  greensPerSide: number
  /** Greens shared by both keys. */
  greenOverlap: number
  /** Total clues allowed across both sides (shared pool). */
  turnTokens: number
  /** SRS: cap on never-seen words per board. */
  maxNewWordsPerBoard: number
}

/**
 * Codenames-Duet ratios (25 words, 9 greens/side, 3 overlap, 9 timer tokens)
 * scaled down.
 *
 * The number worth watching when tuning is greens per clue: distinct greens
 * divided by turnTokens, i.e. how much each clue has to carry.
 *
 *   Duet          15 greens / 9 tokens = 1.67
 *   beginner       8 greens / 5 tokens = 1.60
 *   middle        11 greens / 6 tokens = 1.83
 *   standard      12 greens / 8 tokens = 1.50
 *
 * Beginner is the gentlest of the three, which is what a first board should
 * be. Every play style clears it: cluing in pairs takes all five, cluing
 * threes takes three and leaves two spare.
 *
 * Tokens are a shared pool, not two each: a side whose greens are all found
 * has nothing left to clue, so the other side spends what remains.
 *
 * WHAT IS NOT HERE ANY MORE. Duet's third card role — the assassin, which this
 * game called a forbidden word — is gone, along with the translate-every-word
 * last chance that used to soften it. Every key now holds greens and nothing
 * else; a card that is not green on a key is a bystander there. Rounds end by
 * finding every green (win), by the tokens running out into sudden death, or
 * by walking away.
 *
 * The slots those cards occupied were NOT redistributed — greensPerSide and
 * greenOverlap are untouched, so distinctGreens and the ratios above are the
 * numbers they always were. The freed cards simply became bystanders, which is
 * why the neutral count went up on every board (3x5: 2 -> 4). That is a
 * placeholder rather than a decision: fewer of the words on screen now do
 * anything, and whether these boards still want twelve, fifteen and twenty
 * cards is a question for a measured re-tune, not for this comment.
 */
export const GRID_CONFIGS: Record<GridSize, GridConfig> = {
  beginner: {
    // Portrait orientation: phones want more rows than columns.
    rows: 4,
    cols: 3,
    totalWords: 12,
    greensPerSide: 5,
    greenOverlap: 2, // 8 distinct greens, 4 bystanders
    // Five. It was four — two clues each, which is the tidier shape — and four
    // makes cluing in pairs mathematically impossible: eight greens need five
    // such clues. The fifth token does not slow the ambitious line down, which
    // still finishes in three and now has two spare; it just stops the board
    // from insisting on ambition. Odd on purpose: whoever still has greens
    // takes the extra turn.
    turnTokens: 5,
    maxNewWordsPerBoard: 4,
  },
  /**
   * Three across, five down. Seven greens a side is 2 + 2 + 3, which is three
   * clues each and six rounds — the shape this board was asked for. Cluing in
   * pairs spends all six exactly, with nothing left over; that is deliberate
   * now that running out of clues opens sudden death rather than ending the
   * game. Three shared greens keep eleven of fifteen cards on a key.
   *
   * The other four are neutral. It was two while this board also carried a
   * forbidden word a side; those two cards are now bystanders like everything
   * else, so a wrong guess lands on empty air twice as often as it used to.
   * Not measured, not defended — see the note above GRID_CONFIGS.
   *
   * THE RULE THIS STILL TURNS ON, because the first version of this comment
   * got it backwards and the removal of forbidden words does not change it:
   * outside sudden death a guess is judged against the CLUE-GIVER's key and
   * nothing else (game.ts, the GUESS case). A card that is neutral on your key
   * may be green on Cluey's, and under his clue it is his key that is read —
   * which is why bystander reveals are directional and burn one side at a time.
   */
  middle: {
    rows: 5,
    cols: 3,
    totalWords: 15,
    greensPerSide: 7,
    greenOverlap: 3, // 11 distinct greens, 4 bystanders
    turnTokens: 6,
    maxNewWordsPerBoard: 5,
  },
  standard: {
    rows: 5,
    cols: 4,
    totalWords: 20,
    greensPerSide: 7,
    greenOverlap: 2, // 12 distinct greens, 8 bystanders
    turnTokens: 8,
    maxNewWordsPerBoard: 6,
  },
}

/**
 * The wrap-up board: 4×5, every word already collected, dealt only by
 * newWrapUpGame — deliberately NOT a GridSize. The union reaches settings,
 * the Settings select and the backup PrefsSchema (whose enum hard-rejects
 * unknown values), and the wrap-up round is a mode you enter, not a
 * difficulty you keep.
 *
 * Ten greens a side and ten shared tokens is five clue-givings each — the
 * shape this board was asked for. Sixteen distinct greens over ten tokens is
 * 1.60 greens per clue, the beginner ratio, and that is deliberate: the
 * packing phase (every card starts in English) is this round's added
 * difficulty, so the clue economy stays forgiving.
 *
 * The measurement that used to sit here — 6.4% of guesses on this board name a
 * forbidden word, against 8.0% on the 3×5 and 16.0% on standard's 4×5 — was
 * the argument for this board's shape and no longer describes anything. There
 * are no forbidden words on any board now, so the only way to lose a wrap-up
 * round is the clock, and this board's difficulty is entirely the packing gate
 * it was always meant to be. What that does to the win rate has not been
 * re-measured.
 */
export const WRAPUP_CONFIG: GridConfig = {
  rows: 5,
  cols: 4,
  totalWords: 20,
  greensPerSide: 10,
  greenOverlap: 4, // 16 distinct greens, 4 bystanders
  turnTokens: 10,
  // Every word on a wrap-up board is collected; nothing is ever new.
  maxNewWordsPerBoard: 0,
}

/** The largest number the clue stepper offers; a clue of N allows N+1 guesses. */
export const MAX_CLUE_NUMBER = 4

/** Greens that must be found to win — shared ones count once. */
export function distinctGreens(c: GridConfig): number {
  return c.greenOverlap + 2 * (c.greensPerSide - c.greenOverlap)
}

export function assertConfigConsistent(c: GridConfig): void {
  if (c.rows * c.cols !== c.totalWords) {
    throw new Error(`grid ${c.rows}x${c.cols} != totalWords ${c.totalWords}`)
  }
  const perSideOnlyGreens = c.greensPerSide - c.greenOverlap
  if (perSideOnlyGreens < 0) {
    throw new Error('greensPerSide too small for greenOverlap')
  }
  const used = c.greenOverlap + 2 * perSideOnlyGreens
  if (used > c.totalWords) {
    throw new Error(`key slots (${used}) exceed board size (${c.totalWords})`)
  }
  // Cutting tokens shortens the game, and past a point it stops being a game
  // at all: a clue of N ends the turn on the Nth correct guess, so no clue can
  // ever take more than MAX_CLUE_NUMBER words and below this many tokens the
  // board cannot be cleared by a perfect player on a perfect day. A loose bound
  // on purpose — it catches an impossible config, not a hard one, which is a
  // judgement no assertion should be making.
  const needed = Math.ceil(distinctGreens(c) / MAX_CLUE_NUMBER)
  if (c.turnTokens < needed) {
    throw new Error(
      `${c.turnTokens} tokens cannot clear ${distinctGreens(c)} greens: ` +
        `${MAX_CLUE_NUMBER} guesses per clue means at least ${needed}`,
    )
  }
  // There was a third guard here, against a board with no clue left after the
  // last chance opened — it would have shipped RedemptionView, the grader and
  // the 'redeemed' ending with none of them reachable. Both the threshold and
  // the screens it protected are gone, so the guard has nothing left to guard.
}
