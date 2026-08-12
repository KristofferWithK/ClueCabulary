export type Region = 'Sønderjylland' | 'Jylland' | 'Fyn' | 'Sjælland'

export interface City {
  id: string
  name: string
  region: Region
  /** Real coordinates — the map plots cities on a true projection. */
  lat: number
  lon: number
  blurbDa: string
  blurbEn: string
}

/** Words each city owns, split into GATES_PER_CITY waves of GATE_SIZE. */
export const WORDS_PER_CITY = 100
export const GATE_SIZE = 20
export const GATES_PER_CITY = WORDS_PER_CITY / GATE_SIZE

/**
 * Green words at which a city stops rationing exam attempts. Someone who knows
 * nine words in ten has proved the point; making them wait for another token is
 * bookkeeping, not teaching.
 */
export const UNLIMITED_TRIALS_AT = Math.round(WORDS_PER_CITY * 0.9)

/**
 * The route: from the far south, up Jutland to the tip where two seas meet,
 * then back down across Funen to Zealand and journey's end in the capital.
 */
export const CITIES: City[] = [
  {
    id: 'sonderborg',
    name: 'Sønderborg',
    region: 'Sønderjylland',
    lat: 54.909,
    lon: 9.792,
    blurbDa: 'Rejsen begynder på Als, længst mod syd.',
    blurbEn: 'The journey begins on Als, at the southern edge.',
  },
  {
    id: 'ribe',
    name: 'Ribe',
    region: 'Jylland',
    lat: 55.33,
    lon: 8.768,
    blurbDa: 'Danmarks ældste by — vikinger og skæve brosten.',
    blurbEn: "Denmark's oldest town — Vikings and crooked cobblestones.",
  },
  {
    id: 'kolding',
    name: 'Kolding',
    region: 'Jylland',
    lat: 55.491,
    lon: 9.472,
    blurbDa: 'Ved fjorden, hvor Koldinghus har stået i 750 år.',
    blurbEn: 'By the fjord, where Koldinghus has stood for 750 years.',
  },
  {
    id: 'aarhus',
    name: 'Aarhus',
    region: 'Jylland',
    lat: 56.163,
    lon: 10.203,
    blurbDa: 'Den anden hovedstad — regnbuen ligger på taget.',
    blurbEn: 'The second capital — the rainbow sits on the roof.',
  },
  {
    id: 'viborg',
    name: 'Viborg',
    region: 'Jylland',
    lat: 56.453,
    lon: 9.402,
    blurbDa: 'Gammelt tingsted midt i Jylland, hvor konger blev kåret.',
    blurbEn: 'An ancient assembly place in mid-Jutland, where kings were named.',
  },
  {
    id: 'aalborg',
    name: 'Aalborg',
    region: 'Jylland',
    lat: 57.048,
    lon: 9.921,
    blurbDa: 'Limfjordens by — nu er der ikke langt til toppen.',
    blurbEn: 'The city on the Limfjord — the top is not far now.',
  },
  {
    id: 'skagen',
    name: 'Skagen',
    region: 'Jylland',
    lat: 57.724,
    lon: 10.581,
    blurbDa: 'Vendepunktet: her mødes to have, og rejsen drejer sydpå.',
    blurbEn: 'The turning point: two seas meet here, and the journey turns south.',
  },
  {
    id: 'odense',
    name: 'Odense',
    region: 'Fyn',
    lat: 55.403,
    lon: 10.402,
    blurbDa: 'H.C. Andersens by midt på Fyn — eventyr på hvert hjørne.',
    blurbEn: "Hans Christian Andersen's city on Funen — fairy tales on every corner.",
  },
  {
    id: 'roskilde',
    name: 'Roskilde',
    region: 'Sjælland',
    lat: 55.642,
    lon: 12.087,
    blurbDa: 'Vikingeskibe i fjorden og konger i domkirken.',
    blurbEn: 'Viking ships in the fjord and kings in the cathedral.',
  },
  {
    id: 'kobenhavn',
    name: 'København',
    region: 'Sjælland',
    lat: 55.676,
    lon: 12.568,
    blurbDa: 'Rejsens mål. Tusind ord senere er du hjemme i sproget.',
    blurbEn: "Journey's end. A thousand words later, the language is home.",
  },
]

export const FINAL_CITY_INDEX = CITIES.length - 1

/**
 * The study phase (whole board shown with translations before the round) is a
 * beginner's scaffold. It fades once the journey turns north at Aalborg —
 * by then the player has met 500 words and should be recalling, not reading.
 */
export const STUDY_UNTIL_CITY = 5

export function cityAt(index: number): City {
  const city = CITIES[index]
  if (!city) throw new Error(`no city at index ${index}`)
  return city
}
