import { WORDS } from '../../data/words'
import type { GameState, Outcome } from '../../engine/types'
import { WORDS_PER_CITY, cityAt } from '../../journey/cities'
import { countCollection, wordsForCity } from '../../journey/progress'
import { useGame } from '../../stores/gameStore'
import { useJourney } from '../../stores/journeyStore'
import { useSrs } from '../../stores/srsStore'
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

/**
 * Every ending, keyed by `result:reason`. Typed off the Outcome union rather
 * than `Record<string, …>`, so an ending added to the engine fails the build
 * here instead of reading `undefined!` and throwing on the debrief screen the
 * first time a player reaches it.
 */
type OutcomeKey = Outcome extends infer O
  ? O extends Outcome
    ? `${O['result']}:${O['reason']}`
    : never
  : never

const OUTCOME_COPY: Record<OutcomeKey, { title: string; sub: string }> = {
  'won:all-greens': { title: 'You won! 🎉', sub: 'Every green word found together.' },
  'won:redeemed': { title: 'Redeemed! 🔥', sub: 'You translated your way out of disaster.' },
  // Reached by giving up in sudden death now, not by the clock running out —
  // the clock hands you sudden death instead of ending the round.
  'lost:timeout': { title: 'Round given up', sub: 'The connection was there — next time.' },
  'lost:sudden-death': {
    title: 'Sudden death',
    sub: 'One word too far. The clues were spent and that one was not green.',
  },
  // No translation challenge happened, so this must not borrow the sentence
  // below it. The word is named because nothing else on this screen names it:
  // the board unmounts when the round finishes, and all the player would
  // otherwise see is a ☠ in the clue log.
  'lost:forbidden-hit': {
    title: 'Forbidden word',
    sub: 'That one ended the round on the spot — the last chance only opens later.',
  },
  'lost:forbidden-failed': {
    title: 'So close…',
    sub: 'The forbidden word won this round. Those translations will stick now.',
  },
}

export function DebriefPanel({ game }: { game: GameState }) {
  const { debrief, debriefFailed, aiBusy, newGame, newlyLearned } = useGame()
  const goTo = useUi((s) => s.goTo)
  const cityIndex = useJourney((s) => s.cityIndex)
  const banked = useJourney((s) => s.banked)
  const srs = useSrs((s) => s.stats)
  const cityLearned = countCollection(wordsForCity(WORDS, cityIndex), srs, banked).learned
  const outcome = game.outcome!
  const copy = OUTCOME_COPY[`${outcome.result}:${outcome.reason}` as OutcomeKey]
  const aiClues = game.clueHistory.filter((c) => c.by === 'ai' && c.rationale)
  // The board is gone by the time this renders, so an ending caused by one
  // card has to say which card. Either side can name it, and under the gate
  // that costs the whole round, so the sentence says who did.
  const fatal =
    outcome.reason === 'forbidden-hit' || outcome.reason === 'sudden-death'
      ? game.words.find((w) => game.reveals[w.wordId]?.kind === 'forbidden')
      : undefined
  // In sudden death there is no giver — the player names the board themselves.
  // Otherwise the guesser is whoever did not give the last clue.
  const namedBySelf =
    outcome.reason === 'sudden-death' || game.clueHistory.at(-1)?.by === 'ai'
  const fatalBy = namedBySelf ? 'You named' : 'Klaus named'

  return (
    <div className="debrief">
      {outcome.result === 'won' && <Confetti />}
      <div className={`outcome-banner outcome-${outcome.result}`}>
        <h2>{copy.title}</h2>
        <p>{copy.sub}</p>
        {fatal && (
          <p className="outcome-culprit">
            {fatalBy} «<span lang="da">{fatal.da}</span>» — {fatal.en[0]}.
          </p>
        )}
      </div>

      {/* The point of the round. A loss can still green a word, so this is
          shown either way — and it is the only place the collection speaks. */}
      {newlyLearned.length > 0 && (
        <section className="debrief-section collected-section">
          <h3>
            Added to <span lang="da">samlingen</span>
          </h3>
          <ul className="collected-words">
            {newlyLearned.map((id) => {
              const w = game.words.find((x) => x.wordId === id)
              if (!w) return null
              return (
                <li key={id} className="collected-word">
                  <span className="collected-mark" aria-hidden="true">
                    ●
                  </span>
                  <span lang="da">{w.da}</span>
                  <span className="collected-en">{w.en[0]}</span>
                </li>
              )
            })}
          </ul>
          <p className="collected-note">
            {newlyLearned.length === 1 ? 'One word' : `${newlyLearned.length} words`} turned green
            — {cityLearned} of {WORDS_PER_CITY} in {cityAt(cityIndex).name}.
          </p>
        </section>
      )}

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
                  meant{' '}
                  <span lang="da">
                    {c.targets.map((t) => game.words.find((w) => w.wordId === t)?.da).join(', ')}
                  </span>
                </span>
              )}
              <span className="clue-log-guesses" lang="da">
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
