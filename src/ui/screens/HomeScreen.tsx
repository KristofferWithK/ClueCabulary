import { WORDS } from '../../data/words'
import { GRID_CONFIGS, type GridSize } from '../../engine/config'
import { useGame } from '../../stores/gameStore'
import { useSettings } from '../../stores/settingsStore'
import { useSrs } from '../../stores/srsStore'
import { useUi } from '../../stores/uiStore'

export function HomeScreen() {
  const goTo = useUi((s) => s.goTo)
  const pendingSeed = useUi((s) => s.pendingSeed)
  const game = useGame((s) => s.game)
  const newGame = useGame((s) => s.newGame)
  const settings = useSettings()
  const seenCount = useSrs((s) => Object.keys(s.stats).length)

  const start = (gridSize: GridSize) => {
    settings.set({ gridSize })
    newGame(pendingSeed ?? undefined)
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
