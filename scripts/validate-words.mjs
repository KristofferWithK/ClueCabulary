// Validates src/data/words.<lang>.json: schema, uniqueness, single-token
// citation forms, POS whitelist, and that the dataset is exactly the route's
// worth of words. Exits non-zero on hard errors; prints warnings for things a
// human/model review pass should look at.
//
// Every rule that is a fact about the language — the alphabet, the genders and
// their articles, which nouns cannot be counted, the route — is read from the
// language's pack rather than written here. `--lang da` is the default.
import { readFileSync, readdirSync } from 'node:fs'

/**
 * Which language to validate. Danish is the only dataset that exists, so it is
 * the default; `--lang de` will work the moment H2 lands `words.de.json` and a
 * `src/lang/de/` pack, with no change here beyond an entry in ALPHABETS.
 */
const argLang = process.argv.indexOf('--lang')
const LANG = argLang === -1 ? 'da' : (process.argv[argLang + 1] ?? 'da')
if (!/^[a-z]{2}$/.test(LANG)) {
  console.error(`--lang must be a two-letter code, got "${LANG}"`)
  process.exit(2)
}

/**
 * The uncountable list, read out of the language pack rather than copied, so
 * the classification has exactly one home. A plain regex over the quoted
 * strings above the export is enough — that part of the file is a list of
 * literals by design, and a validator that needs a bundler is a validator
 * nobody runs. (Which is why `grammar.ts` keeps its gender table BELOW the
 * export: a quoted string up there would land in this set.)
 */
const grammarSrc = readFileSync(
  new URL(`../src/lang/${LANG}/grammar.ts`, import.meta.url),
  'utf8',
)
const UNCOUNTABLE = new Set(
  [
    ...grammarSrc
      .split('export const UNCOUNTABLE')[0]
      // Import lines carry quoted paths, and '../types' scraped straight into
      // the set when countability moved into the pack. It matched no headword
      // so nothing failed, which is exactly why it is worth removing: a
      // validator that silently reads junk is one bad line away from silently
      // reading nothing.
      .split('\n')
      .filter((line) => !/^\s*import\b/.test(line))
      .join('\n')
      .matchAll(/'([^']+)'/g),
  ].map((m) => m[1]),
)
if (UNCOUNTABLE.size === 0) {
  console.error(`read no uncountable nouns out of src/lang/${LANG}/grammar.ts — the scrape broke`)
  process.exit(2)
}

/**
 * The route, read out of the TypeScript rather than restated, for the same
 * reason the uncountable list is: one home per fact. Nine cities of a hundred
 * is what "900Words" means, and the dataset and the route have to agree about
 * it or a city ends up owning a band with nothing in it.
 *
 * The cities come from the language's own route; WORDS_PER_CITY is the
 * journey's constant and is shared by every language.
 */
const routeSrc = readFileSync(new URL(`../src/lang/${LANG}/route.ts`, import.meta.url), 'utf8')
const CITY_IDS = [...routeSrc.matchAll(/^ {4}id: '([a-z]+)',/gm)].map((m) => m[1])
const citiesSrc = readFileSync(new URL('../src/journey/cities.ts', import.meta.url), 'utf8')
const WORDS_PER_CITY = Number(citiesSrc.match(/WORDS_PER_CITY = (\d+)/)?.[1])
const EXPECTED = CITY_IDS.length * WORDS_PER_CITY

const PATH = new URL(`../src/data/words.${LANG}.json`, import.meta.url)
const POS = new Set(['noun', 'verb', 'adjective', 'adverb', 'numeral', 'interjection'])

/**
 * The letters a citation form may be spelled with, beyond plain ASCII.
 *
 * Per language because the check is real: it is what catches a stray digit, a
 * space or a smuggled English word in the dataset. German needs äöüß and its
 * capitals — and note that German nouns are capitalised, so the existing
 * allowance for upper case is not a looseness there but the rule.
 */
const ALPHABETS = {
  da: 'æøåÆØÅé',
  de: 'äöüßÄÖÜ',
}
const extra = ALPHABETS[LANG]
if (extra === undefined) {
  console.error(`no alphabet listed for "${LANG}" — add one to ALPHABETS in this file`)
  process.exit(2)
}
const DA_TOKEN = new RegExp(`^[a-zA-Z${extra}]+$`)

