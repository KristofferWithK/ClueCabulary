import { useEffect } from 'react'
import { currentClue } from '../../engine/game'
import type { GameState } from '../../engine/types'
import { useGame } from '../../stores/gameStore'
import { playWord } from '../speak'
import { ClueyFace, type ClueyMood } from './Cluey'

const GUESS_INTERVAL_MS = 1100

const confidencePhrase = (c: number): string => {
  if (c >= 0.75) return "I'm quite sure about"
  if (c >= 0.5) return "I'm fairly confident about"
  if (c >= 0.35) return "I'll take a careful shot at"
  return "I'm really just guessing"
}

/**
 * Shows the AI side of a turn and paces its guesses one by one.
 *
 * Two regions, one height (K2), and the shape is chosen for what comes next
 * rather than for what is in it today: Casey's face beside a bubble clamped to
 * TWO lines, then one line for the clue and how the last guess landed. Today
 * the bubble restates the clue it is guessing against; U3 puts the model's own
 * reasoning there, which is why it is two lines and clamped rather than one
 * line ellipsized. Nothing here may add a third region — the dock is --dock-h
 * like every other one, and the board's size in every phase of the round is
 * that number.
 */
export function AiTurnPanel({ game }: { game: GameState }) {
  const { aiBusy, aiGuessQueue, planForClueIndex, lastAiGuess, stepAiGuess } = useGame()
  const clue = currentClue(game)
  const planReady = planForClueIndex === game.clueHistory.length

  useEffect(() => {
    if (game.phase !== 'aiGuessing' || !planReady) return
    const t = setInterval(() => useGame.getState().stepAiGuess(), GUESS_INTERVAL_MS)
    return () => clearInterval(t)
  }, [game.phase, planReady, stepAiGuess])

  // Casey's guesses are spoken (S1) — the sound setting already gates
  // `playWord` at the source, so there is nothing to check here. This is the
  // one sound in the app that does not follow directly from a tap: it follows
  // FROM one, several beats later, off the `setInterval` above — which is why
  // the composer primes the audio element on the Give-clue tap rather than
  // relying on this call to do it (see `primeWordAudio` in speak.ts).
  useEffect(() => {
    if (!lastAiGuess) return
    const word = game.words.find((w) => w.wordId === lastAiGuess.wordId)
    if (word) void playWord(word.wordId, word.da)
  }, [lastAiGuess, game.words])

  if (game.phase === 'aiClueInput' || aiBusy) {
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

  if (game.phase !== 'aiGuessing' || !clue) return null

  const lastResult = lastAiGuess
    ? game.clueHistory[game.clueHistory.length - 1]!.guesses.find(
        (g) => g.wordId === lastAiGuess.wordId,
      )
    : undefined
  const lastWord = lastAiGuess ? game.words.find((w) => w.wordId === lastAiGuess.wordId) : undefined
  // How the last guess landed is already computed for the sentence below; the
  // face reads the same variable rather than deriving anything of its own.
  const mood: ClueyMood = !lastResult
    ? 'thinking'
    : lastResult.result === 'green'
      ? 'happy'
      : 'oops'

  return (
    <div className="dock ai-panel">
      <div className="ai-say">
        <ClueyFace mood={mood} className="cluey-mini" />
        {/* Two lines, clamped, with the whole text as the title — the shape
            U3's reasoning arrives into. What stands in it until then is the
            clue Casey is guessing against, which used to be a .dock-title of
            its own row. */}
        <p className="ai-bubble" title={`Your clue: «${clue.text}» (${clue.number})`}>
          Your clue: <strong>«{clue.text}»</strong> ({clue.number})
        </p>
      </div>
      {lastAiGuess && lastWord && lastResult ? (
        <p className={`ai-guess-line result-${lastResult.result}`}>
          {confidencePhrase(lastAiGuess.confidence)} <strong>{lastWord.da}</strong>
          {lastResult.result === 'green' && ' — got one!'}
          {lastResult.result === 'bystander' && ' — ouch, neutral.'}
        </p>
      ) : (
        <p className="ai-guess-line">
          Casey is choosing {aiGuessQueue.length > 0 ? 'a word' : 'whether to guess'}…
        </p>
      )}
    </div>
  )
}
