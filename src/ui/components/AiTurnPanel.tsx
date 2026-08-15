import { useEffect } from 'react'
import { currentClue } from '../../engine/game'
import type { GameState } from '../../engine/types'
import { useGame } from '../../stores/gameStore'
import { ClueyFace, type ClueyMood } from './Cluey'

const GUESS_INTERVAL_MS = 1100

const confidencePhrase = (c: number): string => {
  if (c >= 0.75) return "I'm quite sure about"
  if (c >= 0.5) return "I'm fairly confident about"
  if (c >= 0.35) return "I'll take a careful shot at"
  return "I'm really just guessing"
}

/** Shows the AI side of a turn and paces its guesses one by one. */
export function AiTurnPanel({ game }: { game: GameState }) {
  const { aiBusy, aiGuessQueue, planForClueIndex, lastAiGuess, stepAiGuess } = useGame()
  const clue = currentClue(game)
  const planReady = planForClueIndex === game.clueHistory.length

  useEffect(() => {
    if (game.phase !== 'aiGuessing' || !planReady) return
    const t = setInterval(() => useGame.getState().stepAiGuess(), GUESS_INTERVAL_MS)
    return () => clearInterval(t)
  }, [game.phase, planReady, stepAiGuess])

  if (game.phase === 'aiClueInput' || aiBusy) {
    return (
      <div className="dock ai-panel">
        <ClueyFace mood="thinking" className="cluey-mini" />
        <p className="thinking">
          <span className="dots" /> Cluey is thinking…
        </p>
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
      <ClueyFace mood={mood} className="cluey-mini" />
      <p className="dock-title">
        Your clue: <strong>«{clue.text}»</strong> ({clue.number})
      </p>
      {lastAiGuess && lastWord && lastResult ? (
        <p className={`ai-guess-line result-${lastResult.result}`}>
          {confidencePhrase(lastAiGuess.confidence)} <strong>{lastWord.da}</strong>
          {lastResult.result === 'green' && ' — got one!'}
          {lastResult.result === 'bystander' && ' — ouch, neutral.'}
          {lastResult.result === 'forbidden' && ' — oh no.'}
        </p>
      ) : (
        <p className="ai-guess-line">
          Cluey is choosing {aiGuessQueue.length > 0 ? 'a word' : 'whether to guess'}…
        </p>
      )}
    </div>
  )
}
