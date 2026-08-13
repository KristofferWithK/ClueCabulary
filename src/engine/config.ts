export type GridSize = 'beginner' | 'middle' | 'standard'

export interface GridConfig {
  rows: number
  cols: number
  totalWords: number
  /** Greens on each side's key. */
  greensPerSide: number
  /** Greens shared by both keys. */
  greenOverlap: number
  forbiddenPerSide: number
  /** Cross-side identity of each side's forbidden words (must sum to forbiddenPerSide). */
  forbiddenBothSides: number
  /** Per side: forbidden here, green on the other key. */
  forbiddenVsGreen: number
  /** Per side: forbidden here, bystander on the other key. */
  forbiddenVsBystander: number
  /** Total clues allowed across both sides (shared pool). */
  turnTokens: number
  /** SRS: cap on never-seen words per board. */
  maxNewWordsPerBoard: number
}

/**
 * Codenames-Duet ratios (25 words, 9 greens/side, 3 overlap, 3 forbidden/side
 * with 1-1-1 cross identity, 9 timer tokens) scaled down.
 *
 * The number worth watching when tuning is greens per clue: distinct greens
 * divided by turnTokens, i.e. how much each clue has to carry.
 *
 *   Duet          15 greens / 9 tokens = 1.67
 *   beginner       8 greens / 4 tokens = 2.00
 *   middle        11 greens / 6 tokens = 1.83
 *   standard      12 greens / 8 tokens = 1.50
 *
 * Beginner is deliberately the tightest of the three. Four clues means two
 * each, which is the shape the game was asked for: short, and both sides get
 * to guess twice. It is a harder game than the 3x4 board looks, and if it
 * proves too hard the cheapest fix is greensPerSide 5 -> 4 here, which takes
 * it to 6 greens / 4 tokens = 1.50 without touching the board.
 *
 * Tokens are a shared pool, not two each: a side whose greens are all found
 * has nothing left to clue, so the other side spends what remains.
 */
export const GRID_CONFIGS: Record<GridSize, GridConfig> = {
  beginner: {
    // Portrait orientation: phones want more rows than columns.
    rows: 4,
    cols: 3,
    totalWords: 12,
    greensPerSide: 5,
    greenOverlap: 2, // 8 distinct greens
    forbiddenPerSide: 1,
    forbiddenBothSides: 0,
    forbiddenVsGreen: 0,
    forbiddenVsBystander: 1,
    // Four clues: you clue, Klaus clues, you clue, Klaus clues. Both sides
    // guess twice, and the round is over in about as long as a bus ride.
    turnTokens: 4,
    maxNewWordsPerBoard: 4,
  },
  /**
   * Three across, five down. Seven greens a side is 2 + 2 + 3, which is three
   * clues each and six rounds — the shape this board was asked for. Cluing in
   * pairs spends all six exactly, with nothing left over; that is deliberate
   * now that running out of clues opens sudden death rather than ending the
   * game. Three shared greens keep thirteen of fifteen cards on a key and
   * leave two neutrals, so a wrong guess is usually somebody's green rather
   * than empty air.
   */
  middle: {
    rows: 5,
    cols: 3,
    totalWords: 15,
    greensPerSide: 7,
    greenOverlap: 3, // 11 distinct greens
    forbiddenPerSide: 2,
    forbiddenBothSides: 0,
    forbiddenVsGreen: 1,
    forbiddenVsBystander: 1,
    turnTokens: 6,
    maxNewWordsPerBoard: 5,
  },
  standard: {
    rows: 5,
    cols: 4,
    totalWords: 20,
    greensPerSide: 7,
    greenOverlap: 2, // 12 distinct greens
    forbiddenPerSide: 3,
    forbiddenBothSides: 1,
    forbiddenVsGreen: 1,
    forbiddenVsBystander: 1,
    turnTokens: 8,
    maxNewWordsPerBoard: 6,
  },
}

/** The largest number the clue stepper offers; a clue of N allows N+1 guesses. */
export const MAX_CLUE_NUMBER = 4

/**
 * Greens that must be found to win — shared ones count once.
 *
 * Note what is NOT subtracted: a word that is forbidden on one key and green
 * on the other is still a green, and still has to be found by the side that
 * holds it. assertConfigConsistent below does subtract it, because there it is
 * counting board SLOTS and that word occupies the forbiddenVsGreen slot. Two
 * different questions about the same card.
 */
export function distinctGreens(c: GridConfig): number {
  return c.greenOverlap + 2 * (c.greensPerSide - c.greenOverlap)
}

export function assertConfigConsistent(c: GridConfig): void {
  if (c.rows * c.cols !== c.totalWords) {
    throw new Error(`grid ${c.rows}x${c.cols} != totalWords ${c.totalWords}`)
  }
  if (c.forbiddenBothSides + c.forbiddenVsGreen + c.forbiddenVsBystander !== c.forbiddenPerSide) {
    throw new Error('forbidden cross-identity counts must sum to forbiddenPerSide')
  }
  const perSideOnlyGreens = c.greensPerSide - c.greenOverlap - c.forbiddenVsGreen
  if (perSideOnlyGreens < 0) {
    throw new Error('greensPerSide too small for overlap + forbiddenVsGreen')
  }
  const used =
    c.greenOverlap +
    2 * perSideOnlyGreens +
    c.forbiddenBothSides +
    2 * c.forbiddenVsGreen +
    2 * c.forbiddenVsBystander
  if (used > c.totalWords) {
    throw new Error(`key slots (${used}) exceed board size (${c.totalWords})`)
  }
  // Cutting tokens shortens the game, and past a point it stops being a game
  // at all: every clue is capped at MAX_CLUE_NUMBER + 1 guesses, so below this
  // many tokens the board cannot be cleared by a perfect player on a perfect
  // day. A loose bound on purpose — it catches an impossible config, not a
  // hard one, which is a judgement no assertion should be making.
  const needed = Math.ceil(distinctGreens(c) / (MAX_CLUE_NUMBER + 1))
  if (c.turnTokens < needed) {
    throw new Error(
      `${c.turnTokens} tokens cannot clear ${distinctGreens(c)} greens: ` +
        `${MAX_CLUE_NUMBER + 1} guesses per clue means at least ${needed}`,
    )
  }
}
