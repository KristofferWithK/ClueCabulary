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
   * THE RULE THIS TURNS ON, because the first version of this comment got it
   * backwards: outside sudden death a guess is judged against the CLUE-GIVER's
   * key and nothing else (game.ts, the GUESS case). So the player's forbidden
   * words can only end the round while the PLAYER is cluing and Cluey is
   * guessing. A card the player's own key marks forbidden is harmless for them
   * to tap under Cluey's clue — it is read off aiKey, where it is a green or a
   * bystander. In the player's words, which are right: "my forbidden word is a
   * word he is not allowed to pick when he gets my clue."
   *
   * forbiddenVsGreen deals BOTH directions (keygen.ts), one card each, and they
   * are nothing alike:
   *
   * - (forbidden for the player, GREEN for Cluey) is not a trap at all. Cluey
   *   clues toward it because it is his green, the player taps it, and it
   *   SCORES. keygen already agrees — it files that card under the `recall`
   *   tier, not `hazard`. It is dangerous only as a word the player must not
   *   aim their OWN clue near, and the board draws it dashed from playerKey, so
   *   the side that has to steer is the side that can see it.
   * - (GREEN for the player, forbidden for Cluey) is the one worth cutting. The
   *   player's own key paints it as a target; Cluey's key ends the round on it;
   *   and while the player is guessing there is no marking to warn them. Cluey
   *   can see it on his own key and should steer his clues away, exactly as a
   *   human partner would — but that is the only protection, and it is only as
   *   good as his clue.
   *
   * So the cut spends the vsGreen slot. It also happens to be free: by
   * assertConfigConsistent's own arithmetic, vsGreen 0 / vsBystander 1 leaves
   * perSideOnlyGreens at 4 and `used` at 13, keeping the thirteen-of-fifteen
   * above intact, while vsGreen 1 / vsBystander 0 drops it to 11 and doubles
   * the neutrals to four.
   *
   * (The report that prompted the change — Cluey clued «kitchen», the player
   * answered «food», «food» was forbidden — cannot have been either vsGreen
   * card. Under Cluey's clue a word forbidden on the PLAYER's key reveals green
   * or neutral and play carries on. «food» was forbidden on CLUEY's key, which
   * is the vsBystander card this cut leaves in place: a clue-quality problem,
   * answered in prompts.ts, not a board-shape one. What the player saw was the
   * dashed border on their own key, and they reasonably read it as "never touch
   * this" — which is why the legend now says "forbidden on your key".)
   *
   * standard still ships forbiddenVsGreen: 1, so the (green for the player,
   * forbidden for Cluey) card is still dealt there. Deliberate: it is the big
   * board, and Duet's own ratios keep it.
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
 * difficulty, so the clue economy stays forgiving. One forbidden word a side,
 * bystander-cross like the learner boards.
 *
 * Measured over 3000 know-nothing games each (the selfplay harness's hash
 * guesser): 6.4% of guesses on this board name a forbidden word and 20% of
 * games end on one before the last chance — against 8.0% / 26% on the 3×5
 * and 16.0% / 46% on standard's 4×5 with its three forbidden a side. The
 * big board is only as harsh as its hazards, and this one carries two in
 * twenty cards.
 */
export const WRAPUP_CONFIG: GridConfig = {
  rows: 5,
  cols: 4,
  totalWords: 20,
  greensPerSide: 10,
  greenOverlap: 4, // 16 distinct greens
  forbiddenPerSide: 1,
  forbiddenBothSides: 0,
  forbiddenVsGreen: 0,
  forbiddenVsBystander: 1,
  turnTokens: 10,
  // Every word on a wrap-up board is collected; nothing is ever new.
  maxNewWordsPerBoard: 0,
}

/** The largest number the clue stepper offers; a clue of N allows N+1 guesses. */
export const MAX_CLUE_NUMBER = 4

/**
 * The last chance — translate every unsolved word, one shot, all or nothing —
 * only opens once this many clues have been given. Before that a forbidden
 * word ends the round where it stands.
 *
 * A round is a clue, so on the boards as they stand the last chance is live on
 * the 4th and 5th clue of 5 (3x4), the 4th through 6th of 6 (3x5), and the 4th
 * through 8th of 8 (4x5).
 *
 * Two things are worth knowing before this number is moved again, both
 * measured over 300 games a board rather than reasoned about:
 *
 * - The guessing side alternates with the clue index. The player opens, so ODD
 *   clues are Cluey guessing and EVEN clues are the player. (The one exception
 *   is endTurn handing the same side a second clue when the other has no greens
 *   left — 3 games in 171 when it was last measured.) This is why the number
 *   matters more than it looks. At 4 the first eligible clue was the 5th — odd
 *   — and on the 3x4 board, where the 5th is also the last, that made the
 *   player's own guessing turn all but ineligible: the ending the last chance
 *   exists for was unreachable on the first board a learner meets. At 3 the
 *   first eligible clue is the 4th, which is the player's, and re-measuring
 *   over 300 games a board finds it on every one of them, on all three boards.
 * - It does not shorten the challenge much. Words still unsolved when a
 *   forbidden word lands: 11.6 of 12 on the opening clue, 9.3 of 12 on the
 *   5th. The last chance was never a short quiz; what this changes is when it
 *   is offered at all, not how much typing it is.
 */
export const REDEMPTION_AFTER_ROUND = 3

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
