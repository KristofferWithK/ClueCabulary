import { useState } from 'react'
import { wordById } from '../../data/words'
import type { WordEntry } from '../../data/types'
import { answerMatches } from '../../engine/redemption'
import { CITIES, GATES_PER_CITY, GATE_SIZE, cityAt } from '../../journey/cities'
import { canTravel, stampsFor } from '../../journey/progress'
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
  const journey = useJourney()
  const recordRound = useSrs((s) => s.recordRound)

  const [graded, setGraded] = useState<Graded[] | null>(null)
  const [arrivedIndex, setArrivedIndex] = useState<number | null>(null)

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
        <p className="arrival-unlock">100 new words to discover.</p>
        <button className="btn btn-primary btn-big" onClick={() => goTo('home')}>
          <span lang="da">Kom i gang</span>
        </button>
        <button className="btn" onClick={() => goTo('map')}>
          <span lang="da">Se kortet</span>
        </button>
      </div>
    )
  }

  const exam = journey.activeExam
  if (!exam) {
    goTo('home')
    return null
  }

  const city = cityAt(journey.cityIndex)
  // The exact words drawn when the exam opened, so playing elsewhere cannot
  // change the paper mid-sitting.
  const words = exam.wordIds.map((id) => wordById(id)).filter((w): w is WordEntry => !!w)
  const answers = exam.answers
  const answered = words.filter((w) => (answers[w.id] ?? '').trim().length > 0).length
  const passed = graded !== null && graded.every((g) => g.accepted)

  const submit = () => {
    const results: Graded[] = words.map((w) => {
      const given = answers[w.id] ?? ''
      return { word: w, given, accepted: answerMatches(given, w.en) !== undefined }
    })
    setGraded(results)

    // Feed the schedule: misses demote, hits promote. Handling counts are
    // untouched, so an exam never inflates the play-route to green.
    const srsResults: RoundWordResult[] = results.map((r) => ({
      wordId: r.word.id,
      guessedGreen: false,
      guessedWrong: false,
      lookedUp: false,
      redemption: r.accepted ? 'right' : 'wrong',
    }))
    recordRound(srsResults, Date.now())

    if (results.every((r) => r.accepted)) {
      journey.awardStamp(journey.cityIndex, exam.wordIds, Date.now())
      if (navigator.vibrate) navigator.vibrate([20, 60, 20])
    }
  }

  const retry = () => {
    journey.startExam(exam.cityIndex, exam.wordIds)
    setGraded(null)
  }

  // awardStamp already ran, so read the freshly-stamped passport.
  const stamps = stampsFor(journey, journey.cityIndex)
  const readyToTravel = passed && canTravel(journey, journey.cityIndex)
  const nextCity = journey.cityIndex + 1 < CITIES.length ? cityAt(journey.cityIndex + 1) : null

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
          <span lang="da">Rejseprøve</span>
        </h1>
      </header>

      <p className="gate-intro">
        {graded
          ? passed
            ? `All ${words.length} right — a stempel for ${city.name}.`
            : 'Not this time. Look at the misses, play a few more rounds, and come back.'
          : `Your strongest ${words.length} words in ${city.name}. Translate every one to English — no mistakes, and the dictionary is closed.`}
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
            <div className="gate-actions">
              <p className="stamp-award">
                <span lang="da">Stempel</span> {stamps} / {GATES_PER_CITY} ·{' '}
                {words.length} words banked
              </p>
              {readyToTravel && nextCity ? (
                <>
                  <p className="travel-callout">The passport page is full. The road is open.</p>
                  <button
                    className="btn btn-primary btn-big"
                    onClick={() => {
                      const destination = journey.cityIndex + 1
                      journey.endExam()
                      journey.travel(Date.now())
                      setArrivedIndex(destination)
                    }}
                  >
                    <span lang="da">Rejs videre</span> → {nextCity.name}
                  </button>
                </>
              ) : (
                <button
                  className="btn btn-primary btn-big"
                  onClick={() => {
                    journey.endExam()
                    goTo('home')
                  }}
                >
                  Keep collecting
                </button>
              )}
            </div>
          ) : (
            <div className="gate-actions">
              <button className="btn btn-primary" onClick={retry}>
                Try the same words again
              </button>
              <button
                className="btn"
                onClick={() => {
                  journey.endExam()
                  goTo('home')
                }}
              >
                Play a round first
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
                    onChange={(e) => journey.setExamAnswer(w.id, e.target.value)}
                  />
                </label>
              </li>
            ))}
          </ul>
          <p className="gate-progress">
            {answered} / {words.length} answered
          </p>
          <button className="btn btn-primary btn-big" onClick={submit}>
            Submit — all {GATE_SIZE} must be right
          </button>
        </>
      )}
    </div>
  )
}
