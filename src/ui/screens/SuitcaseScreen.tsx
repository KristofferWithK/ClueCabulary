import { useEffect, useState } from 'react'
import type { WordEntry } from '../../data/types'
import { WORDS } from '../../data/words'
import { CITIES, WORDS_PER_CITY, cityAt } from '../../journey/cities'
import { WRAP_TO_TRAVEL, wordState, wordsForCity } from '../../journey/progress'
import { WRAP_UP_UNLOCK, wrapUpUnlocked } from '../../journey/wrapup'
import { useGame } from '../../stores/gameStore'
import { useJourney } from '../../stores/journeyStore'
import { useSrs } from '../../stores/srsStore'
import { useUi } from '../../stores/uiStore'

/**
 * Cluey, open on the table. Three bands and no scrolling: the words still
 * loose in the city (discovered and undiscovered), then the open suitcase —
 * collected words in the top compartment, wrapped ones packed below — and the
 * wrap-up button that moves words from one compartment to the other.
 *
 * Everything pages sideways instead of scrolling; each strip is a fixed grid
 * of slots with ‹ › to leaf through.
 */

/** Slots per page in each band; small enough to fit 360x640 with room over. */
const LOOSE_PAGE = 8
const CASE_PAGE = 6

function Pager({
  label,
  words,
  page,
  perPage,
  onPage,
  render,
  empty,
}: {
  label: string
  words: WordEntry[]
  page: number
  perPage: number
  onPage: (p: number) => void
  render: (w: WordEntry) => React.ReactNode
  empty: string
}) {
  const pages = Math.max(1, Math.ceil(words.length / perPage))
  const clamped = Math.min(page, pages - 1)
  const slice = words.slice(clamped * perPage, (clamped + 1) * perPage)
  return (
    <div className="case-band">
      <div className="case-band-head">
        <span className="case-band-label">{label}</span>
        {pages > 1 && (
          <span className="case-pager">
            <button
              className="icon-btn icon-btn-small"
              aria-label={`${label}: previous page`}
              disabled={clamped === 0}
              onClick={() => onPage(clamped - 1)}
            >
              ‹
            </button>
            <span className="case-page-count" aria-live="polite">
              {clamped + 1}/{pages}
            </span>
            <button
              className="icon-btn icon-btn-small"
              aria-label={`${label}: next page`}
              disabled={clamped >= pages - 1}
              onClick={() => onPage(clamped + 1)}
            >
              ›
            </button>
          </span>
        )}
      </div>
      {words.length === 0 ? (
        <p className="case-empty">{empty}</p>
      ) : (
        <ul className="case-tiles">{slice.map((w) => render(w))}</ul>
      )}
    </div>
  )
}

