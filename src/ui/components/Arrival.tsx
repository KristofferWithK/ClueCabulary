import { WORDS_PER_CITY, cityAt } from '../../journey/cities'
import { useUi } from '../../stores/uiStore'
import { ACTIVE } from '../../lang/active'

/**
 * The moment a city is reached. Travelling happens on the map — Home's travel
 * button only leads there — and the map lands here, so it is never silent.
 */
export function Arrival({
  cityIndex,
  onContinue,
  onSeeMap,
}: {
  cityIndex: number
  /** Supplied when something other than goTo must end the moment — the intro
   *  (O3) renders this while onboarding still owns the shell, so a bare
   *  goTo('home') would change a screen nobody is looking at. */
  onContinue?: () => void
  /** Supplied when the map is the thing rendering this, since goTo alone would
   *  leave its own arrival state up and re-render this very screen. */
  onSeeMap?: () => void
}) {
  const goTo = useUi((s) => s.goTo)
  const city = cityAt(cityIndex)

  // Danish above, English below, on purpose: the welcome, the city and its
  // blurb are a bilingual block with blurbEn as the gloss, which is content
  // rather than chrome. The two buttons are chrome and speak English.
  return (
    <div className="screen arrival-screen">
      <p className="arrival-eyebrow" lang={ACTIVE.code}>
        {ACTIVE.copy.welcome}
      </p>
      <h1 className="arrival-city" lang={ACTIVE.code}>
        {city.name}
      </h1>
      <p className="arrival-blurb" lang={ACTIVE.code}>
        {city.blurbTarget}
      </p>
      <p className="arrival-blurb-en">{city.blurbEn}</p>
      <p className="arrival-unlock">
        {WORDS_PER_CITY} new words to discover — Casey is open and waiting for them.
      </p>
      <button
        className="btn btn-primary btn-big"
        onClick={() => (onContinue ? onContinue() : goTo('home'))}
      >
        Get started
      </button>
      <button className="btn" onClick={() => (onSeeMap ? onSeeMap() : goTo('map'))}>
        See the map
      </button>
    </div>
  )
}
