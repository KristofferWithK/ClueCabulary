import { useEffect, useRef, useState } from 'react'
import { useJourney } from '../../stores/journeyStore'
import { useUi } from '../../stores/uiStore'
import { clueyLines, openingLineIndex } from '../cluey-tips'

/**
 * The mascot is called **Casey** everywhere a player can read him, and `Cluey`
 * everywhere only a developer can: this file, `ClueyFace`, `ClueyMood`,
 * `ConnectCluey`, `markClueyVerified`, `cluey-tips.ts` and every `cluey-*`
 * class. That split is deliberate and it is the `klausVerifiedAt` precedent —
 * he has now been renamed twice, and renaming the identifiers each time buys a
 * migration, a stale-selector hunt and a drive rewrite for a label nobody sees.
 * The name in the copy is the only one that has to be right.
 */

/**
 * What Casey's face is doing. Every one of these is already a local variable at
 * the site that renders him — the AI panel knows it is waiting, the guess line
 * knows how the guess landed, the round summary knows the outcome — so a mood costs a
 * prop rather than any new state.
 */
export type ClueyMood = 'idle' | 'thinking' | 'happy' | 'oops'

/**
 * Casey himself: a suitcase with eyes.
 *
 * Hand-rolled inline SVG like the Denmark map: CSS-styleable strokes, no asset
 * pipeline. The eyes are the whole point — a face that blinks and looks around
 * reads as alive, and one that holds still reads as a picture of a suitcase.
 *
 * Each eye sits in its own <g> so it can be scaled to nothing for a blink
 * without moving the pupil inside it; that needs transform-box: fill-box, since
 * an SVG child's default transform origin is the viewBox corner rather than the
 * shape. The mood parts (arc eyes, brow, round mouth) are always in the markup
 * and switched by CSS, which keeps this a stylesheet decision and avoids
 * remounting the SVG mid-animation.
 */
export function ClueyFace({
  mood = 'idle',
  className = '',
}: {
  mood?: ClueyMood
  className?: string
}) {
  return (
    <svg
      className={`cluey-svg mood-${mood} ${className}`}
      viewBox="0 0 120 96"
      role="img"
      aria-hidden="true"
    >
      <g className="cluey-figure">
        {/* handle */}
        <path className="cluey-line" d="M45 18 v-6 a6 6 0 0 1 6-6 h18 a6 6 0 0 1 6 6 v6" fill="none" />
        {/* body */}
        <rect className="cluey-body" x="8" y="18" width="104" height="70" rx="12" />
        {/* pencil shading, in the corners a right-hander would have rested on */}
        <g className="cluey-hatch" aria-hidden="true">
          <line x1="14" y1="80" x2="22" y2="72" />
          <line x1="19" y1="82" x2="28" y2="73" />
          <line x1="25" y1="83" x2="34" y2="74" />
          <line x1="96" y1="26" x2="103" y2="19" />
        </g>
        {/* the lid seam and latches */}
        <line className="cluey-line" x1="8" y1="40" x2="112" y2="40" />
        <rect className="cluey-latch" x="26" y="36" width="8" height="8" rx="2" />
        <rect className="cluey-latch" x="86" y="36" width="8" height="8" rx="2" />
        {/* eyes on the lid, each in its own group so a blink scales the eye
            without dragging the pupil out of it */}
        <g className="cluey-eye-g">
          <circle className="cluey-eye" cx="46" cy="29" r="6" />
          <circle className="cluey-pupil" cx="47.5" cy="30" r="2.6" />
        </g>
        <g className="cluey-eye-g">
          <circle className="cluey-eye" cx="74" cy="29" r="6" />
          <circle className="cluey-pupil" cx="75.5" cy="30" r="2.6" />
        </g>
        {/* happy: the eyes become arcs */}
        <path className="cluey-arc" d="M40 31 q6 -7 12 0" fill="none" />
        <path className="cluey-arc" d="M68 31 q6 -7 12 0" fill="none" />
        {/* thinking: one raised brow */}
        <path className="cluey-brow" d="M40 19 q5 -3 10 -1" fill="none" />
        {/* a small smile under the seam, and the mouth it becomes when caught out */}
        <path className="cluey-line cluey-smile" d="M52 56 q8 8 16 0" fill="none" />
        <circle className="cluey-mouth-o" cx="60" cy="57" r="3.4" fill="none" />
        {/* travel sticker */}
        <circle className="cluey-sticker" cx="94" cy="70" r="9" />
      </g>
    </svg>
  )
}

