/**
 * Applies the word selection decided in docs/word-selection.md.
 *
 *     node scripts/apply-word-selection.mjs            # rewrite the dataset
 *     node scripts/apply-word-selection.mjs --check    # compare, write nothing
 *     node scripts/apply-word-selection.mjs --report   # + the per-domain table
 *
 * THIS IS REPRODUCIBLE, AND THAT IS THE POINT. The card could have been done
 * with an editor and a lot of patience; then nobody could ever ask "why is
 * *gulerod* in Skagen" and get an answer. Run this on the dataset as it was
 * before it and you get the dataset as it is after it, byte for byte.
 *
 * It is NOT a build step (nothing imports it, `npm run verify` does not call
 * it) and it is not idempotent against its own output either: it takes the
 * pre-selection dataset — 900 words with the closed class still in them — and
 * produces the post-selection one. Running it twice is running it once; the
 * removals are already gone and the arrivals are already there, so the second
 * pass finds nothing to do and says so.
 *
 * WHAT IT DOES, in the order docs/word-selection.md's "The change to make"
 * lists it:
 *
 *   1. Removes the 113 headwords no one-word clue can reach — everything on
 *      the functionWords ledger, the greetings and replies, every numeral and
 *      interjection, and fourteen adverbs that associate with nothing.
 *   2. Adds the hundred that ranks 901–1000 of the generation pool were always
 *      going to be, dropped only because the tenth city went and
 *      merge-batches.mjs caps at 900, plus thirteen new nouns generated the
 *      batch way (src/data/generated/words-batch-9.json).
 *   3. Renumbers curriculumRank 1..900. City one is untouched — it is curated
 *      for clueability by apply-city-one.mjs and re-deriving it would undo
 *      that. The other eight hundred are dealt into cities by frequency,
 *      interleaved so that no city is a block of one part of speech or one
 *      domain, and no word moves more than MAX_DRIFT ranks from where plain
 *      frequency would have put it.
 *
 * The interleave is the part worth reading. See placeCities() below.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { AVOID_TOGETHER, DOMAINS, DOMAIN_OF } from './word-domains.da.mjs'

const ROOT = new URL('../', import.meta.url)
const WORDS_PATH = new URL('src/data/words.da.json', ROOT)
const GEN_DIR = new URL('src/data/generated/', ROOT)
const LEDGER_PATH = new URL('src/data/function-words.da.json', ROOT)

const WORDS_PER_CITY = 100
const CITIES = 9
const TOTAL = WORDS_PER_CITY * CITIES

/**
 * How far a word may be moved from its frequency position, in ranks.
 *
 * From docs/word-selection.md, and it is the dial that decides how much
 * interleaving is possible at all: the hundred pool words sit at the very end
 * of the frequency order, so 250 is what lets sixty-seven concrete nouns reach
 * back as far as the fifth city instead of landing on the ninth as one block.
 * Raise it and the curriculum stops being frequency-ordered; lower it and the
 * clumps come back.
 */
const MAX_DRIFT = 250

/** No city may hold more than this many words of one domain. */
const DOMAIN_CAP = 15

/**
 * How little road a word may have left before the placer stops interleaving it
 * and simply puts it down, in ranks.
 *
 * The interleave works by preferring a word whose DOMAIN is behind its share
 * rather than the word whose rank is lowest, which means deliberately leaving
 * low-ranked words unplaced for a while. This is the leash on that: with none,
 * words piled up against their MAX_DRIFT deadlines and were forced in in
 * batches, over the class quota, and a city lost a noun to it.
 *
 * Measured at 0, 40 and 80. At 0 the leash is off: three words break MAX_DRIFT
 * outright, city 5 comes out with 40 nouns and 29 adjectives and city 9 with
 * 50 nouns. 40 and 80 both hold every city at exactly 45; 40 is kept because
 * it is the looser interleave of the two and the numbers say it costs nothing.
 */
const URGENT = 40

/* ------------------------------------------------------------------ *
 * 1. The removals
 * ------------------------------------------------------------------ */

/**
 * The 113, by the city they are leaving, exactly as docs/word-selection.md
 * lists them. Kept in that shape rather than flattened so the two can be read
 * against each other.
 */
const REMOVED_BY_CITY = {
  2: `ikke være der så kunne også nu skulle her blive meget ja nej ville kun
      lige bare gøre op ud ind ned igen tilbage altid aldrig måtte måske lidt
      mere hvor hvordan samme hvorfor hvornår tak hej en to tre hjemme`,
  3: `væk ude inde oppe nede frem sammen have ofte tit snart allerede stadig
      endnu helt næsten nok sådan gerne hellere virkelig faktisk egentlig
      selvfølgelig først fire fem seks syv otte ni ti mest mindre mindst ret`,
  4: `derfor alligevel ellers altså nemlig pludselig længe sjældent engang
      straks endelig cirka især undskyld okay hallo farvel velkommen jo goddag
      godmorgen godnat skål`,
  5: `av første anden burde tredje tyve hundrede tusind tredive fyrre halvtreds
      nul`,
  8: `mod`,
}
const REMOVED = new Set(Object.values(REMOVED_BY_CITY).flatMap((s) => s.trim().split(/\s+/)))

/* ------------------------------------------------------------------ *
 * 2. The arrivals
 * ------------------------------------------------------------------ */

/**
 * merge-batches.mjs's scoring, copied rather than imported because that script
 * is a bootstrap that writes the whole dataset and this one must not. The two
 * must agree: this is how "ranks 901–1000 of the pool" is defined, and a
 * different score here would add a different hundred words.
 *
 * noun-5 is new, and continues the noun bands the way noun-4 continued noun-3,
 * so the thirteen generated for this card score just past rank 1000 instead of
 * landing in the middle of a set that was ranked a year ago.
 */
const SLICE_SCORE = {
  'noun-1': (o) => o * 2.2,
  'noun-2': (o) => (150 + o) * 2.2,
  'noun-3': (o) => (300 + o) * 2.2,
  'noun-4': (o) => (450 + o) * 2.2,
  'noun-5': (o) => (560 + o) * 2.2,
  'verb-1': (o) => o * 4,
  'verb-2': (o) => (140 + o) * 4,
  'verb-3': (o) => (280 + o) * 4,
  'adj-1': (o) => o * 5,
  'adj-2': (o) => (160 + o) * 5,
  'misc-1': (o) => o * 3,
}

