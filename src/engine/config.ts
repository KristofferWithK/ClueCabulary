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
 * THE BOARD. Three across, six down, and there is only one of it.
 *
 * There were three — beginner 3x4, middle 3x5, standard 4x5 — picked from a
 * select in Settings and stored as `gridSize`. The owner's call on 2026-08-21
 * is that a difficulty ladder is not what this game is: "we no longer have
 * beginner, we have one standardized board". So the union, the picker, the
 * persisted setting and the `?grid=` dev switch are all gone, and what is left
 * is this constant plus two boards you ENTER rather than choose — the tutorial
 * and the wrap-up, both below.
 *
 * ---- why 3x6, and why it could not have been 3x6 last week -----------------
 *
 * Because a sixth row now fits, and it did not before. Measured on the built
 * app at 360x640, the tight case, in the opening clue phase:
 *
 *                    board height   row     card min-height   a 6th row
 *   before K1/K2          239.30   41.46              44.00       33.22
 *   after  K1/K2          318.56   57.31              57.31       46.43
 *
 * 33.22px is under the 44px floor a card cannot go below, so a sixth row
 * before the composer work would have overflowed the phone — invisibly, since
 * a flex column overflows by painting over what is under it while
 * `scrollHeight` stays honest. K1 gave the dock its measured height and K2
 * collapsed every dock into it and deleted the key legend; between them the
 * board got 79.26px back, and the sixth row measures 46.43 — clear of the
 * floor by 2.43, and the six rows of a 3x6 are TALLER than the five rows of
 * the 3x5 it replaces. The bigger board is the roomier one, but only in that
 * order. `.word-card`'s `@container` threshold is set against that 46.43; see
 * index.css, which says which side of it this board sits on and why.
 *
 * ---- what it plays like ----------------------------------------------------
 *
 * `selfplay.test.ts` walks one dial — the chance a guess finds a word the
 * clue-giver actually meant — from a guesser that knows nothing up to perfect
 * play, and reports what each board does at each step. The whole table is
 * reproducible with
 *
 *   SELFPLAY_GAMES=2000 SELFPLAY_REPORT=1 npx vitest run src/ai/selfplay.test.ts
 *
 * and this is what it says, 2000 seeded games a cell, both sides cluing up to
 * three at a time. The 3x5 row is the board this one replaces, kept for the
 * comparison and not shipped:
 *
 *   board                  greens dead tok  g/tok   p=0.6   p=0.7   p=0.8  SD%@.7  clues@1
 *   3x6  8/3/8  THE BOARD     13    5   8   1.63    74.7    90.0    98.2    24.6     5.00
 *   3x4  5/2/5  tutorial       8    4   5   1.60    76.1    89.0    96.9    30.8     3.51
 *   4x5 10/4/10 wrap-up       16    4  10   1.60    84.8    95.2    99.2    12.7     6.00
 *   3x5  7/3/6  (replaced)    11    4   6   1.83    67.1    85.4    94.7    38.8     4.18
 *   3x6  8/2/8  (rejected)    14    4   8   1.75    69.8    87.8    97.2    30.4     5.56
 *   3x6  8/4/8  (rejected)    12    6   8   1.50    79.8    93.4    98.8    17.9     4.52
 *   3x6  8/3/7  (rejected)    13    5   7   1.86    59.7    79.8    94.4    45.6     5.00
 *   3x6  8/3/9  (rejected)    13    5   9   1.44    84.9    95.9    99.6    11.8     5.00
 *
 * `g/tok` is the number worth watching when tuning: distinct greens divided by
 * turnTokens, i.e. how much each clue has to carry. Codenames Duet, the game
 * this is scaled from, sits at 15/9 = 1.67.
 *
 * Eight greens a side with three shared is thirteen distinct greens over eight
 * shared tokens, and against the 3x5 it replaces it is kinder in the two ways a
 * learner feels: **74.7% at p=0.6 against 67.1%**, and sudden death on **24.6%
 * of rounds at p=0.7 against 38.8%**. Losing the round to the clock, on the
 * board that is meant to be the ordinary one, roughly halves. A perfect pair
 * spends 5.00 of the eight tokens, so three are spare — room for two wrong
 * guesses and a wasted clue, where the 3x5 left 1.8.
 *
 * And the floor did not move. A guesser that knows literally nothing — both
 * sides cluing nonsense, every guess a hash — wins 0.1% of the time, spends all
 * 8.00 tokens, and reaches the last chance in 100.0% of rounds with 8.54 of the
 * thirteen greens still hidden. That is the distance a real player's word
 * associations have to cover, and it is why the floor is a floor rather than an
 * argument that this board is hard.
 *
 * And it is a bigger board in the sense the journey cares about. Thirteen
 * distinct greens a round against the 3x5's eleven is about 18% more green
 * events, and green events are what feed collection — a word is collected only
 * once it has gone green each way (`wordState` in journey/progress.ts).
 *
 * Tokens are a shared pool, not two each: a side whose greens are all found has
 * nothing left to clue, so the other side spends what remains. Eight of them is
 * four clue-givings each.
 *
 * ---- the neighbours, measured rather than argued ---------------------------
 *
 * Four boards were played against this one and are in the table above.
 *
 *   8/2/8 — fourteen greens, four dead cards. MORE green on the board and it
 *     plays HARDER (69.8% at p=0.6), which is the counter-intuitive result this
 *     game keeps producing: a card on nobody's key is a card nobody ever has to
 *     point at, so padding makes a board easier, not slower. It also stretches
 *     a perfect round from 5.00 clues to 5.56.
 *   8/4/8 — twelve greens, six dead. The other direction, and it works
 *     (79.8%), but six of eighteen cards doing nothing is a third of the board
 *     the player reads and never needs, and the win rate is drifting toward the
 *     wrap-up board's.
 *   8/3/7 — one token fewer. 59.7% at p=0.6 and sudden death on 45.6% of
 *     rounds at p=0.7: harsher than the 3x5 this replaces, on a bigger board.
 *     A perfect round still spends 5.00, so seven tokens is two spare, which is
 *     not enough slack for a board with thirteen greens on it.
 *   8/3/9 — one token more. 84.9%, and the last chance all but disappears
 *     (11.8%). That is the wrap-up board's economy on the board you play every
 *     day, and the wrap-up round is supposed to be the soft one.
 *
 * Eight is the token count where the round still has a losing side without the
 * clock being the thing you play against.
 *
 * ---- and what is NOT here any more -----------------------------------------
 *
 * Duet's third card role — the assassin, which this game called a forbidden
 * word — is gone, along with the translate-every-word ending that used to
 * soften it. Every key holds greens and nothing else; a card that is not green
 * on a key is a bystander there. Rounds end by finding every green (win), by
 * the tokens running out into the last chance, or by walking away. Five of
 * these eighteen cards are on nobody's key, which is the same proportion the
 * 3x5 carried (4 of 15).
 *
 * These are floors and brackets, not forecasts: a hash-based guesser is not a
 * person, and the p dial stands in for reading a clue, which is the part of
 * this game a number cannot really hold.
 */
