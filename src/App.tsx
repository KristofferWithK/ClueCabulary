import { useEffect, useState } from 'react'
import { WORDS } from './data/words'
import { cityAt } from './journey/cities'
import { LEARN_REPS, wordsForCity } from './journey/progress'
import { rescueStrandedJourney, useJourney } from './stores/journeyStore'
import { useSettings } from './stores/settingsStore'
import { useSrs } from './stores/srsStore'
import {
  consumeSelfPop,
  devSwitchesAllowed,
  shouldShowHowTo,
  useUi,
} from './stores/uiStore'
import { DictionarySheet } from './ui/components/DictionarySheet'
import { HowToPlay } from './ui/components/HowToPlay'
import { UpdateBanner } from './ui/components/UpdateBanner'
import { GameScreen } from './ui/screens/GameScreen'

import { HomeScreen } from './ui/screens/HomeScreen'
import { MapScreen } from './ui/screens/MapScreen'
import { SuitcaseScreen } from './ui/screens/SuitcaseScreen'
import { SettingsScreen } from './ui/screens/SettingsScreen'

export default function App() {
  const screen = useUi((s) => s.screen)
  const [rescued, setRescued] = useState<{ cityIndex: number; banked: number } | null>(null)

  // Before anything reads the journey: give back what the v1 -> v2 key rename
  // took. Merges, never replaces, and runs once per device.
  useEffect(() => {
    const r = rescueStrandedJourney()
    if (r.outcome === 'rescued' && r.recovered) setRescued(r.recovered)
  }, [])

  // The rules open themselves exactly once. Its own effect, because it must
  // run for every player — it used to sit below the dev-switch guard in the
  // effect beneath this one, which returns early on any deployed origin, so
  // on the live site the rules never opened.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('howto') === '0') return
    if (shouldShowHowTo()) useUi.getState().openHowTo()
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
    // ?first=player makes the player open the round. Cluey opens by default,
    // and a drive that is about the AI client rather than the turn order needs
    // to get to the clue box without spending a guess first.
    const first = params.get('first')
    if (first === 'player' || first === 'ai') useUi.setState({ pendingFirstGiver: first })
    // ?grid= picks the board «Spil videre» deals. The picker left Home for
    // Settings, and a drive cannot type into a select mid-run.
    const grid = params.get('grid')
    if (grid === 'beginner' || grid === 'middle' || grid === 'standard') {
      useSettings.getState().set({ gridSize: grid })
    }
    // Journey dev switches, so the travel screens can be driven in tests:
    // ?city=N jumps to a stop, ?collected=K collects K of its words,
    // ?wrapped=K packs K of them into the suitcase.
    const city = params.get('city')
    if (city && /^\d$/.test(city)) useJourney.setState({ cityIndex: Number(city) })
    const cityIndex = useJourney.getState().cityIndex

    // ?collected=K marks the first K words of the city as collected — a green
    // earned each way. ?learned= is the same switch under its old name.
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
          greenByClue: 1,
          greenByGuess: 1,
        }
      }
      useSrs.setState({ stats })
    }

    // ?almost=K leaves the first K words one interaction short of collected,
    // so a single round can be driven over the line in a test. Words another
    // switch already seeded keep that record, so the switches compose:
    // ?collected=30&almost=35 is thirty collected and five almost.
    const almost = params.get('almost')
    if (almost && /^\d{1,3}$/.test(almost)) {
      const now = Date.now()
      const stats = { ...useSrs.getState().stats }
      for (const w of wordsForCity(WORDS, cityIndex).slice(0, Number(almost))) {
        if (stats[w.id]) continue
        stats[w.id] = {
          box: 2,
          lastSeenAt: now - 3 * 24 * 60 * 60 * 1000,
          seen: LEARN_REPS - 1,
          correctGuesses: LEARN_REPS - 1,
          misses: 0,
          lookups: 0,
          redemptionRight: 0,
          redemptionWrong: 0,
          // One handling short *and* one interaction short of collected: the
          // guess is in hand, the clue is what the driven round must supply.
          greenByClue: 0,
          greenByGuess: 1,
        }
      }
      useSrs.setState({ stats })
    }

    // ?wrapped=K packs the first K city words: wrapped in the ledger, and
    // collected in the stats so the states stay consistent with real play.
    const wrappedParam = params.get('wrapped')
    if (wrappedParam && /^\d{1,3}$/.test(wrappedParam)) {
      const now = Date.now()
      const stats = { ...useSrs.getState().stats }
      const wrapped = { ...useJourney.getState().wrapped }
      for (const w of wordsForCity(WORDS, cityIndex).slice(0, Number(wrappedParam))) {
        wrapped[w.id] = now
        stats[w.id] = {
          box: 3,
          lastSeenAt: now,
          seen: 3,
          correctGuesses: LEARN_REPS,
          misses: 0,
          lookups: 0,
          redemptionRight: 0,
          redemptionWrong: 0,
          greenByClue: 1,
          greenByGuess: 1,
        }
      }
      useSrs.setState({ stats })
      useJourney.setState({ wrapped })
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
      {screen === 'suitcase' && <SuitcaseScreen />}
      {screen === 'map' && <MapScreen />}
      {rescued && (
        <div className="update-banner" role="status">
          <span>
            Found progress from an older version: {cityAt(rescued.cityIndex).name},{' '}
            {rescued.banked} packed {rescued.banked === 1 ? 'word' : 'words'}. Put back.
          </span>
          <div className="update-actions">
            <button className="btn btn-small btn-primary" onClick={() => setRescued(null)}>
              Good
            </button>
          </div>
        </div>
      )}
      <DictionarySheet />
      <HowToPlay />
      <UpdateBanner />
    </main>
  )
}
