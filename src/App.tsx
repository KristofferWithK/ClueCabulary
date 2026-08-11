import { useEffect } from 'react'
import { useSettings } from './stores/settingsStore'
import { shouldShowHowTo, useUi } from './stores/uiStore'
import { DictionarySheet } from './ui/components/DictionarySheet'
import { HowToPlay } from './ui/components/HowToPlay'
import { GameScreen } from './ui/screens/GameScreen'
import { HomeScreen } from './ui/screens/HomeScreen'
import { SettingsScreen } from './ui/screens/SettingsScreen'
import { StatsScreen } from './ui/screens/StatsScreen'

export default function App() {
  const screen = useUi((s) => s.screen)

  // Dev/e2e switches: ?mock=1 selects the offline companion, ?seed=N fixes the board.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('mock') === '1') useSettings.getState().set({ useMock: true })
    const seed = params.get('seed')
    if (seed && /^\d+$/.test(seed)) {
      useUi.setState({ pendingSeed: Number(seed) })
    }
    if (shouldShowHowTo() && params.get('howto') !== '0') useUi.getState().openHowTo()
  }, [])

  // Android back gesture / browser back: close the top-most layer, then fall
  // back to home — never straight out of the installed PWA.
  useEffect(() => {
    const onPop = () => {
      const ui = useUi.getState()
      if (ui.sheetWordId) {
        useUi.setState({ sheetWordId: null })
      } else if (ui.howToOpen) {
        ui.closeHowTo()
      } else if (ui.screen !== 'home') {
        useUi.setState({ screen: 'home', sheetWordId: null })
      }
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  return (
    <main className="app-shell">
      {screen === 'home' && <HomeScreen />}
      {screen === 'game' && <GameScreen />}
      {screen === 'settings' && <SettingsScreen />}
      {screen === 'stats' && <StatsScreen />}
      <DictionarySheet />
      <HowToPlay />
    </main>
  )
}
