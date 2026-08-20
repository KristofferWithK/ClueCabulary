import { WORDS } from '../../data/words'
import { CITIES, FINAL_CITY_INDEX, WORDS_PER_CITY, cityAt } from '../../journey/cities'
import { DENMARK_PATH, MAP_HEIGHT, MAP_WIDTH, projectCity } from '../../journey/denmark'
import {
  canTravel,
  countCollection,
  isJourneyComplete,
  wordsForCity,
} from '../../journey/progress'
import { useGame } from '../../stores/gameStore'
import { useJourney } from '../../stores/journeyStore'
import { useSettings } from '../../stores/settingsStore'
import { useSrs } from '../../stores/srsStore'
import { useUi } from '../../stores/uiStore'
import { Cluey } from '../components/Cluey'

/**
 * Home in three bands, per the notebook sketch: the journey (map and
 * progress) on top, Casey in the middle with something to say, and Play at
 * the bottom between the daily star and the rules. Nothing scrolls; anything
 * deeper lives one tap away — the map, the case, Settings behind the gear.
 */

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
  const game = useGame((s) => s.game)
  const newGame = useGame((s) => s.newGame)
  const settings = useSettings()
  const srs = useSrs((s) => s.stats)
  const journey = useJourney()

  const city = cityAt(journey.cityIndex)
  const cityCounts = countCollection(wordsForCity(WORDS, journey.cityIndex), srs, journey.wrapped)
  // København has no next stop at all, packed suitcase or not — journeyDone
  // also wants the suitcase full, so at the last city it can be false while
  // cityAt(cityIndex + 1) still throws and blanks the app.
  const atRoadsEnd = journey.cityIndex >= FINAL_CITY_INDEX
  const nextCity = atRoadsEnd ? null : cityAt(journey.cityIndex + 1)
  const journeyDone = isJourneyComplete(WORDS, journey.wrapped, journey.cityIndex)
  const travelReady = canTravel(WORDS, journey.wrapped, journey.cityIndex) && !atRoadsEnd

  const daily = dailyChallenge()
  const dailyOutcome = localStorage.getItem(`cluecab-daily:${daily.key}`)
  // Three states, not two: no key at all, a key that has never been shown to
  // work, and everything fine. Still suppressed by useMock, deliberately —
  // someone who ticked "Practice companion" does not need a key, and the
  // practice note inside the round carries the signal there.
  const needsSetup = !settings.apiKey && !settings.useMock
  const unverifiedCluey = !needsSetup && !settings.useMock && settings.klausVerifiedAt === null

  const play = () => {
    newGame({ seed: pendingSeed ?? undefined })
    goTo('game')
  }

  const playDaily = () => {
    newGame({ seed: daily.seed, dailyKey: daily.key })
    goTo('game')
  }

  return (
    <div className="screen home-screen">
      <header className="home-top">
        <h1 className="home-title">900Words</h1>
        <button className="icon-btn" aria-label="Settings" onClick={() => goTo('settings')}>
          ⚙
        </button>
      </header>

      {needsSetup && (
        <button className="setup-nudge" onClick={() => goTo('settings')}>
          Add your API key in Settings to wake Casey up →
        </button>
      )}

      {unverifiedCluey && (
        <button className="setup-nudge" onClick={() => goTo('settings')}>
          Casey has not answered yet — tap Test connection in Settings first →
        </button>
      )}

      <button className="map-button" onClick={() => goTo('map')} aria-label="Open the map">
        <JourneyMap cityIndex={journey.cityIndex} />
      </button>

      <section className="city-card home-progress-band">
        <p className="city-eyebrow">
          Stop {journey.cityIndex + 1} of {CITIES.length} ·{' '}
          <span lang="da">{city.name}</span>
        </p>
        <div className="collect-bar" aria-hidden="true">
          <div
            className="collect-fill collect-learned"
            style={{
              width: `${((cityCounts.wrapped + cityCounts.collected) / WORDS_PER_CITY) * 100}%`,
            }}
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
      </section>

      <Cluey />

      {journeyDone && (
        <p className="journey-done">
          <span lang="da">Rejsen er slut</span> — you packed the last suitcase in København.
        </p>
      )}
      {travelReady && (
        <button className="btn btn-travel" onClick={() => goTo('map')}>
          <span lang="da">Rejs videre</span> → {nextCity?.name}
        </button>
      )}

      <div className="home-actions">
        <button
          className={`icon-btn home-daily ${dailyOutcome ? 'home-daily-done' : ''}`}
          aria-label={
            dailyOutcome
              ? `Daily challenge — played today (${dailyOutcome})`
              : 'Daily challenge — one shared board per date'
          }
          onClick={playDaily}
        >
          ★
        </button>
        {game && game.phase !== 'finished' ? (
          <button className="btn btn-primary btn-big home-play" onClick={() => goTo('game')}>
            Continue game
          </button>
        ) : (
          <button className="btn btn-primary btn-big home-play" onClick={play}>
            <span lang="da">Spil videre</span>
          </button>
        )}
        <button
          className="icon-btn"
          aria-label="How to play"
          onClick={() => useUi.getState().openHowTo()}
        >
          ?
        </button>
      </div>
    </div>
  )
}
