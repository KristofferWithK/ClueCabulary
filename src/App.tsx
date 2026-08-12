import { useEffect, useState } from 'react'
import { WORDS } from './data/words'
import { GATES_PER_CITY, cityAt } from './journey/cities'
import { LEARN_REPS, wordsForCity } from './journey/progress'
import { rescueStrandedJourney, useJourney } from './stores/journeyStore'
import { useSettings } from './stores/settingsStore'
import { useSrs } from './stores/srsStore'
import {
  consumeSelfPop,
  devSwitchesAllowed,
  shouldShowHowTo,
  shouldShowLetter,
  useUi,
} from './stores/uiStore'
import { DictionarySheet } from './ui/components/DictionarySheet'
import { GrandmotherLetter } from './ui/components/GrandmotherLetter'
import { HowToPlay } from './ui/components/HowToPlay'
import { UpdateBanner } from './ui/components/UpdateBanner'
import { GameScreen } from './ui/screens/GameScreen'
import { GateExamScreen } from './ui/screens/GateExamScreen'
import { HomeScreen } from './ui/screens/HomeScreen'
import { MapScreen } from './ui/screens/MapScreen'
import { CollectionScreen } from './ui/screens/CollectionScreen'
import { SettingsScreen } from './ui/screens/SettingsScreen'

export default function App() {
  const screen = useUi((s) => s.screen)
  const [rescued, setRescued] = useState<{ cityIndex: number; stamps: number; banked: number } | null>(
    null,
  )

  // Before anything reads the journey: give back what the v1 -> v2 key rename
  // took. Merges, never replaces, and runs once per device.
  useEffect(() => {
    const r = rescueStrandedJourney()
    if (r.outcome === 'rescued' && r.recovered) setRescued(r.recovered)

    // A marked paper does not survive a relaunch. Its stempel is already
    // awarded, and leaving it active would offer it back on Home as unfinished
    // work while silently locking the dictionary. Only unmarked papers resume.
    if (useJourney.getState().activeExam?.gradedAt) useJourney.getState().endExam()
  }, [])

  // Dev/e2e switches: ?mock=1 selects the offline companion, ?seed=N fixes the board.
  useEffect(() => {
    // These overwrite the collection — ?learned=100 rewrites a hundred word
    // records with no confirmation — so they must not exist on a deployed site
    // where a shared link could carry them. Local only; the Playwright drives
    // run against 127.0.0.1, so they keep working.
    if (!devSwitchesAllowed()) return
    const params = new URLSearchParams(window.location.search)
    if (params.get('mock') === '1') useSettings.getState().set({ useMock: true })
    const seed = params.get('seed')
    if (seed && /^\d+$/.test(seed)) {
      useUi.setState({ pendingSeed: Number(seed) })
    }
    // The invitation comes before the rules: the letter opens, and closing it
    // hands over to How to Play. ?howto=0 skips both, for the drives.
    const skipIntro = params.get('howto') === '0' || params.get('letter') === '0'
    if (shouldShowLetter() && !skipIntro) useUi.getState().openLetter()
    else if (shouldShowHowTo() && !skipIntro) useUi.getState().openHowTo()

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
      } else if (ui.letterOpen) {
        useUi.setState({ letterOpen: false })
      } else if (ui.howToOpen) {
        ui.closeHowTo()
      } else if (ui.screen !== 'home') {
        // Backing out of an unmarked travel exam suspends it rather than
        // binning it — the attempt was spent when the paper was drawn, so the
        // paper has to survive being put down, and Home surfaces it. A marked
        // one is finished: its stempel is already awarded, and leaving it on
        // the shelf would only lock the dictionary for nothing.
        const exam = useJourney.getState().activeExam
        if (ui.screen === 'gate' && exam?.gradedAt) useJourney.getState().endExam()
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
      {rescued && (
        <div className="update-banner" role="status">
          <span>
            Found progress from an older version: {cityAt(rescued.cityIndex).name},{' '}
            {rescued.stamps} {rescued.stamps === 1 ? 'stempel' : 'stempler'}. Put back.
          </span>
          <div className="update-actions">
            <button className="btn btn-small btn-primary" onClick={() => setRescued(null)}>
              Good
            </button>
          </div>
        </div>
      )}
      <DictionarySheet />
      <GrandmotherLetter />
      <HowToPlay />
      <UpdateBanner />
    </main>
  )
}
