import { WORDS } from '../../data/words'
import type { GameState, Outcome } from '../../engine/types'
import { WORDS_PER_CITY, cityAt } from '../../journey/cities'
import { countCollection, wordsForCity } from '../../journey/progress'
import { useGame } from '../../stores/gameStore'
import { useJourney } from '../../stores/journeyStore'
import { useSrs } from '../../stores/srsStore'
import { clueFlagId, guessFlagId, useFeedback } from '../../stores/feedbackStore'
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
  // Reached by giving up in sudden death now, not by the clock running out —
  // the clock hands you sudden death instead of ending the round.
  'lost:timeout': { title: 'Round given up', sub: 'The connection was there — next time.' },
  'lost:sudden-death': {
    title: 'Sudden death',
    sub: 'One word too far. The clues were spent and that one was not green.',
  },
}

/**
 * One tap to say "that was a bad call", on the screen where the reasoning is.
 *
 * A toggle, not a report form: the player is looking at a finished round and
 * the useful signal is cheap to give. Everything needed to show Cluey what he
 * did — the word, the clue it was made under, and his own account of it — is
 * on screen already, so the flag carries it rather than a bare thumbs-down.
 */
function FlagButton({
  id,
  kind,
  what,
  underClue,
  why,
  label,
}: {
  id: string
  kind: 'clue' | 'guess'
  what: string
  underClue?: string
  why?: string
  label: string
}) {
  const flags = useFeedback((s) => s.flags)
  const toggleFlag = useFeedback((s) => s.toggleFlag)
  const flagged = flags.some((f) => f.id === id)
  return (
    <button
      className={`flag-btn ${flagged ? 'flag-on' : ''}`}
      aria-pressed={flagged}
      aria-label={flagged ? `${label} — flagged as a bad call. Tap to undo` : `Flag ${label} as a bad call`}
      onClick={() => toggleFlag({ id, kind, what, underClue, why })}
    >
      ⚑
    </button>
  )
}

