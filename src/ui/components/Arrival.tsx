import { WORDS_PER_CITY, cityAt } from '../../journey/cities'
import { useUi } from '../../stores/uiStore'

/**
 * The moment a city is reached. Travelling happens on the map — Home's travel
 * button only leads there — and the map lands here, so it is never silent.
 */
export function Arrival({
  cityIndex,
  onSeeMap,
}: {
  cityIndex: number
  /** Supplied when the map is the thing rendering this, since goTo alone would
   *  leave its own arrival state up and re-render this very screen. */
  onSeeMap?: () => void
}) {
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
      <p className="arrival-unlock">
        {WORDS_PER_CITY} new words to discover — Cluey is open and waiting for them.
      </p>
      <button className="btn btn-primary btn-big" onClick={() => goTo('home')}>
        <span lang="da">Kom i gang</span>
      </button>
      <button className="btn" onClick={() => (onSeeMap ? onSeeMap() : goTo('map'))}>
        <span lang="da">Se kortet</span>
      </button>
    </div>
  )
}
