/**
 * The shared clue pool, as pips — and the count in words.
 *
 * `given` is clues SUBMITTED, which is one behind the clue being composed
 * during a clue-input phase. It is labelled "given" rather than shown as an
 * ordinal ("Clue 4 of 5") for exactly that reason: a player would read the
 * ordinal as the clue they are about to give and be off by one.
 *
 * The label is on this element, not on the pips, so a screen reader is handed
 * the same number the screen shows. It used to say only how many were LEFT,
 * which is the complement — recoverable, but only by arithmetic nobody should
 * have to do. It also used to say whether the last chance was open; there is
 * no last chance to be open, so the sentence is just the count now.
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
  return (
    <div className="turn-tokens" aria-label={`${given} of ${total} clues given, ${left} left.`}>
      {/* Drawn from `given`, not from `left`, so the pips and the sentence
          beneath them can never disagree.

          They used to come from turnsLeft, which the engine decrements when a
          turn ENDS rather than when a clue is given — so between submitting a
          clue and the guessing finishing, the screen read "1/6 clues given"
          above six untouched pips. Both numbers were true and the pair was
          not, and it reads as a clue that failed to register. */}
      <span className="token-row" aria-hidden="true">
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className={`token ${i < total - given ? 'token-full' : 'token-spent'}`} />
        ))}
      </span>
      <span className="token-count" aria-hidden="true">
        {given}/{total} clues given
      </span>
    </div>
  )
}