/** The whole generation pool, ranked the way merge-batches.mjs ranks it. */
function rankedPool() {
  const seen = new Map()
  for (const f of readdirSync(GEN_DIR).filter((f) => /^words-batch-\d+\.json$/.test(f)).sort()) {
    for (const e of JSON.parse(readFileSync(new URL(f, GEN_DIR), 'utf8'))) {
      const key = e.da.trim().toLowerCase()
      if (!seen.has(key)) seen.set(key, e)
    }
  }
  return [...seen.values()]
    .map((entry) => ({ entry, score: (SLICE_SCORE[entry.slice] ?? ((o) => o * 6))(entry.order) }))
    .sort((a, b) => a.score - b.score || a.entry.da.localeCompare(b.entry.da, 'da'))
    .map(({ entry }, i) => ({ entry, freqRank: i + 1 }))
}

/**
 * The example sentences the arrivals ship with, where the batch's own sentence
 * is not the one this card wants.
 *
 * TWO BUDGETS, both from docs/PLAN-2.md's WS1 card. A sentence must (a) show
 * the grammar structure that docs/grammar-da.md's closing table says the city
 * it lands in reinforces — the city you arrive in exercises the chapter you
 * were just told — and (b) carry scenery: the closed-class words a learner can
 * only ever meet inside somebody else's sentence, preferring the ones
 * scripts/measure-function-words.mjs finds thin.
 *
 * Only the arrivals are written this way. The 787 that were already here keep
 * the sentences they had; rewriting those to the same budget is T3, and doing
 * it here would have meant nine hundred Danish sentences in a card that is
 * about which words exist.
 *
 * A SENTENCE MUST STILL USE ITS OWN HEADWORD. Two documents in this repo say
 * the opposite — docs/word-selection.md and the essay atop
 * scripts/measure-function-words.mjs both call it a rule that an example may
 * NOT contain its headword — and both have the validator backwards. The check
 * warns when the example does NOT contain the stem, 885 of the 900 shipped
 * examples do contain it, and the fifteen warnings are the exceptions. So
 * every sentence below uses its word.
 *
 * THE TARGET IS A SHARE, NOT ALL OF THEM. docs/grammar-da.md says so in the
 * paragraph under the table — "a sentence forced into a structure it does not
 * want is worse than a sentence that misses it" — so the arrivals whose batch
 * sentence already shows the structure keep it, and the rest were rewritten
 * until each city was comfortably over half.
 *
 * NOT READ BY A DANISH SPEAKER. Neither were the batch sentences, but those
 * at least came from the same generation pass as the rest of the dataset;
 * these were written here, for a structural target, and the PR says so.
 */
