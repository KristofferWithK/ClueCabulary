import { useState } from 'react'
import { ACTIVE, setActiveLanguage } from '../../lang/active'
import { availableLanguages } from '../../lang/index'
import type { LanguagePack } from '../../lang/types'
import { markOnboardDone } from '../../onboarding/flow'
import { useUi } from '../../stores/uiStore'
import { ClueyFace } from '../components/Cluey'
import { PencilTrain } from '../components/TrainRide'

/**
 * The app opens inside the train (O1). Casey at the window, three tapped
 * bubble lines — he is a suitcase, every word you learn rides in him, nine
 * cities of a hundred — and then the ticket: where are we going?
 *
 * The ticket is built AS a language picker even though one pack ships. With
 * one language it collapses to a single confirm card — never a one-entry
 * select, `hasLanguageChoice`'s own reasoning — and H2's registry line turns
 * the same markup into a real choice with no new work here. The display
 * format is the one Settings' LanguagePicker uses: `name — endonym`.
 *
 * SKIP IS ALWAYS VISIBLE, at every act — the study-phase precedent, the same
 * standing rule the train ride keeps. Skip marks the flow done (on a real
 * run) and lands Home; Settings' "Replay the intro" runs these screens again
 * without touching the flag.
 */

/** Casey's welcome, one bubble per tap. The ticket act asks the question. */
const TRAIN_LINES = [
  'Hej! I’m Casey. I’m a suitcase — and this train is taking us abroad.',
  'Every word you learn on the way rides in me. Fill me up and the road opens.',
  'Nine cities ahead, a hundred words in each. Nine hundred, door to door.',
]

/** The train out the window, Casey looking out of the first carriage. */
function TrainScene({ mood }: { mood: 'idle' | 'happy' }) {
  return (
    <div className="onboard-scene" aria-hidden="true">
      <PencilTrain />
      <div className="onboard-casey">
        <ClueyFace mood={mood} />
      </div>
    </div>
  )
}

export function OnboardingScreen() {
  const onboarding = useUi((s) => s.onboarding)
  const advance = useUi((s) => s.advanceOnboarding)
  const finish = useUi((s) => s.finishOnboarding)
  const [line, setLine] = useState(0)
  if (!onboarding) return null

  const skip = (
    <button className="btn onboard-skip" onClick={finish}>
      Skip
    </button>
  )

  if (onboarding.step === 'train') {
    const last = line === TRAIN_LINES.length - 1
    return (
      <div className="screen onboard-screen" data-act="train">
        <TrainScene mood={last ? 'happy' : 'idle'} />
        {/* role=status: each tapped line is announced without stealing focus. */}
        <p className="onboard-bubble" role="status">
          {TRAIN_LINES[line]}
        </p>
        <div className="onboard-spacer" />
        <div className="onboard-controls">
          <button
            className="btn btn-primary onboard-next"
            onClick={() => (last ? advance('ticket') : setLine(line + 1))}
          >
            {last ? 'So — where to?' : 'Next'}
          </button>
          {skip}
        </div>
      </div>
    )
  }

  // The ticket. Tapping one is the confirmation — a card, not a control row —
  // and with one pack shipped it is the single card the owner settled on.
  const languages = availableLanguages()
  const choose = (pack: LanguagePack) => {
    if (pack.code !== ACTIVE.code) {
      // A real choice reloads the app (src/lang/active.ts): every index, the
      // route and the word list change at once. The flow's marker must be
      // down BEFORE that reload so the way back up resumes instead of
      // starting over. O1's flow ends at the ticket, so the marker written
      // is the done flag itself; O2 writes its tutorial step here instead.
      if (onboarding.persist) markOnboardDone()
      setActiveLanguage(pack.code)
      return
    }
    finish()
  }

  return (
    <div className="screen onboard-screen" data-act="ticket">
      <TrainScene mood="idle" />
      <p className="onboard-bubble" role="status">
        So — where are we going?
      </p>
      <div className="onboard-tickets">
        {languages.map((pack) => (
          <button
            key={pack.code}
            className="onboard-ticket"
            onClick={() => choose(pack)}
            aria-label={`Travel ${pack.route.country} — learn ${pack.name}`}
          >
            <span className="ticket-eyebrow">One ticket to</span>
            <span className="ticket-dest">{pack.route.country}</span>
            <span className="ticket-lang">
              {pack.name} — {pack.endonym}
            </span>
            <span className="ticket-meta">
              {pack.words.length} words · {pack.route.cities.length} cities
            </span>
          </button>
        ))}
      </div>
      <p className="onboard-hint">
        {languages.length > 1 ? 'Tap a ticket to choose.' : 'Tap your ticket and we’re off.'}
      </p>
      <div className="onboard-spacer" />
      <div className="onboard-controls">{skip}</div>
    </div>
  )
}
