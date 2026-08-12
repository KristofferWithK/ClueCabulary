import { WORDS } from '../../data/words'
import { GRID_CONFIGS, type GridSize } from '../../engine/config'
import { mulberry32 } from '../../engine/rng'
import { CITIES, GATES_PER_CITY, WORDS_PER_CITY, cityAt } from '../../journey/cities'
import { DENMARK_PATH, MAP_HEIGHT, MAP_WIDTH, projectCity } from '../../journey/denmark'
import {
  canTravel,
  countCollection,
  EXAM_MIN_GREEN,
  examComposition,
  examUnlocked,
  examWords,
  stampsFor,
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
      <text className="home-map-here" x={here.x} y={here.y - 42} textAnchor="middle">
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
  const cityCounts = countCollection(wordsForCity(WORDS, journey.cityIndex), srs, journey.banked)
  const allCounts = countCollection(WORDS, srs, journey.banked)
  const stamps = stampsFor(journey, journey.cityIndex)
  const paper = examComposition(WORDS, srs, journey.banked, journey.cityIndex)
  const paperUnknown = paper.discovered + paper.undiscovered
  const examOpen = examUnlocked(WORDS, srs, journey.banked, journey.cityIndex)
  const travelReady = canTravel(journey, journey.cityIndex)

  const wotd = wordOfTheDay(journey.cityIndex)
  const daily = dailyChallenge()
  const dailyOutcome = localStorage.getItem(`cluecab-daily:${daily.key}`)
  const needsSetup = !settings.apiKey && !settings.useMock

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
      </div>

      {needsSetup && (
        <button className="setup-nudge" onClick={() => goTo('settings')}>
          Add your Ollama API key in Settings to wake Klaus up →
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

        <p className="passport-label" lang="da">
          Rejsepas
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

      {travelReady ? (
        <button className="btn btn-travel" onClick={() => goTo('map')}>
          <span lang="da">Rejs videre</span> → {cityAt(journey.cityIndex + 1).name}
        </button>
      ) : (
        <button className="btn btn-gate" onClick={openExam} disabled={!examOpen}>
          <span lang="da">Rejseprøve</span>
          <span className="gate-paper">
            {!examOpen
              ? `${paper.learned} / ${EXAM_MIN_GREEN} green words needed to sit it`
              : paperUnknown === 0
                ? `all ${paper.learned} words green — a fair test`
                : `${paper.learned} you know · ${paperUnknown} you don't`}
          </span>
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
