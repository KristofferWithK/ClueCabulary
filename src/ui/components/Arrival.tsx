import { WORDS_PER_CITY, cityAt } from '../../journey/cities'
import { useUi } from '../../stores/uiStore'

/**
 * The moment a city is reached. Both roads out of a full passport — the exam
 * screen and the map — land here, so travelling is never silent.
 */
export function Arrival({ cityIndex }: { cityIndex: number }) {
  const goTo = useUi((s) => s.goTo)
  const city = cityAt(cityIndex)

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
      <button className="btn btn-primary btn-big" onClick={() => goTo('home')}>
        <span lang="da">Kom i gang</span>
      </button>
      <button className="btn" onClick={() => goTo('map')}>
        <span lang="da">Se kortet</span>
      </button>
    </div>
  )
}
