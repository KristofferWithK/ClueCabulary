import { useState } from 'react'
import { useJourney } from '../../stores/journeyStore'
import { useUi } from '../../stores/uiStore'
import { clueyLines, dailyLineIndex } from '../cluey-tips'

/**
 * Cluey himself: a suitcase with eyes, sitting in the middle of Home. The
 * bubble above him speaks — a tip or fun fact, rotating daily, leafing on a
 * tap — and tapping Cluey opens the case (the collection screen).
 *
 * Hand-rolled inline SVG like the Denmark map: CSS-styleable strokes, no
 * asset pipeline, and one place for the pencil look to land later.
 */
function ClueyFace() {
  return (
    <svg className="cluey-svg" viewBox="0 0 120 96" role="img" aria-hidden="true">
      {/* handle */}
      <path className="cluey-line" d="M45 18 v-6 a6 6 0 0 1 6-6 h18 a6 6 0 0 1 6 6 v6" fill="none" />
      {/* body */}
      <rect className="cluey-body" x="8" y="18" width="104" height="70" rx="12" />
      {/* the lid seam and latches */}
      <line className="cluey-line" x1="8" y1="40" x2="112" y2="40" />
      <rect className="cluey-latch" x="26" y="36" width="8" height="8" rx="2" />
      <rect className="cluey-latch" x="86" y="36" width="8" height="8" rx="2" />
      {/* eyes on the lid */}
      <circle className="cluey-eye" cx="46" cy="29" r="6" />
      <circle className="cluey-eye" cx="74" cy="29" r="6" />
      <circle className="cluey-pupil" cx="47.5" cy="30" r="2.6" />
      <circle className="cluey-pupil" cx="75.5" cy="30" r="2.6" />
      {/* a small smile under the seam */}
      <path className="cluey-line" d="M52 56 q8 8 16 0" fill="none" />
      {/* travel sticker */}
      <circle className="cluey-sticker" cx="94" cy="70" r="9" />
    </svg>
  )
}

export function Cluey() {
  const goTo = useUi((s) => s.goTo)
  const cityIndex = useJourney((s) => s.cityIndex)
  const lines = clueyLines(cityIndex)
  const [index, setIndex] = useState(() => dailyLineIndex(lines.length))
  const line = lines[index % lines.length]!

  return (
    <div className="cluey-band">
      <button
        className="cluey-bubble"
        aria-label={`Cluey says: ${line} Tap for another tip.`}
        onClick={() => setIndex((i) => i + 1)}
      >
        {line}
      </button>
      <button
        className="cluey-button"
        aria-label="Open Kufferten — your collection"
        onClick={() => goTo('suitcase')}
      >
        <ClueyFace />
        <span className="cluey-name" aria-hidden="true">
          Cluey
        </span>
      </button>
    </div>
  )
}
