/**
 * The pace of Casey's guessing turn, as a pure function (U3).
 *
 * A turn used to be one `setInterval` at 1100ms: a card flipped, then another,
 * and whatever she had thought about it stayed in the round summary where
 * nobody looked until afterwards. U3 splits that interval in two so the
 * thinking arrives BEFORE the guess it explains:
 *
 *   think   her own sentence for the guess she is about to name, two clamped
 *           lines in the bubble, long enough to read
 *   reveal  `stepAiGuess()` — the card flips, S1 speaks the word, her face
 *           lands happy or oops and the line says how it went
 *
 * It lives here rather than inside the panel because the panel is a `.tsx` and
 * this repo's vitest includes `.test.ts` under `src/` in a NODE environment
 * with no DOM: a component cannot be tested here at all, and a two-beat clock
 * with a step in the middle of it is exactly the part worth pinning.
 */

export type AiBeat = 'think' | 'reveal'

/**
 * Long enough to read two lines of reasoning without stopping the turn dead.
 * Chosen against the beat below rather than measured: three guesses is the
 * most a clue of three can queue, so the ceiling on a turn is 3 x (2000 +
 * 1100) = 9.3s — and a tap on the panel skips straight to the next beat, which
 * is what makes that a ceiling rather than a wait.
 */
export const THINK_MS = 2000

/**
 * The reveal keeps the 1100ms the whole turn used to run at. It is the beat
 * with the least to read in it — one word and three words about it — and it is
 * the one carrying the sound, so it is also the one that must not be cut so
 * short that the clip is talked over by the next.
 */
export const REVEAL_MS = 1100

export type BeatPlan = {
  /** What the panel shows next. */
  readonly next: AiBeat
  /** How long the current beat stays up before that happens. */
  readonly delayMs: number
  /** Whether leaving this beat is the moment `stepAiGuess()` is called. */
  readonly step: boolean
}

/**
 * What happens at the end of the beat now on screen.
 *
 * `queued` is whether the store still holds a planned guess. When it does not,
 * the think beat has no sentence to show and no reason to linger — the step
 * that leaves it is the one that ends the turn (`STOP_GUESSING`), so it runs
 * at the shorter beat. Everything else is the two beats in order, forever,
 * until the phase changes underneath it.
 */
export function beatPlan(beat: AiBeat, queued: boolean): BeatPlan {
  if (beat === 'think') {
    return { next: 'reveal', delayMs: queued ? THINK_MS : REVEAL_MS, step: true }
  }
  return { next: 'think', delayMs: REVEAL_MS, step: false }
}
