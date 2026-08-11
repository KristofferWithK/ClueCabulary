import type { GameState } from '../../engine/types'
import { useGame } from '../../stores/gameStore'
import { useUi } from '../../stores/uiStore'

const CONFETTI_COLORS = ['#6aaa64', '#c9b458', '#567b95', '#121212', '#e3735e']

/** One-shot CSS confetti burst — deterministic layout, no dependencies. */
function Confetti() {
  return (
    <div className="confetti" aria-hidden="true">
      {Array.from({ length: 28 }, (_, i) => (
        <span
          key={i}
          className="confetti-piece"
          style={{
            left: `${(i * 37) % 100}%`,
            background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
            animationDelay: `${(i % 7) * 0.12}s`,
            animationDuration: `${2 + (i % 5) * 0.3}s`,
          }}
        />
      ))}
    </div>
  )
}

const OUTCOME_COPY: Record<string, { title: string; sub: string }> = {
  'won:all-greens': { title: 'You won! 🎉', sub: 'Every green word found together.' },
  'won:redeemed': { title: 'Redeemed! 🔥', sub: 'You translated your way out of disaster.' },
  'lost:timeout': { title: 'Out of clues', sub: 'The connection was there — next time.' },
  'lost:forbidden-failed': {
    title: 'So close…',
    sub: 'The forbidden word won this round. Those translations will stick now.',
  },
}

export function DebriefPanel({ game }: { game: GameState }) {
  const { debrief, debriefFailed, aiBusy, newGame } = useGame()
  const goTo = useUi((s) => s.goTo)
  const outcome = game.outcome!
  const copy = OUTCOME_COPY[`${outcome.result}:${outcome.reason}`]!
  const aiClues = game.clueHistory.filter((c) => c.by === 'ai' && c.rationale)

  return (
    <div className="debrief">
      {outcome.result === 'won' && <Confetti />}
      <div className={`outcome-banner outcome-${outcome.result}`}>
        <h2>{copy.title}</h2>
        <p>{copy.sub}</p>
      </div>

      {game.redemption?.results && (
        <section className="debrief-section">
          <h3>Translation challenge</h3>
          <ul className="redemption-results">
            {game.redemption.results.map((r) => {
              const w = game.words.find((x) => x.wordId === r.wordId)!
              return (
                <li key={r.wordId} className={r.accepted ? 'accepted' : 'rejected'}>
                  <span className="result-mark">{r.accepted ? '✓' : '✗'}</span>
                  <span lang="da">{w.da}</span>
                  <span className="result-answer">
                    {r.given || '—'}
                    {!r.accepted && <em> (= {w.en[0]})</em>}
                  </span>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      <section className="debrief-section">
        <h3>Klaus debriefs</h3>
        {debrief ? (
          <>
            <p>{debrief.summary}</p>
            <ul className="takeaways">
              {debrief.takeaways.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
            </ul>
          </>
        ) : aiBusy ? (
          <p className="thinking">
            <span className="dots" /> Klaus is gathering his thoughts…
          </p>
        ) : debriefFailed && aiClues.length > 0 ? (
          <ul className="takeaways">
            {aiClues.map((c, i) => (
              <li key={i}>
                «{c.text}» — {c.rationale}
              </li>
            ))}
          </ul>
        ) : (
          <p className="dim">No debrief this time.</p>
        )}
      </section>

      <section className="debrief-section">
        <h3>Clue history</h3>
        <ul className="clue-log">
          {game.clueHistory.map((c, i) => (
            <li key={i}>
              <strong>{c.by === 'player' ? 'You' : 'Klaus'}:</strong> «{c.text}» ({c.number})
              {c.by === 'ai' && c.targets && (
                <span className="dim">
                  {' '}
                  meant {c.targets.map((t) => game.words.find((w) => w.wordId === t)?.da).join(', ')}
                </span>
              )}
              <span className="clue-log-guesses">
                {c.guesses
                  .map((g) => {
                    const da = game.words.find((w) => w.wordId === g.wordId)?.da
                    const mark = g.result === 'green' ? '✓' : g.result === 'bystander' ? '·' : '☠'
                    return `${da} ${mark}`
                  })
                  .join('  ')}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <div className="debrief-actions">
        <button className="btn btn-primary" onClick={() => newGame()}>
          Play again
        </button>
        <button className="btn" onClick={() => goTo('home')}>
          Home
        </button>
      </div>
    </div>
  )
}