export const BOARD: GridConfig = {
  // Portrait: phones want more rows than columns, and three across is what
  // keeps `.card-da` at a full 16px — it is sized in cqw off the card, so a
  // four-wide board shrinks the word rather than the layout.
  rows: 6,
  cols: 3,
  totalWords: 18,
  greensPerSide: 8,
  greenOverlap: 3, // 13 distinct greens, 5 bystanders
  turnTokens: 8,
  // One in three, the ratio every board has carried. The sampler's cap on
  // never-seen words; see srs/sampler.ts.
  maxNewWordsPerBoard: 6,
}

/**
 * The tutorial board: 3x4, dealt only by `newTutorialGame` from a fixed word
 * list and a fixed seed (src/onboarding/tutorial.ts).
 *
 * It was `GRID_CONFIGS.beginner` — the gentlest of the three sizes — and it
 * survives the sizes going for the reason WRAPUP_CONFIG survived them: it is a
 * mode you enter, not a difficulty you keep. Nothing reads it from settings,
 * nothing offers it, and no player can pick it.
 *
 * Twelve cards is what the scripted round needs. Eight distinct greens over
 * five tokens, and the script narrates a specific board whose keys the seed was
 * searched for — so do not tune it: `tutorial.test.ts` plays every scripted
 * beat through `applyEvent`, and a changed shape here fails as a script that no
 * longer describes the engine.
 */
export const TUTORIAL_CONFIG: GridConfig = {
  rows: 4,
  cols: 3,
  totalWords: 12,
  greensPerSide: 5,
  greenOverlap: 2, // 8 distinct greens, 4 bystanders
  turnTokens: 5,
  maxNewWordsPerBoard: 4,
}

/**
 * The wrap-up board: 4x5, every word already collected, dealt only by
 * newWrapUpGame.
 *
 * Ten greens a side and ten shared tokens is five clue-givings each — the
 * shape this board was asked for. Sixteen distinct greens over ten tokens is
 * 1.60 greens per clue, and that is deliberately the loosest budget in the
 * game: the packing phase (every card starts in English) is this round's added
 * difficulty, so the clue economy stays forgiving.
 *
 * The measurement that used to sit here — 6.4% of guesses on this board name a
 * forbidden word, against 8.0% on the 3x5 — was the argument for this board's
 * shape and no longer describes anything. There are no forbidden words on any
 * board now, so the only way to lose a wrap-up round is the clock, and this
 * board's difficulty is entirely the packing gate it was always meant to be.
 *
 * It is the softest board in the game and is left that way deliberately. The
 * selfplay harness plays the engine round and cannot see the packing gate
 * above it — every card face-down in English, dictionary closed, first miss
 * remembered — which is where this round's difficulty was always meant to
 * live, so a soft engine round here is the design working rather than a slack
 * budget. Nine tokens was measured and is what to reach for if the ritual ever
 * needs teeth; ten is what ships until the packing gate is measured on a
 * person rather than a hash.
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
