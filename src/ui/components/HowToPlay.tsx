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

        {/* Two tiles, not three: the black one demonstrated a forbidden word.
            Card A2 owns the constructive rewrite of this overlay — this pass
            only takes out the sentences that are now untrue. */}
        <div className="howto-tiles" aria-hidden="true">
          <span className="demo-tile demo-green">hund</span>
          <span className="demo-tile demo-beige">vej</span>
        </div>

        <ol>
          <li>
            The board is a grid of Danish words. You and Cluey each hold a secret key: some words
            are <strong>green</strong> (targets) and the rest are neutral.
          </li>
          <li>
            Take turns: you give a one-word clue and Cluey guesses — then Cluey clues and you
            guess. A guess is judged against the <em>clue-giver's</em> key, so Cluey can never
            peek at yours.
          </li>
          <li>
            A clue comes with a number, and that number is the allowance: guess that many right
            and the turn ends itself. A neutral word ends it sooner, and you can always stop early
            and keep what you have. Every clue spends one shared token (the dots at the top),
            however the turn ends.
          </li>
          <li>
            A neutral is only spent for the side that hit it. A word Cluey burned may still be
            green on <em>his</em> key — and his key is the one that scores while you are guessing,
            so spent words are crossed out and the rest are still yours to take.
          </li>
          <li>
            When the clues run out the board stays open. Keep naming green words and you can still
            win it; name anything else and the round is over.
          </li>
          <li>
            Nothing on the board connects? Before you give the first clue, <strong lang="da">
            Nye ord
            </strong>{' '}
            deals a different board of the same size. It costs nothing — no clue has been given
            yet — and the words you turned down do not come back on it.
          </li>
          <li>
            Tap <strong>ⓘ</strong> on a word for the dictionary, or <strong>Aa</strong> to show all
            translations. Every lookup tells the app which words to bring back next round.
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
