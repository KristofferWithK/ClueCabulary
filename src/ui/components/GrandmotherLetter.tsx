import { LETTER } from '../../journey/letter'
import { useUi } from '../../stores/uiStore'
import { useDialog } from '../useDialog'

/**
 * The frame the whole journey hangs on, and the first screen a new player sees:
 * before the rules, before the board, a letter. It is a full screen rather than
 * a dialog because it is not an interruption — it is the beginning.
 */
export function GrandmotherLetter() {
  const open = useUi((s) => s.letterOpen)
  const close = useUi((s) => s.closeLetter)
  // Focus in, Tab kept inside, Escape closes, focus restored on the way out.
  // The ref goes on the whole screen so the set-off button is inside the trap.
  const ref = useDialog(open, close)

  if (!open) return null

  return (
    <div
      className="letter-screen"
      role="dialog"
      aria-modal="true"
      aria-labelledby="letter-from"
      tabIndex={-1}
      ref={ref}
    >
      <div className="letter-scroll">
        <div className="letter">
          <p className="letter-stamp" aria-hidden="true">
            ✉
          </p>
          <p className="letter-salutation" lang="da">
            {LETTER.salutation}
          </p>
          {LETTER.body.map((para, i) => (
            <p key={i} className="letter-para">
              {para}
            </p>
          ))}
          <p className="letter-signoff" lang="da">
            {LETTER.signoff}
          </p>
          <p className="letter-from" id="letter-from">
            {LETTER.from}
          </p>
          <p className="letter-ps">
            <span className="letter-ps-label">P.S.</span> {LETTER.postscript}
          </p>
        </div>
      </div>

      <button className="btn btn-primary btn-big letter-go" onClick={close}>
        <span lang="da">Tag afsted</span> — set off
      </button>
    </div>
  )
}
