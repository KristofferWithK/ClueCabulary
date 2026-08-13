import { articleLabel, genderLabel } from '../../data/gender'
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
                // A neutral is burned only against the side that hit it, so on
                // your turn some beige cards are still live and some are spent.
                // The two tints differ by ~1.35:1 — far too little to read on a
                // phone — so say it outright while it matters.
                canGuess && reveal.kind === 'bystander'
                  ? guessable
                    ? 'card-still-live'
                    : 'card-spent'
                  : '',
                selectedWordId === w.wordId ? 'card-selected' : '',
                showKey ? `mykey-${myRole}` : '',
              ].join(' ')}
              disabled={!guessable && !tapLooksUp}
              aria-label={`${genderLabel(w) ? `${genderLabel(w)} ` : ''}${w.da}${showKey ? keyText[myRole] : ''}${stateText(reveal)}${
                tapLooksUp ? '. Tap to look up' : ''
              }`}
              aria-pressed={selectedWordId === w.wordId}
              onClick={() => {
                if (guessable) onCardTap(w.wordId)
                else if (tapLooksUp) onInfoTap(w.wordId)
              }}
            >
              {/* No dot: the card's own border carries your key — solid green
                  for a target, dashed black for forbidden — and two marks
                  saying one thing was one too many. The border differs by
                  style as well as colour, so it does not rest on colour alone,
                  and the accessible name says it outright. */}
              {/* Gender in front of the word, where it is read — "et hus", the
                  way the pair is actually learned. It rode in the top strip
                  for one build because it costs nothing there, and it was too
                  easy to miss.
                  It is not free here: a 4-wide board at 360px leaves the word
                  64px and an inline "en" takes about 13 of them, so 71 of the
                  430 nouns gain a second line. Measured across the whole set,
                  none is clipped — the article is small, the strip's old
                  padding came back when the key dot went, and the word is now
                  sized off the card rather than the viewport. */}
              <span className="card-da" lang="da">
                {articleLabel(w) && <span className="card-article">{articleLabel(w)}</span>}
                {/* The Danish word alone, so a selector can still ask for it
                    without the article coming along in the text. */}
                <span className="card-word">{w.da}</span>
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
