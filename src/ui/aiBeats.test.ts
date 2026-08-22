import { describe, expect, it } from 'vitest'
import { beatPlan, REVEAL_MS, THINK_MS, type AiBeat } from './aiBeats'

describe('beatPlan', () => {
  it('shows the reasoning first and steps the guess on the way out of it', () => {
    const p = beatPlan('think', true)
    expect(p).toEqual({ next: 'reveal', delayMs: THINK_MS, step: true })
  })

  it('does not step twice for one guess — the reveal only waits', () => {
    const p = beatPlan('reveal', true)
    expect(p).toEqual({ next: 'think', delayMs: REVEAL_MS, step: false })
  })

  /**
   * The queue is empty on the beat that ENDS the turn: the step out of it is
   * `STOP_GUESSING` rather than a guess, and there is no sentence in the
   * bubble to read, so it does not hold the panel for a full think.
   */
  it('does not linger on a think beat with nothing queued to think about', () => {
    expect(beatPlan('think', false)).toEqual({ next: 'reveal', delayMs: REVEAL_MS, step: true })
  })

  /**
   * The card's own number, walked rather than asserted from the constants: a
   * clue of three is the most a turn can queue, and it costs nine seconds if
   * the player never taps. A tap skips whatever is left of the current beat,
   * which is why this is the ceiling and not the wait.
   */
  it('costs a three-guess turn about nine seconds unhurried', () => {
    let beat: AiBeat = 'think'
    let queued = 3
    let ms = 0
    for (let i = 0; i < 6; i++) {
      const p = beatPlan(beat, queued > 0)
      ms += p.delayMs
      if (p.step) queued--
      beat = p.next
    }
    expect(queued).toBe(0)
    expect(ms).toBe(3 * (THINK_MS + REVEAL_MS))
    expect(ms).toBeGreaterThanOrEqual(9000)
    expect(ms).toBeLessThan(10_000)
  })
})
