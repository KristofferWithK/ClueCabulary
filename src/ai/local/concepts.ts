/**
 * The vocabulary the offline companion thinks in.
 *
 * Each curated word carries one to three of these concepts, and a clue is
 * simply the name of a concept that covers several of Klaus's words and none
 * of his forbidden ones. The names therefore have to be sayable as clues,
 * which means surviving checkClueLegality against whatever twelve words the
 * board happens to hold — and the strict containment rule means a single name
 * per concept is not enough. "mad" is useless as a clue for FOOD on a board
 * that contains "mad"; "måltid" is fine.
 *
 * So each concept lists several names per language, best first, and the
 * companion takes the first legal one. concepts.test.ts checks that every
 * concept keeps at least one legal name on boards drawn from the whole
 * curated city, which is the only way this list stays honest as words change.
 */
export const CONCEPT_IDS = [
  'people',
  'family',
  'body',
  'food',
  'drink',
  'kitchen',
  'home',
  'furniture',
  'school',
  'work',
  'money',
  'time',
  'colour',
  'animal',
  'nature',
  'weather',
  'vehicle',
  'building',
  'place',
  'movement',
  'speech',
  'thought',
  'emotion',
  'senses',
  'size',
  'age',
  'clothing',
  'health',
  'leisure',
  'nationality',
] as const

export type ConceptId = (typeof CONCEPT_IDS)[number]

/** Clue names per concept, best first. Both languages, because the player picks. */
export const CONCEPT_CLUES: Record<ConceptId, { da: readonly string[]; en: readonly string[] }> = {
  people: { da: ['befolkning', 'nogen', 'individ', 'skikkelse'], en: ['humans', 'individuals', 'folk', 'somebody'] },
  family: { da: ['slægt', 'slægtning', 'pårørende', 'stamtræ'], en: ['relatives', 'kin', 'household', 'lineage'] },
  body: { da: ['anatomi', 'legeme', 'lemmer', 'skelet'], en: ['anatomy', 'limbs', 'skeleton', 'flesh'] },
  food: { da: ['måltid', 'spisning', 'ernæring', 'kost'], en: ['meal', 'edible', 'nourishment', 'groceries'] },
  drink: { da: ['drikkevare', 'tørst', 'glas', 'kande'], en: ['beverage', 'thirst', 'sip', 'pour'] },
  kitchen: { da: ['madlavning', 'gryde', 'opskrift', 'komfur'], en: ['cooking', 'recipe', 'stove', 'saucepan'] },
  home: { da: ['bolig', 'husstand', 'indendørs', 'adresse'], en: ['dwelling', 'domestic', 'indoors', 'residence'] },
  furniture: { da: ['møbel', 'møblement', 'indretning', 'inventar'], en: ['furnishing', 'upholstery', 'interior', 'fittings'] },
  school: { da: ['undervisning', 'uddannelse', 'lektier', 'eksamen'], en: ['teaching', 'lesson', 'homework', 'classroom'] },
  work: { da: ['erhverv', 'beskæftigelse', 'karriere', 'ansættelse'], en: ['career', 'employment', 'profession', 'labour'] },
  money: { da: ['finans', 'formue', 'regning', 'valuta'], en: ['finance', 'wallet', 'currency', 'wealth'] },
  time: { da: ['kalender', 'ur', 'varighed', 'tidsplan'], en: ['calendar', 'clock', 'duration', 'schedule'] },
  colour: { da: ['kulør', 'nuance', 'malerkasse', 'regnbue'], en: ['hue', 'shade', 'palette', 'rainbow'] },
  animal: { da: ['dyr', 'fauna', 'væsen', 'zoologi'], en: ['creature', 'beast', 'wildlife', 'zoology'] },
  nature: { da: ['landskab', 'udendørs', 'vildmark', 'terræn'], en: ['landscape', 'outdoors', 'wilderness', 'terrain'] },
  weather: { da: ['vejrlig', 'himmel', 'klima', 'vejrudsigt'], en: ['climate', 'forecast', 'sky', 'meteorology'] },
  vehicle: { da: ['transport', 'køretøj', 'motor', 'trafik'], en: ['commuting', 'traffic', 'engine', 'driving'] },
  building: { da: ['bygning', 'arkitektur', 'mursten', 'tag'], en: ['architecture', 'structure', 'brickwork', 'roof'] },
  place: { da: ['beliggenhed', 'lokalitet', 'landkort', 'område'], en: ['location', 'map', 'region', 'whereabouts'] },
  movement: { da: ['bevægelse', 'rejse', 'fart', 'retning'], en: ['motion', 'travel', 'speed', 'direction'] },
  speech: { da: ['samtale', 'stemme', 'sprog', 'ytring'], en: ['conversation', 'voice', 'language', 'utterance'] },
  thought: { da: ['fornuft', 'hjerne', 'idé', 'overvejelse'], en: ['mind', 'brain', 'idea', 'reasoning'] },
  emotion: { da: ['følelse', 'stemning', 'humør', 'hjertevarme'], en: ['feeling', 'mood', 'sentiment', 'temper'] },
  senses: { da: ['sansning', 'sanser', 'opfattelse', 'indtryk'], en: ['perception', 'sensation', 'awareness', 'impression'] },
  size: { da: ['størrelse', 'omfang', 'målestok', 'dimension'], en: ['magnitude', 'scale', 'measurement', 'proportions'] },
  age: { da: ['alder', 'levealder', 'generation', 'årgang'], en: ['ageing', 'vintage', 'lifespan', 'birthday'] },
  clothing: { da: ['påklædning', 'garderobe', 'stof', 'mode'], en: ['garment', 'wardrobe', 'fabric', 'attire'] },
  health: { da: ['helbred', 'sygdom', 'medicin', 'behandling'], en: ['medicine', 'illness', 'treatment', 'wellbeing'] },
  leisure: { da: ['fritid', 'hobby', 'underholdning', 'ferie'], en: ['pastime', 'entertainment', 'holiday', 'recreation'] },
  nationality: { da: ['nationalitet', 'landegrænse', 'folkeslag', 'pas'], en: ['nationality', 'passport', 'border', 'citizenship'] },
}

const CONCEPT_SET: ReadonlySet<string> = new Set(CONCEPT_IDS)
export const isConceptId = (s: string): s is ConceptId => CONCEPT_SET.has(s)

/**
 * Every name of every concept, for reading a clue back the other way: when the
 * partner clues "meal", the companion needs to know that means FOOD.
 */
export const CONCEPT_BY_NAME: ReadonlyMap<string, ConceptId> = new Map(
  CONCEPT_IDS.flatMap((id) =>
    [...CONCEPT_CLUES[id].da, ...CONCEPT_CLUES[id].en].map((name) => [name.toLowerCase(), id] as const),
  ),
)
