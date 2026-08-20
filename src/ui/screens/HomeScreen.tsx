import { DEFAULT_BASE_URL } from '../../ai/client'
import { WORDS } from '../../data/words'
import { CITIES, FINAL_CITY_INDEX, WORDS_PER_CITY, cityAt } from '../../journey/cities'
import {
  DENMARK_HATCH,
  DENMARK_PATH,
  DENMARK_SKETCH,
  MAP_HEIGHT,
  MAP_WIDTH,
  projectCity,
} from '../../journey/denmark'
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
 *
 * Casey is the biggest thing on the screen and that is the point: he is the
 * app's face and its store screenshot. Everything above him is a strip. The
 * progress band in particular is *one line that cannot wrap* — the city, a
 * short bar, and the two numbers that mean something. The four-part count it
 * replaced took three lines at 360px and pushed him down into a thumbnail; the
 * rest of the breakdown lives in the suitcase, which is where a breakdown
 * belongs.
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
      <path className="map-hatch" d={DENMARK_HATCH} />
      <path className="map-sketch" d={DENMARK_SKETCH} />
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
  // There used to be a second banner above this one, shown when `apiKey` was
  // blank. Settings v7 cleared every stored key and the app talks to the proxy
  // without one, so "Add your API key in Settings" fired for *every* player,
  // for a thing none of them needs — it is deleted, not moved.
  //
  // What survives is the honest half of it: a player who has set up an AI
  // connection of their own and has never once had an answer out of it. Own
  // key or own base URL — the deploy guide's recommended setup is a worker
  // holding the key as a Cloudflare secret and *nothing* in the app, so
  // testing the key alone would leave exactly the people following the guide
  // with no way to hear that their worker is not answering. (proxy-drive walks
  // that setup and found this: it reached Settings through the banner this
  // card deleted.) Anything still on the shipped proxy with no key of its own
  // has configured nothing and is told nothing.
  //
  // `klausVerifiedAt` is stamped the moment Casey replies in ordinary play, so
  // this clears itself on the first round that works — and the store resets it
  // whenever the key or the base URL changes, so it re-arms if you point the
  // app somewhere new. useMock suppresses it as before: the practice companion
  // needs nothing, and the round itself says so.
  const ownConnection =
    settings.apiKey.trim() !== '' ||
    settings.baseUrl.trim().replace(/\/+$/, '') !== DEFAULT_BASE_URL
  const unverifiedCluey =
    !settings.useMock && ownConnection && settings.klausVerifiedAt === null

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

      <button className="map-button" onClick={() => goTo('map')} aria-label="Open the map">
        <JourneyMap cityIndex={journey.cityIndex} />
      </button>

      {/* One line, and structurally incapable of becoming two: every part is
          nowrap, the bar is the only thing that flexes, and the city name
          ellipsises before anything can overflow. "Stop N of 9" went — the map
          directly above says where you are, twice, in the label and in its
          accessible name. The bar keeps the discovered layer, so the number
          the text no longer prints is still on the screen. */}
      <section className="city-card home-progress-band">
        <p className="city-eyebrow" lang="da">
          {city.name}
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
          <span className="dim">{cityCounts.collected} collected</span>
        </p>
      </section>

      <Cluey needsConnection={unverifiedCluey} />

      {/* The one line of chrome deliberately left in Danish. Everything a
          player must READ to operate the app is English now, but this is not
          operable — it is the last thing the game ever says, after nine
          hundred words, and by then it is a sentence you can read. Nothing is
          lost if you cannot: the English clause carries the meaning. */}
      {journeyDone && (
        <p className="journey-done">
          <span lang="da">Rejsen er slut</span> — you packed the last suitcase in København.
        </p>
      )}
      {travelReady && (
        <button className="btn btn-travel" onClick={() => goTo('map')}>
          Travel on → {nextCity?.name}
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
            Play
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