const EXAMPLE_OVERRIDES = {
  // ---- city 6, Skagen: past and perfect ---------------------------------
  radio: ['Vi hørte radio i bilen hele vejen hjem.', 'We listened to the radio in the car the whole way home.'],
  pas: ['Han havde glemt sit pas i lufthavnen.', 'He had forgotten his passport at the airport.'],
  færge: ['Færgen er sejlet uden os.', 'The ferry has sailed without us.'],
  ko: ['Koen har stået på marken siden i morges.', 'The cow has been standing in the field since this morning.'],
  gris: ['Grisen var stor og lyserød, da vi så den.', 'The pig was big and pink when we saw it.'],

  // ---- city 7, Odense: adjectives in all three coats ---------------------
  får: ['De hvide får går rundt på den grønne mark.', 'The white sheep walk around on the green field.'],
  blyant: ['Eleven skriver med en rød blyant.', 'The pupil writes with a red pencil.'],
  kok: ['Den unge kok laver god mad hver aften.', 'The young cook makes good food every evening.'],
  tjener: ['Den venlige tjener kommer med vores mad.', 'The friendly waiter brings our food.'],
  pære: ['Jeg spiser en grøn pære til frokost.', 'I eat a green pear for lunch.'],
  pen: ['Har du en blå pen, jeg kan låne?', 'Do you have a blue pen I can borrow?'],
  citron: ['Hun drikker varm te med citron.', 'She drinks hot tea with lemon.'],
  frisør: ['Den nye frisør klipper hurtigt og godt.', 'The new hairdresser cuts quickly and well.'],
  kamera: ['Hun tager billeder med et nyt kamera.', 'She takes pictures with a new camera.'],
  pande: ['Fisken steger på en varm pande.', 'The fish is frying in a hot pan.'],
  flod: ['Den lange flod løber gennem byen.', 'The long river runs through the city.'],
  jordbær: ['Vi spiser røde jordbær om sommeren.', 'We eat red strawberries in the summer.'],

  // ---- city 8, Roskilde: possessives, and some sin -----------------------
  appelsin: ['Han lægger en appelsin i sin taske.', 'He puts an orange in his bag.'],
  torden: ['Hunden gemmer sig under min seng, når der er torden.', 'The dog hides under my bed when there is thunder.'],
  landmand: ['Landmanden henter sine køer hver morgen.', 'The farmer fetches his cows every morning.'],
  agurk: ['Jeg køber en frisk agurk til salaten.', 'I buy a fresh cucumber for the salad.'],
  toilet: ['Deres toilet er lige ved siden af køkkenet.', 'Their toilet is right next to the kitchen.'],
  ordbog: ['Han glemte sin ordbog hjemme.', 'He forgot his dictionary at home.'],
  plante: ['Hendes plante står i vinduet.', 'Her plant stands in the window.'],
  lastbil: ['Manden vasker sin lastbil om søndagen.', 'The man washes his truck on Sundays.'],
  grænse: ['Vi viste vores pas ved grænsen.', 'We showed our passports at the border.'],
  gulerod: ['Hesten spiser en gulerod af min hånd.', 'The horse eats a carrot out of my hand.'],
  journalist: ['Journalisten skriver sin artikel om aftenen.', 'The journalist writes her article in the evening.'],
  bad: ['Jeg tager mit bad hver morgen.', 'I take my bath every morning.'],
  kind: ['Hun kysser sin mor på kinden.', 'She kisses her mother on the cheek.'],
  blad: ['Bladene på vores træ falder om efteråret.', 'The leaves on our tree fall in the autumn.'],

  // ---- city 9, København: subordinate clauses, and the shifted ikke ------
  // This is also where the measured scenery hole gets filled: hvis was 0 of
  // 900 sentences, selvom 0, mens 0 and fordi 2, because a one-clause A1
  // example has no second clause to put them in. These have one.
  reparere: ['Min far reparerer cyklen, fordi den ikke kører.', 'My dad is repairing the bike, because it does not run.'],
  ødelægge: ['Pas på, at du ikke ødelægger min telefon.', 'Be careful that you do not break my phone.'],
  pose: ['Hun tager en pose med, når hun handler.', 'She brings a bag when she goes shopping.'],
  bage: ['Min mor bager boller, selvom hun ikke har tid.', 'My mother bakes buns, even though she does not have time.'],
  kanal: ['Vi sejler gennem kanalen, mens solen går ned.', 'We sail through the canal while the sun goes down.'],
  skinke: ['Jeg spiser brød med skinke, fordi jeg ikke kan lide ost.', 'I eat bread with ham, because I do not like cheese.'],
  koge: ['Vandet koger, når det bliver varmt nok.', 'The water boils when it gets hot enough.'],
  and: ['Anden svømmer væk, hvis du kommer for tæt på.', 'The duck swims away if you come too close.'],
  rydde: ['Han rydder op i køkkenet, selvom han ikke vil.', 'He tidies up the kitchen, even though he does not want to.'],
  møbel: ['Vi køber nye møbler, fordi de gamle ikke passer.', 'We are buying new furniture, because the old ones do not fit.'],
  sweater: ['Hun tager en varm sweater på, når det er koldt.', 'She puts on a warm sweater when it is cold.'],
  snakke: ['Vi snakker om ferien, mens vi venter på toget.', 'We talk about the holiday while we wait for the train.'],
  trykke: ['Tryk på knappen, hvis døren ikke åbner.', 'Press the button if the door does not open.'],
  fylde: ['Hun fylder flasken, fordi der ikke er mere vand.', 'She fills the bottle, because there is no more water.'],
  skære: ['Han skærer brødet, mens suppen bliver varm.', 'He cuts the bread while the soup gets warm.'],
  læbe: ['Mine læber bliver tørre, hvis jeg ikke drikker vand.', 'My lips get dry if I do not drink water.'],
  råbe: ['Hun råber, fordi han ikke kan høre hende.', 'She shouts, because he cannot hear her.'],
  tårn: ['Man kan se hele byen, når man står i tårnet.', 'You can see the whole city when you stand in the tower.'],
  ryge: ['Han ryger ikke mere, fordi det ikke er sundt.', 'He does not smoke anymore, because it is not healthy.'],
  tørre: ['Jeg tørrer hænderne, når jeg har vasket dem.', 'I dry my hands when I have washed them.'],
  peber: ['Maden smager ikke af noget, hvis der ikke er salt og peber i.', 'The food does not taste of anything if there is no salt and pepper in it.'],
  politibetjent: ['Politibetjenten stopper bilen, fordi den kører for hurtigt.', 'The police officer stops the car, because it is driving too fast.'],
  blande: ['Bland mælk og æg, før du bager kagen.', 'Mix milk and eggs before you bake the cake.'],
  hylde: ['Koppen står på hylden, som hænger over bordet.', 'The cup is on the shelf that hangs above the table.'],
  ordne: ['Jeg ordner mit værelse, selvom jeg ikke gider.', 'I tidy my room, even though I do not feel like it.'],
  skygge: ['Vi sad i skyggen, fordi solen var alt for varm.', 'We sat in the shade, because the sun was far too hot.'],
  hoppe: ['Børnene hopper på sengen, når de ikke skal sove.', 'The children jump on the bed when they do not have to sleep.'],
  bluse: ['Hun tager sin nye bluse på, fordi hun skal til fest.', 'She puts on her new blouse, because she is going to a party.'],
  rulle: ['Bolden ruller ned ad vejen, hvis du ikke holder den.', 'The ball rolls down the road if you do not hold it.'],
  bade: ['Vi bader i havet, når vandet ikke er for koldt.', 'We swim in the sea when the water is not too cold.'],
  kursus: ['Hun tager et kursus i dansk, fordi hun bor her nu.', 'She is taking a Danish course, because she lives here now.'],
  binde: ['Han binder sine sko, før han løber.', 'He ties his shoes before he runs.'],
  teater: ['Vi går i teatret, selvom billetterne ikke er billige.', 'We go to the theatre, even though the tickets are not cheap.'],
  klippe: ['Frisøren klipper mit hår, mens jeg læser et blad.', 'The hairdresser cuts my hair while I read a magazine.'],
  app: ['Jeg bruger en app, når jeg ikke kan huske et ord.', 'I use an app when I cannot remember a word.'],
  stege: ['Jeg steger fisken, mens kartoflerne koger.', 'I fry the fish while the potatoes boil.'],
  kalender: ['Hun skriver mødet i sin kalender, så hun ikke glemmer det.', 'She writes the meeting in her calendar so that she does not forget it.'],
  hælde: ['Hun hælder kaffe i koppen, fordi gæsterne kommer nu.', 'She pours coffee into the cup, because the guests are arriving now.'],
  smøre: ['Han smører brødet, mens vandet koger.', 'He butters the bread while the water boils.'],
  slik: ['Børnene får slik om fredagen, hvis de ikke har været syge.', 'The children get sweets on Fridays if they have not been ill.'],
  servere: ['De serverer aftensmad klokken seks, selvom vi ikke er sultne.', 'They serve dinner at six o’clock, even though we are not hungry.'],
  hjerne: ['Hjernen arbejder dårligt, hvis du ikke sover nok.', 'The brain works badly if you do not sleep enough.'],
  diskutere: ['Vi diskuterer planen, fordi vi ikke er enige.', 'We are discussing the plan, because we do not agree.'],
  aftale: ['Vi har en aftale hos lægen, som vi ikke må glemme.', 'We have an appointment at the doctor that we must not forget.'],
  skuffe: ['Knivene ligger i skuffen, hvis du ikke kan finde dem.', 'The knives are in the drawer if you cannot find them.'],
  hviske: ['Hun hvisker, fordi barnet ikke må vågne.', 'She whispers, because the child must not wake up.'],
  ring: ['Han giver hende en ring, fordi de skal giftes.', 'He gives her a ring, because they are getting married.'],
  glide: ['Pas på, at du ikke glider på isen.', 'Be careful that you do not slip on the ice.'],
  klatre: ['Drengen klatrer op i træet, selvom han ikke må.', 'The boy climbs up the tree, even though he is not allowed to.'],
  opskrift: ['Kagen bliver ikke god, hvis du ikke følger opskriften.', 'The cake does not turn out well if you do not follow the recipe.'],
  bekymre: ['Du skal ikke bekymre dig, fordi alt går godt.', 'You should not worry, because everything is going well.'],
  irritere: ['Støjen irriterer mig, når jeg ikke kan sove.', 'The noise annoys me when I cannot sleep.'],
  kramme: ['Hun krammer sin søster, fordi hun er ked af det.', 'She hugs her sister, because she is sad.'],
  trøste: ['Moren trøster barnet, som ikke kan sove.', 'The mother comforts the child that cannot sleep.'],
  venskab: ['Vores venskab er vigtigt, selvom vi ikke ses tit.', 'Our friendship is important, even though we do not see each other often.'],
  skrige: ['Barnet skriger, fordi det ikke vil i seng.', 'The child screams, because it does not want to go to bed.'],
  ægteskab: ['Deres ægteskab er godt, fordi de snakker sammen.', 'Their marriage is good, because they talk to each other.'],
}

