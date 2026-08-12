import { WORDS_PER_CITY, cityAt } from '../../journey/cities'
import { championAt } from '../../journey/champions'
import { useUi } from '../../stores/uiStore'

/**
 * The moment a city is reached. Both roads out of a full passport — the exam
 * screen and the map — land here, so travelling is never silent.
 */
export function Arrival({ cityIndex }: { cityIndex: number }) {
  const goTo = useUi((s) => s.goTo)
  const city = cityAt(cityIndex)
  const champion = championAt(cityIndex)

  return (
    <div className="screen arrival-screen">
      <p className="arrival-eyebrow" lang="da">
        Velkommen til
      </p>
      <h1 className="arrival-city" lang="da">
        {city.name}
      </h1>
      <p className="arrival-blurb" lang="da">
        {city.blurbDa}
      </p>
      <p className="arrival-blurb-en">{city.blurbEn}</p>
      <p className="arrival-unlock">{WORDS_PER_CITY} new words to discover.</p>

      {/* Somebody is expecting you. The letter said so. */}
      <div className="champion-card champion-card-arrival">
        <p className="champion-motif" aria-hidden="true">
          {champion.motif}
        </p>
        <p className="champion-name">{champion.name}</p>
        <p className="champion-title">
          <span lang="da">{champion.titleDa}</span> · {champion.titleEn}
        </p>
        <p className="champion-line" lang="da">
          {champion.greetingDa}
        </p>
        <p className="champion-line-en">{champion.greetingEn}</p>
        <p className="champion-blurb">{champion.blurbEn}</p>
        <p className="champion-knew">{champion.knewHer}</p>
      </div>
      <button className="btn btn-primary btn-big" onClick={() => goTo('home')}>
        <span lang="da">Kom i gang</span>
      </button>
      <button className="btn" onClick={() => goTo('map')}>
        <span lang="da">Se kortet</span>
      </button>
    </div>
  )
}
