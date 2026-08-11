import { WORDS } from '../../data/words'
import { GRID_CONFIGS, type GridSize } from '../../engine/config'
import { useGame } from '../../stores/gameStore'
import { useSettings } from '../../stores/settingsStore'
import { useSrs } from '../../stores/srsStore'
import { useUi } from '../../stores/uiStore'

/** Deterministic pick that changes daily — a small NYT-style ritual. */
function wordOfTheDay() {
  const now = new Date()
  const dayKey = now.getFullYear() * 372 + now.getMonth() * 31 + now.getDate()
  return WORDS[(dayKey * 2654435761) % WORDS.length]!
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

export function HomeScreen() {
  const goTo = useUi((s) => s.goTo)
  const pendingSeed = useUi((s) => s.pendingSeed)
  const game = useGame((s) => s.game)
  const newGame = useGame((s) => s.newGame)
  const settings = useSettings()
  const seenCount = useSrs((s) => Object.keys(s.stats).length)

  const openSheet = useUi((s) => s.openSheet)
  const wotd = wordOfTheDay()
  const daily = dailyChallenge()
  const dailyOutcome = localStorage.getItem(`cluecab-daily:${daily.key}`)

  const start = (gridSize: GridSize) => {
    settings.set({ gridSize })
    newGame({ seed: pendingSeed ?? undefined })
    goTo('game')
  }

  const startDaily = () => {
    newGame({ seed: daily.seed, dailyKey: daily.key, gridSize: 'standard' })
    goTo('game')
  }

  const needsSetup = !settings.apiKey && !settings.useMock

  return (
    <div className="screen home-screen">
      <div className="home-hero">
        <h1>ClueCabulary</h1>
        <p className="tagline">Learn Danish one clue at a time — with Klaus, your AI makker.</p>
        {seenCount > 0 && (
          <p className="home-progress">
            {seenCount} / {WORDS.length} words met
          </p>
        )}
      </div>

      {needsSetup && (
        <button className="setup-nudge" onClick={() => goTo('settings')}>
          Add your Ollama API key in Settings to wake Klaus up →
        </button>
      )}

      {game && game.phase !== 'finished' && (
        <button className="btn btn-primary btn-big" onClick={() => goTo('game')}>
          Continue game
        </button>
      )}

      <div className="grid-picker">
        <button className="grid-card" onClick={() => start('beginner')}>
          <span className="grid-card-size">3×4</span>
          <span className="grid-card-name">Beginner</span>
          <span className="grid-card-desc">
            12 words · {GRID_CONFIGS.beginner.turnTokens} clues
          </span>
        </button>
        <button className="grid-card" onClick={() => start('standard')}>
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
        <span className="daily-card-desc">
          Daily challenge — one shared 4×5 board per day
        </span>
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
