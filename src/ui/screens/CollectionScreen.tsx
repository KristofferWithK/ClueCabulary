import { useState } from 'react'
import { WORDS } from '../../data/words'
import { CITIES, WORDS_PER_CITY, cityAt } from '../../journey/cities'
import { countCollection, wordState, wordsForCity } from '../../journey/progress'
import { useJourney } from '../../stores/journeyStore'
import { useSrs } from '../../stores/srsStore'
import { useUi } from '../../stores/uiStore'

export function CollectionScreen() {
  const goTo = useUi((s) => s.goTo)
  const openSheet = useUi((s) => s.openSheet)
  const srs = useSrs((s) => s.stats)
  const journey = useJourney()
  const [openCity, setOpenCity] = useState<number>(journey.cityIndex)

  const total = countCollection(WORDS, srs, journey.banked)

  return (
    <div className="screen collection-screen">
      <header className="screen-header">
        <button className="icon-btn" aria-label="Back" onClick={() => goTo('home')}>
          ←
        </button>
        <h1>
          <span lang="da">Samlingen</span>
        </h1>
      </header>

      <section className="collection-summary">
        <p className="collection-headline">
          <strong>{total.learned}</strong> learned
        </p>
        <p className="collection-sub">
          {total.discovered} discovered · {total.undiscovered} still out there
        </p>
        <div className="collect-bar" aria-hidden="true">
          <div
            className="collect-fill collect-learned"
            style={{ width: `${(total.learned / WORDS.length) * 100}%` }}
          />
          <div
            className="collect-fill collect-discovered"
            style={{ width: `${(total.discovered / WORDS.length) * 100}%` }}
          />
        </div>
        <p className="collection-legend">
          <span className="swatch swatch-learned" aria-hidden="true" /> learned
          <span className="swatch swatch-discovered" aria-hidden="true" /> discovered
          <span className="swatch swatch-unknown" aria-hidden="true" /> not yet found
        </p>
      </section>

      {CITIES.map((city, index) => {
        const words = wordsForCity(WORDS, index)
        const counts = countCollection(words, srs, journey.banked)
        const reached = index <= journey.cityIndex
        const open = openCity === index

        return (
          <section key={city.id} className="collection-city">
            <button
              className="collection-city-head"
              aria-expanded={open}
              onClick={() => setOpenCity(open ? -1 : index)}
            >
              <span className="collection-chevron" aria-hidden="true">
                {open ? '▾' : '▸'}
              </span>
              <span className="collection-city-name" lang="da">
                {city.name}
              </span>
              <span className="collection-city-count">
                {counts.learned} / {WORDS_PER_CITY}
                {counts.discovered > 0 && (
                  // A half-met city read as an untouched one without this.
                  <span className="collection-city-grey"> · {counts.discovered} grey</span>
                )}
                {!reached && <span className="collection-locked"> · not reached</span>}
              </span>
            </button>

            {open && (
              <ul className="word-dex">
                {words.map((w) => {
                  const state = wordState(srs[w.id], w.id in journey.banked)
                  if (state === 'undiscovered') {
                    return (
                      <li key={w.id} className="dex-slot dex-unknown" aria-label="Undiscovered word">
                        <span aria-hidden="true">?</span>
                      </li>
                    )
                  }
                  return (
                    <li key={w.id}>
                      <button
                        className={`dex-slot dex-${state}`}
                        lang="da"
                        aria-label={`${w.da}, ${state}`}
                        onClick={() => openSheet(w.id)}
                      >
                        {w.da}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        )
      })}

      <p className="collection-foot">
        Words turn green when you have clued or guessed them three times, or banked them by
        passing a <span lang="da">rejseprøve</span>.
      </p>

      <button className="btn" onClick={() => goTo('home')}>
        Back
      </button>
      <p className="dim collection-city-note">
        Currently in <span lang="da">{cityAt(journey.cityIndex).name}</span>.
      </p>
    </div>
  )
}
