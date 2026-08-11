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
          Find every green word with Klaus, your AI partner — and learn Danish on the way.
        </p>

        <div className="howto-tiles" aria-hidden="true">
          <span className="demo-tile demo-green">hund</span>
          <span className="demo-tile demo-beige">vej</span>
          <span className="demo-tile demo-black">nat</span>
        </div>

        <ol>
          <li>
            The board is a grid of Danish words. You and Klaus each hold a secret key: some words
            are <strong>green</strong> (targets), most are neutral, a few are{' '}
            <strong>forbidden</strong>.
          </li>
          <li>
            Take turns: you give a one-word clue and Klaus guesses — then Klaus clues and you
            guess. A guess is judged against the <em>clue-giver's</em> key, so Klaus can never
            peek at yours.
          </li>
          <li>
            A clue comes with a number: the guesser gets at most that many guesses plus one bonus.
            Green guesses keep the turn alive up to that cap; a neutral word ends it at once.
            Every clue spends one shared token (the dots at the top), however the turn ends.
          </li>
          <li>
            Hit a <strong>forbidden</strong> word and one chance remains: translate every unsolved
            word on the board. All correct — the game is redeemed. Any miss — it's lost.
          </li>
          <li>
            Tap <strong>ⓘ</strong> on a word for the dictionary, or <strong>Aa</strong> to show all
            translations. Every lookup tells the app which words to bring back next round.
          </li>
        </ol>

        <button className="btn btn-primary" onClick={close}>
          Play
        </button>
      </div>
    </div>
  )
}
