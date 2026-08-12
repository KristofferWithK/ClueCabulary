import { useState } from 'react'
import { WORDS } from '../../data/words'
import type { WordEntry } from '../../data/types'
import { answerMatches } from '../../engine/redemption'
import { CITIES, cityAt, GATES_PER_CITY, GATE_SIZE } from '../../journey/cities'
import { canTravel, waveWords } from '../../journey/progress'
import { useJourney } from '../../stores/journeyStore'
import { useSrs } from '../../stores/srsStore'
import { useUi } from '../../stores/uiStore'
import type { RoundWordResult } from '../../srs/types'

interface Graded {
  word: WordEntry
  given: string
  accepted: boolean
}

export function GateExamScreen() {
  const goTo = useUi((s) => s.goTo)
  const gateIndex = useUi((s) => s.gateIndex)
  const journey = useJourney()
  const recordRound = useSrs((s) => s.recordRound)

  const [graded, setGraded] = useState<Graded[] | null>(null)
  /** Where we just arrived — captured before travelling, since the store index moves. */
  const [arrivedIndex, setArrivedIndex] = useState<number | null>(null)

  if (gateIndex === null) {
    goTo('home')
    return null
  }

  // Answers live in the persisted store, so a phone killing the app
  // mid-exam (or a stray back gesture) does not throw the work away.
  const answers = journey.activeExam?.answers ?? {}
  const setAnswer = (wordId: string, text: string) => journey.setExamAnswer(wordId, text)

  const city = cityAt(journey.cityIndex)
  const words = waveWords(WORDS, journey.cityIndex, gateIndex)
  const answered = words.filter((w) => (answers[w.id] ?? '').trim().length > 0).length
  const passed = graded !== null && graded.every((g) => g.accepted)

  const submit = () => {
    const results: Graded[] = words.map((w) => {
      const given = answers[w.id] ?? ''
      return { word: w, given, accepted: answerMatches(given, w.en) !== undefined }
    })
    setGraded(results)

    // Feed the schedule: misses demote, hits promote. Collection counters are
    // untouched, so passing or failing never changes what you have collected.
    const srsResults: RoundWordResult[] = results.map((r) => ({
      wordId: r.word.id,
      guessedGreen: false,
      guessedWrong: false,
      lookedUp: false,
      redemption: r.accepted ? 'right' : 'wrong',
    }))
    recordRound(srsResults, Date.now())

    if (results.every((r) => r.accepted)) {
      journey.passGate(journey.cityIndex, gateIndex)
      journey.endExam()
      if (navigator.vibrate) navigator.vibrate([20, 60, 20])
    }
  }

  const retry = () => {
    journey.startExam(journey.cityIndex, gateIndex)
    setGraded(null)
  }

  const readyToTravel = passed && canTravel(journey, journey.cityIndex)
  const nextCity = journey.cityIndex + 1 < CITIES.length ? cityAt(journey.cityIndex + 1) : null

  if (arrivedIndex !== null) {
    const arrived = cityAt(arrivedIndex)
    return (
      <div className="screen arrival-screen">
        <p className="arrival-eyebrow" lang="da">
          Velkommen til
        </p>
        <h1 className="arrival-city" lang="da">
          {arrived.name}
        </h1>
        <p className="arrival-blurb" lang="da">
          {arrived.blurbDa}
        </p>
        <p className="arrival-blurb-en">{arrived.blurbEn}</p>
        <p className="arrival-unlock">100 new words unlocked.</p>
        <button className="btn btn-primary btn-big" onClick={() => goTo('home')}>
          <span lang="da">Kom i gang</span>
        </button>
        <button className="btn" onClick={() => goTo('map')}>
          <span lang="da">Se kortet</span>
        </button>
      </div>
    )
  }

  return (
    <div className="screen gate-screen">
      <header className="screen-header">
        <button
          className="icon-btn"
          aria-label="Back"
          onClick={() => {
            journey.endExam()
            goTo('home')
          }}
        >
          ←
        </button>
        <h1>
          <span lang="da">Rejseprøve</span> {gateIndex + 1}/{GATES_PER_CITY}
        </h1>
      </header>

      <p className="gate-intro">
        {graded
          ? passed
            ? `All ${GATE_SIZE} right — ${city.name} has taught you well.`
            : 'Not yet. Look at the misses, then take the whole test again.'
          : `Translate all ${GATE_SIZE} words to English. Every one must be right, and the dictionary is closed.`}
      </p>

      {graded ? (
        <>
          <ul className="gate-results">
            {graded.map((g) => (
              <li key={g.word.id} className={g.accepted ? 'accepted' : 'rejected'}>
                <span className="result-mark" aria-hidden="true">
                  {g.accepted ? '✓' : '✗'}
                </span>
                <span className="gate-da" lang="da">
                  {g.word.da}
                </span>
                <span className="result-answer">
                  {g.given || '—'}
                  {!g.accepted && <em> = {g.word.en.join(', ')}</em>}
                </span>
              </li>
            ))}
          </ul>

          {passed ? (
            readyToTravel && nextCity ? (
              <div className="gate-actions">
                <p className="travel-callout">
                  All five tests passed. The road north is open.
                </p>
                <button
                  className="btn btn-primary btn-big"
                  onClick={() => {
                    const destination = journey.cityIndex + 1
                    journey.travel(Date.now())
                    setArrivedIndex(destination)
                  }}
                >
                  <span lang="da">Rejs videre</span> → {nextCity.name}
                </button>
              </div>
            ) : (
              <div className="gate-actions">
                <button className="btn btn-primary btn-big" onClick={() => goTo('home')}>
                  Continue collecting
                </button>
              </div>
            )
          ) : (
            <div className="gate-actions">
              <button className="btn btn-primary" onClick={retry}>
                Try the test again
              </button>
              <button className="btn" onClick={() => goTo('home')}>
                Practise more first
              </button>
            </div>
          )}
        </>
      ) : (
        <>
          <ul className="gate-list">
            {words.map((w) => (
              <li key={w.id} className="gate-item">
                <label>
                  <span className="gate-da" lang="da">
                    {w.da}
                  </span>
                  <input
                    type="text"
                    value={answers[w.id] ?? ''}
                    placeholder="English…"
                    autoCapitalize="off"
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    onChange={(e) => setAnswer(w.id, e.target.value)}
                  />
                </label>
              </li>
            ))}
          </ul>
          <p className="gate-progress">
            {answered} / {GATE_SIZE} answered
          </p>
          <button className="btn btn-primary btn-big" onClick={submit}>
            Submit the test
          </button>
        </>
      )}
    </div>
  )
}
