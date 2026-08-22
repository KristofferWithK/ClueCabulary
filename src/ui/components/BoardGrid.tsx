import { articleLabel, genderLabel } from '../../data/gender'
import type { CardRole, GameState, Reveal } from '../../engine/types'
import { isGuessable } from '../../engine/game'
import { ACTIVE } from '../../lang/active'
import { playWord } from '../speak'

interface Props {
  game: GameState
  translationsOn: boolean
  /** Player may tap cards to (pre-)select a guess right now. */
  canGuess: boolean
  selectedWordId: string | null
  onCardTap: (wordId: string) => void
  onInfoTap: (wordId: string) => void
  /** Dictionary access is locked during the wrap-up packing phase. */
  dictionaryLocked: boolean
  /**
   * Wrap-up rounds: which cards are still English-side up. An unpacked card
   * shows its gloss where the Danish goes — for the whole round, if it was
   * skipped: the English face is the visible mark of "cannot wrap this time".
   */
  englishFace?: (wordId: string) => boolean
  /**
   * Wrap-up rounds: which cards were NOT collected when the board was dealt
   * (W1's top-up). They play like any other card and count toward the win, but
   * nothing can pack them and `finishRound` cannot wrap them, so they carry a
   * quiet mark rather than a loud one — the player is not being refused
   * anything, and a card that shouts would make a topped-up board read as a
   * board full of mistakes.
   */
  notWrappable?: (wordId: string) => boolean
  /** Packing phase: unpacked cards are tappable to select for packing. */
  packingSelectable?: boolean
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
  if (r.against.length === 2) return ', neutral for both sides'
  return r.against[0] === 'player' ? ', neutral under your clues' : ", neutral under Casey's clues"
}

/**
 * Your own key — the private information you play from, like a Duet key card.
 * One mark, not two: the dashed border that said "forbidden on your key" is
 * gone with the cards it described.
 */
const keyText: Record<CardRole, string> = {
  green: ', your target',
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
  englishFace,
  notWrappable,
  packingSelectable,
}: Props) {
  return (
    <div
      className="board-grid"
      style={{
        gridTemplateColumns: `repeat(${game.config.cols}, 1fr)`,
        // Rows shrink together with the phase's dock: minmax(0, 1fr) lets a
        // short phone flatten the cards instead of scrolling the screen.
        gridTemplateRows: `repeat(${game.config.rows}, minmax(0, 1fr))`,
      }}
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
        const faceDown = englishFace?.(w.wordId) ?? false
        const noWrap = notWrappable?.(w.wordId) ?? false
        const packable = (packingSelectable ?? false) && faceDown
        // Outside a guessing turn (and outside packing) a tap's only job left
        // is to say the word — looking it up is ⓘ's alone now (U1). Kept as
        // its own flag rather than folded into `disabled` because it also
        // drives the aria hint below.
        const tapPlaysWord = !guessable && !packable && !dictionaryLocked

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
                faceDown ? 'card-face-en' : '',
                noWrap ? 'card-no-wrap' : '',
              ].join(' ')}
              disabled={!guessable && !tapPlaysWord && !packable}
              aria-label={
                faceDown
                  ? `${w.en[0]}${packable ? `, not yet packed. Tap to type the ${ACTIVE.name}` : ', unpacked'}${stateText(reveal)}`
                  : `${genderLabel(w) ? `${genderLabel(w)} ` : ''}${w.da}${showKey ? keyText[myRole] : ''}${stateText(reveal)}${
                      noWrap ? ', not yours to wrap yet' : ''
                    }${tapPlaysWord ? '. Tap to hear' : ''}`
              }
              aria-pressed={selectedWordId === w.wordId}
              onClick={() => {
                /**
                 * Tapping a word says it — the whole card, every time it is a
                 * live button, and nothing else. That used to be shared with a
                 * second job: outside a guessing turn, the same tap also opened
                 * the dictionary. The owner split them apart (U1) — "the
                 * translation and definition of the word should only appear if
                 * you click on the i symbol and not just the word. The audio
                 * should still play though" — because a card that plays sound
                 * AND opens a sheet on the same gesture cannot be told apart
                 * from a lookup, and the SRS was crediting `recordLookup` on a
                 * tap that only ever meant "say that again". Now ⓘ (`card-info`
                 * below) is the only door to the sheet, and hearing a word is
                 * free while reading its meaning is what costs a lookup.
                 *
                 * Not on a face-down card. There the English is showing and
                 * the Danish is what the player has to produce from memory, so
                 * saying it aloud would hand over the one thing the packing
                 * phase exists to withhold — the same reasoning PackingDock
                 * gives for only speaking on a hit.
                 *
                 * `playWord` checks the sound setting itself and falls back to
                 * the device voice when a clip is missing, so there is nothing
                 * to gate here.
                 */
                if (!faceDown) void playWord(w.wordId, w.da)
                if (guessable || packable) onCardTap(w.wordId)
              }}
            >
              {/* No dot: the card's own border carries your key — solid green
                  for a target — and two marks saying one thing was one too
                  many. The border differs by style as well as colour, so it
                  does not rest on colour alone, and the accessible name says
                  it outright. (There was a dashed black border here too, for
                  a word forbidden on your key. Both are gone.) */}
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
              {faceDown ? (
                // The English face: what a card looks like before it is packed.
                // Same slot and sizing as the Danish, so the board keeps its
                // shape as cards flip.
                <span className="card-da">
                  <span className="card-word card-word-en">{w.en[0]}</span>
                </span>
              ) : (
                <span className="card-da" lang={ACTIVE.code}>
                  {articleLabel(w) && <span className="card-article">{articleLabel(w)}</span>}
                  {/* The Danish word alone, so a selector can still ask for it
                      without the article coming along in the text. */}
                  <span className="card-word">{w.da}</span>
                </span>
              )}
              {!faceDown && (translationsOn || reveal.kind === 'green') && (
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