/* ------------------------------------------------------------------ *
 * 3. The city placement
 * ------------------------------------------------------------------ */

/**
 * Where the eight hundred words of cities 2–9 go.
 *
 * The shape of the problem: plain frequency order puts the hundred pool words
 * — six fruit and vegetables, five farm animals, six professions, four weather
 * words, sixty-seven concrete nouns in all — at the very end, so city nine
 * would be a block of concrete nouns and the eight cities before it would run
 * out of them. That is the "difficulty curve runs backwards" the doc measured,
 * in the other direction.
 *
 * The fix is two passes and no search:
 *
 *   WHICH CLASS this position wants. In two steps, because one was not enough.
 *
 *   First an IDEAL SEQUENCE of eight hundred class labels, with no words in
 *   it: repeatedly take the class with the largest share of itself still
 *   unspent. Nouns are 45% of the eight hundred so they take about 45 of every
 *   hundred labels; the seventeen surviving adverbs are 2% and come round
 *   about once every forty-seven. It is the largest-remainder rule run one
 *   label at a time, and it interleaves by construction — no class can be
 *   dealt as a block, because spending one drops its share below the others'.
 *   Each city's hundred labels are then that city's QUOTA.
 *
 *   Then the fill goes for the quota, not the sequence: at each position the
 *   class furthest behind ITS OWN city's quota goes next. Running the share
 *   rule directly against the pool instead left city 2 with 44 nouns and city
 *   6 with 42, because a share of eight hundred says nothing about which
 *   hundred; the quota is per city and holds every city to 45.
 *
 *   Two things bend it, both on purpose. A class with nothing left within
 *   MAX_DRIFT of here is skipped — the seventeen adverbs all live in the first
 *   fifth of the frequency order, so the later cities' adverb quota is simply
 *   unmeetable and the words behind it go to whichever class is next furthest
 *   behind. (An earlier version pre-computed the plan from even spacing and
 *   deadlocked at position 447 asking for an adverb that could not legally
 *   reach it.) And a word about to miss its own deadline outranks the quota
 *   entirely.
 *
 *   WHICH WORD of that class. The one with the lowest frequency rank left.
 *   Lowest-first is not a preference, it is what makes the pass safe: a word
 *   may move at most MAX_DRIFT ranks, so the lowest-ranked one is the one
 *   whose deadline is nearest, and taking it first is earliest-deadline-first
 *   scheduling. A word whose domain is already at DOMAIN_CAP in this city, or
 *   whose opposite is already in it, is stepped over — but only while another
 *   word of the class is available, and a word that would otherwise miss its
 *   deadline is placed regardless. An unfilled city would be worse than a
 *   fifteenth fruit.
 *
 * The result is checked rather than trusted: every drift, every city's size,
 * every part-of-speech count and every domain count is asserted below, and
 * scripts/validate-words.mjs checks the quota again on the written file.
 */
