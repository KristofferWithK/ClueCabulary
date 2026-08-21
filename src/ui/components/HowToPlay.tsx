import { useUi } from '../../stores/uiStore'
import { useDialog } from '../useDialog'
import { ACTIVE } from '../../lang/active'

/**
 * The reference card behind ? — and nothing more (O4). Onboarding owns
 * first-run now: the train teaches the game a beat at a time, so the eight
 * paragraphs that used to stand here are trimmed to the four rules a mid-round
 * player wants back at a glance, and the door to hearing the whole thing again.
 * This overlay never opens itself; the ? buttons are its only doors.
 *
 * Closing it still writes HOWTO_KEY (uiStore.closeHowTo). The key outlives the
 * long overlay it was built for because the onboarding gate reads it as proof
 * a device predates the intro (src/onboarding/flow.ts) — see the comment on
 * HOWTO_KEY itself.
 */
export function HowToPlay() {
  const open = useUi((s) => s.howToOpen)
  const close = useUi((s) => s.closeHowTo)
  const startOnboarding = useUi((s) => s.startOnboarding)
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
          Find every green word with Casey, your AI partner — and learn {ACTIVE.name} on the way.
        </p>

        {/* Two tiles, and they are the entire vocabulary of the board: a
            target and a neutral are the only things a card can be. A third,
            black one used to stand here for a card that ended the round on the
            spot, which is why rule 1 says outright that there is no third kind
            — anyone who played the old game is looking for it. */}
        <div className="howto-tiles" aria-hidden="true">
          <span className="demo-tile demo-green">hund</span>
          <span className="demo-tile demo-beige">vej</span>
        </div>

        {/* Four short rules. The clue-giver's-key rule is stated ONCE, and
            forwards — the wording game.test.ts pins ("a guess is judged
            against the clue-giver's key"), never a per-phase paraphrase: this
            rule has been written backwards in copy six times in this repo. */}
        <ol>
          <li>
            You and Casey each hold a secret key: on it some words are <strong>green</strong> —
            targets — and the rest are neutral. The two keys differ, and there is no third kind of
            card.
          </li>
          <li>
            Take turns cluing and guessing: one {ACTIVE.name} word and a number. A guess is judged
            against the <em>clue-giver's</em> key — whoever gave the clue, their greens are the
            ones that count.
          </li>
          <li>
            Every turn spends one clue token, however it ends. Out of tokens is{' '}
            <strong>sudden death</strong>: keep naming greens — either key counts there — and
            anything else ends the round.
          </li>
          <li>
            Clue a word once <em>and</em> guess it once — a green each way — and it is{' '}
            <strong>collected</strong> into the case. Wrap-up rounds pack collected words for
            good; wrap all hundred and the road onward opens.
          </li>
        </ol>

        {/* The rest of the teaching lives in the intro, so the card only has
            to offer the way back to it. A transient re-run — the done flag
            stays (uiStore.startOnboarding); closing first so the overlay is
            not still standing over the train. */}
        <button
          className="btn howto-replay"
          onClick={() => {
            close()
            startOnboarding()
          }}
        >
          Replay the intro
        </button>
        <button className="btn btn-primary" onClick={close}>
          Play
        </button>
      </div>
    </div>
  )
}
