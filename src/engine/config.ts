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
 *   standard      12 greens / 7 tokens = 1.71
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
 * WHAT THAT COST, MEASURED. The freed cards became bystanders rather than
 * greens, so every board carries more cards that are on nobody's key (3x4 and
 * 3x5: 2 -> 4; 4x5: 5 -> 8) and lost the only ending that could arrive early.
 * `selfplay.test.ts` walks a guesser from knowing nothing to reading every
 * clue and reports what each board does at each step; the whole table is
 * reproducible with `SELFPLAY_GAMES=2000 SELFPLAY_REPORT=1 npx vitest run
 * src/ai/selfplay.test.ts`. Two things it settles, over 2000 seeded games a
 * cell:
 *
 *   1. Nobody can lose by accident any more. A guesser that knows literally
 *      nothing spends every token on every board — sudden death 100%, mean
 *      clues exactly the budget — and still wins only 0.0-1.2% of the time.
 *      The retired forbidden measurement had that same guesser losing 27% of
 *      3x5 games and 47% of 4x5 games to a forbidden word before the clues
 *      ran out. So the floor did not move up, it moved LATER: every loss now
 *      happens in sudden death, and it arrives with the board barely touched —
 *      9.01 of standard's 12 greens are still hidden when the tokens go, so
 *      surviving from there means naming nine cards blind. That is why the
 *      floor is a floor and not an argument that these boards are hard.
 *   2. The boards stopped escalating. Only standard was re-tuned for it and
 *      only by one token; the argument is above `standard` below. beginner
 *      and middle are untouched and still measure 76.1% and 67.1% at p=0.6,
 *      in that order, which is the order they are meant to be in.
 *
 * These are floors and brackets, not forecasts: a hash-based guesser is not a
 * person, and the p dial stands in for reading a clue, which is the part of
 * this game a number cannot really hold.
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
    //
    // Re-measured after forbidden words came out and kept. Four tokens now
    // costs 15.6 points of win rate at p=0.6 (60.5% against five's 76.1%,
    // 2000 games) on top of forbidding a whole play style, and the first board
    // a learner meets is the one board that should be gentle. This is the only
    // token count in the file with an arithmetic argument as well as a
    // measured one, which is why it did not move when standard's did.
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
   * else, so a wrong guess lands on empty air more often than it used to —
   * 67.9% of missed guesses hit a card on nobody's key (p=0.7, 2000 games),
   * the lowest of the three learner boards.
   *
   * This board is the one the re-tune left alone, and it earned that: at 1.83
   * greens per clue it is the tightest budget in the game, it wins 67.1% at
   * p=0.6 against beginner's 76.1%, and it is the default board. Six tokens
   * were measured against five (50.0% at p=0.6 — a coin flip, and a harsh
   * thing to make the default) and against seven (81.0%, which flattens it
   * into the beginner board), and six is where it should be.
   *
   * THE RULE THIS STILL TURNS ON, because the first version of this comment
   * got it backwards and the removal of forbidden words does not change it:
   * outside sudden death a guess is judged against the CLUE-GIVER's key and
   * nothing else (game.ts, the GUESS case). A card that is neutral on your key
   * may be green on Casey's, and under his clue it is his key that is read —
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
  /**
   * Four across, five down, and the only board this re-tune moved.
   *
   * Eight tokens was Duet's ratio and it was right while this board carried
   * what Duet's does. Standard was the only grid dealt three forbidden words a
   * side — five distinct cards, three of them pure hazards that could end a
   * round on the spot — so its difficulty lived in the danger, not in the clue
   * economy, and 1.50 greens per clue was the loosest budget in the game on
   * purpose. Removing the hazards took that difficulty away and left the loose
   * budget behind, which showed up exactly where you would expect. Measured
   * over 2000 seeded games per cell (`selfplay.test.ts`, both sides guessing
   * right with probability p), standard at eight tokens won 71.3% at p=0.6
   * against middle's 67.1%, and 89.3% at p=0.7 against middle's 85.4% — the
   * big board had become easier than the one it escalates from.
   *
   * Seven restores the order: 58.1% and 80.7% at those two points, behind
   * middle at both, and the ratio goes 1.50 -> 1.71. It costs nothing at the
   * top — perfect play still wins every seed and still spends 4.44 clues, so
   * there are 2.6 spare rather than 3.6 — and nothing at the bottom, where the
   * know-nothing floor was 0.0% and stays there. It is the honest dial: the
   * board on screen does not change, only how long you have with it.
   *
   * NOT TOUCHED, and why. Eight of these twenty cards are on nobody's key, and
   * 76.2% of missed guesses land on one (p=0.7) — the most padded board in the
   * game, and the obvious thing to blame. Dealing those slots as greens was
   * measured too, at these same seven tokens (9 a side, 2 shared: 16 greens,
   * 4 neutrals), and it does not do what the padding complaint assumes. It
   * makes the board harder AND longer: 64.3% at p=0.7, with perfect play
   * spending 6.00 clues of the 7 instead of 4.44. A dead card is a card nobody
   * ever has to point at, so the padding made this board EASIER, not slower.
   * Changing what the twenty cards are is a real design decision with the SRS
   * deal behind it (keygen's tiers), not a tuning fix, and nothing measured
   * here asked for it.
   */
  standard: {
    rows: 5,
    cols: 4,
    totalWords: 20,
    greensPerSide: 7,
    greenOverlap: 2, // 12 distinct greens, 8 bystanders
    turnTokens: 7,
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
 * it was always meant to be.
 *
 * Re-measured, and it is now the softest board in the game by a clear margin:
 * 84.8% at p=0.6 and 95.2% at p=0.7, against the 3x5's 67.1% and 85.4% (2000
 * seeded games a cell, `selfplay.test.ts`). Left alone deliberately. That
 * harness plays the engine round and cannot see the packing gate above it —
 * every card face-down in English, dictionary closed, first miss remembered —
 * which is where this round's difficulty was always meant to live, so a soft
 * engine round here is the design working rather than a slack budget. Nine
 * tokens was measured (73.5% / 89.7%) and is what to reach for if the ritual
 * ever needs teeth; ten is what ships until the packing gate is measured on
 * a person rather than a hash.
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