function placeCities(pool) {
  const byPos = new Map()
  for (const w of pool) {
    if (!byPos.has(w.pos)) byPos.set(w.pos, [])
    byPos.get(w.pos).push(w)
  }
  for (const list of byPos.values()) list.sort((a, b) => a.freqPos - b.freqPos)

  const partner = new Map()
  for (const [a, b] of AVOID_TOGETHER) {
    if (!partner.has(a)) partner.set(a, new Set())
    if (!partner.has(b)) partner.set(b, new Set())
    partner.get(a).add(b)
    partner.get(b).add(a)
  }
  const total = new Map([...byPos].map(([pos, list]) => [pos, list.length]))
  const remaining = new Map([...byPos].map(([pos, list]) => [pos, [...list]]))
  // Biggest class first, so a tie in the share rule resolves the same way on
  // every machine and in favour of the class with the most to get through.
  const classes = [...total.keys()].sort((a, b) => total.get(b) - total.get(a) || a.localeCompare(b))

  const taken = new Map(classes.map((c) => [c, 0]))
  /**
   * The stretch of positions a class can legally occupy at all: from the
   * earliest its first word may be pulled to, to the latest its last word may
   * be pushed to.
   *
   * This is what makes the adverbs work. All seventeen survivors sit in the
   * first third of the frequency order, so the last of them must be placed by
   * position 600 — and pacing them at 17/800 per position, as an even rate
   * over the whole eight hundred does, left eight of them unplaced and out of
   * time at the city-6 boundary, where they were forced in together and cost
   * that city two of its nouns. Paced over the stretch they can actually
   * occupy, they arrive about three a city and stop.
   */
  const span = new Map(
    classes.map((c) => {
      const list = byPos.get(c)
      return [
        c,
        [
          Math.max(1, list[0].freqPos - MAX_DRIFT),
          Math.min(pool.length, list[list.length - 1].freqPos + MAX_DRIFT),
        ],
      ]
    }),
  )
  /**
   * How far behind its own rate a class is, after p−1 positions. A class that
   * is 45% of the pool should hold 45% of every prefix; taking the largest
   * deficit each time keeps every class within about one word of its rate at
   * EVERY position.
   */
  const deficit = (c, p) => {
    const [from, to] = span.get(c)
    const share = Math.min(1, Math.max(0, (p - from + 1) / (to - from + 1)))
    return total.get(c) * share - taken.get(c)
  }

  /**
   * How many of each class each city gets — decided up front, as whole words,
   * and then held to.
   *
   * "About the right rate" is not good enough here and the arithmetic says
   * why: there are 360 nouns for eight cities, which is 45 each with nothing
   * to spare, so a city that takes 46 has taken one from somewhere else and
   * put it below the 55±10 the selection asks for. Three earlier versions of
   * this loop each landed one city on 44 for exactly that reason. So the rate
   * decides the SHAPE and this matrix decides the COUNTS: the rate's real
   * numbers are fitted to whole ones whose rows are a hundred and whose
   * columns are the class totals, and the fill may not exceed a cell.
   *
   * The biggest class — the nouns — is settled FIRST and dead level, and
   * everything else shares what is left. Fitting all four at once let the
   * adverbs, which can only reach the first five cities, push the nouns there
   * down to 44 while the last four went to 46; that is a real property of the
   * pool, and the right place to absorb it is the two classes with ten words
   * of slack rather than the one with none.
   */
  const [flatClass, ...sharing] = classes
  const flat = Array.from({ length: CITIES - 1 }, (_, c) =>
    Math.floor(total.get(flatClass) / (CITIES - 1)) + (c < total.get(flatClass) % (CITIES - 1) ? 1 : 0),
  )
  const shared = apportion(
    Array.from({ length: CITIES - 1 }, (_, c) =>
      sharing.map((k) => {
        const [from, to] = span.get(k)
        const lo = Math.max(from, c * WORDS_PER_CITY + 1)
        const hi = Math.min(to, (c + 1) * WORDS_PER_CITY)
        return (total.get(k) * Math.max(0, hi - lo + 1)) / (to - from + 1)
      }),
    ),
    flat.map((n) => WORDS_PER_CITY - n),
    sharing.map((k) => total.get(k)),
  )
  const quota = shared.map((row, c) => [flat[c], ...row])
  const cityTaken = Array.from({ length: CITIES }, () => new Map(classes.map((c) => [c, 0])))

  /**
   * The same rate rule again, one level down: a domain that is 5% of the pool
   * should hold 5% of every prefix of it.
   *
   * WITHOUT THIS the placement was correct and useless. Taking the lowest
   * frequency rank left is order-preserving, so the hundred pool words — which
   * ARE the tail of the frequency order — came out as the tail of the
   * curriculum: all 113 arrivals in cities 8 and 9, six fruit and five farm
   * animals and six professions dealt as one block, which is the arrangement
   * docs/word-selection.md exists to prevent. Racing the domains on their own
   * share, rather than the words on their own rank, is what pulls a carrot
   * back to Aalborg and lets an ordinary word from Aalborg go on to Roskilde.
   *
   * Everything with no listed domain shares one bucket and so still comes out
   * in frequency order among itself — the deficit ties, and the scan takes the
   * lowest rank first.
   */
  const domainOf = (w) => DOMAIN_OF.get(w.da) ?? ''
  const domainTotal = new Map()
  for (const w of pool) domainTotal.set(domainOf(w), (domainTotal.get(domainOf(w)) ?? 0) + 1)
  const domainTaken = new Map([...domainTotal.keys()].map((d) => [d, 0]))
  const domainDeficit = (d, p) => p / pool.length - domainTaken.get(d) / domainTotal.get(d)

  const placed = []
  const cityDomains = Array.from({ length: CITIES }, () => new Map())
  const cityWords = Array.from({ length: CITIES }, () => new Set())
  const cityGlosses = Array.from({ length: CITIES }, () => new Set())
  const softSkips = []

  for (let p = 1; p <= pool.length; p++) {
    const city = Math.floor((p - 1) / WORDS_PER_CITY) + 1 // city 1 is the curated one
    // A word whose deadline is this position must go now. Deadlines are
    // freqPos + MAX_DRIFT and freqPos is unique, so at most one word ever is.
    let pick = classes.find((c) => {
      const head = remaining.get(c)[0]
      return head && head.freqPos + MAX_DRIFT <= p
    })
    if (pick === undefined) {
      const reachable = classes.filter((c) => {
        const head = remaining.get(c)[0]
        return head && head.freqPos - MAX_DRIFT <= p
      })
      if (reachable.length === 0) {
        throw new Error(`nothing may sit at position ${p} — the pool and ${MAX_DRIFT} ranks disagree`)
      }
      const room = reachable.filter((c) => cityTaken[city].get(c) < quota[city - 1][classes.indexOf(c)])
      const choices = room.length ? room : reachable
      // A class whose oldest word is running out of road goes now, while there
      // is still quota room for it. Waiting until its deadline would force it
      // in over the quota and take a noun off some city — which is exactly how
      // city 5 ended up with 44 before this clause existed.
      const urgent = choices.filter((c) => remaining.get(c)[0].freqPos + MAX_DRIFT - p < URGENT)
      pick = (urgent.length ? urgent : choices).reduce((best, c) =>
        deficit(c, p) > deficit(best, p) ? c : best,
      )
    }
    taken.set(pick, taken.get(pick) + 1)
    cityTaken[city].set(pick, cityTaken[city].get(pick) + 1)
    const list = remaining.get(pick)
    let chosen = 0
    if (list[0].freqPos + MAX_DRIFT - p >= URGENT) {
      let bestScore = -Infinity
      let fallback = -1
      for (let j = 0; j < list.length; j++) {
        const w = list[j]
        if (w.freqPos - MAX_DRIFT > p) break
        if (fallback === -1) fallback = j
        if (!isAcceptable(w, cityDomains[city], cityWords[city], partner, cityGlosses[city])) continue
        const s = domainDeficit(domainOf(w), p)
        if (s > bestScore) {
          bestScore = s
          chosen = j
        }
      }
      if (bestScore === -Infinity) {
        chosen = fallback === -1 ? 0 : fallback
        softSkips.push(`${list[chosen].da} at ${p} (city ${city + 1})`)
      }
    }
    const [w] = list.splice(chosen, 1)
    w.curriculumRank = WORDS_PER_CITY + p
    placed.push(w)
    cityWords[city].add(w.da)
    for (const g of w.en) cityGlosses[city].add(glossKey(g))
    domainTaken.set(domainOf(w), domainTaken.get(domainOf(w)) + 1)
    const domain = DOMAIN_OF.get(w.da)
    if (domain) cityDomains[city].set(domain, (cityDomains[city].get(domain) ?? 0) + 1)
  }
  return { placed, cityDomains, softSkips }
}