export function SuitcaseScreen() {
  const goTo = useUi((s) => s.goTo)
  const openSheet = useUi((s) => s.openSheet)
  const srs = useSrs((s) => s.stats)
  const banked = useSrs((s) => s.wrapUpsBanked)
  const won = useSrs((s) => s.games.won)
  const journey = useJourney()
  const [city, setCity] = useState(journey.cityIndex)
  const [loosePage, setLoosePage] = useState(0)
  const [collectedPage, setCollectedPage] = useState(0)
  const [wrappedPage, setWrappedPage] = useState(0)

  // Changing city rewinds every strip to its first page.
  useEffect(() => {
    setLoosePage(0)
    setCollectedPage(0)
    setWrappedPage(0)
  }, [city])

  const words = wordsForCity(WORDS, city)
  const stateOf = (w: WordEntry) => wordState(srs[w.id], w.id in journey.wrapped)
  const loose = words.filter((w) => {
    const s = stateOf(w)
    return s === 'undiscovered' || s === 'discovered'
  })
  const collected = words.filter((w) => stateOf(w) === 'collected')
  const wrapped = words.filter((w) => stateOf(w) === 'wrapped')

  const isHome = city === journey.cityIndex
  const reached = city <= journey.cityIndex

  /**
   * Two conditions, and they are different in kind — so the hint below names
   * whichever is missing rather than leaving a dead button to explain itself.
   *
   * `boardReady` is arithmetic: a wrap-up board is twenty collected words and
   * cannot be dealt without them. `banked` is the reward economy: a wrap-up
   * round is earned by winning a normal one. Whichever is slower binds, and
   * early in a city that is the collecting — a measured median of 11 to 13
   * rounds even with every round won, against a first win that is very likely
   * the first or second. So this hint mostly asks for words at the start of a
   * city and mostly asks for a win afterwards. See WRAP_UP_BANK_CAP.
   */
  const boardReady = isHome && wrapUpUnlocked(WORDS, srs, journey.wrapped, journey.cityIndex)
  const wrapUpReady = boardReady && banked > 0
  // How many more words the city owes a board. This counts the POOL, while
  // boardReady above answers by dealing — so a pool of exactly twenty that
  // cannot seat twenty (two words that clash on one board) lands here at zero
  // with the button still dark, and the hint has to say something true rather
  // than «Collect 0 more».
  const shortBy = Math.max(0, WRAP_UP_UNLOCK - collected.length - wrapped.length)
  const blockers = [
    !boardReady &&
      (shortBy > 0
        ? `Collect ${shortBy} more to open wrap-up rounds.`
        : 'A couple of these words clash on one board — collect one or two more to open wrap-up rounds.'),
    // The first win is the unlock, so it is worded as the next thing to do
    // rather than as a counter at zero.
    banked === 0 &&
      (won === 0
        ? 'Win a round to earn your first wrap-up round.'
        : 'Win a round to earn another wrap-up round.'),
  ].filter((s): s is string => typeof s === 'string')

  const wordTile = (w: WordEntry, cls: string) => (
    <li key={w.id}>
      <button
        className={`case-tile ${cls}`}
        lang="da"
        aria-label={`${w.da}, ${stateOf(w)}`}
        onClick={() => openSheet(w.id)}
      >
        {w.da}
      </button>
    </li>
  )

  return (
    <div className="screen suitcase-screen">
      <header className="screen-header">
        <button className="icon-btn" aria-label="Back" onClick={() => goTo('home')}>
          ←
        </button>
        <h1>
          <span lang="da">Kufferten</span>
        </h1>
        <span className="case-city-pager">
          <button
            className="icon-btn icon-btn-small"
            aria-label="Previous city"
            disabled={city === 0}
            onClick={() => setCity((c) => c - 1)}
          >
            ‹
          </button>
          <span className="case-city-name" lang="da">
            {cityAt(city).name}
          </span>
          <button
            className="icon-btn icon-btn-small"
            aria-label="Next city"
            disabled={city >= CITIES.length - 1}
            onClick={() => setCity((c) => c + 1)}
          >
            ›
          </button>
        </span>
      </header>

      {reached ? (
        <>
          <Pager
            label={`Loose in ${cityAt(city).name} — ${loose.length}`}
            words={loose}
            page={loosePage}
            perPage={LOOSE_PAGE}
            onPage={setLoosePage}
            empty="Nothing loose — every word here has been collected."
            render={(w) =>
              stateOf(w) === 'undiscovered' ? (
                <li key={w.id} className="case-tile case-unknown" aria-label="Undiscovered word">
                  <span aria-hidden="true">?</span>
                </li>
              ) : (
                wordTile(w, 'case-discovered')
              )
            }
          />

          <div className="suitcase-open">
            <Pager
              label={`Collected — ${collected.length}`}
              words={collected}
              page={collectedPage}
              perPage={CASE_PAGE}
              onPage={setCollectedPage}
              empty="Clue a word and guess it — one green each way — to collect it."
              render={(w) => wordTile(w, 'case-collected')}
            />
            <Pager
              label={`Wrapped — ${wrapped.length} of ${WRAP_TO_TRAVEL}`}
              words={wrapped}
              page={wrappedPage}
              perPage={CASE_PAGE}
              onPage={setWrappedPage}
              empty="Nothing wrapped yet — wrap-up rounds pack collected words safely."
              render={(w) => wordTile(w, 'case-wrapped')}
            />
          </div>
        </>
      ) : (
        <p className="case-locked">
          {WORDS_PER_CITY} words waiting — reach {cityAt(city).name} to meet them.
        </p>
      )}

      <div className="case-actions">
        {isHome && (
          <button
            className="btn btn-primary btn-big"
            disabled={!wrapUpReady}
            aria-label={banked > 0 ? `Wrap up words — ${banked} banked` : 'Wrap up words'}
            onClick={() => {
              useGame.getState().newWrapUpGame()
              goTo('game')
            }}
          >
            Wrap up words
            {banked > 0 && (
              <span className="wrap-bank" aria-hidden="true">
                {banked}
              </span>
            )}
          </button>
        )}
        {isHome && !wrapUpReady && <p className="case-hint">{blockers.join(' ')}</p>}
        <button className="btn" onClick={() => goTo('home')}>
          Back
        </button>
      </div>
    </div>
  )
}
