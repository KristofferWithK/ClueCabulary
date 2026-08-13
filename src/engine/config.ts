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
   * game. Three shared greens keep thirteen of fifteen cards on a key and
   * leave two neutrals, so a wrong guess is usually somebody's green rather
   * than empty air.
   *
   * One forbidden word a side, and it is the bystander variant on purpose.
   *
   * This board shipped with two, one of which was forbidden here and GREEN on
   * the other key — the Duet trap, where your partner's best word is the one
   * that ends your game. Two things make that trap unfair rather than tense
   * here: Klaus cannot see the player's key, so unlike a human partner he
   * cannot even try to steer around it, and he is the one giving most of the
   * clues. A player reported the exact shape — Klaus clued «kitchen», they
   * answered «food», and food was forbidden — and asked for one forbidden word
   * instead of two. Cutting the vsGreen one is how to spend that cut: what is
   * left is a word that is merely neutral for Klaus, so nothing on the board is
   * simultaneously worth pointing at and fatal to name.
   */
  middle: {
    rows: 5,
    cols: 3,
    totalWords: 15,
    greensPerSide: 7,
    greenOverlap: 3, // 11 distinct greens
    forbiddenPerSide: 1,
    forbiddenBothSides: 0,
    forbiddenVsGreen: 0,
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
 * The last chance — translate every unsolved word, one shot, all or nothing —
 * only opens once this many clues have been given. Before that a forbidden
 * word ends the round where it stands.
 *
 * A round is a clue, so on the boards as they stand the last chance is live on
 * the 5th clue of 5 (3x4), the 5th and 6th of 6 (3x5), and the 5th through 8th
 * of 8 (4x5).
 *
 * Two things are worth knowing before this number is moved again, both
 * measured over 300 games a board rather than reasoned about:
 *
 * - The guessing side alternates strictly with the clue index. The player
 *   opens, so ODD clues are Klaus guessing and EVEN clues are the player. At 4
 *   the first eligible clue is the 5th — odd — so on the 3x4 board, where the
 *   5th is also the last, the player is not the one guessing in the only round
 *   that can reach the last chance (168 of 171 games; the other 3 come from
 *   endTurn handing the same side a second clue when the other has no greens
 *   left). Set this to 3 and the player's own 4th-clue turn qualifies too.
 * - It does not shorten the challenge much. Words still unsolved when a
 *   forbidden word lands: 11.6 of 12 on the opening clue, 9.3 of 12 on the
 *   5th. The last chance was never a short quiz; what this changes is when it
 *   is offered at all, not how much typing it is.
 */
export const REDEMPTION_AFTER_ROUND = 4

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
  // A board with no clue after the threshold can never reach the last chance,
  // and would take RedemptionView, the redemption grader and the 'redeemed'
  // ending out of the game silently — every screen still shipping, none of
  // them reachable. Not hypothetical: beginner had four tokens until recently,
  // and the request that set this threshold arrived in the same conversation
  // as a request to give it four again.
  if (c.turnTokens <= REDEMPTION_AFTER_ROUND) {
    throw new Error(
      `${c.turnTokens} tokens with the last chance opening after ` +
        `${REDEMPTION_AFTER_ROUND} means it never opens — lower ` +
        `REDEMPTION_AFTER_ROUND or give the board another clue`,
    )
  }
}
