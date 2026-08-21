import { useEffect, useState } from 'react'
import type { WordEntry } from '../../data/types'
import { WORDS } from '../../data/words'
import { cityAt } from '../../journey/cities'
import {
  WRAP_TO_TRAVEL,
  isCollected,
  unlockedWords,
  wordState,
  wordsForCity,
} from '../../journey/progress'
import { WRAP_UP_UNLOCK, wrapUpUnlocked } from '../../journey/wrapup'
import { useGame } from '../../stores/gameStore'
import { useJourney } from '../../stores/journeyStore'
import { useSrs } from '../../stores/srsStore'
import { useUi } from '../../stores/uiStore'
import { playWord } from '../speak'
import { ACTIVE } from '../../lang/active'

/**
 * Inside Casey: ONE suitcase, lying open, filling the screen.
 *
 * The screen used to page between cities in the header, which made nine
 * containers out of one — you left Ribe's suitcase to visit Aarhus's. A city
 * is a **filter** now, a chip over one continuous case, so the case never
 * changes; only how much of it you are looking at does.
 *
 * It OPENS on the city you are standing in. "All" was the default while it
 * was the proof that the case is one thing, and it cost more than it proved:
 * the strip above the case pages through every word not yet in it, so All at
 * the last stop is eight hundred-odd words and a hundred-odd pages of them,
 * against thirteen for the stop actually being played. The wrap-up button
 * below has always been about the city you are in — a board is dealt from
 * home whatever the chips say — so opening on that city is the view the rest
 * of the screen was already talking about. All is one tap away and still
 * shows the whole case; nothing about it moved except which chip starts lit.
 *
 * The screen reads TOP TO BOTTOM in the order a word travels: the strip of
 * loose words first, then the lid holding what is COLLECTED, then the tray
 * holding what is WRAPPED. Every band is one step further in, so packing a
 * word is always a move downward and the wrap-up button's job is on the
 * screen as a direction. The tray is the bottom of the case for the terminal
 * state — add-only, never regresses — and the lid, nearer the loose strip the
 * words come from, is the half you keep rummaging in.
 *
 * The loose words are not in the case at all, which is the point of them, so
 * they sit in a strip on the table ABOVE it: they are the queue you are
 * working through, and burying the queue under the case put the thing you act
 * on next furthest from the thumb.
 *
 * Nothing scrolls. Every band is a fixed grid of slots with ‹ › to leaf
 * through, and the slots stretch to fill whatever height the phone gives them
 * — that is how the case fills a 390×844 screen without a measurement.
 */

/** Slots per page. The compartments are 3 wide; the loose strip is 4 by 2. */
const LOOSE_PAGE = 8
const CASE_PAGE = 12

/** The "All" filter — one suitcase, everything reached in it. */
const ALL = -1

/* ---------- the drawn case ----------

   Hand-rolled inline SVG in the same hand as Cluey.tsx: wobbled paths, real
   stroke weights, the `cluey-hatch` shading reused verbatim so the corners are
   shaded by the same pencil. No images, no asset pipeline.

   The two panels stretch (`preserveAspectRatio="none"`), so they carry only
   shapes that survive being stretched: long edges, short diagonals, and tabs
   that are wider than they are tall. Everything with a fixed aspect — the
   handle, the corner hatching — is its own small SVG placed by CSS instead,
   because a nested <svg> does NOT escape an ancestor's non-uniform scale. */

/**
 * A compartment: outer edge, the inner wall a hand's width inside it, and
 * short spurs joining the two at the corners. Those spurs are the whole trick
 * — two outlines and a corner joint is what a box with depth looks like, and
 * it costs four strokes.
 *
 * Each panel is left OPEN on its hinge side, so the lid's bottom edge and the
 * tray's top edge are the hinge itself rather than four parallel lines
 * stacked up in the middle of the case.
 */
