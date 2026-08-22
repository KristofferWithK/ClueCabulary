import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { GameState } from '../../engine/types'
import { useGame } from '../../stores/gameStore'
import { beatPlan, REVEAL_MS, type AiBeat } from '../aiBeats'
import { playWord } from '../speak'
import { ClueyFace, type ClueyMood } from './Cluey'

/** A guess that has landed: what she named, and what it turned out to be. */
type Landed = {
  readonly da: string
  readonly result: 'green' | 'bystander'
  readonly reasoning: string
}

/**
 * Shows the AI side of a turn and paces its guesses one by one.
 *
 * Two regions, one height (K2): Casey's face beside a bubble clamped to TWO
 * lines, then one line for how the guess landed. Nothing here may add a third
 * region — the dock is --dock-h like every other one, and the board's size in
 * every phase of the round is that number.
 *
 * ---- the two beats (U3) ---------------------------------------------------
 *
 * The store keeps the queue; the PACING lives here, and it is two beats per
 * planned guess rather than one interval (`aiBeats.ts` holds the clock and its
 * test):
 *
 *   think    the bubble carries `aiGuessQueue[0].reasoning` — Casey's own
 *            sentence for the guess she is about to name — and her face is
 *            thinking. ~2s.
 *   reveal   `stepAiGuess()`: the card flips, the S1 effect below speaks the
 *            word, the face goes happy or oops, and the line says how it went.
 *            ~1.1s, then the next guess's think beat.
 *
 * A tap anywhere on the panel skips to the next beat, so a three-guess turn is
 * nine seconds only if the player lets it be. It is a plain `onClick` on the
 * dock rather than a button, deliberately: the beats advance on their own, so
 * the tap makes nothing reachable that was not already coming — it only
 * hurries it — and a `role="button"` wrapping the whole panel would replace
 * the two things a screen reader is here to read with one label.
 *
 * The reveal is HELD for its own beat even after the turn has ended, which is
 * the `held` latch below. Without it the last guess of every turn — and the
 * only guess of a clue of one — flips its card while the panel has already
 * jumped back to "Casey is thinking…", so her face never answers the guess she
 * just made. The store's `lastAiGuess` cannot carry that across on its own:
 * `runAiClue` nulls it the moment the phase turns over.
 *
 * The reasoning is the model's own (`prompts.ts` asks every entry for "why
 * THIS word and not another"), or the engine's templated one when the practice
 * companion is answering (E3, `engineCompanion.ts` — it names the riskiest
 * neutral out of the book's `why`). Nothing new is requested for this.
 *
 * NOTHING IS LEAKED BY SHOWING IT. This panel only paces guesses under the
 * PLAYER'S clue, and a guess is judged against the clue-giver's key — so the
 * key those sentences are read against is the player's own, which they are
 * looking at. Casey may name any word on the board here.
 *
 * The confidence phrases that used to open the line ("I'm quite sure about…")
 * are gone with this: the reasoning says the same thing better, and says it
 * before the guess instead of after it.
 */
