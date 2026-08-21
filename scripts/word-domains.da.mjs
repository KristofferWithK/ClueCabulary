/**
 * Which everyday domain each Danish headword belongs to, for the ONE purpose
 * of keeping a city from filling up with one of them.
 *
 * WHY THIS IS NOT `concepts` IN THE DATASET
 *
 * `words.da.json` already carries a `concepts` array — but only on the curated
 * first city, and it is read by the offline companion (`src/ai/local/`) to
 * decide what a one-word clue can span. Tagging the other eight hundred would
 * change how that companion clues in every later city, which is E1's business
 * and not this script's. So the curriculum's view of "semantic domain" lives
 * here, beside the script that uses it, and never reaches the app.
 *
 * WHAT IT IS FOR
 *
 * `docs/word-selection.md`: no semantic domain above ~15 of a city's 100, and
 * the pool's clumps — six fruit and vegetables, five farm animals, six
 * professions, four weather words — interleaved across the later cities rather
 * than dealt as a block. Tinkham (1997) and Erten & Tekin (2008) are the
 * reason; the doc's research section carries the citations.
 *
 * WHAT IT IS NOT
 *
 * Not a full tagging, and deliberately so. A word that belongs to no listed
 * domain counts toward no cap — which is the safe direction: the cap can only
 * ever be under-applied, never applied to a set that is not really a set. The
 * domains listed are the ones a hundred words can plausibly clump into; the
 * abstract middle of the frequency list (mening, grund, sag, måde) is left
 * alone because "abstraction" is not a domain a board feels.
 *
 * The names are the companion's thirty concept ids where one fits, so there is
 * one vocabulary rather than two, plus `technology` and `travel`, which the
 * curriculum needs and the companion has never had a word for.
 */

/** domain id -> the headwords in it. A word may appear in at most one. */
export const DOMAINS = {
  food: [
    'æble', 'kage', 'smør', 'salt', 'sukker', 'kartoffel', 'grøntsag', 'ost',
    'æg', 'kød', 'fisk', 'mad', 'brød', 'frugt', 'suppe', 'salat', 'is',
    'kylling', 'pizza', 'pølse', 'tomat', 'banan', 'pasta', 'chokolade',
    'måltid', 'middag', 'frokost', 'morgenmad', 'aftensmad',
    'appelsin', 'pære', 'citron', 'jordbær', 'agurk', 'gulerod', 'løg',
    'skinke', 'peber', 'slik', 'opskrift',
  ],
  drink: ['mælk', 'vand', 'kaffe', 'øl', 'te', 'vin', 'sodavand'],
  animal: ['hund', 'kat', 'fugl', 'hest', 'dyr', 'sommerfugl', 'ko', 'gris', 'får', 'mus', 'and'],
  body: [
    'øje', 'hånd', 'mund', 'hoved', 'ben', 'fod', 'arm', 'finger', 'næse',
    'tand', 'hår', 'hjerte', 'krop', 'øre', 'mave', 'ryg', 'ansigt', 'blod',
    'hals', 'skulder', 'knæ', 'hud', 'muskel', 'tå', 'kind', 'læbe', 'hjerne',
  ],
  health: [
    'læge', 'hospital', 'sygdom', 'feber', 'forkølelse', 'hoste', 'hovedpine',
    'influenza', 'medicin', 'pille', 'recept', 'apotek', 'tandlæge',
    'sygeplejerske', 'ambulance', 'skade', 'sår', 'syg', 'rask', 'sund',
    'sundhed', 'ulykke', 'smerte', 'motion', 'træning',
  ],
  family: ['mor', 'far', 'barn', 'bror', 'søster', 'søn', 'datter', 'kone', 'kæreste', 'gift'],
  people: ['mand', 'kvinde', 'pige', 'dreng', 'ven', 'menneske', 'person', 'nabo', 'gæst', 'gruppe', 'voksen'],
  work: [
    'lærer', 'arbejde', 'job', 'chef', 'kollega', 'firma', 'kontor', 'løn',
    'kunde', 'politiker', 'politi', 'politistation', 'fabrik', 'kok',
    'tjener', 'frisør', 'landmand', 'journalist', 'håndværker',
    'politibetjent', 'aftale',
  ],
  school: [
    'skole', 'bog', 'elev', 'klasse', 'universitet', 'opgave', 'eksamen',
    'bibliotek', 'børnehave', 'blyant', 'pen', 'ordbog', 'lektie', 'kursus',
  ],
  money: ['penge', 'købe', 'bank', 'butik', 'pris', 'krone', 'regning', 'skat', 'pung', 'supermarked', 'bageri', 'marked', 'kvittering'],
  time: ['dag', 'nat', 'aften', 'uge', 'år', 'gang', 'tid', 'morgen', 'måned', 'time', 'minut', 'weekend', 'øjeblik', 'klokke', 'pause', 'fødselsdag', 'kalender'],
  colour: ['rød', 'hvid', 'sort', 'blå', 'grøn', 'gul', 'grå', 'brun', 'lyserød', 'lilla', 'orange'],
  clothing: [
    'tøj', 'sko', 'jakke', 'kjole', 'skjorte', 'trøje', 'frakke', 'nederdel',
    'hue', 'hat', 'handske', 'støvle', 'sok', 'tørklæde', 'bælte', 'knap',
    'undertøj', 'bukser', 'briller', 'sweater', 'bluse', 'ring',
  ],
  kitchen: ['køkken', 'kop', 'glas', 'flaske', 'tallerken', 'kniv', 'gaffel', 'gryde', 'ovn', 'køleskab', 'pande', 'fryser', 'saks', 'kurv'],
  home: [
    'hus', 'dør', 'vindue', 'værelse', 'lampe', 'væg', 'gulv', 'tag', 'trappe',
    'spejl', 'stue', 'badeværelse', 'lejlighed', 'hjem', 'kælder',
    'vaskemaskine', 'støvsuger', 'håndklæde', 'sæbe', 'tandbørste',
    'hylde', 'skuffe', 'toilet', 'bad', 'pose', 'loft',
  ],
  furniture: ['bord', 'seng', 'stol', 'skab', 'sofa', 'tæppe', 'pude', 'dyne', 'gardin', 'møbel'],
  weather: ['regn', 'sne', 'vejr', 'vind', 'sky', 'storm', 'temperatur', 'varme', 'kulde', 'solskin', 'torden', 'lyn', 'tåge'],
  nature: [
    'sol', 'træ', 'blomst', 'himmel', 'måne', 'stjerne', 'hav', 'strand',
    'natur', 'sø', 'skov', 'ø', 'jord', 'luft', 'ild', 'sten', 'sommer',
    'vinter', 'forår', 'efterår', 'græs', 'bjerg', 'flod', 'plante', 'blad',
    'skygge', 'udsigt', 'kanal',
  ],
  vehicle: ['bil', 'tog', 'bus', 'cykel', 'fly', 'skib', 'båd', 'færge', 'lastbil'],
  building: ['by', 'kirke', 'park', 'gade', 'museum', 'bro', 'bygning', 'hotel', 'restaurant', 'rådhus', 'fængsel', 'lufthavn', 'tårn'],
  travel: ['rejse', 'billet', 'station', 'ferie', 'tur', 'kuffert', 'rygsæk', 'pas', 'kørekort', 'bagage', 'grænse', 'turist', 'skilt'],
  technology: ['telefon', 'computer', 'maskine', 'internet', 'mail', 'program', 'fjernsyn', 'skærm', 'kamera', 'batteri', 'hjemmeside', 'app', 'radio'],
  leisure: ['fodbold', 'svømning', 'koncert', 'biograf', 'film', 'musik', 'fest', 'sang', 'kamp', 'klub', 'forening', 'teater'],
  nationality: [
    'dansk', 'engelsk', 'tysk', 'svensk', 'norsk', 'fransk', 'spansk',
    'italiensk', 'kinesisk', 'russisk', 'amerikansk', 'europæisk',
    'international', 'udenlandsk', 'national',
  ],
  emotion: [
    'glad', 'elske', 'glæde', 'kærlighed', 'sorg', 'vrede', 'frygt', 'angst',
    'humør', 'lykke', 'stolthed', 'skam', 'ensomhed', 'bekymring',
    'skuffelse', 'overraskelse', 'trist', 'lykkelig', 'vred', 'sur', 'ond',
    'bange', 'ensom', 'stolt', 'genert', 'nervøs', 'bekymret', 'skuffet',
    'overrasket', 'spændt', 'tilfreds', 'heldig',
  ],
  speech: ['ord', 'sprog', 'navn', 'spørgsmål', 'svar', 'besked', 'brev', 'avis', 'nyhed', 'tekst', 'historie', 'mening', 'adresse'],
}

