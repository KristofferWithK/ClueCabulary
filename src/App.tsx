import { useEffect } from 'react'
import { WORDS } from './data/words'
import { GATES_PER_CITY } from './journey/cities'
import { wordsForCity } from './journey/progress'
import { useJourney } from './stores/journeyStore'
import { useSettings } from './stores/settingsStore'
import { useSrs } from './stores/srsStore'
import { shouldShowHowTo, useUi } from './stores/uiStore'
import { DictionarySheet } from './ui/components/DictionarySheet'
import { HowToPlay } from './ui/components/HowToPlay'
import { GameScreen } from './ui/screens/GameScreen'
import { GateExamScreen } from './ui/screens/GateExamScreen'
import { HomeScreen } from './ui/screens/HomeScreen'
import { MapScreen } from './ui/screens/MapScreen'
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

    // Journey dev switches, so the travel screens can be driven in tests:
    // ?city=N jumps to a stop, ?collected=K collects K of its words,
    // ?gates=G marks G travel exams as already passed.
    const city = params.get('city')
    if (city && /^\d$/.test(city)) useJourney.setState({ cityIndex: Number(city) })
    const cityIndex = useJourney.getState().cityIndex

    const collected = params.get('collected')
    if (collected && /^\d{1,3}$/.test(collected)) {
      const now = Date.now()
      const stats = { ...useSrs.getState().stats }
      for (const w of wordsForCity(WORDS, cityIndex).slice(0, Number(collected))) {
        stats[w.id] = {
          box: 2,
          lastSeenAt: now,
          seen: 2,
          correctGuesses: 2,
          misses: 0,
          lookups: 0,
          redemptionRight: 0,
          redemptionWrong: 0,
        }
      }
      useSrs.setState({ stats })
    }

    const gates = params.get('gates')
    if (gates && /^\d$/.test(gates)) {
      const passed = Array.from({ length: Math.min(Number(gates), GATES_PER_CITY) }, (_, i) => i)
      useJourney.setState((s) => ({ gatesPassed: { ...s.gatesPassed, [cityIndex]: passed } }))
    }

    // Credit everything already proven — including progress made before the
    // journey existed — into the add-only collection latch.
    useJourney.getState().syncCollected(useSrs.getState().stats, Date.now())
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
      {screen === 'map' && <MapScreen />}
      {screen === 'gate' && <GateExamScreen />}
      <DictionarySheet />
      <HowToPlay />
    </main>
  )
}
