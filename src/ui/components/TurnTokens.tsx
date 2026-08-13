import { REDEMPTION_AFTER_ROUND } from '../../engine/config'

/**
 * The shared clue pool, as pips — and, once a rule started turning on it, the
 * count in words.
 *
 * `given` is clues SUBMITTED, which is one behind the clue being composed
 * during a clue-input phase. It is labelled "given" rather than shown as an
 * ordinal ("Clue 4 of 5") for exactly that reason: a player deciding how risky
 * a clue to give would read the ordinal as the clue they are about to give and
 * be off by one about whether the last chance is open.
 *
 * The label is on this element, not on the pips, so a screen reader is handed
 * the same number the screen shows. It used to say only how many were LEFT,
 * which is the complement — recoverable, but only by arithmetic nobody should
 * have to do about a rule.
 */
export function TurnTokens({
  total,
  left,
  given,
}: {
  total: number
  left: number
  given: number
}) {
  const lastChanceOpen = given > REDEMPTION_AFTER_ROUND
  return (
    <div
      className="turn-tokens"
      aria-label={
        `${given} of ${total} clues given, ${left} left. ` +
        (lastChanceOpen
          ? 'The last chance is open.'
          : `The last chance opens after ${REDEMPTION_AFTER_ROUND}.`)
      }
    >
      <span className="token-row" aria-hidden="true">
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className={`token ${i < left ? 'token-full' : 'token-spent'}`} />
        ))}
      </span>
      <span className="token-count" aria-hidden="true">
        {given}/{total} clues given
      </span>
    </div>
  )
}
