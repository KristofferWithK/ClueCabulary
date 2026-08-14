import { REDEMPTION_AFTER_ROUND } from '../../engine/config'
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
            A clue comes with a number, and that number is the allowance: guess that many right
            and the turn ends itself. A neutral word ends it sooner, and you can always stop early
            and keep what you have. Every clue spends one shared token (the dots at the top),
            however the turn ends.
          </li>
          <li>
            A neutral is only spent for the side that hit it. A word Klaus burned may still be
            green on <em>his</em> key — and his key is the one that scores while you are guessing,
            so spent words are crossed out and the rest are still yours to take.
          </li>
          <li>
            <strong>Forbidden words cut one way at a time</strong>, because a guess is judged on
            the clue-giver's key. The dashed cards are forbidden on <em>your</em> key: safe for you
            to tap, but never lead Klaus to one with your clue. While you guess <em>his</em> clue
            it is <em>his</em> forbidden words that end the round — and you cannot see those.
          </li>
          <li>
            Once <strong>{REDEMPTION_AFTER_ROUND} clues</strong> have been given, a forbidden word
            leaves one last chance instead of ending it: translate every unsolved word on the
            board. All correct — the game is redeemed. Any miss — it's lost.
          </li>
          <li>
            When the clues run out the board stays open. Keep naming green words and you can still
            win it; name anything else and the round is over — a forbidden word included, with no
            last chance out there.
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
            You are travelling Denmark, south to north and home to København. Each city holds{' '}
            <strong>100 words</strong>. A word you meet turns grey; clue or guess it{' '}
            <strong>three times</strong> and it turns <strong>green</strong>.
          </li>
          <li>
            Every ten green words buys one attempt at a <strong lang="da">rejseprøve</strong>:
            twenty words — your green ones first, then whatever the paper needs to fill up —
            translated to English with no mistakes and no dictionary. Drawing the paper spends
            the attempt whether you pass or fail, so take it when you are ready. Passing banks
            those twenty and earns a <strong lang="da">stempel</strong>; five stempler fill your{' '}
            <span lang="da">rejsepas</span> and open the road north. Once ninety of a city's
            hundred words are green it stops counting attempts altogether.
          </li>
        </ol>

        <button className="btn btn-primary" onClick={close}>
          Play
        </button>
      </div>
    </div>
  )
}