export function AiTurnPanel({ game }: { game: GameState }) {
  const { aiBusy, aiGuessQueue, planForClueIndex, lastAiGuess } = useGame()
  const planReady = planForClueIndex === game.clueHistory.length
  const guessing = game.phase === 'aiGuessing' && planReady
  const next = aiGuessQueue[0]

  const [beat, setBeat] = useState<AiBeat>('think')

  // Every turn opens on the think beat. The plan arriving is what starts the
  // clock, so the reset hangs off `guessing` rather than off the phase: while
  // Casey is still working out what to guess this panel is in its waiting
  // state below, and there is nothing to pace yet.
  useEffect(() => {
    if (!guessing) setBeat('think')
  }, [guessing])

  const advance = useCallback(() => {
    if (!guessing) return
    const plan = beatPlan(beat, aiGuessQueue.length > 0)
    if (plan.step) useGame.getState().stepAiGuess()
    setBeat(plan.next)
  }, [guessing, beat, aiGuessQueue.length])

  // One timeout per beat rather than one interval per turn — the two beats are
  // different lengths, and a tap that hurries one has to restart the clock
  // rather than land mid-interval. `beat` changing is what re-runs this, so
  // the tap needs nothing of its own.
  useEffect(() => {
    if (!guessing) return
    const { delayMs } = beatPlan(beat, aiGuessQueue.length > 0)
    const t = setTimeout(advance, delayMs)
    return () => clearTimeout(t)
  }, [guessing, beat, aiGuessQueue.length, advance])

  // How the guess she just made landed. Read out of THIS clue's guesses, so a
  // `lastAiGuess` left over from another turn resolves to nothing rather than
  // to a stale result.
  const lastTurn = game.clueHistory[game.clueHistory.length - 1]
  const lastResult = lastAiGuess
    ? lastTurn?.guesses.find((g) => g.wordId === lastAiGuess.wordId)
    : undefined
  const lastWord = lastAiGuess ? game.words.find((w) => w.wordId === lastAiGuess.wordId) : undefined
  const revealed: Landed | null =
    lastAiGuess && lastWord && lastResult
      ? { da: lastWord.da, result: lastResult.result, reasoning: lastAiGuess.reasoning ?? '' }
      : null
  // One id per landed guess, so the latch below fires once for it however many
  // times this panel re-renders while it is up.
  const revealedId = revealed && lastAiGuess ? `${lastAiGuess.wordId}:${revealed.result}` : null

  const [held, setHeld] = useState<Landed | null>(null)
  // Deliberately NOT cleared when the effect's dependency changes, which is
  // the whole point of the ref: the turn ending nulls `lastAiGuess` and would
  // take an ordinary effect's cleanup — and the reveal beat with it — half a
  // frame after the beat began. Only unmounting stops it.
  const holdTimer = useRef<number | undefined>(undefined)
  // Layout, not effect: this runs in the same commit that flipped the card, so
  // there is no painted frame between the guess landing and the panel saying
  // so.
  useLayoutEffect(() => {
    if (!revealedId || !revealed) return
    setHeld(revealed)
    window.clearTimeout(holdTimer.current)
    holdTimer.current = window.setTimeout(() => setHeld(null), REVEAL_MS)
    // Keyed on the guess's ID ALONE, and `revealed` is deliberately not in the
    // list: it is a fresh object every render, so depending on it would
    // re-latch and re-time the hold on every one of them and the reveal would
    // never end. There is no eslint in this repo to argue with about that.
  }, [revealedId])
  useEffect(() => () => window.clearTimeout(holdTimer.current), [])

  // Casey's guesses are spoken (S1) — the sound setting already gates
  // `playWord` at the source, so there is nothing to check here. This is the
  // one sound in the app that does not follow directly from a tap: it follows
  // FROM one, several beats later, off the timer above — which is why the
  // composer primes the audio element on the Give-clue tap rather than relying
  // on this call to do it (see `primeWordAudio` in speak.ts). It hangs off
  // `lastAiGuess`, which changes exactly once per `stepAiGuess`, so the reveal
  // beat speaks the word once however many times this panel re-renders.
  useEffect(() => {
    if (!lastAiGuess) return
    const word = game.words.find((w) => w.wordId === lastAiGuess.wordId)
    if (word) void playWord(word.wordId, word.da)
  }, [lastAiGuess, game.words])

  // While the turn is being paced, the reveal belongs to the reveal beat — a
  // tap that hurries past it must take it off screen with the rest of the
  // beat. Once the turn is over there is no beat left to belong to, and what
  // is left of the hold is the reveal itself.
  const landed = !guessing || beat === 'reveal' ? held : null

  if ((game.phase === 'aiClueInput' || aiBusy) && !landed) {
    return (
      <div className="dock ai-panel">
        <div className="ai-say">
          <ClueyFace mood="thinking" className="cluey-mini" />
          <p className="ai-bubble thinking">
            <span className="dots" /> Casey is thinking…
          </p>
        </div>
        {/* The line's ROOM, rendered empty rather than omitted: the same two
            regions in every state is what keeps the face and the bubble at the
            same height while Casey thinks. A different class on purpose —
            ai-drive, live-drive and proxy-drive all treat `.ai-guess-line`
            as "a guess has been reported", and an empty one wearing that name
            would answer them with nothing. */}
        <p className="ai-line-blank" aria-hidden="true" />
      </div>
    )
  }

  if (game.phase !== 'aiGuessing' && !landed) return null

  // Which guess this pair of beats is ABOUT: the one she is choosing while she
  // thinks, the one she just named while it lands. The same sentence stands
  // across both, so what changes between them is the line under it — the
  // player is never asked to re-read the bubble to find out what happened.
  const said = (landed ? landed.reasoning : next?.reasoning)?.trim()
  const bubble = said || (next ? 'Let me look at the board again.' : 'That is as far as I dare go.')

  const mood: ClueyMood = !landed ? 'thinking' : landed.result === 'green' ? 'happy' : 'oops'

  return (
    <div
      className="dock ai-panel"
      // What is on SCREEN rather than what the clock thinks, because the
      // rectangle layout-drive compares per beat is a fact about the former —
      // and a reveal held past the end of the turn is still a reveal beat.
      data-beat={landed ? 'reveal' : 'think'}
      // Only while there is a turn left to hurry. During the held reveal the
      // beats are over, and a pointer cursor offering to skip nothing is a
      // control that does not exist.
      {...(guessing ? { 'data-hurry': '1', title: 'Tap to hurry Casey along' } : {})}
      onClick={guessing ? advance : undefined}
    >
      <div className="ai-say">
        <ClueyFace mood={mood} className="cluey-mini" />
        {/* Two lines, clamped, with the whole sentence as the title — the
            model's reasoning runs longer than a dock can hold and the part
            that gets cut is the end of an explanation, not a word the player
            needs. */}
        <p className="ai-bubble" title={bubble}>
          {bubble}
        </p>
      </div>
      {landed ? (
        <p className={`ai-guess-line result-${landed.result}`}>
          «<strong>{landed.da}</strong>»{landed.result === 'green' && ' — got one!'}
          {landed.result === 'bystander' && ' — neutral.'}
        </p>
      ) : (
        <p className="ai-guess-line">
          Casey is choosing {next ? 'a word' : 'whether to guess'}…
        </p>
      )}
    </div>
  )
}
