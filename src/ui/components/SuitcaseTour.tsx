import { useCallback, useLayoutEffect, useState } from 'react'
import { TOUR_STEPS } from '../../onboarding/tour'
import { ClueyFace } from './Cluey'

/**
 * The spotlight walking the REAL SuitcaseScreen (O3). This component renders
 * nothing of the case itself: it measures the band the current step's anchor
 * selector finds on the live screen and draws a window around it — the scrim
 * is one box-shadow cast from the transparent spotlight div, so the band
 * stays exactly as bright as the screen drew it and everything else dims.
 *
 * The overlay covers the whole viewport and eats every tap (a tap on the
 * scrim advances), which is also what keeps the header's Back arrow and the
 * tiles inert while the tour has the floor: SuitcaseScreen itself is
 * untouched by O3, and suitcase-drive proves it never noticed.
 *
 * Fixed positioning throughout, so nothing here can lengthen the document —
 * the no-scroll rule holds by construction, and layout-drive measures it
 * anyway.
 */
export function SuitcaseTour({
  onDone,
  onSkip,
}: {
  /** Every band seen: the flow moves on (to the arrival). */
  onDone: () => void
  /** Skip, always visible — ends the whole intro, not just the tour. */
  onSkip: () => void
}) {
  const [index, setIndex] = useState(0)
  const [rect, setRect] = useState<{ top: number; left: number; width: number; height: number } | null>(null)
  const step = TOUR_STEPS[Math.min(index, TOUR_STEPS.length - 1)]!
  const last = index >= TOUR_STEPS.length - 1

  const measure = useCallback(() => {
    const el = document.querySelector(step.anchor)
    if (!el) {
      // A band the screen no longer renders. The drive pins every anchor, so
      // this is belt-and-braces for a future refactor: never strand the
      // player behind a spotlight pointing at nothing.
      setRect(null)
      return
    }
    const r = el.getBoundingClientRect()
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height })
  }, [step.anchor])

  useLayoutEffect(() => {
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [measure])

  const advance = () => (last ? onDone() : setIndex(index + 1))

  // The bubble takes whichever half of the screen the band is not in, so the
  // light and the words about it never cover each other.
  const vh = typeof window === 'undefined' ? 640 : window.innerHeight
  const bandInTopHalf = rect !== null && rect.top + rect.height / 2 < vh / 2
  return (
    // The scrim advancing on tap is deliberate — the tour is tap-through like
    // every bubble before it — and the Next button repeats it, so a keyboard
    // or reader user loses nothing to the div's click.
    <div
      className="tour-overlay"
      data-tour-step={index}
      data-tour-anchor={step.anchor}
      onClick={advance}
    >
      {rect && (
        <div
          className="tour-spot"
          style={{
            top: rect.top - 4,
            left: rect.left - 4,
            width: rect.width + 8,
            height: rect.height + 8,
          }}
          aria-hidden="true"
        />
      )}
      <div
        className={`tour-panel ${bandInTopHalf ? 'tour-panel-bottom' : 'tour-panel-top'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="tutorial-say">
          <ClueyFace mood={last ? 'happy' : 'idle'} className="cluey-mini" />
          {/* role=status: each step is announced without stealing focus, the
              same pattern every onboarding bubble uses. */}
          <p className="tutorial-bubble" role="status">
            {step.text}
          </p>
        </div>
        <div className="onboard-controls">
          <button className="btn btn-primary onboard-next" onClick={advance}>
            {last ? 'On we go' : 'Next'}
          </button>
          <button className="btn onboard-skip" onClick={onSkip}>
            Skip
          </button>
        </div>
      </div>
    </div>
  )
}
