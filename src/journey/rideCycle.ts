import type { StoryVariant } from '../ui/speak'

/**
 * What the ride does with one sentence before moving to the next.
 *
 * Four passes, not one. A sentence read once in a language you are learning is
 * a sound; the same sentence read, translated, read slowly and read again is a
 * sentence you have a chance of keeping. The shape is the owner's — Danish,
 * the translation, slow Danish, Danish again — and the last pass is
 * deliberately the FIRST clip replayed rather than a fourth bake: hearing the
 * ordinary reading a second time, after the slow one has taken it apart, is
 * the point of ending there.
 *
 * The cost is length. Sønderborg's 31 sentences become 124 passes, so the ride
 * is roughly four times what it was — which is why Skip stays where it is and
 * why any line can be tapped to hear just that one.
 *
 * Type-only import of `StoryVariant`, so nothing under journey/ takes a
 * runtime dependency on the UI: this module is the shape of the cycle and
 * knows nothing about how a clip is fetched or spoken.
 */
export interface RideStep {
  /** Which bake of the sentence this pass plays. */
  readonly variant: StoryVariant
  /** Which line of the sentence is being read, for the highlight. */
  readonly side: 'da' | 'en'
}

export const RIDE_CYCLE: readonly RideStep[] = [
  { variant: 'normal', side: 'da' },
  { variant: 'en', side: 'en' },
  { variant: 'slow', side: 'da' },
  { variant: 'normal', side: 'da' },
]

/**
 * Where the ride goes after finishing one pass: the next pass of the same
 * sentence, or the first pass of the next one. Returning a sentence index past
 * the end is how the caller learns the story is over.
 */
export function nextPass(sentence: number, step: number): { sentence: number; step: number } {
  return step + 1 < RIDE_CYCLE.length
    ? { sentence, step: step + 1 }
    : { sentence: sentence + 1, step: 0 }
}