/** headword -> domain id, built once. */
export const DOMAIN_OF = new Map(
  Object.entries(DOMAINS).flatMap(([domain, list]) => list.map((da) => [da, domain])),
)

/**
 * Pairs a city should not hold both halves of: opposites and near-synonyms are
 * the most confusable things to present together (Nation, after Higa 1963).
 * A soft rule — the placer prefers a split and never fails on one, because a
 * hard constraint here would fight the frequency ordering for a small gain.
 */
export const AVOID_TOGETHER = [
  ['stor', 'lille'], ['gammel', 'ung'], ['varm', 'kold'], ['hurtig', 'langsom'],
  ['god', 'dårlig'], ['let', 'svær'], ['tyk', 'tynd'], ['høj', 'lav'],
  ['lys', 'mørk'], ['ren', 'beskidt'], ['tør', 'våd'], ['tom', 'fuld'],
  ['bred', 'smal'], ['tidlig', 'sen'], ['rig', 'fattig'], ['blød', 'hård'],
  ['død', 'levende'], ['åben', 'lukket'], ['syg', 'rask'], ['sulten', 'tørstig'],
  ['vinde', 'tabe'], ['huske', 'glemme'], ['købe', 'sælge'], ['åbne', 'lukke'],
  ['starte', 'slutte'], ['grine', 'græde'], ['nem', 'svær'], ['smuk', 'grim'],
  ['klog', 'dum'], ['trist', 'lykkelig'], ['sund', 'syg'], ['spørge', 'svare'],
  ['låne', 'eje'], ['tænde', 'slukke'], ['rolig', 'travl'], ['sandhed', 'lyve'],
  // near-synonyms rather than opposites
  ['nem', 'let'], ['smuk', 'pæn'], ['sjov', 'morsom'], ['speciel', 'særlig'],
  ['snakke', 'tale'], ['prøve', 'forsøge'], ['starte', 'begynde'],
  ['slutte', 'afslutte'], ['rar', 'venlig'], ['flink', 'venlig'],
  ['mærkelig', 'underlig'], ['stille', 'rolig'], ['ordne', 'rette'],
  ['hoppe', 'springe'], ['råbe', 'skrige'], ['skygge', 'mørk'],
]
