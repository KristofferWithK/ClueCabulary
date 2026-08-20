import { useCallback, useEffect, useRef, useState } from 'react'
import type { GameState } from '../../engine/types'
import { useSettings } from '../../stores/settingsStore'
import { canPlayWords, playWord, stopWordAudio } from '../speak'

/**
 * How long each word gets before the next one starts.
 *
 * **Chosen, not measured, and it is the one number here that could not be.**
 * Neither thing that makes the sound will say when it has stopped: an
 * `<audio>` element's `play()` resolves when playback *begins*, and
 * `speechSynthesis.speak` returns immediately — `speak.ts` exposes neither the
 * element's `ended` nor the utterance's, and threading a completion callback
 * through `WordAudioPorts` is a rewrite of the player rather than an addition
 * to it. So the tour is paced on a clock.
 *
 * 1200ms is long enough for the one-to-three-syllable headwords the nine
 * hundred are made of, said at `speakText`'s 0.88 rate, and it puts a full
 * 4×5 board at 24 seconds. If a baked clip ever runs past it the symptom is
 * benign and visible: the next word cuts the last one off, because `playWord`
 * silences whatever is playing before it starts. The fix, if it comes to that,
 * is an `onEnd` port in `speak.ts` and this constant deleted.
 */
const WORD_MS = 1200

/**
 * Play the board out loud, top to bottom.
 *
 * This is what replaced the pre-game slideshow. A forced march through twenty
 * words before the round is the study phase again, and the study phase was
 * removed for being homework before the game; the difference here is only that
 * it is a button. Nothing starts it but a tap, and the same tap stops it —
 * which is also the rule the whole app follows, that every sound follows a
 * touch.
 *
 * Absent, not merely disabled, during wrap-up packing: the cards are
 * English-side up and the dictionary is shut, so reading the Danish aloud
 * would be handing over the answer key. The caller decides that — see
 * GameScreen — and absence rather than a dead button is deliberate, so there
 * is no control to explain.
 */
export function HearBoard({ game }: { game: GameState }) {
  const sound = useSettings((s) => s.sound)
  const [playing, setPlaying] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const stop = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = undefined
    stopWordAudio()
    setPlaying(false)
  }, [])

  // Leaving the round — or the phase that renders this — must not leave a
  // voice running over the summary screen. The board unmounts at `finished`,
  // so this cleanup IS the stop for the ordinary end of a round.
  useEffect(() => stop, [stop])

  // Turning sound off mid-tour. `playWord` would fall silent by itself on the
  // next word, but the button would sit there claiming to be playing.
  useEffect(() => {
    if (!sound) stop()
  }, [sound, stop])

  // A re-deal mid-tour. The two controls sit in the same header and ↻ is only
  // offered before the first clue, which is exactly when someone would ask to
  // hear the board — so this is reachable, not theoretical. Without it the
  // tour would read out twenty words that are no longer on screen.
  const boardKey = game.words.map((w) => w.wordId).join(',')
  useEffect(() => {
    // Guarded on a tour actually being in flight — `timer.current` is set only
    // between the first word and the last — so that mounting does not fire
    // `stopWordAudio` at whatever the previous screen was still saying.
    if (timer.current) stop()
    // Keyed on the board's identity rather than on the object: the store hands
    // back a new GameState on every reveal, and stopping on each of those
    // would leave the tour unable to outlive a single word.
  }, [boardKey, stop])

  // The same reasoning SpeakWord gives: with sound off these would be a
  // control that does nothing, which is worse than no control.
  if (!sound || !canPlayWords()) return null

  const start = () => {
    // Board order, which is reading order — the same left-to-right,
    // top-to-bottom the eye is already using. Snapshotted rather than read per
    // tick because the store hands back a new GameState on every reveal, and
    // the tour should walk the board it was started on; the effect above is
    // what handles the one case where that board stops existing.
    const words = game.words.map((w) => ({ id: w.wordId, da: w.da }))
    let i = 0
    setPlaying(true)
    const step = () => {
      const next = words[i++]
      if (!next) {
        timer.current = undefined
        setPlaying(false)
        return
      }
      void playWord(next.id, next.da)
      timer.current = setTimeout(step, WORD_MS)
    }
    step()
  }

  return (
    <button
      className={`icon-btn hear-board ${playing ? 'icon-btn-active' : ''}`}
      // Pressed rather than a changed label: the glyph swaps, and a toggle that
      // only says so in an emoji says nothing to a screen reader.
      aria-pressed={playing}
      aria-label={
        playing ? 'Stop reading the board' : `Hear the board — all ${game.words.length} words`
      }
      title={playing ? 'Stop' : 'Hear the board'}
      onClick={playing ? stop : start}
    >
      {/* Both glyphs are one character wide, so the header does not resize
          when the tour starts — the board hangs off this row's height. */}
      <span aria-hidden="true">{playing ? '■' : '▶'}</span>
    </button>
  )
}
