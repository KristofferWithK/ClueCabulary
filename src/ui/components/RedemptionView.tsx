import { useState } from 'react'
import type { GameState } from '../../engine/types'

interface Props {
  game: GameState
  onSubmit: (answers: Record<string, string>) => void
}

/** The one-chance translation challenge after a forbidden word is revealed. */
export function RedemptionView({ game, onSubmit }: Props) {
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const prompted = game.words.filter((w) => game.redemption?.promptWordIds.includes(w.wordId))
  const filled = prompted.filter((w) => (answers[w.wordId] ?? '').trim().length > 0).length

  return (
    <div className="redemption">
      <h2>⚠ Forbidden word!</h2>
      <p className="redemption-intro">
        One chance remains: translate every unsolved word on the board into English. All of them.
        The dictionary is locked.
      </p>
      <div className="redemption-list">
        {prompted.map((w) => (
          <label key={w.wordId} className="redemption-item">
            <span className="redemption-da" lang="da">
              {w.da}
            </span>
            <input
              type="text"
              value={answers[w.wordId] ?? ''}
              placeholder="English…"
              autoCapitalize="off"
              autoComplete="off"
              onChange={(e) => setAnswers((a) => ({ ...a, [w.wordId]: e.target.value }))}
            />
          </label>
        ))}
      </div>
      <p className="redemption-progress">
        {filled} / {prompted.length} answered
      </p>
      <button className="btn btn-danger" onClick={() => onSubmit(answers)}>
        Submit — win or lose
      </button>
    </div>
  )
}
