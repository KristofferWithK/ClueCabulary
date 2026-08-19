import { useUi } from '../../stores/uiStore'
import { useDialog } from '../useDialog'

export function HowToPlay() {
  const open = useUi((s) => s.howToOpen)
  const close = useUi((s) => s.closeHowTo)
  const dialogRef = useDialog(open, close)
  if (!open) return null

  return (
    <div className="howto-backdrop" onClick={close}>
      <div
        className="howto"
        role="dialog"
        aria-modal="true"
        aria-labelledby="howto-title"
        tabIndex={-1}
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="howto-title">How to Play</h2>
        <p className="howto-sub">
          Find every green word with Cluey, your AI partner — and learn Danish on the way.
        </p>

        {/* Two tiles, and now they are the entire vocabulary of the board: a
            target and a neutral are the only things a card can be. A third,
            black one used to stand here for a card that ended the round on the
            spot, which is why rule 1 says outright that there is no third kind
            — anyone who played the old game is looking for it. */}
        <div className="howto-tiles" aria-hidden="true">
          <span className="demo-tile demo-green">hund</span>
          <span className="demo-tile demo-beige">vej</span>
        </div>

        <ol>
          <li>
            The board is a grid of Danish words. You and Cluey each hold a secret key: on it some
            words are <strong>green</strong> — your targets — and the rest are neutral. There is
            no third kind of card, and the two keys differ.
          </li>
          <li>
            Take turns: you give a one-word clue and Cluey guesses, then he clues and you guess.
            Every guess is judged against the <em>clue-giver's</em> key, so while you are guessing
            it is <em>his</em> greens that count — and he never sees yours.
          </li>
          <li>
            The number that comes with a clue is the allowance: name that many right and the turn
            ends itself. A neutral ends it sooner, and you can stop early and keep what you have.
            Every turn spends one shared clue token (the dots at the top), however it ends — which
            is the whole cost of a wrong tap, and the reason the clock is what beats you.
          </li>
          <li>
            A neutral is spent only for the side that hit it. A word Cluey burned while guessing
            your clue can still be green on his own key, so it is crossed out for him and back in
            play the moment he is the one cluing.
          </li>
          <li>
            <strong>Sudden death</strong>: when the tokens run out the clues stop but the board
            does not. Keep naming green words — either key counts now — and you can still win it.
            Name anything else and the round is over.
          </li>
          <li>
            Nothing connects? Before the first clue, <strong lang="da">Nye ord</strong> deals a
            different board of the same size — nothing has been spent yet, and the words you turned
            down do not come back on it. Any time, tap <strong>ⓘ</strong> on a word for the
            dictionary or <strong>Aa</strong> to show every translation; each lookup tells the app
            which words to bring back.
          </li>
          <li>
            You are travelling Denmark, south to north and home to København, with{' '}
            <strong>Cluey the suitcase</strong> carrying every word you learn. Each city holds{' '}
            <strong>100 words</strong>. A word you meet is <em>discovered</em>; clue it once{' '}
            <em>and</em> guess it once — a green earned each way — and it is{' '}
            <strong>collected</strong> into the case.
          </li>
          <li>
            Collected words still break on the road. <strong>Wrap-up rounds</strong> pack them
            safely: a big board dealt from your collected words, every card starting in{' '}
            <em>English</em>. Type the Danish to pack a card before the clues begin — skip one and
            it plays on, English-side up, but cannot be wrapped that round. Every packed word
            found green is <strong>wrapped</strong> for good, win or lose. Wrap all hundred and
            the road onward opens.
          </li>
        </ol>

        <button className="btn btn-primary" onClick={close}>
          Play
        </button>
      </div>
    </div>
  )
}
