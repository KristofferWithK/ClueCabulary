import type { City } from '../../journey/route'
import type { MapArt, Route } from '../types'
import {
  DENMARK_HATCH,
  DENMARK_PATH,
  DENMARK_SKETCH,
  MAP_HEIGHT,
  MAP_WIDTH,
  projectCity,
} from './map'

/**
 * The route: from the far south, up Jutland to the tip where two seas meet,
 * then back down across Funen to Zealand and journey's end in the capital.
 *
 * NINE stops, and the length is not decoration — nine cities of
 * WORDS_PER_CITY is the 900 the game is named for, and
 * scripts/validate-words.mjs reads this array to check the dataset against it.
 * Viborg, the inland mid-Jutland detour, was the stop that left when the
 * dataset came down from a thousand; a saved journey past it is shifted by
 * migrateJourney (src/stores/journeyStore.ts).
 */
const CITIES: City[] = [
  {
    id: 'sonderborg',
    name: 'Sønderborg',
    region: 'Sønderjylland',
    lat: 54.909,
    lon: 9.792,
    blurbTarget: 'Rejsen begynder på Als, længst mod syd.',
    blurbEn: 'The journey begins on Als, at the southern edge.',
  },
  {
    id: 'ribe',
    name: 'Ribe',
    region: 'Jylland',
    lat: 55.33,
    lon: 8.768,
    blurbTarget: 'Danmarks ældste by — vikinger og skæve brosten.',
    blurbEn: "Denmark's oldest town — Vikings and crooked cobblestones.",
  },
  {
    id: 'kolding',
    name: 'Kolding',
    region: 'Jylland',
    lat: 55.491,
    lon: 9.472,
    blurbTarget: 'Ved fjorden, hvor Koldinghus har stået i 750 år.',
    blurbEn: 'By the fjord, where Koldinghus has stood for 750 years.',
  },
  {
    id: 'aarhus',
    name: 'Aarhus',
    region: 'Jylland',
    lat: 56.163,
    lon: 10.203,
    blurbTarget: 'Den anden hovedstad — regnbuen ligger på taget.',
    blurbEn: 'The second capital — the rainbow sits on the roof.',
  },
  {
    id: 'aalborg',
    name: 'Aalborg',
    region: 'Jylland',
    lat: 57.048,
    lon: 9.921,
    blurbTarget: 'Limfjordens by — nu er der ikke langt til toppen.',
    blurbEn: 'The city on the Limfjord — the top is not far now.',
  },
  {
    id: 'skagen',
    name: 'Skagen',
    region: 'Jylland',
    lat: 57.724,
    lon: 10.581,
    blurbTarget: 'Vendepunktet: her mødes to have, og rejsen drejer sydpå.',
    blurbEn: 'The turning point: two seas meet here, and the journey turns south.',
  },
  {
    id: 'odense',
    name: 'Odense',
    region: 'Fyn',
    lat: 55.403,
    lon: 10.402,
    blurbTarget: 'H.C. Andersens by midt på Fyn — eventyr på hvert hjørne.',
    blurbEn: "Hans Christian Andersen's city on Funen — fairy tales on every corner.",
  },
  {
    id: 'roskilde',
    name: 'Roskilde',
    region: 'Sjælland',
    lat: 55.642,
    lon: 12.087,
    blurbTarget: 'Vikingeskibe i fjorden og konger i domkirken.',
    blurbEn: 'Viking ships in the fjord and kings in the cathedral.',
  },
  {
    id: 'kobenhavn',
    name: 'København',
    region: 'Sjælland',
    lat: 55.676,
    lon: 12.568,
    blurbTarget: 'Rejsens mål. Ni hundrede ord senere er du hjemme i sproget.',
    blurbEn: "Journey's end. Nine hundred words later, the language is home.",
  },
]

/**
 * The generated map, packaged as the pack wants it. `map.ts` keeps the plain
 * consts `scripts/make-map.mjs` writes; this is the adapter, so regenerating
 * the art never has to know about the seam.
 */
const map: MapArt = {
  width: MAP_WIDTH,
  height: MAP_HEIGHT,
  project: projectCity,
  path: DENMARK_PATH,
  sketch: DENMARK_SKETCH,
  hatch: DENMARK_HATCH,
}

export const danishRoute: Route = { cities: CITIES, map }