function CasePanel({ half }: { half: 'lid' | 'tray' }) {
  const lid = half === 'lid'
  return (
    <svg
      className={`case-art case-art-${half}`}
      viewBox="0 0 300 200"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      {lid ? (
        <>
          <path
            className="case-floor"
            d="M8 22 Q8 8 22 7 L151 5 L278 7 Q292 8 292 22 L293 200 L7 200 Z"
          />
          <path
            className="case-edge"
            d="M7 200 L9 146 L7 90 L8 22 Q8 8 22 7 L96 6 L151 5 L214 6 L278 7 Q292 8 292 23 L291 94 L293 148 L292 200"
          />
          <path
            className="case-wall"
            d="M18 200 L19 148 L17 94 L18 26 Q18 16 29 15 L151 13 L272 15 Q283 16 283 26 L282 94 L284 148 L283 200"
          />
          <path className="case-wall" d="M8 22 L18 26 M292 22 L283 26" />
          {/* The pen carried past two corners, as a pen does. */}
          <path className="case-edge" d="M285 7 L297 10 M22 7 L11 3" />
        </>
      ) : (
        <>
          <path
            className="case-floor"
            d="M7 0 L8 178 Q8 192 22 193 L151 195 L278 193 Q292 192 292 178 L293 0 Z"
          />
          <path
            className="case-edge"
            d="M8 0 L9 54 L7 110 L8 178 Q8 192 22 193 L96 194 L151 195 L214 194 L278 193 Q292 192 292 177 L291 106 L293 52 L292 0"
          />
          <path
            className="case-wall"
            d="M18 0 L19 52 L17 108 L18 174 Q18 184 29 185 L151 187 L272 185 Q283 184 283 174 L282 108 L284 52 L283 0"
          />
          <path className="case-wall" d="M8 178 L18 174 M292 178 L283 174" />
          {/* The two clasps, on the outer edge the lid closes onto. Wider than
              they are tall on purpose: stretched to a tall phone they stay
              wider than they are tall, and so stay clasps. */}
          <rect className="case-clasp" x="88" y="184" width="26" height="11" rx="4" />
          <rect className="case-clasp" x="186" y="184" width="26" height="11" rx="4" />
          <path className="case-edge" d="M285 193 L297 190 M22 193 L11 197" />
        </>
      )}
    </svg>
  )
}

/** The hinge the case opens about — Casey's closed seam, split. */
function CaseHinge() {
  return (
    <svg
      className="case-hinge-art"
      viewBox="0 0 300 18"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      <path className="case-edge" d="M10 4 L150 3 L290 5" />
      <path className="case-edge" d="M10 14 L150 15 L290 13" />
      <rect className="case-hinge-barrel" x="44" y="2" width="30" height="14" rx="5" />
      <rect className="case-hinge-barrel" x="135" y="2" width="30" height="14" rx="5" />
      <rect className="case-hinge-barrel" x="226" y="2" width="30" height="14" rx="5" />
    </svg>
  )
}

/**
 * The handle, on top, where Casey wears his. A case opened flat would really
 * have it on the tray's outer edge — but Casey IS this suitcase, the player
 * just tapped him to come in here, and matching his silhouette is worth more
 * than being right about which half carries the grip.
 */
function CaseHandle() {
  return (
    <svg className="case-handle" viewBox="0 0 100 42" aria-hidden="true" focusable="false">
      <path className="case-edge" d="M9 42 L8 17 Q8 6 21 5 L79 6 Q92 7 92 18 L91 42" />
      <path className="case-wall" d="M23 42 L22 21 Q22 18 27 18 L73 19 Q78 19 78 22 L77 42" />
      <rect className="case-clasp" x="1" y="31" width="20" height="10" rx="3" />
      <rect className="case-clasp" x="79" y="31" width="20" height="10" rx="3" />
    </svg>
  )
}

/**
 * Pencil shading in a corner, lifted straight from Casey — same `cluey-hatch`
 * class, so the one stroke rule draws both and they can never drift into
 * different hands. Fixed aspect and placed by CSS (which corner it lands in is
 * the panel's business, not this component's), so the hatch keeps the angle it
 * was drawn at however far the panel around it is stretched.
 */
function CornerHatch() {
  return (
    <svg className="case-hatch" viewBox="0 0 40 40" aria-hidden="true" focusable="false">
      <g className="cluey-hatch">
        <line x1="5" y1="34" x2="17" y2="22" />
        <line x1="11" y1="36" x2="24" y2="23" />
        <line x1="18" y1="37" x2="30" y2="25" />
      </g>
    </svg>
  )
}

