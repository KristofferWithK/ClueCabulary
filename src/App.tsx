import { useEffect } from 'react'
import { WORDS } from './data/words'
import { GATES_PER_CITY } from './journey/cities'
import { LEARN_REPS, wordsForCity } from './journey/progress'
import { useJourney } from './stores/journeyStore'
import { useSettings } from './stores/settingsStore'
import { useSrs } from './stores/srsStore'
import { consumeSelfPop, shouldShowHowTo, useUi } from './stores/uiStore'
import { DictionarySheet } from './ui/components/DictionarySheet'
import { HowToPlay } from './ui/components/HowToPlay'
import { GameScreen } from './ui/screens/GameScreen'
import { GateExamScreen } from './ui/screens/GateExamScreen'
import { HomeScreen } from './ui/screens/HomeScreen'
import { MapScreen } from './ui/screens/MapScreen'
import { CollectionScreen } from './ui/screens/CollectionScreen'
import { SettingsScreen } from './ui/screens/SettingsScreen'

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

    // ?learned=K marks the first K words of the city as green.
    const learned = params.get('learned') ?? params.get('collected')
    if (learned && /^\d{1,3}$/.test(learned)) {
      const now = Date.now()
      const stats = { ...useSrs.getState().stats }
      for (const w of wordsForCity(WORDS, cityIndex).slice(0, Number(learned))) {
        stats[w.id] = {
          box: 3,
          lastSeenAt: now,
          seen: 3,
          correctGuesses: LEARN_REPS,
          misses: 0,
          lookups: 0,
          redemptionRight: 0,
          redemptionWrong: 0,
        }
      }
      useSrs.setState({ stats })
    }

    // ?almost=K leaves the first K words one handling short of green, so a
    // single round can be driven over the line in a test.
    const almost = params.get('almost')
    if (almost && /^\d{1,3}$/.test(almost)) {
      const now = Date.now()
      const stats = { ...useSrs.getState().stats }
      for (const w of wordsForCity(WORDS, cityIndex).slice(0, Number(almost))) {
        stats[w.id] = {
          box: 2,
          lastSeenAt: now - 3 * 24 * 60 * 60 * 1000,
          seen: LEARN_REPS - 1,
          correctGuesses: LEARN_REPS - 1,
          misses: 0,
          lookups: 0,
          redemptionRight: 0,
          redemptionWrong: 0,
        }
      }
      useSrs.setState({ stats })
    }

    const stamps = params.get('stamps')
    if (stamps && /^\d$/.test(stamps)) {
      const earned = Math.min(Number(stamps), GATES_PER_CITY)
      useJourney.setState((s) => ({ stamps: { ...s.stamps, [cityIndex]: earned } }))
    }
  }, [])

  // Android back gesture / browser back: close the top-most layer, then fall
  // back to home — never straight out of the installed PWA.
  useEffect(() => {
    const onPop = () => {
      // An in-app close already updated the state and asked for this pop;
      // handling it again would close a second layer.
      if (consumeSelfPop()) return
      const ui = useUi.getState()
      if (ui.sheetWordId) {
        useUi.setState({ sheetWordId: null })
      } else if (ui.howToOpen) {
        ui.closeHowTo()
      } else if (ui.screen !== 'home') {
        // Backing out of a travel exam suspends it rather than binning it — the
        // attempt was spent when the paper was drawn, so the paper has to
        // survive being put down. Home surfaces it, which is what keeps the
        // app-wide dictionary lock from becoming an invisible dead end.
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
      {screen === 'stats' && <CollectionScreen />}
      {screen === 'map' && <MapScreen />}
      {screen === 'gate' && <GateExamScreen />}
      <DictionarySheet />
      <HowToPlay />
    </main>
  )
}
