import type { GameState } from '../../engine/types'
import { useGame } from '../../stores/gameStore'

interface Props {
  game: GameState
  onSubmit: (answers: Record<string, string>) => void
}

/** The one-chance translation challenge after a forbidden word is revealed. */
export function RedemptionView({ game, onSubmit }: Props) {
  // Persisted, not local: the redemption phase survives a reload, so the
  // answers must too. Losing twenty typed answers to a stray back gesture, in
  // the one round that cannot be replayed, is the worst loss in the game.
  const answers = useGame((s) => s.redemptionDraft)
  const setAnswer = useGame((s) => s.setRedemptionAnswer)
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
              onChange={(e) => setAnswer(w.wordId, e.target.value)}
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