export function DebriefPanel({ game }: { game: GameState }) {
  const { debrief, debriefFailed, aiBusy, newGame, newlyLearned } = useGame()
  const mode = useGame((s) => s.mode)
  const packed = useGame((s) => s.packed)
  const goTo = useUi((s) => s.goTo)
  const cityIndex = useJourney((s) => s.cityIndex)
  const wrapped = useJourney((s) => s.wrapped)
  const srs = useSrs((s) => s.stats)
  const cityCounts = countCollection(wordsForCity(WORDS, cityIndex), srs, wrapped)
  const cityCollected = cityCounts.collected + cityCounts.wrapped
  // What a wrap-up round wrapped: packed AND found green, mirror of finishRound.
  const wrappedWords =
    mode === 'wrapup'
      ? game.words.filter(
          (w) => packed.includes(w.wordId) && game.reveals[w.wordId]?.kind === 'green',
        )
      : []
  const outcome = game.outcome!
  const copy = OUTCOME_COPY[`${outcome.result}:${outcome.reason}` as OutcomeKey]
  const aiClues = game.clueHistory.filter((c) => c.by === 'ai' && c.rationale)
  // The board is gone by the time this renders, so an ending caused by one
  // card has to say which card. Sudden death is now the only such ending, and
  // it no longer leaves a role that names itself: a forbidden hit revealed the
  // one and only `forbidden` card, whereas a lost sudden death just writes
  // another bystander.
  //
  // What identifies it: sudden death pushes no guess record — the reducer
  // writes the reveal and returns — and it is the only thing that burns a card
  // against BOTH sides in one go. So the card is the one neither clue ever
  // touched. A word already burned against one side by a clue and then named
  // here is indistinguishable, and this deliberately shows nothing rather than
  // pointing at the wrong card.
  const namedUnderAClue = new Set(
    game.clueHistory.flatMap((c) => c.guesses.map((g) => g.wordId)),
  )
  const fatal =
    outcome.reason === 'sudden-death'
      ? game.words.find((w) => {
          const r = game.reveals[w.wordId]
          return r?.kind === 'bystander' && r.against.length === 2 && !namedUnderAClue.has(w.wordId)
        })
      : undefined
  // Sudden death has no clue-giver: the player named it themselves.
  const fatalBy = 'You named'

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

      {/* The point of a wrap-up round: what went into the suitcase for good.
          Shown either way — a lost round keeps every word it wrapped. */}
      {mode === 'wrapup' && (
        <section className="debrief-section collected-section">
          <h3>Wrapped and packed</h3>
          {wrappedWords.length > 0 ? (
            <>
              <ul className="collected-words">
                {wrappedWords.map((w) => (
                  <li key={w.wordId} className="collected-word">
                    <span className="collected-mark" aria-hidden="true">
                      ●
                    </span>
                    <span lang="da">{w.da}</span>
                    <span className="collected-en">{w.en[0]}</span>
                  </li>
                ))}
              </ul>
              <p className="collected-note">
                {wrappedWords.length === 1 ? 'One word' : `${wrappedWords.length} words`} wrapped —{' '}
                {cityCounts.wrapped} of {WORDS_PER_CITY} packed in {cityAt(cityIndex).name}.
              </p>
            </>
          ) : (
            <p className="collected-note">
              Nothing wrapped this time — a word is packed when it was translated AND found green.
            </p>
          )}
        </section>
      )}

      {/* The point of the round. A loss can still green a word, so this is
          shown either way — and it is the only place the collection speaks. */}
      {newlyLearned.length > 0 && (
        <section className="debrief-section collected-section">
          <h3>Collected for Cluey</h3>
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
            {newlyLearned.length === 1 ? 'One word' : `${newlyLearned.length} words`} collected —{' '}
            {cityCollected} of {WORDS_PER_CITY} in {cityAt(cityIndex).name}.
          </p>
        </section>
      )}

      <section className="debrief-section">
        <h3>Cluey debriefs</h3>
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
            <span className="dots" /> Cluey is gathering his thoughts…
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

      {/* Every decision Cluey made, with his account of it.
          This used to be a one-line score-strip — «mad ✓  hus ·» — which said
          WHAT he did and never why. The model had always written a reason for
          each guess and the engine dropped it on the floor, so the one question
          a player kept asking ("why that word?") was the one question the app
          had thrown away. A clue's rationale now carries what he steered AWAY
          from too, which is the half a learner cannot reconstruct alone. */}
      <section className="debrief-section">
        <h3>What was said, and why</h3>
        {/* Flagging lives here and nowhere else: this is the only screen where
            the reasoning is visible, and a verdict on a clue is only worth
            anything next to the account Cluey gave of it. Cluey's own turns
            only — flagging your own clue would be marking your own homework. */}
        <p className="dim log-hint">
          Tap ⚑ on anything of Cluey's that was a bad call. He is shown the ones you flag.
        </p>
        <ol className="turn-log">
          {game.clueHistory.map((c, i) => {
            const da = (id: string) => game.words.find((w) => w.wordId === id)?.da ?? id
            const clueId = clueFlagId(game.seed, i)
            return (
              <li key={i}>
                <p className="turn-clue">
                  <strong>{c.by === 'player' ? 'You' : 'Cluey'}:</strong> «{c.text}» ({c.number})
                  {c.by === 'ai' && c.targets && (
                    <span className="dim">
                      {' '}
                      for <span lang="da">{c.targets.map(da).join(', ')}</span>
                    </span>
                  )}
                  {c.by === 'ai' && (
                    <FlagButton
                      id={clueId}
                      kind="clue"
                      what={c.text}
                      why={c.rationale}
                      label={`Cluey's clue «${c.text}»`}
                    />
                  )}
                </p>
                {c.rationale && <p className="turn-why">{c.rationale}</p>}
                <ul className="turn-guesses">
                  {c.guesses.map((g, gi) => (
                    <li key={gi} className={`guess-${g.result}`}>
                      <span className="result-mark" aria-hidden="true">
                        {g.result === 'green' ? '✓' : '·'}
                      </span>
                      <span lang="da" className="guess-word">
                        {da(g.wordId)}
                      </span>
                      <span className="visually-hidden">
                        {g.result === 'green' ? ' — correct' : ' — neutral'}
                      </span>
                      {g.reasoning && <span className="turn-why guess-why">{g.reasoning}</span>}
                      {g.confidence !== undefined && (
                        // Said out loud because it is the number that decided
                        // the ORDER, and the first guess is played whatever it
                        // is — so a guess Cluey was never sure of should look
                        // like one rather than like a considered choice.
                        <span className="guess-confidence">
                          {Math.round(g.confidence * 100)}% sure
                        </span>
                      )}
                      {/* His guesses are the ones made under YOUR clue; the
                          rest of this list is your own tapping. */}
                      {c.by === 'player' && (
                        <FlagButton
                          id={guessFlagId(game.seed, i, gi)}
                          kind="guess"
                          what={da(g.wordId)}
                          underClue={c.text}
                          why={g.reasoning}
                          label={`Cluey's guess «${da(g.wordId)}»`}
                        />
                      )}
                    </li>
                  ))}
                  {c.guesses.length === 0 && <li className="dim">no guess made</li>}
                </ul>
              </li>
            )
          })}
        </ol>
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
