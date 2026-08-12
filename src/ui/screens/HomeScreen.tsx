import { WORDS } from '../../data/words'
import { cityAt, GATES_PER_CITY, WORDS_PER_CITY } from '../../journey/cities'
import {
  canTravel,
  cityGateStatuses,
  collectedCount,
  currentGateIndex,
  unlockedWords,
  wordsForCity,
  type GateStatus,
} from '../../journey/progress'
import { GRID_CONFIGS, type GridSize } from '../../engine/config'
import { useGame } from '../../stores/gameStore'
import { collectedSet, useJourney } from '../../stores/journeyStore'
import { useSettings } from '../../stores/settingsStore'
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
  const key = `${y}-${m}-${d}`
  return { key, seed: y * 10000 + (now.getMonth() + 1) * 100 + now.getDate() }
}

const DAILY_BADGE: Record<string, string> = {
  won: '✓ solved',
  redeemed: '🔥 redeemed',
  lost: '· played',
}

const GATE_LABEL: Record<GateStatus, string> = {
  passed: 'passed',
  ready: 'ready to test',
  locked: 'still collecting',
}

export function HomeScreen() {
  const goTo = useUi((s) => s.goTo)
  const pendingSeed = useUi((s) => s.pendingSeed)
  const openSheet = useUi((s) => s.openSheet)
  const game = useGame((s) => s.game)
  const newGame = useGame((s) => s.newGame)
  const settings = useSettings()
  const journey = useJourney()
  const collectedIds = collectedSet(journey.collectedAt)

  const city = cityAt(journey.cityIndex)
  const cityWords = wordsForCity(WORDS, journey.cityIndex)
  const collected = collectedCount(cityWords, collectedIds)
  const gates = cityGateStatuses(WORDS, collectedIds, journey, journey.cityIndex)
  const nextGate = currentGateIndex(WORDS, collectedIds, journey, journey.cityIndex)
  const readyGate = gates.findIndex((s) => s === 'ready')
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

  const openExam = (gateIndex: number) => {
    journey.startExam(journey.cityIndex, gateIndex)
    useUi.getState().openGate(gateIndex)
  }

  const startDaily = () => {
    newGame({ seed: daily.seed, dailyKey: daily.key, gridSize: 'standard' })
    goTo('game')
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

      <section className="city-card">
        <p className="city-eyebrow">
          Stop {journey.cityIndex + 1} of 10 · <span lang="da">{city.region}</span>
        </p>
        <h2 className="city-name" lang="da">
          {city.name}
        </h2>
        <p className="city-blurb" lang="da">
          {city.blurbDa}
        </p>
        <p className="city-blurb-en">{city.blurbEn}</p>

        <div
          className="collect-bar"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={WORDS_PER_CITY}
          aria-valuenow={collected}
          aria-label={`${collected} of ${WORDS_PER_CITY} words collected in ${city.name}`}
        >
          <div className="collect-fill" style={{ width: `${collected}%` }} />
        </div>
        <p className="collect-count">
          <strong>{collected}</strong> / {WORDS_PER_CITY} words collected
        </p>

        <ul className="gate-pips">
          {gates.map((status, i) => (
            <li key={i} className={`gate-pip gate-${status}`}>
              <span className="visually-hidden">
                Gate {i + 1} of {GATES_PER_CITY}: {GATE_LABEL[status]}
              </span>
              <span aria-hidden="true">{status === 'passed' ? '✓' : i + 1}</span>
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
      ) : readyGate >= 0 ? (
        <button className="btn btn-gate" onClick={() => openExam(readyGate)}>
          <span lang="da">Rejseprøve</span> {readyGate + 1} of {GATES_PER_CITY} — 20 words ready
        </button>
      ) : (
        <p className="gate-hint">
          Collect the next {GATES_PER_CITY > 0 ? 20 : 0} words to open{' '}
          <span lang="da">rejseprøve</span> {nextGate + 1}.
        </p>
      )}

      <button className="btn" onClick={() => goTo('map')}>
        <span lang="da">Se kortet</span> · view the map
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

      <button className="daily-card" onClick={startDaily}>
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
        <button className="btn" onClick={() => goTo('stats')}>
          Progress
        </button>
        <button className="btn" onClick={() => goTo('settings')}>
          Settings
        </button>
      </nav>
    </div>
  )
}
