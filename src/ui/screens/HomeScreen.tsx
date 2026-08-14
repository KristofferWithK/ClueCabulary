import { articleLabel } from '../../data/gender'
import { WORDS } from '../../data/words'
import { GRID_CONFIGS, type GridSize } from '../../engine/config'
import { CITIES, FINAL_CITY_INDEX, WORDS_PER_CITY, cityAt } from '../../journey/cities'

import { DENMARK_PATH, MAP_HEIGHT, MAP_WIDTH, projectCity } from '../../journey/denmark'
import {
  WRAP_TO_TRAVEL,
  canTravel,
  countCollection,
  isJourneyComplete,
  unlockedWords,
  wordsForCity,
} from '../../journey/progress'
import { useGame } from '../../stores/gameStore'
import { useJourney } from '../../stores/journeyStore'
import { useSettings } from '../../stores/settingsStore'
import { useSrs } from '../../stores/srsStore'
import { useUi } from '../../stores/uiStore'


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

/** The three boards, in the order the picker shows them: the difficulty ramp. */
const GRIDS: ReadonlyArray<{ size: GridSize; label: string; name: string }> = [
  { size: 'beginner', label: '3×4', name: 'Beginner' },
  { size: 'middle', label: '3×5', name: 'Middle' },
  { size: 'standard', label: '4×5', name: 'Standard' },
]

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
  const cityCounts = countCollection(wordsForCity(WORDS, journey.cityIndex), srs, journey.wrapped)
  const allCounts = countCollection(WORDS, srs, journey.wrapped)
  // København has no next stop at all, packed suitcase or not. Every place
  // that names the next city has to ask this, not journeyDone — journeyDone
  // also wants the suitcase full, so at the last city it can be false while
  // cityAt(cityIndex + 1) still throws and blanks the app.
  const atRoadsEnd = journey.cityIndex >= FINAL_CITY_INDEX
  const nextCity = atRoadsEnd ? null : cityAt(journey.cityIndex + 1)
  const journeyDone = isJourneyComplete(WORDS, journey.wrapped, journey.cityIndex)
  const travelReady = canTravel(WORDS, journey.wrapped, journey.cityIndex) && !atRoadsEnd

  const wotd = wordOfTheDay(journey.cityIndex)
  const daily = dailyChallenge()
  const dailyOutcome = localStorage.getItem(`cluecab-daily:${daily.key}`)
  // Three states, not two: no key at all, a key that has never been shown to
  // work, and everything fine. The middle one used to look like the last, so a
  // wrong key or a CORS block announced itself only after the player had picked
  // a grid and committed to a board.
  // Still suppressed by useMock, deliberately. Someone who ticked "Practice
  // companion" does not need a key and should not be nagged for one — and on a
  // 360x640 phone the nudge pushes the primary action below the fold, which
  // layout-drive catches. The signal that was missing belongs in the round
  // instead: the practice note now fires for this route too, on the screen
  // where a random-looking guess is actually confusing someone.
  const needsSetup = !settings.apiKey && !settings.useMock
  const unverifiedCluey = !needsSetup && !settings.useMock && settings.klausVerifiedAt === null

  const play = (gridSize?: GridSize) => {
    if (gridSize) settings.set({ gridSize })
    newGame({ seed: pendingSeed ?? undefined, gridSize })
    goTo('game')
  }

  return (
    <div className="screen home-screen">
      <div className="home-hero">
        <h1>ClueCabulary</h1>
        <p className="home-tagline">Learn Danish one clue at a time.</p>
      </div>

      {needsSetup && (
        <button className="setup-nudge" onClick={() => goTo('settings')}>
          Add your Ollama API key in Settings to wake Cluey up →
        </button>
      )}

      {unverifiedCluey && (
        <button className="setup-nudge" onClick={() => goTo('settings')}>
          Cluey has not answered yet — tap Test connection in Settings before you start a round →
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
        <div className="collect-bar" aria-hidden="true">
          <div
            className="collect-fill collect-learned"
            style={{ width: `${((cityCounts.wrapped + cityCounts.collected) / WORDS_PER_CITY) * 100}%` }}
          />
          <div
            className="collect-fill collect-discovered"
            style={{ width: `${(cityCounts.discovered / WORDS_PER_CITY) * 100}%` }}
          />
        </div>
        <p className="collect-count">
          <strong>{cityCounts.wrapped}</strong> wrapped ·{' '}
          <span className="dim">{cityCounts.collected} collected</span> ·{' '}
          <span className="dim">{cityCounts.discovered} discovered</span> ·{' '}
          <span className="dim">{cityCounts.undiscovered} to find</span>
        </p>

        <p className="passport-label">
          <span lang="da">Pak kufferten</span>
          <span className="passport-gloss">
            {' '}
            —{' '}
            {nextCity
              ? `wrap all ${WRAP_TO_TRAVEL} words to open the road to ${nextCity.name}`
              : `wrap all ${WRAP_TO_TRAVEL} words and the collection is complete`}
          </span>
        </p>
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
          <span lang="da">Rejsen er slut</span> — you packed the last suitcase in København.{' '}
          {allCounts.wrapped} of {WORDS.length} words wrapped.
        </p>
      ) : travelReady ? (
        <button className="btn btn-travel" onClick={() => goTo('map')}>
          <span lang="da">Rejs videre</span> → {nextCity?.name}
        </button>
      ) : null}

      <button className="btn" onClick={() => goTo('stats')}>
        <span lang="da">Kufferten</span> — {allCounts.wrapped} wrapped ·{' '}
        {allCounts.collected} collected
      </button>

      <p className="section-divider">
        <span lang="da">også</span>
      </p>

      {/* Tapping one of these stores it, so the picker is also the answer to
          "what will «Spil videre» deal?" — a question the screen used to leave
          unanswered while quietly holding a value. The order is the difficulty
          ramp and stays fixed whatever the default is; several drives address
          these cards by index. */}
      <div className="grid-picker">
        {GRIDS.map((g) => {
          const current = settings.gridSize === g.size
          return (
            <button
              key={g.size}
              className={`grid-card ${current ? 'grid-card-current' : ''}`}
              aria-current={current ? 'true' : undefined}
              onClick={() => play(g.size)}
            >
              <span className="grid-card-size">{g.label}</span>
              <span className="grid-card-name">{g.name}</span>
              <span className="grid-card-desc">
                {GRID_CONFIGS[g.size].totalWords} words · {GRID_CONFIGS[g.size].turnTokens} clues
              </span>
              {current && <span className="grid-card-tag">your board</span>}
            </button>
          )
        })}
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
          {articleLabel(wotd) ? `${articleLabel(wotd)} ` : ''}
          {wotd.da}
        </span>
        <span className="wotd-en">{wotd.en[0]}</span>
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
