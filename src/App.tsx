import { useEffect, useState } from 'react'
import { WORDS } from './data/words'
import { FINAL_CITY_INDEX, cityAt } from './journey/cities'
import { LEARN_REPS, wordsForCity } from './journey/progress'
import { useGame } from './stores/gameStore'
import { rescueStrandedJourney, useJourney } from './stores/journeyStore'
import { useSettings } from './stores/settingsStore'
import { useSrs } from './stores/srsStore'
import {
  consumeSelfPop,
  devSwitchesAllowed,
  shouldShowHowTo,
  useUi,
} from './stores/uiStore'
import { useNativeKeyboard } from './ui/nativeKeyboard'
import { DictionarySheet } from './ui/components/DictionarySheet'
import { HowToPlay } from './ui/components/HowToPlay'
import { UpdateBanner } from './ui/components/UpdateBanner'
import { GameScreen } from './ui/screens/GameScreen'

import { HomeScreen } from './ui/screens/HomeScreen'
import { MapScreen } from './ui/screens/MapScreen'
import { SuitcaseScreen } from './ui/screens/SuitcaseScreen'
import { SettingsScreen } from './ui/screens/SettingsScreen'

/**
 * The paper the app is drawn on, and the two wobbles that draw it.
 *
 * One <svg> for the whole app rather than a filter per component: a filter is
 * referenced by id from CSS, so these only have to exist once in the document.
 * The grain is a single fixed rect — one filtered element for every screen —
 * because a texture repeated per card is the same picture rendered forty times.
 *
 * The wobbles are used on chrome only (docks, panels, buttons, Cluey), never on
 * the board: twenty cards each running a displacement map is the kind of cost
 * no test here would catch, and the cards get their hand-drawn edge from plain
 * geometry instead. See index.css, "the pencil pass".
 */
function PencilDefs() {
  return (
    <>
      <svg className="pencil-grain" aria-hidden="true" focusable="false">
        <rect width="100%" height="100%" filter="url(#pencil-paper)" />
      </svg>
      <svg className="pencil-defs" aria-hidden="true" focusable="false">
        <defs>
        <filter id="pencil-edge" x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence type="fractalNoise" baseFrequency="0.028" numOctaves="2" seed="12" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="3.4" />
        </filter>
        {/* For pills. A tight radius turns displacement into scribble — the
            same scale that reads as "drawn" on a panel reads as "scratched
            out" on a button — so this one is gentler, not looser. */}
        <filter id="pencil-edge-fine" x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence type="fractalNoise" baseFrequency="0.016" numOctaves="2" seed="23" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="1.8" />
        </filter>
        <filter id="pencil-paper" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="2" result="n" />
          <feColorMatrix
            in="n"
            type="matrix"
            values="0 0 0 0 0.45  0 0 0 0 0.43  0 0 0 0 0.38  0 0 0 0.055 0"
          />
        </filter>
        </defs>
      </svg>
    </>
  )
}

export default function App() {
  const screen = useUi((s) => s.screen)
  const [rescued, setRescued] = useState<{ cityIndex: number; banked: number } | null>(null)

  // Native shell only. On the mobile web this does nothing at all — see
  // src/ui/nativeKeyboard.ts for why that is deliberate.
  useNativeKeyboard()

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
    // ?fresh=1 abandons any round in flight so Play deals anew — but keeps
    // recentBoards, which is the point: the carry-over drive deals board
    // after board and must not have its window wiped between them.
    if (params.get('fresh') === '1') useGame.getState().abandonGame()
    // Journey dev switches, so the travel screens can be driven in tests:
    // ?city=N jumps to a stop, ?collected=K collects K of its words,
    // ?wrapped=K packs K of them into the suitcase.
    // Clamped, because an out-of-range stop is not a failed assertion — it is
    // cityAt() throwing and the app going white, with cityIndex persisted so
    // it stays white. The route got shorter once (Viborg left) and every
    // ?city=9 in the drives outlived it; clamping means the last stop is
    // whatever the last stop now is, rather than a blank screen.
    const city = params.get('city')
    if (city && /^\d$/.test(city)) {
      useJourney.setState({ cityIndex: Math.min(Number(city), FINAL_CITY_INDEX) })
    }
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

    // ?wraps=K banks K earned wrap-up rounds. A wrap-up now has to be won
    // before it can be played, so without this every drive that opens one
    // would first have to win a round against the mock companion.
    const wraps = params.get('wraps')
    if (wraps && /^\d$/.test(wraps)) useSrs.setState({ wrapUpsBanked: Number(wraps) })

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
      <PencilDefs />
      {/* While the keyboard is up, a tap anywhere else puts it away — and does
          nothing else. It is a real element rather than a document listener
          precisely so the tap lands HERE: dismissing the keyboard and also
          guessing the card you happened to touch is two actions from one tap,
          and the second one costs a turn nobody chose to spend. (It used to
          cost the whole round — that tap could land on a forbidden word.)
          The next tap, with the keyboard down, does what it says. */}
      <div
        className="kb-scrim"
        aria-hidden="true"
        onPointerDown={() => {
          if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
        }}
      />
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