/**
 * Whole numbers as close to `ideal` as rounding allows, with every row summing
 * to its `rowSums` entry and every column to its `colSums` entry.
 *
 * Two passes. First iterative proportional fitting scales rows and columns in
 * turn until the real-valued matrix has the margins asked for — a standard
 * trick, and it converges in a handful of rounds on a matrix this small. Then
 * largest-remainder: floor everything, and hand the units that were rounded
 * away to the cells with the biggest fractions, skipping any whose row or
 * column is already full.
 */
function apportion(ideal, rowSums, colSums) {
  const R = rowSums.length
  const C = colSums.length
  const m = ideal.map((row) => [...row])
  for (let iter = 0; iter < 200; iter++) {
    for (let r = 0; r < R; r++) {
      const s = m[r].reduce((a, b) => a + b, 0)
      if (s > 0) for (let c = 0; c < C; c++) m[r][c] *= rowSums[r] / s
    }
    for (let c = 0; c < C; c++) {
      const s = m.reduce((a, row) => a + row[c], 0)
      if (s > 0) for (let r = 0; r < R; r++) m[r][c] *= colSums[c] / s
    }
  }
  const q = m.map((row) => row.map(Math.floor))
  const rowNeed = rowSums.map((s, r) => s - q[r].reduce((a, b) => a + b, 0))
  const colNeed = colSums.map((s, c) => s - q.reduce((a, row) => a + row[c], 0))
  const cells = []
  for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) cells.push([r, c, m[r][c] % 1])
  cells.sort((a, b) => b[2] - a[2] || a[0] - b[0] || a[1] - b[1])
  for (let pass = 0; pass < 3 && rowNeed.some((n) => n > 0); pass++) {
    for (const [r, c] of cells) {
      if (rowNeed[r] > 0 && colNeed[c] > 0) {
        q[r][c]++
        rowNeed[r]--
        colNeed[c]--
      }
    }
  }
  if (rowNeed.some((n) => n !== 0) || colNeed.some((n) => n !== 0)) {
    throw new Error('the class quota does not add up — the rate and the totals disagree')
  }
  return q
}

/** The gloss key a board compares on — `conflicts()` in src/srs/sampler.ts. */
const glossKey = (g) => g.toLowerCase().trim().replace(/^(to|a|an|the) /, '')

/**
 * Three soft reasons to step over a word and take the next one of its class:
 * its domain is full in this city, its opposite is already here, or a word
 * here already answers to one of its English glosses.
 *
 * The last is the same rule the board itself applies — `conflicts()` refuses
 * two words that share a gloss, so a city holding both simply never deals them
 * together and quietly loses a pair. Soft, because it cannot always be
 * honoured: «appelsin» and «orange» are the same word in English and both have
 * to live somewhere.
 */
function isAcceptable(w, domains, words, partner, glosses) {
  const domain = DOMAIN_OF.get(w.da)
  if (domain && (domains.get(domain) ?? 0) >= DOMAIN_CAP) return false
  const mates = partner.get(w.da)
  if (mates && [...mates].some((m) => words.has(m))) return false
  return !w.en.some((g) => glosses.has(glossKey(g)))
}

/* ------------------------------------------------------------------ *
 * Run
 * ------------------------------------------------------------------ */

const check = process.argv.includes('--check')
const report = process.argv.includes('--report')

const words = JSON.parse(readFileSync(WORDS_PATH, 'utf8'))
const before = JSON.stringify(words)
const kept = words.filter((w) => !REMOVED.has(w.da.toLowerCase()))
const removedCount = words.length - kept.length
if (removedCount !== REMOVED.size && removedCount !== 0) {
  const absent = [...REMOVED].filter((da) => !words.some((w) => w.da.toLowerCase() === da))
  console.error(`${absent.length} of the ${REMOVED.size} removals are not in the dataset: ${absent.join(', ')}`)
  process.exit(1)
}

const pool = rankedPool()
const have = new Set(kept.map((w) => w.da.toLowerCase()))
const UNCOUNTABLE = readUncountable()

/** The generation record's shape, turned into the dataset's. */
function fromBatch({ entry, freqRank }) {
  const da = entry.da.trim()
  const gender = entry.article === 'et' ? 'neuter' : 'common'
  const [overrideDa, overrideEn] = EXAMPLE_OVERRIDES[da.toLowerCase()] ?? []
  return {
    id: `da:${da.toLowerCase()}`,
    da,
    en: entry.en.map((g) => g.trim()).filter(Boolean),
    pos: entry.pos,
    ...(entry.pos === 'noun' && entry.article ? { article: entry.article } : {}),
    exampleDa: (overrideDa ?? entry.exampleDa).trim(),
    exampleEn: (overrideEn ?? entry.exampleEn).trim(),
    freqRank,
    ...(entry.pos === 'noun' ? { gender } : {}),
    ...(entry.pos === 'noun' && UNCOUNTABLE.has(da.toLowerCase()) ? { countable: false } : {}),
  }
}

/**
 * The uncountable nouns, scraped out of the language pack the same way
 * scripts/validate-words.mjs scrapes them — one home for the fact, and the
 * validator would fail this file's output the moment the two disagreed.
 */
function readUncountable() {
  const src = readFileSync(new URL('src/lang/da/grammar.ts', ROOT), 'utf8')
  const set = new Set(
    [
      ...src
        .split('export const UNCOUNTABLE')[0]
        .split('\n')
        .filter((line) => !/^\s*import\b/.test(line))
        .join('\n')
        .matchAll(/'([^']+)'/g),
    ].map((m) => m[1]),
  )
  if (set.size === 0) throw new Error('read no uncountable nouns out of src/lang/da/grammar.ts')
  return set
}

/**
 * Everything the pool ranks past 900: the hundred the tenth city took with it
 * and the thirteen generated for this card. Taken as a slice rather than as
 * "whatever is not already a headword", because the pool also still holds the
 * 113 words this script has just removed and re-adding those would be a very
 * quiet way to undo the whole change.
 */
