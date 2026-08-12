import { WORDS } from '../../data/words'
import { GRID_CONFIGS, type GridSize } from '../../engine/config'
import { mulberry32 } from '../../engine/rng'
import {
  CITIES,
  FINAL_CITY_INDEX,
  GATES_PER_CITY,
  WORDS_PER_CITY,
  cityAt,
} from '../../journey/cities'
import { championAt } from '../../journey/champions'
import { DENMARK_PATH, MAP_HEIGHT, MAP_WIDTH, projectCity } from '../../journey/denmark'
import {
  canTravel,
  countCollection,
  examComposition,
  examTrials,
  examUnlocked,
  examWords,
  greensToNextTrial,
  isJourneyComplete,
  stampsFor,
  unlockedWords,
  wordsForCity,
} from '../../journey/progress'
import { useGame } from '../../stores/gameStore'
import { useJourney } from '../../stores/journeyStore'
import { useSettings } from '../../stores/settingsStore'
import { useSrs } from '../../stores/srsStore'
import { useUi } from '../../stores/uiStore'
import { LETTER } from '../../journey/letter'

/** Deterministic pick that changes daily — drawn from words already unlocked. */
function wordOfTheDay(cityIndex: number) {
  const pool = unlockedWords(WORDS, cityIndex)
  const now = new Date()
  const dayKey = now.getFullYear() * 372 + now.getMonth() * 31 + now.getDate()
  return pool[(dayKey * 2654435761) % pool.length]!
}

/** Local date key + seed: the same daily board for everyone on that date. */
function dailyChallenge() {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return {
    key: `${y}-${m}-${d}`,
    seed: y * 10000 + (now.getMonth() + 1) * 100 + now.getDate(),
  }
}

const DAILY_BADGE: Record<string, string> = {
  won: '✓ solved',
  redeemed: '🔥 redeemed',
  lost: '· played',
}

/** The route so far, drawn small enough to live above the fold. */
function JourneyMap({ cityIndex }: { cityIndex: number }) {
  const points = CITIES.map((c) => projectCity(c.lon, c.lat))
  const done = points
    .slice(0, cityIndex + 1)
    .map((p) => `${p.x.toFixed(0)},${p.y.toFixed(0)}`)
    .join(' ')
  const ahead = points
    .slice(cityIndex)
    .map((p) => `${p.x.toFixed(0)},${p.y.toFixed(0)}`)
    .join(' ')
  const here = points[cityIndex]!

  return (
    <svg
      className="home-map"
      viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
      role="img"
      aria-label={`Stop ${cityIndex + 1} of ${CITIES.length}: ${cityAt(cityIndex).name}`}
    >
      <path className="map-land" d={DENMARK_PATH} />
      <polyline className="map-route-ahead" points={ahead} />
      <polyline className="map-route-done" points={done} />
      {points.map((p, i) => (
        <circle
          key={CITIES[i]!.id}
          className={`home-dot ${i < cityIndex ? 'dot-done' : i === cityIndex ? 'dot-here' : 'dot-ahead'}`}
          cx={p.x}
          cy={p.y}
          r={i === cityIndex ? 26 : 14}
        />
      ))}
      {/* Skagen sits at the top of the map, where a label above the dot falls
          outside the viewBox — flip it below. The same for the east coast,
          where a centred label would run off the right edge. */}
      <text
        className="home-map-here"
        x={Math.min(Math.max(here.x, 110), MAP_WIDTH - 110)}
        y={here.y < 90 ? here.y + 62 : here.y - 42}
        textAnchor="middle"
      >
        {cityAt(cityIndex).name}
      </text>
    </svg>
  )
}