/**
 * The genders this language has and the article each one takes, read out of the
 * same pack the app prints from.
 *
 * Hardcoded as common/neuter and en/et until the language seam, which would
 * have rejected every German noun in the dataset as "no gender" — a validator
 * that fails a correct dataset is as bad as one that passes a broken one, and
 * this one gates the build. Note the article is NOT unique per gender in
 * German (der and das both take ein), so the checks below read gender→article
 * and never the reverse.
 */
const GENDERS = Object.fromEntries(
  [...grammarSrc.matchAll(/^ {2}(\w+): \{ article: '([^']+)'/gm)].map((m) => [m[1], m[2]]),
)
if (Object.keys(GENDERS).length === 0) {
  console.error(`read no genders out of src/lang/${LANG}/grammar.ts — the scrape broke`)
  process.exit(2)
}

const words = JSON.parse(readFileSync(PATH, 'utf8'))
const errors = []
const warnings = []

const ids = new Set()
const das = new Set()
const ranks = new Set()
const curriculum = new Set()
// Kept in step with src/ai/local/concepts.ts by concepts.test.ts, which fails
// if the city uses a concept the companion cannot name.
const CONCEPTS = new Set([
  'people', 'family', 'body', 'food', 'drink', 'kitchen', 'home', 'furniture',
  'school', 'work', 'money', 'time', 'colour', 'animal', 'nature', 'weather',
  'vehicle', 'building', 'place', 'movement', 'speech', 'thought', 'emotion',
  'senses', 'size', 'age', 'clothing', 'health', 'leisure', 'nationality',
])

for (const [i, w] of words.entries()) {
  const at = `#${i} (${w?.da ?? '?'})`
  for (const field of ['id', 'da', 'en', 'pos', 'exampleDa', 'exampleEn', 'freqRank']) {
    if (w[field] === undefined || w[field] === null || w[field] === '') {
      errors.push(`${at}: missing ${field}`)
    }
  }
  if (ids.has(w.id)) errors.push(`${at}: duplicate id`)
  ids.add(w.id)
  const daKey = String(w.da).toLowerCase()
  if (das.has(daKey)) errors.push(`${at}: duplicate da`)
  das.add(daKey)
  if (ranks.has(w.freqRank)) errors.push(`${at}: duplicate freqRank ${w.freqRank}`)
  ranks.add(w.freqRank)
  if (!Number.isInteger(w.freqRank) || w.freqRank < 1) errors.push(`${at}: bad freqRank`)
  if (w.curriculumRank !== undefined) {
    if (!Number.isInteger(w.curriculumRank) || w.curriculumRank < 1) {
      errors.push(`${at}: bad curriculumRank`)
    } else if (curriculum.has(w.curriculumRank)) {
      errors.push(`${at}: duplicate curriculumRank ${w.curriculumRank}`)
    }
    curriculum.add(w.curriculumRank)
  }
  if (w.concepts !== undefined) {
    if (!Array.isArray(w.concepts) || w.concepts.length === 0) {
      errors.push(`${at}: concepts must be a non-empty array when present`)
    } else {
      for (const c of w.concepts) if (!CONCEPTS.has(c)) errors.push(`${at}: unknown concept "${c}"`)
    }
  }
  if (!DA_TOKEN.test(w.da)) errors.push(`${at}: da is not a single Danish token`)
  if (!POS.has(w.pos)) errors.push(`${at}: pos "${w.pos}" not in whitelist`)
  if (!Array.isArray(w.en) || w.en.length === 0 || w.en.some((g) => typeof g !== 'string' || !g.trim())) {
    errors.push(`${at}: en must be a non-empty string array`)
  }
  // Every noun must say what gender it is. Most say it with en/et; the ones
  // that cannot — plurale tantum, where there is no indefinite singular — say
  // it with the gender field, and the card prints (com)/(neut). A noun with
  // neither tells the learner nothing, which is a hard error rather than a
  // warning: gender is not decoration in Danish.
  if (w.pos === 'noun' && GENDERS[w.gender] === undefined) {
    errors.push(
      `${at}: noun with no gender the pack knows (has "${w.gender}", knows ${Object.keys(GENDERS).join('/')})`,
    )
  }
  if (w.article && w.gender && GENDERS[w.gender] !== w.article) {
    errors.push(`${at}: article "${w.article}" disagrees with gender ${w.gender}`)
  }
  if (w.pos === 'noun' && !w.article) {
    warnings.push(`${at}: noun with no article — shown as its gender, ${w.gender}`)
  }
  if (w.pos !== 'noun' && (w.article || w.gender || w.countable !== undefined)) {
    warnings.push(`${at}: non-noun with article, gender or countability`)
  }
  // The countability classification lives in the language pack's grammar
  // module and is applied to the whole noun set, so the two must not drift.
  if (w.pos === 'noun' && (w.countable === false) !== UNCOUNTABLE.has(w.da)) {
    errors.push(
      `${at}: countable=${w.countable} disagrees with the pack's grammar module (listed: ${UNCOUNTABLE.has(w.da)})`,
    )
  }
  if (w.en?.some((g) => /^to /.test(g))) warnings.push(`${at}: gloss with leading "to " (${w.en})`)
  // The example should contain the headword or a recognizable inflection.
  const stem = String(w.da).toLowerCase().slice(0, Math.max(3, w.da.length - 2))
  if (w.exampleDa && !w.exampleDa.toLowerCase().includes(stem)) {
    warnings.push(`${at}: exampleDa may not use the headword`)
  }
}

// A partial curriculum ordering would put words in no city at all.
if (curriculum.size && curriculum.size !== words.length) {
  errors.push(`${curriculum.size} of ${words.length} words have a curriculumRank — it must be all or none`)
}

// The dataset is exactly the route: nine cities owning a hundred words each.
if (!CITY_IDS.length || !Number.isInteger(WORDS_PER_CITY)) {
  errors.push(`could not read the route out of src/lang/${LANG}/route.ts`)
} else if (words.length !== EXPECTED) {
  errors.push(
    `${words.length} words for ${CITY_IDS.length} cities × ${WORDS_PER_CITY} — expected ${EXPECTED}`,
  )
}

// Contiguous 1..N, because cityBand() slices the teaching order by arithmetic:
// a gap does not shrink a city, it empties a slot in one and no error says so.
if (curriculum.size === words.length) {
  const missing = []
  for (let r = 1; r <= words.length && missing.length < 5; r++) {
    if (!curriculum.has(r)) missing.push(r)
  }
  if (missing.length) {
    errors.push(`curriculumRank must be contiguous 1..${words.length}; missing ${missing.join(', ')}…`)
  }
  // Each city's hundred, counted the way src/journey/progress.ts counts it.
  for (const [c, id] of CITY_IDS.entries()) {
    const lo = c * WORDS_PER_CITY + 1
    const hi = (c + 1) * WORDS_PER_CITY
    const n = words.filter((w) => w.curriculumRank >= lo && w.curriculumRank <= hi).length
    if (n !== WORDS_PER_CITY) errors.push(`${id} (ranks ${lo}-${hi}) owns ${n} words, not ${WORDS_PER_CITY}`)
  }
}

// Every shipped headword must still be traceable to a generation batch. The
// batches are the raw record and the merge's ranked pool, not a build input
// (see scripts/merge-batches.mjs) — but a headword in neither place came from
// nowhere, and that is the drift worth catching.
const GEN_DIR = new URL('../src/data/generated/', import.meta.url)
const batched = new Set()
for (const f of readdirSync(GEN_DIR).filter((f) => /^words-batch-\d+\.json$/.test(f))) {
  for (const e of JSON.parse(readFileSync(new URL(f, GEN_DIR), 'utf8'))) {
    batched.add(String(e.da).trim().toLowerCase())
  }
}
const untraceable = words.filter((w) => !batched.has(String(w.da).toLowerCase())).map((w) => w.da)
if (untraceable.length) {
  errors.push(`${untraceable.length} headwords are in no generation batch: ${untraceable.join(', ')}`)
}

const tagged = words.filter((w) => w.concepts?.length).length
console.log(
  `${words.length} entries checked, ${curriculum.size} ranked for teaching, ${tagged} tagged` +
    ` — ${CITY_IDS.length} cities × ${WORDS_PER_CITY}`,
)
if (warnings.length) {
  console.log(`\n${warnings.length} warnings:`)
  for (const w of warnings.slice(0, 40)) console.log(`  ⚠ ${w}`)
  if (warnings.length > 40) console.log(`  … and ${warnings.length - 40} more`)
}
if (errors.length) {
  console.error(`\n${errors.length} ERRORS:`)
  for (const e of errors) console.error(`  ✗ ${e}`)
  process.exit(1)
}
console.log('OK — no hard errors')