const wanted = pool.slice(TOTAL)
const arrivals = wanted.filter(({ entry }) => !have.has(entry.da.trim().toLowerCase())).map(fromBatch)
const stray = Object.keys(EXAMPLE_OVERRIDES).filter(
  (da) => !wanted.some(({ entry }) => entry.da.trim().toLowerCase() === da),
)
if (stray.length) {
  console.error(`EXAMPLE_OVERRIDES names ${stray.length} words that are not arrivals: ${stray.join(', ')}`)
  process.exit(1)
}
const onBoth = arrivals.filter((w) => REMOVED.has(w.da.toLowerCase()))
if (onBoth.length) {
  console.error(`${onBoth.length} arrivals are also on the removal list: ${onBoth.map((w) => w.da).join(', ')}`)
  process.exit(1)
}
const final = [...kept, ...arrivals]
if (final.length !== TOTAL) {
  console.error(
    `${kept.length} kept + ${arrivals.length} arrivals = ${final.length}, not ${TOTAL}.` +
      ' The pool and the removals do not add up; see docs/word-selection.md.',
  )
  process.exit(1)
}

// A ledger word must not be a headword — the rule scripts/validate-words.mjs
// now enforces, checked here too so this script cannot produce a file that
// fails it.
const ledger = new Set(Object.values(JSON.parse(readFileSync(LEDGER_PATH, 'utf8'))).flat())
const onLedger = final.filter((w) => ledger.has(w.da.toLowerCase())).map((w) => w.da)
if (onLedger.length) {
  console.error(`${onLedger.length} headwords are also on the ledger: ${onLedger.join(', ')}`)
  process.exit(1)
}

// City one, unchanged and in its own order.
const city1 = final
  .filter((w) => w.curriculumRank !== undefined && w.curriculumRank <= WORDS_PER_CITY)
  .sort((a, b) => a.curriculumRank - b.curriculumRank)
if (city1.length !== WORDS_PER_CITY) {
  console.error(`city one holds ${city1.length} words, not ${WORDS_PER_CITY}`)
  process.exit(1)
}
const city1Ids = new Set(city1.map((w) => w.id))

// Everything else, in frequency order, with its position in that order.
const rest = final
  .filter((w) => !city1Ids.has(w.id))
  .sort((a, b) => a.freqRank - b.freqRank)
  .map((w, i) => ({ ...w, freqPos: i + 1 }))

const { placed, cityDomains, softSkips } = placeCities(rest)

const out = [...city1, ...placed.sort((a, b) => a.curriculumRank - b.curriculumRank)].map((w) => {
  const { freqPos, ...rest } = w
  return rest
})

/* ---- the checks, all of them, before anything is written --------- */
const problems = []
const ranks = new Set(out.map((w) => w.curriculumRank))
if (ranks.size !== TOTAL) problems.push('curriculumRank is not a permutation of 1..900')
for (let r = 1; r <= TOTAL; r++) if (!ranks.has(r)) problems.push(`curriculumRank ${r} is missing`)
for (const w of placed) {
  const drift = Math.abs(w.curriculumRank - WORDS_PER_CITY - w.freqPos)
  if (drift > MAX_DRIFT) problems.push(`${w.da} moved ${drift} ranks, over the ${MAX_DRIFT} allowed`)
}
const cityOf = (w) => Math.floor((w.curriculumRank - 1) / WORDS_PER_CITY)
const perCity = Array.from({ length: CITIES }, () => ({ noun: 0, verb: 0, adjective: 0, adverb: 0 }))
for (const w of out) perCity[cityOf(w)][w.pos] = (perCity[cityOf(w)][w.pos] ?? 0) + 1
for (let c = 1; c < CITIES; c++) {
  for (const [pos, target] of [['noun', 55], ['verb', 25], ['adjective', 20]]) {
    const n = perCity[c][pos]
    if (Math.abs(n - target) > 10) problems.push(`city ${c + 1} has ${n} ${pos}s, outside ${target}±10`)
  }
}
for (const [c, counts] of cityDomains.entries()) {
  for (const [domain, n] of counts) {
    if (n > DOMAIN_CAP) problems.push(`city ${c + 1} has ${n} ${domain} words, over ${DOMAIN_CAP}`)
  }
}
/* ---- the report -------------------------------------------------- */
const CITY_NAMES = readFileSync(new URL('src/lang/da/route.ts', ROOT), 'utf8')
  .match(/name: '([^']+)'/g)
  .map((m) => m.slice(7, -1))

console.log(`removed ${removedCount}, added ${arrivals.length}, ${out.length} words in ${CITIES} cities\n`)
console.log('| City | Nouns | Verbs | Adj | Adverbs | Largest domain |')
console.log('|---|---|---|---|---|---|')
for (let c = 0; c < CITIES; c++) {
  const counts = perCity[c]
  const biggest = [...(cityDomains[c] ?? new Map())].sort((a, b) => b[1] - a[1])[0]
  console.log(
    `| ${c + 1} ${CITY_NAMES[c]} | ${counts.noun} | ${counts.verb} | ${counts.adjective} |` +
      ` ${counts.adverb ?? 0} | ${biggest ? `${biggest[0]} ${biggest[1]}` : '—'} |`,
  )
}
/**
 * How many of a city's arrivals show the structure that city reinforces.
 *
 * docs/grammar-da.md's closing table says the city you arrive in should
 * exercise the chapter you were just told, and that this "is measurable, and
 * it should be measured". This is the crude version of that measurement, over
 * the arrivals only — a regex for each structure, generous rather than exact,
 * because it exists to stop the claim in the PR being a guess. The real thing,
 * over all nine hundred sentences, is T3's.
 */
const setOf = (pos) => new Set(out.filter((w) => w.pos === pos).map((w) => w.da.toLowerCase()))
const NOUNS = setOf('noun')
const VERBS = setOf('verb')
const ADJECTIVES = setOf('adjective')
// Danish letters are not \w, which is the whole reason this is a token list
// and not a set of regexes: the first draft of this report matched nothing
// with an æ, ø or å in it and said city 6 was at 3 of 5 when it was at 5.
const wordsIn = (s) => s.toLowerCase().replace(/[^a-zæøåé\s]/g, ' ').split(/\s+/).filter(Boolean)
const inflectionOf = (t, suffixes, set) =>
  set.has(t) ||
  suffixes.some((suf) => {
    if (!t.endsWith(suf) || t.length - suf.length < 2) return false
    const stem = t.slice(0, t.length - suf.length)
    return set.has(stem) || set.has(`${stem}e`)
  })
