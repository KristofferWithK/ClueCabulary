/**
 * What a stop on the journey is, with no country in it.
 *
 * The Denmark route itself lives in `src/lang/da/route.ts`, because which
 * cities you travel through is part of the language you are learning rather
 * than part of the journey mechanic. `src/journey/cities.ts` is the facade that
 * hands the active pack's route to everything that reads it.
 */
export interface City {
  id: string
  name: string
  /**
   * Whatever the country divides itself into — Danish regions, German
   * Bundesländer. A plain string on purpose: it is shown, never branched on,
   * and a union type here would be one more thing a second language has to
   * widen.
   */
  region: string
  /** Real coordinates — the map plots cities on a true projection. */
  lat: number
  lon: number
  /** The blurb in the language being learned, and in English. */
  blurbTarget: string
  blurbEn: string
}
