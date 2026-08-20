import { useEffect, useMemo, useRef, useState } from 'react'
import { cityAt } from '../../journey/cities'
import { storyForCity, storySentences } from '../../journey/travelStory'
import { useSettings } from '../../stores/settingsStore'
import { ACTIVE } from '../../lang/active'
import { canSpeak, speakText, stopWordAudio, storyAudioUrl } from '../speak'

/**
 * The ride out of a city: its hundred words, read back as a story.
 *
 * THE MOMENT. Travel is the one point in the journey where a player has
 * finished something — `canTravel` opens the road only when every word of the
 * city is packed — and until now the reward for that was a screen saying the
 * name of the next town. This is what the packing was for: the words come back
 * in sentences, spoken, and the payoff is that they can be understood.
 *
 * The story belongs to the city being LEFT, not the one arrived at. Its words
 * are the ones just wrapped, and its band is why one written story serves
 * every player (see the note on travelStory.ts).
 *
 * SKIPPABLE, ALWAYS AND VISIBLY. A player who wants their next city is not
 * made to sit through eight sentences of Danish first — an unskippable ritual
 * is how a lovely idea becomes the thing people dread between rounds. The
 * study phase was cut once already for being homework, which is the precedent.
 */
export function TrainRide({
  cityIndex,
  onDone,
}: {
  /** The city being left — the story and the words are its own. */
  cityIndex: number
  onDone: () => void
}) {
  const story = storyForCity(cityIndex)
  const sound = useSettings((s) => s.sound)
  const sentences = useMemo(() => (story ? storySentences(story) : []), [story])

  const [at, setAt] = useState<number | null>(null)
  const [playing, setPlaying] = useState(false)
  const [slow, setSlow] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  // Read inside the ended handler, which is installed once; state read there
  // would be the value from the render that installed it.
  const slowRef = useRef(slow)
  slowRef.current = slow

  // Nothing written for this city yet: say so by not existing. The caller
  // treats a null ride as "go straight to the arrival".
  useEffect(() => {
    if (!story) onDone()
  }, [story, onDone])

  // Any word audio still going from the screen behind would play under this.
  useEffect(() => {
    stopWordAudio()
    return () => {
      const a = audioRef.current
      if (a) {
        a.pause()
        a.src = ''
      }
      if (canSpeak()) window.speechSynthesis.cancel()
    }
  }, [])

  if (!story) return null

  const playFrom = (index: number) => {
    if (index >= sentences.length) {
      setPlaying(false)
      setAt(null)
      return
    }
    setAt(index)
    setPlaying(true)
    if (!sound) return

    const a = (audioRef.current ??= new Audio())
    a.onended = null
    a.pause()
    a.src = storyAudioUrl(cityIndex, index)
    // The clips are already baked slow (0.6); this is a second, free step for
    // a learner who wants it, and it stretches rather than re-times — which is
    // why it is a small nudge and not another halving.
    a.playbackRate = slowRef.current ? 0.8 : 1
    // Without this the pitch rises with the rate and Aoede turns into a
    // chipmunk, which is worse than no toggle at all.
    ;(a as HTMLAudioElement & { preservesPitch?: boolean }).preservesPitch = true
    a.onended = () => playFrom(index + 1)
    a.play().catch(() => {
      // No clip in this build, or the browser refused: read it with the device
      // voice instead. Silent phones simply show the text, which is the same
      // bargain RoundSentences makes.
      if (canSpeak()) speakText(sentences[index]!.da)
      setPlaying(false)
    })
  }

  const stop = () => {
    const a = audioRef.current
    if (a) a.pause()
    if (canSpeak()) window.speechSynthesis.cancel()
    setPlaying(false)
  }

  const city = cityAt(cityIndex)
  let n = -1

  return (
    <div className="screen ride-screen">
      <div className="ride-window" aria-hidden="true">
        {/* The pencil train, in Casey's hatching. Drawn rather than imported:
            everything else here is hand-rolled SVG and an icon set would look
            borrowed. */}
        <svg viewBox="0 0 240 90" className="ride-train" role="presentation">
          <g className="cluey-hatch">
            <rect x="18" y="22" width="150" height="46" rx="8" />
            <rect x="34" y="32" width="34" height="22" rx="3" />
            <rect x="82" y="32" width="34" height="22" rx="3" />
            <rect x="130" y="32" width="26" height="22" rx="3" />
            <circle cx="46" cy="74" r="9" />
            <circle cx="140" cy="74" r="9" />
            <path d="M168 30 h28 l10 22 v16 h-38 z" />
            <circle cx="188" cy="74" r="9" />
            <path d="M6 74 h228" className="ride-rail" />
          </g>
        </svg>
      </div>

      <p className="ride-eyebrow">Leaving {city.name}</p>
      <h1 className="ride-title" lang={ACTIVE.code}>
        {story.titleDa}
      </h1>
      <p className="ride-subtitle">
        {story.titleEn} — every word you packed here, in a story.
      </p>

      <div className="ride-scroll">
        {story.chapters.map((chapter) => (
          <section key={chapter.titleDa} className="ride-chapter">
            <h2 className="ride-chapter-title">
              <span lang={ACTIVE.code}>{chapter.titleDa}</span>
              <span className="ride-chapter-en">{chapter.titleEn}</span>
            </h2>
            <ol className="ride-sentences">
              {chapter.sentences.map((s) => {
                n += 1
                const index = n
                return (
                  <li
                    key={index}
                    className={`ride-sentence${at === index ? ' is-current' : ''}`}
                  >
                    <button
                      type="button"
                      className="ride-line"
                      // Tap any line to hear that line — the thing a learner
                      // actually wants when one sentence went past too fast.
                      onClick={() => playFrom(index)}
                      aria-label={`Play: ${s.da}`}
                    >
                      <span className="ride-da" lang={ACTIVE.code}>
                        {s.da}
                      </span>
                      <span className="ride-en">{s.en}</span>
                    </button>
                  </li>
                )
              })}
            </ol>
          </section>
        ))}
      </div>

      <div className="ride-controls">
        <button
          className="btn btn-primary ride-play"
          onClick={() => (playing ? stop() : playFrom(at ?? 0))}
        >
          {playing ? 'Pause' : at === null ? 'Listen' : 'Continue'}
        </button>
        <button
          className={`btn btn-toggle ride-slow${slow ? ' is-on' : ''}`}
          aria-pressed={slow}
          onClick={() => setSlow((v) => !v)}
        >
          Slower
        </button>
        <button className="btn ride-skip" onClick={onDone}>
          Skip
        </button>
      </div>
    </div>
  )
}