export function HomeScreen() {
  const goTo = useUi((s) => s.goTo)
  const pendingSeed = useUi((s) => s.pendingSeed)
  const openSheet = useUi((s) => s.openSheet)
  const game = useGame((s) => s.game)
  const newGame = useGame((s) => s.newGame)
  const settings = useSettings()
  const srs = useSrs((s) => s.stats)
  const journey = useJourney()

  const city = cityAt(journey.cityIndex)
  const champion = championAt(journey.cityIndex)
  const cityCounts = countCollection(wordsForCity(WORDS, journey.cityIndex), srs, journey.banked)
  const allCounts = countCollection(WORDS, srs, journey.banked)
  const stamps = stampsFor(journey, journey.cityIndex)
  const paper = examComposition(WORDS, srs, journey.banked, journey.cityIndex)
  const paperUnknown = paper.discovered + paper.undiscovered
  const paperLine =
    paperUnknown === 0
      ? `all ${paper.learned} green`
      : `${paper.learned} you know · ${paperUnknown} you don't`
  const examOpen = examUnlocked(WORDS, srs, journey.banked, journey, journey.cityIndex)
  const trials = examTrials(WORDS, srs, journey.banked, journey, journey.cityIndex)
  const toNextTrial = greensToNextTrial(WORDS, srs, journey.banked, journey.cityIndex)
  // København has no next stop at all, stamps or no stamps. Every place that
  // names the next city has to ask this, not journeyDone — journeyDone also
  // wants a full passport, so at the last city with four stamps it is false
  // while cityAt(cityIndex + 1) still throws and blanks the app.
  const atRoadsEnd = journey.cityIndex >= FINAL_CITY_INDEX
  const nextCity = atRoadsEnd ? null : cityAt(journey.cityIndex + 1)
  const journeyDone = isJourneyComplete(journey)
  const travelReady = canTravel(journey, journey.cityIndex) && !atRoadsEnd

  const examAnswered = journey.activeExam
    ? Object.values(journey.activeExam.answers).filter((a) => a.trim().length > 0).length
    : 0

  const wotd = wordOfTheDay(journey.cityIndex)
  const daily = dailyChallenge()
  const dailyOutcome = localStorage.getItem(`cluecab-daily:${daily.key}`)
  // Three states, not two: no key at all, a key that has never been shown to
  // work, and everything fine. The middle one used to look like the last, so a
  // wrong key or a CORS block announced itself only after the player had picked
  // a grid and committed to a board.
  const needsSetup = !settings.apiKey && !settings.useMock
  const unverifiedKlaus = !needsSetup && !settings.useMock && settings.klausVerifiedAt === null

  const play = (gridSize?: GridSize) => {
    if (gridSize) settings.set({ gridSize })
    newGame({ seed: pendingSeed ?? undefined, gridSize })
    goTo('game')
  }

  const openExam = () => {
    const words = examWords(
      WORDS,
      srs,
      journey.banked,
      journey.cityIndex,
      mulberry32(Date.now() % 0xffffffff),
    )
    // Nothing left unbanked in this city: an empty paper would pass vacuously.
    if (words.length === 0) return
    journey.startExam(
      journey.cityIndex,
      words.map((w) => w.id),
    )
    goTo('gate')
  }

  return (
    <div className="screen home-screen">
      <div className="home-hero">
        <h1>ClueCabulary</h1>
        <p className="home-tagline">{LETTER.tagline}</p>
      </div>

      {needsSetup && (
        <button className="setup-nudge" onClick={() => goTo('settings')}>
          Add your Ollama API key in Settings to wake Klaus up →
        </button>
      )}

      {unverifiedKlaus && (
        <button className="setup-nudge" onClick={() => goTo('settings')}>
          Klaus has not answered yet — tap Test connection in Settings before you start a round →
        </button>
      )}

      <button className="map-button" onClick={() => goTo('map')} aria-label="Open the map">
        <JourneyMap cityIndex={journey.cityIndex} />
      </button>

      <section className="city-card">
        <p className="city-eyebrow">
          Stop {journey.cityIndex + 1} of {CITIES.length} · <span lang="da">{city.region}</span>
        </p>
        <h2 className="city-name" lang="da">
          {city.name}
        </h2>
        <p className="city-blurb" lang="da">
          {city.blurbDa}
        </p>
        <p className="city-champion">
          <span className="champion-motif-inline" aria-hidden="true">
            {champion.motif}
          </span>{' '}
          {champion.name} — <span lang="da">{champion.titleDa}</span> holds the{' '}
          <span lang="da">stempel</span> here
        </p>

        <div className="collect-bar" aria-hidden="true">
          <div
            className="collect-fill collect-learned"
            style={{ width: `${(cityCounts.learned / WORDS_PER_CITY) * 100}%` }}
          />
          <div
            className="collect-fill collect-discovered"
            style={{ width: `${(cityCounts.discovered / WORDS_PER_CITY) * 100}%` }}
          />
        </div>
        <p className="collect-count">
          <strong>{cityCounts.learned}</strong> learned ·{' '}
          <span className="dim">{cityCounts.discovered} discovered</span> ·{' '}
          <span className="dim">{cityCounts.undiscovered} to find</span>
        </p>

        <p className="passport-label">
          <span lang="da">Rejsepas</span>
          <span className="passport-gloss">
            {' '}
            —{' '}
            {nextCity
              ? `${GATES_PER_CITY} stempler open the road to ${nextCity.name}`
              : `${GATES_PER_CITY} stempler and the collection is complete`}
          </span>
        </p>
        <ul className="stamp-row" aria-label={`${stamps} of ${GATES_PER_CITY} stamps`}>
          {Array.from({ length: GATES_PER_CITY }, (_, i) => (
            <li key={i} className={`stamp ${i < stamps ? 'stamp-earned' : ''}`}>
              <span aria-hidden="true">{i < stamps ? '✓' : '○'}</span>
            </li>
          ))}
        </ul>
      </section>

      {game && game.phase !== 'finished' ? (
        <button className="btn btn-primary btn-big" onClick={() => goTo('game')}>
          Continue game
        </button>
      ) : (
        <button className="btn btn-primary btn-big" onClick={() => play()}>
          <span lang="da">Spil videre</span>
        </button>
      )}

      {journeyDone ? (
        <p className="journey-done">
          <span lang="da">Rejsen er slut</span> — you filled the passport in København.{' '}
          {allCounts.learned} of {WORDS.length} words learned.
        </p>
      ) : journey.activeExam ? (
        // A relaunch loses the screen but not the exam, and an open exam locks
        // the dictionary. Surface it so the lock always has a visible cause.
        <div className="exam-resume">
          <button className="btn btn-gate" onClick={() => goTo('gate')}>
            <span lang="da">Fortsæt rejseprøven</span>
            <span className="gate-paper">
              {examAnswered} of {journey.activeExam.wordIds.length} answered · the dictionary
              stays closed until you finish
            </span>
          </button>
          <button className="btn btn-quiet" onClick={() => journey.endExam()}>
            Abandon it
          </button>
        </div>
      ) : travelReady ? (
        <button className="btn btn-travel" onClick={() => goTo('map')}>
          <span lang="da">Rejs videre</span> → {nextCity?.name}
        </button>
      ) : (
        <button className="btn btn-gate" onClick={openExam} disabled={!examOpen || paper.total === 0}>
          <span lang="da">Rejseprøve</span>
          <span className="gate-paper">
            {!examOpen
              ? `${toNextTrial} more green ${toNextTrial === 1 ? 'word' : 'words'} earns an attempt`
              : trials.unlimited
                ? `Unlimited attempts · ${paperLine}`
                : `${trials.available} ${
                    trials.available === 1 ? 'attempt' : 'attempts'
                  } left · ${paperLine}`}
          </span>
          {examOpen && !trials.unlimited && (
            // Said before the tap, because the tap is what spends it.
            <span className="gate-cost">Opening the paper spends one</span>
          )}
        </button>
      )}

      <button className="btn" onClick={() => goTo('stats')}>
        <span lang="da">Samlingen</span> — {allCounts.learned} of {WORDS.length} learned
      </button>

      <p className="section-divider">
        <span lang="da">også</span>
      </p>

      <div className="grid-picker">
        <button className="grid-card" onClick={() => play('beginner')}>
          <span className="grid-card-size">3×4</span>
          <span className="grid-card-name">Beginner</span>
          <span className="grid-card-desc">
            12 words · {GRID_CONFIGS.beginner.turnTokens} clues
          </span>
        </button>
        <button className="grid-card" onClick={() => play('standard')}>
          <span className="grid-card-size">4×5</span>
          <span className="grid-card-name">Standard</span>
          <span className="grid-card-desc">
            20 words · {GRID_CONFIGS.standard.turnTokens} clues
          </span>
        </button>
      </div>

      <button className="daily-card" onClick={() => {
        newGame({ seed: daily.seed, dailyKey: daily.key, gridSize: 'standard' })
        goTo('game')
      }}>
        <span className="daily-card-name" lang="da">
          Dagens udfordring
        </span>
        <span className="daily-card-desc">Daily challenge — one shared 4×5 board per day</span>
        {dailyOutcome && <span className="daily-card-badge">{DAILY_BADGE[dailyOutcome]}</span>}
      </button>

      <button className="wotd" onClick={() => openSheet(wotd.id)}>
        <span className="wotd-label">
          <span lang="da">Dagens ord</span> · word of the day
        </span>
        <span className="wotd-da" lang="da">
          {wotd.pos === 'noun' && wotd.article ? `${wotd.article} ` : ''}
          {wotd.da}
        </span>
        <span className="wotd-en">{wotd.en[0]}</span>
      </button>

      <button className="howto-link" onClick={() => useUi.getState().openLetter()}>
        Read <span lang="da">{LETTER.fromShort}</span>'s letter again
      </button>

      <button className="howto-link" onClick={() => useUi.getState().openHowTo()}>
        How to play
      </button>

      <nav className="home-nav">
        <button className="btn" onClick={() => goTo('settings')}>
          Settings
        </button>
      </nav>
    </div>
  )
}
