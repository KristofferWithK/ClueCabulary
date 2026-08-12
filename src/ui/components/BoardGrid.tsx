import type { CardRole, GameState, Reveal } from '../../engine/types'
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

const revealKind = (game: GameState, wordId: string): string => {
  const r = game.reveals[wordId]!
  if (r.kind !== 'bystander') return r.kind
  return r.against.length === 2 ? 'bystander-both' : `bystander-${r.against[0]}`
}

/** Reveal state spelled out for assistive tech — color alone is not enough. */
const stateText = (r: Reveal): string => {
  if (r.kind === 'hidden') return ''
  if (r.kind === 'green') return ', found'
  if (r.kind === 'forbidden') return ', forbidden'
  if (r.against.length === 2) return ', neutral for both sides'
  return r.against[0] === 'player' ? ', neutral under your clues' : ", neutral under Klaus's clues"
}

/** Your own key — the private information you play from, like a Duet key card. */
const keyText: Record<CardRole, string> = {
  green: ', your target',
  forbidden: ', forbidden on your key',
  bystander: '',
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
        const reveal = game.reveals[w.wordId]!
        const kind = revealKind(game, w.wordId)
        const guessable = canGuess && isGuessable(game, w.wordId)
        const myRole = game.playerKey[w.wordId]!
        // Once a word is globally revealed its key role is spent; while it is
        // still in play (hidden, or neutral in only one direction) you need to
        // see it to give clues.
        const showKey = reveal.kind === 'hidden' || reveal.kind === 'bystander'
        // Outside your guessing turn a tap has nothing else to do, so let the
        // whole card open the dictionary rather than hiding that behind ⓘ.
        const tapLooksUp = !guessable && !dictionaryLocked

        return (
          <div key={w.wordId} className={`word-card-wrap wrap-${kind}`}>
            <button
              className={[
                'word-card',
                `card-${kind}`,
                guessable ? 'card-guessable' : '',
                selectedWordId === w.wordId ? 'card-selected' : '',
                showKey ? `mykey-${myRole}` : '',
              ].join(' ')}
              disabled={!guessable && !tapLooksUp}
              aria-label={`${w.da}${showKey ? keyText[myRole] : ''}${stateText(reveal)}${
                tapLooksUp ? '. Tap to look up' : ''
              }`}
              aria-pressed={selectedWordId === w.wordId}
              onClick={() => {
                if (guessable) onCardTap(w.wordId)
                else if (tapLooksUp) onInfoTap(w.wordId)
              }}
            >
              {showKey && myRole !== 'bystander' && (
                <span className="key-mark" aria-hidden="true">
                  {myRole === 'green' ? '●' : '✖'}
                </span>
              )}
              <span className="card-da" lang="da">
                {w.da}
              </span>
              {(translationsOn || reveal.kind === 'green') && (
                <span className="card-en">{w.en[0]}</span>
              )}
              {reveal.kind === 'bystander' && (
                <span className="card-mark" aria-hidden="true">
                  ✕
                </span>
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
