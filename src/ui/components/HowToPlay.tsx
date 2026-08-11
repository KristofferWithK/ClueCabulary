import { useUi } from '../../stores/uiStore'

export function HowToPlay() {
  const open = useUi((s) => s.howToOpen)
  const close = useUi((s) => s.closeHowTo)
  if (!open) return null

  return (
    <div className="howto-backdrop" onClick={close}>
      <div className="howto" onClick={(e) => e.stopPropagation()}>
        <h2>How to Play</h2>
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
            Green guesses keep the turn going. A neutral word ends the turn and spends one of the
            shared clue tokens shown at the top.
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