const IRREGULAR_PAST = new Set(
  `var havde blev gik så fik sagde drak spiste kom tog stod lå gav satte fandt
   skrev løb sov bad holdt sad hed vidste kunne skulle ville måtte`.trim().split(/\s+/),
)
const POSSESSIVE = new Set('min mit mine din dit dine hans hendes vores deres jeres sin sit sine'.split(' '))
const SUBORDINATOR = new Set('at hvis fordi når da mens selvom som før efter'.split(' '))
const FRONTED = new Set('i på om til med hver fra efter under ved hos bag foran uden gennem langs når hvis fordi mens selvom der'.split(' '))

const STRUCTURE = [
  [2, 'definite nouns', (t) => t.some((w) => !NOUNS.has(w) && inflectionOf(w, ['en', 'et', 'n', 't'], NOUNS))],
  [3, 'plurals', (t) => t.some((w) => !NOUNS.has(w) && inflectionOf(w, ['erne', 'ene', 'er', 'e', 'r'], NOUNS))],
  [4, 'a non-subject first', (t) => FRONTED.has(t[0])],
  [5, 'questions, ikke after the verb', (t, s) => s.includes('?') || t.includes('ikke')],
  [
    6,
    'past and perfect',
    (t) =>
      t.some((w, i) => IRREGULAR_PAST.has(w) || inflectionOf(w, ['ede', 'te', 'de'], VERBS) ||
        (['har', 'havde', 'er', 'var', 'blev'].includes(w) && /(et|t)$/.test(t[i + 1] ?? ''))),
  ],
  [7, 'adjectives in three coats', (t) => t.some((w) => inflectionOf(w, ['t', 'e'], ADJECTIVES))],
  [8, 'possessives, some sin', (t) => t.some((w) => POSSESSIVE.has(w))],
  [
    9,
    'subordinate clause, shifted ikke',
    (t, s) => /,\s*(at|hvis|fordi|når|da|mens|selvom|som|før)\b/.test(s) ||
      t.some((w, i) => SUBORDINATOR.has(w) && t.slice(i + 1, i + 4).includes('ikke')),
  ],
]
const cityIndexOf = new Map(out.map((w) => [w.id, cityOf(w) + 1]))
console.log(
  arrivals.length
    ? '\nthe arrivals against the structure their city reinforces:'
    : '\n(no arrivals — already applied, so nothing to check against a city’s structure)',
)
for (const [city, label, hits] of STRUCTURE) {
  const mine = arrivals.filter((w) => cityIndexOf.get(w.id) === city)
  if (mine.length === 0) continue
  const n = mine.filter((w) => hits(wordsIn(w.exampleDa), w.exampleDa)).length
  console.log(`  ${city} ${CITY_NAMES[city - 1].padEnd(12)} ${String(n).padStart(2)}/${String(mine.length).padEnd(3)} ${label}`)
}

/**
 * How cluable each city's hundred is, as a number.
 *
 * WHY IT IS THIS NUMBER AND NOT A SELFPLAY RUN. The WS1 card asks for
 * src/ai/selfplay.test.ts run "per city slice", pinning that no city falls
 * below city 9's clue-hit floor. That harness cannot answer it: it deals
 * `dansk0ord0`, `dansk1ord1` and so on — synthetic words with no meaning — and
 * its clue-hit rate is a DIAL it is handed, not something it measures off a
 * board. The file says as much where it introduces `skill`: "Danish word
 * association is not a coin with a bias." Run per city it would return the
 * same table nine times.
 *
 * So this is the instrument that can be built today. A clue is worth more than
 * one card only when two cards on the board belong to the same everyday
 * domain, so the share of a city's 4,950 within-city pairs that share one is a
 * direct proxy for how much a clue can reach there. It is the same quantity
 * E1's judged matrix will measure properly, one word-pair at a time and with
 * degrees rather than yes/no; until then this is a floor under the question,
 * and the figure to watch is that no city is far below the others.
 */
const CLUABILITY = cityDomains.map((_, c) => {
  const city = out.filter((w) => cityOf(w) === c)
  const counts = new Map()
  for (const w of city) {
    const d = DOMAIN_OF.get(w.da)
    if (d) counts.set(d, (counts.get(d) ?? 0) + 1)
  }
  const pairs = [...counts.values()].reduce((a, n) => a + (n * (n - 1)) / 2, 0)
  return (100 * pairs) / ((city.length * (city.length - 1)) / 2)
})
console.log('\nsame-domain share of a city’s pairs (a clue needs two cards to reach):')
console.log(
  CLUABILITY.map((v, c) => `  ${c + 1} ${CITY_NAMES[c].padEnd(12)} ${v.toFixed(2)}%`).join('\n'),
)

const drifts = placed.map((w) => Math.abs(w.curriculumRank - WORDS_PER_CITY - w.freqPos))
console.log(
  `\ndrift: max ${Math.max(...drifts)}, mean ${(drifts.reduce((a, b) => a + b, 0) / drifts.length).toFixed(1)},` +
    ` ${drifts.filter((d) => d === 0).length} words did not move`,
)
if (softSkips.length) {
  console.log(`${softSkips.length} placements took a capped domain or a paired word anyway:`)
  for (const s of softSkips.slice(0, 12)) console.log(`  · ${s}`)
}
if (report) {
  console.log('\n=== every domain, by city ===')
  const names = Object.keys(DOMAINS).sort()
  console.log(['domain'.padEnd(12), ...CITY_NAMES.map((_, i) => String(i + 1).padStart(3))].join(' '))
  for (const d of names) {
    console.log(
      [d.padEnd(12), ...cityDomains.map((m) => String(m.get(d) ?? 0).padStart(3))].join(' '),
    )
  }
}

// The table is printed above this on purpose: a failure here is almost always
// a quota that cannot be met, and the numbers are what tells you which.
if (problems.length) {
  console.error(`\nrefusing to write — ${problems.length} problems:`)
  for (const p of problems.slice(0, 20)) console.error(`  ✗ ${p}`)
  process.exit(1)
}
if (check) {
  const same = JSON.stringify(out) === JSON.stringify(JSON.parse(before))
  console.log(same ? '\n--check: the dataset already is this' : '\n--check: the dataset differs')
  process.exit(same ? 0 : 1)
}
writeFileSync(WORDS_PATH, `${JSON.stringify(out, null, 2)}\n`)
console.log('\nwrote src/data/words.da.json')