/** What the bubble says when the player's own key has never produced a reply. */
const CONNECT_LINE = 'I have not answered yet — tap here to test the connection →'

/**
 * Casey on Home: the bubble above him speaks — a tip or fun fact, rotating
 * daily, leafing on a tap — and tapping Casey opens the case.
 *
 * His eyes follow the pointer while one is over him. On a phone that fires
 * rarely, which is why the idle wander does the work by default and the follow
 * is a bonus rather than the mechanism.
 *
 * `needsConnection` is Home's one remaining setup prompt, and it speaks
 * *through* Casey rather than as a banner above the map — he is the thing that
 * is not answering, so he is the one who should say so. It keeps the
 * `setup-nudge` class it had as a banner: the class names the affordance
 * ("tap this and land in Settings"), not the position, and three drives walk
 * that path.
 */
export function Cluey({ needsConnection = false }: { needsConnection?: boolean } = {}) {
  const goTo = useUi((s) => s.goTo)
  const cityIndex = useJourney((s) => s.cityIndex)
  const lines = clueyLines(cityIndex)
  // The first sessions open on the critical tips in priority order; after that
  // window, the daily rotation exactly as before (openingLineIndex, O4).
  const [index, setIndex] = useState(() => openingLineIndex(lines.length))
  const [mood, setMood] = useState<ClueyMood>('idle')
  const svgRef = useRef<HTMLDivElement>(null)
  const line = needsConnection ? CONNECT_LINE : lines[index % lines.length]!

  // A tap is a small celebration; it ends on its own so Home settles back to
  // idle rather than grinning permanently.
  useEffect(() => {
    if (mood === 'idle') return
    const t = setTimeout(() => setMood('idle'), 900)
    return () => clearTimeout(t)
  }, [mood])

  useEffect(() => {
    const host = svgRef.current
    if (!host) return
    if (!window.matchMedia('(prefers-reduced-motion: no-preference)').matches) return
    let idle: ReturnType<typeof setTimeout>
    const follow = (e: PointerEvent) => {
      const pupils = host.querySelectorAll<SVGCircleElement>('.cluey-pupil')
      const box = host.getBoundingClientRect()
      if (!box.width) return
      // The SVG is 120 units wide however many pixels it is drawn at, so a
      // pointer offset has to be converted before it means anything here.
      const scale = 120 / box.width
      host.classList.add('cluey-looking')
      pupils.forEach((p) => {
        const eye = p.getBoundingClientRect()
        const dx = (e.clientX - (eye.left + eye.width / 2)) * scale
        const dy = (e.clientY - (eye.top + eye.height / 2)) * scale
        const reach = Math.min(1, 2.3 / (Math.hypot(dx, dy) || 1))
        p.style.transform = `translate(${(dx * reach).toFixed(1)}px, ${(dy * reach).toFixed(1)}px)`
      })
      clearTimeout(idle)
      idle = setTimeout(() => {
        host.classList.remove('cluey-looking')
        pupils.forEach((p) => (p.style.transform = ''))
      }, 1600)
    }
    window.addEventListener('pointermove', follow)
    return () => {
      window.removeEventListener('pointermove', follow)
      clearTimeout(idle)
    }
  }, [])

  return (
    <div className="cluey-band">
      <button
        className={`cluey-bubble${needsConnection ? ' setup-nudge' : ''}`}
        aria-label={
          needsConnection
            ? 'Casey has not answered yet — open Settings and test the connection'
            : `Casey says: ${line} Tap for another tip.`
        }
        onClick={() => (needsConnection ? goTo('settings') : setIndex((i) => i + 1))}
      >
        {line}
      </button>
      <button
        className="cluey-button"
        aria-label="Open the suitcase — your collection"
        onClick={() => goTo('suitcase')}
        onPointerDown={() => setMood('happy')}
      >
        <div ref={svgRef} className="cluey-live">
          <ClueyFace mood={mood} />
        </div>
        <span className="cluey-name" aria-hidden="true">
          Casey
        </span>
      </button>
    </div>
  )
}
