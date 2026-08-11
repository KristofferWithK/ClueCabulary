import type { GameState } from '../../engine/types'
import { isGuessable } from '../../engine/game'

interface Props {
  game: GameState
  translationsOn: boolean
  /** Player may tap cards to (pre-)select a guess right now. */
  canGuess: boolean
  selectedWordId: string | null
  onCardTap: (wordId: string) => void
  onInfoTap: (wordId: string) => void
  /** Dictionary access is locked during redemption. */
  dictionaryLocked: boolean
}

const revealClass = (game: GameState, wordId: string): string => {
  const r = game.reveals[wordId]!
  if (r.kind === 'hidden') return 'card-hidden'
  if (r.kind === 'green') return 'card-green'
  if (r.kind === 'forbidden') return 'card-forbidden'
  return r.against.length === 2 ? 'card-bystander-both' : `card-bystander-${r.against[0]}`
}

export function BoardGrid({
  game,
  translationsOn,
  canGuess,
  selectedWordId,
  onCardTap,
  onInfoTap,
  dictionaryLocked,
}: Props) {
  return (
    <div
      className="board-grid"
      style={{ gridTemplateColumns: `repeat(${game.config.cols}, 1fr)` }}
    >
      {game.words.map((w) => {
        const revealed = game.reveals[w.wordId]!.kind
        const guessable = canGuess && isGuessable(game, w.wordId)
        return (
          <div key={w.wordId} className="word-card-wrap">
            <button
              className={[
                'word-card',
                revealClass(game, w.wordId),
                guessable ? 'card-guessable' : '',
                selectedWordId === w.wordId ? 'card-selected' : '',
              ].join(' ')}
              onClick={() => guessable && onCardTap(w.wordId)}
            >
              <span className="card-da">{w.da}</span>
              {(translationsOn || revealed === 'green') && (
                <span className="card-en">{w.en[0]}</span>
              )}
            </button>
            {!dictionaryLocked && (
              <button
                className="card-info"
                aria-label={`Look up ${w.da}`}
                onClick={() => onInfoTap(w.wordId)}
              >
                ⓘ
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}
