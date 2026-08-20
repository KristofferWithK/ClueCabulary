import { useState } from 'react'
import { WORDS } from '../../data/words'
import { CITIES, WORDS_PER_CITY, cityAt } from '../../journey/cities'
import { DENMARK_PATH, MAP_HEIGHT, MAP_WIDTH, projectCity } from '../../journey/denmark'
import { WRAP_TO_TRAVEL, canTravel, countCollection, wordsForCity } from '../../journey/progress'

import { Arrival } from '../components/Arrival'
import { useJourney } from '../../stores/journeyStore'
import { useSrs } from '../../stores/srsStore'
import { useUi } from '../../stores/uiStore'

type Placement = { anchor: 'start' | 'end'; dx: number; dy: number }

/** Labels lean away from the map edge; the Zealand pair is split vertically. */
const PLACEMENT: Record<string, Placement> = {
  roskilde: { anchor: 'end', dx: -26, dy: -14 },
  kobenhavn: { anchor: 'start', dx: 26, dy: 26 },
  skagen: { anchor: 'start', dx: 26, dy: 4 },
  odense: { anchor: 'start', dx: 26, dy: 26 },
}
const defaultPlacement = (x: number): Placement =>
  x > MAP_WIDTH * 0.62 ? { anchor: 'end', dx: -34, dy: 6 } : { anchor: 'start', dx: 34, dy: 6 }

export function MapScreen() {
  const goTo = useUi((s) => s.goTo)
  const journey = useJourney()
  const srs = useSrs((s) => s.stats)
  const [selected, setSelected] = useState<number>(journey.cityIndex)
  const [arrivedIndex, setArrivedIndex] = useState<number | null>(null)

  const points = CITIES.map((c) => projectCity(c.lon, c.lat))
  const travelledPath = points
    .slice(0, journey.cityIndex + 1)
    .map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(' ')
  const aheadPath = points
    .slice(journey.cityIndex)
    .map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(' ')

  const city = cityAt(selected)
  const counts = countCollection(wordsForCity(WORDS, selected), srs, journey.wrapped)

  const state =
    selected < journey.cityIndex ? 'visited' : selected === journey.cityIndex ? 'current' : 'ahead'
  const travelReady = canTravel(WORDS, journey.wrapped, journey.cityIndex)
  const nextCity = journey.cityIndex + 1 < CITIES.length ? cityAt(journey.cityIndex + 1) : null

  if (arrivedIndex !== null) {
    return <Arrival cityIndex={arrivedIndex} onSeeMap={() => setArrivedIndex(null)} />
  }

  return (
    <div className="screen map-screen">
      <header className="screen-header">
        <button className="icon-btn" aria-label="Back" onClick={() => goTo('home')}>
          ←
        </button>
        <h1>The journey</h1>
      </header>

      <svg
        className="denmark-map"
        viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`}
        role="img"
        aria-label={`Map of Denmark. Stop ${journey.cityIndex + 1} of ${CITIES.length}: ${cityAt(journey.cityIndex).name}.`}
      >
        <path className="map-land" d={DENMARK_PATH} />
        <polyline className="map-route-ahead" points={aheadPath} />
        <polyline className="map-route-done" points={travelledPath} />

        {CITIES.map((c, i) => {
          const p = points[i]!
          const place = PLACEMENT[c.id] ?? defaultPlacement(p.x)
          const status = i < journey.cityIndex ? 'visited' : i === journey.cityIndex ? 'current' : 'ahead'
          return (
            <g key={c.id} className={`map-city map-city-${status} ${selected === i ? 'map-city-selected' : ''}`}>
              <circle className="map-dot" cx={p.x} cy={p.y} r={status === 'current' ? 24 : 18} />
              <text
                className="map-label"
                x={p.x + place.dx}
                y={p.y + place.dy}
                textAnchor={place.anchor}
              >
                {c.name}
              </text>
              {/* Transparent 44px-equivalent touch target over the small dot. */}
              <circle
                className="map-hit"
                cx={p.x}
                cy={p.y}
                r={58}
                role="button"
                tabIndex={0}
                aria-label={`${c.name}, stop ${i + 1}, ${status === 'visited' ? 'visited' : status === 'current' ? 'you are here' : 'not reached yet'}`}
                onClick={() => setSelected(i)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    setSelected(i)
                  }
                }}
              />
            </g>
          )
        })}
      </svg>

      <section className="map-detail">
        <p className="city-eyebrow">
          Stop {selected + 1} of {CITIES.length} ·{' '}
          {state === 'visited' ? 'visited' : state === 'current' ? 'you are here' : 'ahead'}
        </p>
        <h2 className="city-name" lang="da">
          {city.name}
        </h2>
        <p className="city-blurb" lang="da">
          {city.blurbDa}
        </p>
        <p className="city-blurb-en">{city.blurbEn}</p>

        {state === 'ahead' ? (
          <p className="map-locked">
            {WORDS_PER_CITY} words waiting — reach {city.name} to unlock them.
          </p>
        ) : (
          <>
            <p className="map-collected">
              <strong>{counts.wrapped}</strong> / {WORDS_PER_CITY} wrapped ·{' '}
              {counts.collected} collected · {counts.discovered} discovered
              {journey.arrivedAt[selected] && (
                <>
                  {' · arrived '}
                  {new Date(journey.arrivedAt[selected]!).toLocaleDateString()}
                </>
              )}
            </p>
            {/* The suitcase answers the question the map raises: how far to
                the next city? This many words still to wrap. */}
            <p className="map-case-note">
              {state === 'visited'
                ? 'suitcase packed'
                : counts.wrapped >= WRAP_TO_TRAVEL
                  ? 'The suitcase is packed — the road onward is open.'
                  : `${WRAP_TO_TRAVEL - counts.wrapped} more ${
                      WRAP_TO_TRAVEL - counts.wrapped === 1 ? 'word' : 'words'
                    } to wrap before leaving ${city.name}.`}
            </p>
          </>
        )}
      </section>

      {travelReady && nextCity && (
        <button
          className="btn btn-primary btn-big"
          onClick={() => {
            const destination = journey.cityIndex + 1
            journey.travel(Date.now())
            setSelected(destination)
            setArrivedIndex(destination)
          }}
        >
          Travel on → {nextCity.name}
        </button>
      )}

      <button className="btn" onClick={() => goTo('home')}>
        Back
      </button>

      <p className="map-credit">
        Kort · map data: Geodatastyrelsen / DAGI (FOT), 1:500 000
      </p>
    </div>
  )
}
