import { readLedger, useLedger } from '../../stores/ledgerStore'

/**
 * The clue ledger, in Settings (docs/clue-engine.md §6 Stage 4).
 *
 * One line per arm that has ever given Casey's clue: how many clues, how many
 * of the words it asked for the player actually found, and — for the arms that
 * can be refused — how often its first reply was thrown out by the app's own
 * validator. That last column is `r`, the number `proxy/README.md` records as
 * never measured and the whole cascade arithmetic turns on.
 *
 * Deliberately plain and deliberately dull. It is a diagnostic the owner reads
 * to decide a proxy deploy, not a score the player is meant to chase — nothing
 * here appears anywhere near a round.
 */
/** The arms that answer without asking anything, and so cannot be refused. */
const OFFLINE_ARMS = new Set(['engine', 'mock'])

export function ClueLedgerPanel() {
  const arms = useLedger((s) => s.arms)
  const clear = useLedger((s) => s.clear)
  const rows = readLedger(arms)

  if (rows.length === 0) {
    return (
      <p className="ledger-empty">
        Nothing yet. A line appears here for each of Casey’s clues once you have
        finished guessing under it.
      </p>
    )
  }

  const pct = (x: number | null) => (x === null ? '—' : `${Math.round(100 * x)}%`)

  return (
    <div className="clue-ledger">
      <table>
        <thead>
          <tr>
            <th>arm</th>
            <th>clues</th>
            <th>found</th>
            <th>refused</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.arm}>
              <td>{r.arm}</td>
              <td>{r.tally.clues}</td>
              <td title={`${r.tally.hits} of ${r.tally.asked} words asked for`}>
                {pct(r.hitsPerNumber)}
              </td>
              {/* The offline arms have no validator loop to lose, so a 0 there
                  would read as "never refused" rather than "cannot be". */}
              <td title="How often this arm’s first reply was rejected — r">
                {OFFLINE_ARMS.has(r.arm) ? '—' : pct(r.refusalRate)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <small>
        “found” is the share of the words a clue asked for that you actually
        turned over. “refused” is how often the model’s first answer was thrown
        out and asked again — the offline arms cannot be refused.
      </small>
      <button className="btn" onClick={clear}>
        Clear the ledger
      </button>
    </div>
  )
}