function Pager({
  label,
  words,
  page,
  perPage,
  onPage,
  render,
  empty,
  className = '',
  children,
}: {
  label: string
  words: WordEntry[]
  page: number
  perPage: number
  onPage: (p: number) => void
  render: (w: WordEntry) => React.ReactNode
  empty: string
  className?: string
  /** The drawn panel, if this band is one — it lies behind the words. */
  children?: React.ReactNode
}) {
  const pages = Math.max(1, Math.ceil(words.length / perPage))
  const clamped = Math.min(page, pages - 1)
  const slice = words.slice(clamped * perPage, (clamped + 1) * perPage)
  return (
    <div className={`case-band ${className}`}>
      {children}
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
  // Opens on the stop you are standing in — see the note at the top of the
  // file. Safe as a plain initial value because the screen UNMOUNTS when you
  // leave it (App.tsx renders one screen at a time), so travelling and coming
  // back re-reads the new city rather than holding the old one.
  const [filter, setFilter] = useState<number>(journey.cityIndex)
  const [loosePage, setLoosePage] = useState(0)
  const [collectedPage, setCollectedPage] = useState(0)
  const [wrappedPage, setWrappedPage] = useState(0)

  // Changing the filter rewinds every band to its first page.
  useEffect(() => {
    setLoosePage(0)
    setCollectedPage(0)
    setWrappedPage(0)
  }, [filter])

  const stateOf = (w: WordEntry) => wordState(srs[w.id], w.id in journey.wrapped)

  // One case: All is everything the journey has reached, and a chip narrows
  // the view without moving the player anywhere.
  // A display pool, not a board pool: E0 kept "everything reached" as ALL's
  // meaning on purpose (docs/clue-engine.md §5), even though ordinary boards
  // went city-only.
  const shown =
    filter === ALL ? unlockedWords(WORDS, journey.cityIndex) : wordsForCity(WORDS, filter)
  /**
   * The table above the case: everything not in it yet. The words already MET
   * lead, because those are the ones worth opening, and the undiscovered ?
   * follow them.
   *
   * The ? used to be capped at one page-worth — texture behind the met words
   * rather than a list, on the grounds that there is nothing to see on a ? and
   * eight hundred of them paged eight at a time is a hundred pages of it. What
   * that cap actually bought was a label that disagreed with its own pager:
   * «Still out there — 80» sitting over three pages of twenty-three tiles,
   * which reads as a list that broke rather than one that was trimmed on
   * purpose. So the strip holds every one of them now and the label counts
   * exactly what the ‹ › leaf through — one number, one meaning.
   *
   * It is a long leaf under "All" at a late city — a hundred-odd pages — and
   * that is why the screen opens on one stop instead: a city is a hundred
   * words, thirteen pages, and the only hundred a board is dealt from.
   */
  const met = shown.filter((w) => stateOf(w) === 'discovered')
  const unmet = shown.filter((w) => stateOf(w) === 'undiscovered')
  const loose = [...met, ...unmet]
  const collected = shown.filter((w) => stateOf(w) === 'collected')
  const wrapped = shown.filter((w) => stateOf(w) === 'wrapped')
  const wrapGoal = filter === ALL ? (journey.cityIndex + 1) * WRAP_TO_TRAVEL : WRAP_TO_TRAVEL

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
   *
   * Every number here is read off the city the player is IN, never off the
   * filter. A filter is a view; a wrap-up round always deals from home, and a
   * hint that counted the chip's words would ask for words that no board
   * would ever be dealt from. That is why the hint names the city out loud.
   */
  const home = cityAt(journey.cityIndex)
  const homePool = wordsForCity(WORDS, journey.cityIndex).filter((w) =>
    isCollected(srs[w.id], w.id in journey.wrapped),
  ).length
  const boardReady = wrapUpUnlocked(WORDS, srs, journey.wrapped, journey.cityIndex)
  const wrapUpReady = boardReady && banked > 0
  // How many more words the city owes a board. This counts the POOL, while
  // boardReady above answers by dealing — so a pool of exactly twenty that
  // cannot seat twenty (two words that clash on one board) lands here at zero
  // with the button still dark, and the hint has to say something true rather
  // than «Collect 0 more».
  const shortBy = Math.max(0, WRAP_UP_UNLOCK - homePool)
  const blockers = [
    !boardReady &&
      (shortBy > 0
        ? `Collect ${shortBy} more in ${home.name} to open wrap-up rounds.`
        : `A couple of ${home.name}'s words clash on one board — collect one or two more to open wrap-up rounds.`),
    // The first win is the unlock, so it is worded as the next thing to do
    // rather than as a counter at zero.
    banked === 0 &&
      (won === 0
        ? 'Win a round to earn your first wrap-up round.'
        : 'Win a round to earn another wrap-up round.'),
  ].filter((s): s is string => typeof s === 'string')

  /**
   * A tile is a slot with the word button in it, never a bare button: the
   * slot is the positioned parent a per-tile control hangs off. The audio card
   * (F1) adds its speak button here as a second child with class
   * `case-tile-speak` — the stylesheet already places it, so that merge is one
   * element and no layout change.
   */
  const wordTile = (w: WordEntry, cls: string) => (
    <li key={w.id} className="case-slot">
      <button
        // A compartment tile never wraps: the rows are short at 360×640 and a
        // second line is what would clip. Eleven of the nine hundred words are
        // longer than a 3-column tile holds at the normal size, so those get a
        // smaller one instead — «international» whole beats «internatio-» cut.
        className={`case-tile ${cls}${w.da.length > 10 ? ' case-tile-long' : ''}`}
        lang={ACTIVE.code}
        aria-label={`${w.da}, ${stateOf(w)}`}
        onClick={() => {
          // The tile says the word and opens its page — the sheet has its own
          // 🔊 for a second listen, but wanting to hear a word you are looking
          // at should not cost two taps.
          void playWord(w.id, w.da)
          openSheet(w.id)
        }}
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
        <h1>The suitcase</h1>
      </header>

      {/* The city filter. Only cities reached are offered — the road ahead is
          the map's job, and a chip for a place you have never been would be a
          door into an empty half of the case. It scrolls sideways INSIDE
          itself: nine Danish city names do not fit across 360px, and the
          document is not allowed to scroll. */}
      <div className="case-filter" role="group" aria-label="Filter the suitcase by city">
        <button
          className={`chip ${filter === ALL ? 'chip-on' : ''}`}
          aria-pressed={filter === ALL}
          onClick={() => setFilter(ALL)}
        >
          All
        </button>
        {Array.from({ length: journey.cityIndex + 1 }, (_, i) => (
          <button
            key={i}
            // The city you are standing in wears a dot. Nine chips and no
            // marker leaves the one that the wrap-up button is actually about
            // looking like any other place you have been.
            className={`chip ${filter === i ? 'chip-on' : ''}${
              i === journey.cityIndex ? ' chip-home' : ''
            }`}
            aria-pressed={filter === i}
            aria-current={i === journey.cityIndex ? 'location' : undefined}
            lang={ACTIVE.code}
            onClick={() => setFilter(i)}
          >
            {cityAt(i).name}
          </button>
        ))}
      </div>

      {/* Not in the case, which is the point of them — and above it, because
          these are the words the next round is for. */}
      <Pager
        // `loose.length`, not `met.length + unmet.length`: they are the same
        // number now, and reading it off the list the pager pages through is
        // what keeps them the same if anything is ever dropped from it again.
        label={`Still out there — ${loose.length}`}
        words={loose}
        page={loosePage}
        perPage={LOOSE_PAGE}
        onPage={setLoosePage}
        className="case-loose"
        empty="Nothing loose — every word here is in the case."
        render={(w) =>
          stateOf(w) === 'undiscovered' ? (
            <li key={w.id} className="case-slot">
              <span className="case-tile case-unknown" aria-label="Undiscovered word">
                <span aria-hidden="true">?</span>
              </span>
            </li>
          ) : (
            wordTile(w, 'case-discovered')
          )
        }
      />

      {/* The case itself, open on the table and filling everything left. */}
      <div className="case-open">
        <CaseHandle />
        <Pager
          label={`Collected — ${collected.length}`}
          words={collected}
          page={collectedPage}
          perPage={CASE_PAGE}
          onPage={setCollectedPage}
          className="case-panel case-panel-lid"
          empty="Clue a word and guess it — one green each way — to collect it into the lid."
          render={(w) => wordTile(w, 'case-collected')}
        >
          <CasePanel half="lid" />
          <CornerHatch />
        </Pager>

        <CaseHinge />

        <Pager
          label={`Wrapped — ${wrapped.length} of ${wrapGoal}`}
          words={wrapped}
          page={wrappedPage}
          perPage={CASE_PAGE}
          onPage={setWrappedPage}
          className="case-panel case-panel-tray"
          empty="Nothing packed in the tray yet — wrap-up rounds put words here for good."
          render={(w) => wordTile(w, 'case-wrapped')}
        >
          <CasePanel half="tray" />
          <CornerHatch />
        </Pager>
      </div>

      {/* No second Back button down here: the case is the whole point of the
          screen and every row it does not need is a row it grows by. Settings
          already gets by on the header arrow alone, and nav-drive uses that
          one. */}
      <div className="case-actions">
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
        {!wrapUpReady && <p className="case-hint">{blockers.join(' ')}</p>}
      </div>
    </div>
  )
}
