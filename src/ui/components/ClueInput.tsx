import { useState } from 'react'
import { checkClueLegality } from '../../engine/legality'
import type { GameState } from '../../engine/types'

interface Props {
  game: GameState
  onSubmit: (text: string, number: number) => void
}

export function ClueInput({ game, onSubmit }: Props) {
  const [text, setText] = useState('')
  const [number, setNumber] = useState(2)

  const trimmed = text.trim()
  const verdict = trimmed ? checkClueLegality(trimmed, game.words) : null
  const canSubmit = trimmed.length > 0 && verdict?.legal === true

  return (
    <div className="dock clue-input">
      <p className="dock-title">Your clue — one word for Klaus to guess by</p>
      <div className="clue-row">
        <input
          type="text"
          value={text}
          placeholder="fx: dyreliv"
          autoCapitalize="off"
          autoComplete="off"
          enterKeyHint="done"
          onChange={(e) => setText(e.target.value)}
        />
        <div className="stepper">
          <button
            aria-label="fewer words"
            onClick={() => setNumber((n) => Math.max(1, n - 1))}
          >
            −
          </button>
          <span className="stepper-value">{number}</span>
          <button aria-label="more words" onClick={() => setNumber((n) => Math.min(4, n + 1))}>
            +
          </button>
        </div>
      </div>
      {verdict && !verdict.legal && <p className="clue-error">{verdict.reason}</p>}
      <button
        className="btn btn-primary"
        disabled={!canSubmit}
        onClick={() => {
          onSubmit(trimmed, number)
          setText('')
        }}
      >
        Give clue
      </button>
    </div>
  )
}
