/**
 * The suitcase tour (O3): after the tutorial win, Casey opens himself.
 *
 * ── AN OVERLAY ON THE REAL SCREEN, NEVER A COPY ─────────────────────────────
 *
 * Each step is a spotlight anchored by SELECTOR to a band the real
 * SuitcaseScreen already renders, walked top to bottom in the order a word
 * travels — the exact order E1 built the screen to read. A copied mock of the
 * case could drift from the case it describes the same way the rules copy has
 * drifted from the engine; a selector cannot, because onboarding-drive
 * resolves every anchor on the live screen and fails when one stops matching.
 *
 * ── WHAT THE TOUR POINTS AT ────────────────────────────────────────────────
 *
 * The tutorial DISCOVERS all twelve of its words and COLLECTS none — that is
 * arithmetic, not a bug (collection needs a green EACH way, and one round
 * gives each word exactly one way; see the O2 entry in DECISIONS.md). So the
 * cargo on screen is twelve words in the loose strip and two empty
 * compartments, and the copy below is written to that truth: the near-empty
 * case IS the point — we are going to fill this.
 */

export interface TourStep {
  /**
   * Selector into the live SuitcaseScreen. These are the `case-band`s (plus
   * the action row below the case) — stable, load-bearing class names in the
   * `cluey-*` tradition: rename one over there and the drive fails here.
   */
  anchor: string
  /** Casey's line for the band under the light. */
  text: string
}

export const TOUR_STEPS: TourStep[] = [
  {
    anchor: '.case-loose',
    text:
      'This is me — open on the table! The strip up top holds the words still out there: met, but not yet mine to carry. Our twelve from the first board wait here.',
  },
  {
    anchor: '.case-panel-lid',
    text:
      'The lid is for collected words — one green each way, once under your clue and once by your guess. Empty so far. Today every word earned one way; the other comes with play.',
  },
  {
    anchor: '.case-panel-tray',
    text:
      'And the tray is for keeps: wrap-up rounds pack collected words in for good. A hundred packed words open the road to the next city.',
  },
  {
    anchor: '.case-actions',
    text:
      'This button deals a wrap-up round. It sleeps for now — three won rounds earn one. There is no word count to reach: it packs whatever you have collected, up to thirteen, so it is worth saving one until the lid is full. Let’s go fill me up!',
  },
]
