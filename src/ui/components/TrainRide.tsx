import { useEffect, useMemo, useRef, useState } from 'react'
import { cityAt } from '../../journey/cities'
import { RIDE_CYCLE, nextPass } from '../../journey/rideCycle'
import { storyForCity, storySentences } from '../../journey/travelStory'
import { useSettings } from '../../stores/settingsStore'
import { ACTIVE } from '../../lang/active'
import { TRANSLATION_TAG, canSpeak, speakText, stopWordAudio, storyAudioUrl } from '../speak'

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
 * That matters more now than it did: each sentence is said four times (see
 * journey/rideCycle.ts), so the ride is four times the length it was.
 */
/**
 * The pencil train, in Casey's hatching. Drawn rather than imported:
 * everything else here is hand-rolled SVG and an icon set would look
 * borrowed. Shared with the onboarding scene (OnboardingScreen.tsx), which
 * opens the app inside this same train — one drawing, so the intro and the
 * ride are visibly the same place.
 */
export function PencilTrain({ className = 'ride-train' }: { className?: string }) {
  return (
    <svg viewBox="0 0 240 90" className={className} role="presentation">
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
  )
}

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
  /** Which pass of RIDE_CYCLE the current sentence is on. */
  const [pass, setPass] = useState(0)
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

  /**
   * One pass of one sentence, and then the next by itself.
   *
   * The cycle is in journey/rideCycle.ts and the reason it is four passes is
   * there too. What is here is only how a pass is made audible: the baked clip
   * for that pass, or the device voice reading the same line if the build has
   * no clips — in the language that pass is IN, which is the one thing an
   * English step must not get wrong.
   */
  const playPass = (index: number, step: number) => {
    if (index >= sentences.length) {
      setPlaying(false)
      setAt(null)
      setPass(0)
      return
    }
    setAt(index)
    setPass(step)
    setPlaying(true)
    if (!sound) return

    const sentence = sentences[index]!
    const cur = RIDE_CYCLE[step]!
    const a = (audioRef.current ??= new Audio())
    a.onended = null
    a.pause()
    a.src = storyAudioUrl(cityIndex, index, cur.variant)
    // The slow pass is its own bake at 0.6; this toggle is a second, free step
    // on top of whichever pass is playing, and it stretches rather than
    // re-times — which is why it is a small nudge and not another halving.
    a.playbackRate = slowRef.current ? 0.8 : 1
    // Without this the pitch rises with the rate and Aoede turns into a
    // chipmunk, which is worse than no toggle at all.
    ;(a as HTMLAudioElement & { preservesPitch?: boolean }).preservesPitch = true
    a.onended = () => {
      const next = nextPass(index, step)
      playPass(next.sentence, next.step)
    }
    a.play().catch(() => {
      // No clip in this build, or the browser refused: read it with the device
      // voice instead. Silent phones simply show the text, which is the same
      // bargain RoundSentences makes. The chain stops here either way —
      // speakText cannot say when it has finished (see speak.ts) — so the
      // player taps to continue, which is what happened before the cycle too.
      if (canSpeak()) {
        if (cur.side === 'en') speakText(sentence.en, ACTIVE.speech.rate, TRANSLATION_TAG)
        else speakText(sentence.da, cur.variant === 'slow' ? ACTIVE.speech.slowRate : ACTIVE.speech.rate)
      }
      setPlaying(false)
    })
  }

  /** Tapping a line, or pressing Listen: start that sentence from its first pass. */
  const playFrom = (index: number) => playPass(index, 0)

  const stop = () => {
    const a = audioRef.current
    if (a) {
      // The handler would otherwise start the next pass a beat after the
      // pause, which is a ride that will not stop.
      a.onended = null
      a.pause()
    }
    if (canSpeak()) window.speechSynthesis.cancel()
    setPlaying(false)
  }

  const city = cityAt(cityIndex)
  let n = -1
  const speakingSide = (index: number, side: 'da' | 'en') =>
    playing && at === index && RIDE_CYCLE[pass]!.side === side

  return (
    <div className="screen ride-screen">
      <div className="ride-window" aria-hidden="true">
        <PencilTrain />
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
                      {/* Which line is speaking, so the four passes read as
                          one sentence being worked through rather than as a
                          repeat nobody asked for. */}
                      <span
                        className={`ride-da${speakingSide(index, 'da') ? ' is-speaking' : ''}`}
                        lang={ACTIVE.code}
                      >
                        {s.da}
                      </span>
                      <span className={`ride-en${speakingSide(index, 'en') ? ' is-speaking' : ''}`}>
                        {s.en}
                      </span>
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
          // Continue picks the cycle up where it stopped rather than restarting
          // the sentence, so a pause in the middle of the translation does not
          // cost the Danish again.
          onClick={() => (playing ? stop() : playPass(at ?? 0, at === null ? 0 : pass))}
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
