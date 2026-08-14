import { useState } from 'react'
import { isKnownGloss, wordById } from '../../data/words'
import type { WordEntry } from '../../data/types'
import { answerMatches } from '../../engine/redemption'
import { CITIES, GATES_PER_CITY, cityAt } from '../../journey/cities'
import {
  canTravel,
  examTrials,
  examWords,
  greensToNextTrial,
  stampsFor,
  wordState,
} from '../../journey/progress'

import { mulberry32 } from '../../engine/rng'
import { WORDS } from '../../data/words'
import { useJourney } from '../../stores/journeyStore'
import { useSrs } from '../../stores/srsStore'
import { useUi } from '../../stores/uiStore'
import type { RoundWordResult } from '../../srs/types'
import { Arrival } from '../components/Arrival'

interface Graded {
  word: WordEntry
  given: string
  accepted: boolean
}

export function GateExamScreen() {
  const goTo = useUi((s) => s.goTo)
  const journey = useJourney()
  const recordRound = useSrs((s) => s.recordRound)

  const [submitted, setSubmitted] = useState(false)
  const [arrivedIndex, setArrivedIndex] = useState<number | null>(null)

  if (arrivedIndex !== null) return <Arrival cityIndex={arrivedIndex} />

  const exam = journey.activeExam
  if (!exam) {
    goTo('home')
    return null
  }

  // The paper's own city, not wherever the player happens to be. They normally
  // agree — travel() clears any open exam — but the v1 rescue can move the
  // player while a paper is still out, and a paper must always stamp the city
  // it was drawn for.
  const examCity = exam.cityIndex
  const city = cityAt(examCity)
  // The exact words drawn when the exam opened, so playing elsewhere cannot
  // change the paper mid-sitting.
  const words = exam.wordIds.map((id) => wordById(id)).filter((w): w is WordEntry => !!w)
  const answers = exam.answers
  const answered = words.filter((w) => (answers[w.id] ?? '').trim().length > 0).length

  // One marking, used for everything. It used to be graded twice — once here
  // for the screen and once inside submit() for the stempel — and when the
  // stricter rule landed only this copy got it, so a paper could be stamped by
  // the lenient rule while the screen showed it failed.
  const mark = (): Graded[] =>
    words.map((w) => {
      const given = answers[w.id] ?? ''
      return { word: w, given, accepted: answerMatches(given, w.en, isKnownGloss) !== undefined }
    })

  // Derived, not stored: a paper marked before a reload comes back marked,
  // because gradedAt is persisted with the answers. Without that, resuming a
  // passed exam would put the filled-in paper back on screen and submitting it
  // again would award a second stempel from one correct paper, endlessly.
  const graded: Graded[] | null = submitted || exam.gradedAt ? mark() : null
  // words.length guards a vacuous pass: [].every(...) is true, so a city with
  // nothing left unbanked would hand out a stempel for an empty sheet.
  const passed = graded !== null && graded.length > 0 && graded.every((g) => g.accepted)
  // How much of this paper the player already owns — the honest risk statement.
  const srsStats = useSrs.getState().stats
  const paperGreens = words.filter(
    (w) => wordState(srsStats[w.id], w.id in journey.banked) === 'learned',
  ).length

  const submit = () => {
    if (exam.gradedAt) return
    const results = mark()
    setSubmitted(true)

    // Feed the schedule: misses demote, hits promote. Handling counts are
    // untouched, so an exam never inflates the play-route to green.
    const srsResults: RoundWordResult[] = results.map((r) => ({
      wordId: r.word.id,
      guessedGreen: false,
      guessedWrong: false,
      greenByOwnClue: false,
      greenByOwnGuess: false,
      lookedUp: false,
      redemption: r.accepted ? 'right' : 'wrong',
    }))
    recordRound(srsResults, Date.now())

    journey.markExamGraded(Date.now())
    // The attempt was already spent when the paper was drawn.
    if (results.length > 0 && results.every((r) => r.accepted)) {
      journey.awardStamp(examCity, exam.wordIds, Date.now())
      if (navigator.vibrate) navigator.vibrate([20, 60, 20])
    }
  }

  const trials = examTrials(
    WORDS,
    useSrs.getState().stats,
    journey.banked,
    journey,
    examCity,
  )
  const canRetry = trials.unlimited || trials.available > 0
  const toNextTrial = greensToNextTrial(WORDS, useSrs.getState().stats, journey.banked, examCity)

  // A fresh paper, never the one just marked. The results screen prints the
  // right answer beside every miss, so re-serving the same twenty words would
  // hand the player a guaranteed pass and make the attempt economy meaningless.
  const retry = () => {
    const words = examWords(
      WORDS,
      useSrs.getState().stats,
      journey.banked,
      exam.cityIndex,
      mulberry32(Date.now() % 0xffffffff),
      new Set(exam.wordIds),
    )
    journey.startExam(
      exam.cityIndex,
      words.map((w) => w.id),
    )
    setSubmitted(false)
  }

  // awardStamp already ran, so read the freshly-stamped passport.
  const stamps = stampsFor(journey, examCity)
  // Travelling on is only offered when the paper belongs to where you stand.
  const readyToTravel =
    passed && examCity === journey.cityIndex && canTravel(journey, journey.cityIndex)
  const nextCity = journey.cityIndex + 1 < CITIES.length ? cityAt(journey.cityIndex + 1) : null

  return (
    <div className="screen gate-screen">
      <header className="screen-header">
        <button
          className="icon-btn"
          aria-label={graded ? 'Back' : 'Put the paper down and come back to it'}
          onClick={() => {
            // A marked paper is finished; only an unmarked one is worth keeping.
            if (exam.gradedAt) journey.endExam()
            goTo('home')
          }}
        >
          ←
        </button>
        <h1>
          <span lang="da">Rejseprøve</span>
        </h1>
      </header>

      <p className="gate-paper-line">
        {`${words.length} words from ${city.name}${
          paperGreens === words.length
            ? ', all of them ones you have learned'
            : ` — ${paperGreens} you have learned, ${words.length - paperGreens} you have not`
        }. Translate every one to English — no mistakes, and the dictionary is closed.`}
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

          {!passed && (
            <p className="trials-left">
              {trials.unlimited
                ? `You know this city — take the paper as often as you like.`
                : trials.available > 0
                  ? `${trials.available} ${trials.available === 1 ? 'attempt' : 'attempts'} left · every ten green words earns another`
                  : `No attempts left — ${toNextTrial} more green ${
                      toNextTrial === 1 ? 'word' : 'words'
                    } earns one.`}
            </p>
          )}

          {passed ? (
            <div className="gate-actions">
              <p className="stamp-award">
                <span lang="da">Stempel</span> {stamps} / {GATES_PER_CITY} ·{' '}
                {words.length} words banked
              </p>
              {readyToTravel ? (
                <>
                  <p className="travel-callout">
                    {nextCity
                      ? 'The passport page is full. The road is open.'
                      : 'The passport is full. A thousand words.'}
                  </p>
                  {nextCity ? (
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
                  ) : (
                    <button
                      className="btn btn-primary btn-big"
                      onClick={() => {
                        journey.endExam()
                        goTo('home')
                      }}
                    >
                      <span lang="da">Rejsen er slut</span>
                    </button>
                  )}
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
              <button className="btn btn-primary" onClick={retry} disabled={!canRetry}>
                Try again{trials.unlimited ? '' : ' — spends an attempt'}
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
            Submit — all {words.length} must be right
          </button>
        </>
      )}
    </div>
  )
}
