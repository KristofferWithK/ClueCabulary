// The canonical shape of the association book, and the briefs the authoring
// agents are handed.
//
// `docs/clue-engine.md` §6 "Stage 1": per word ~25-35 associations, and for
// every within-city pair the matrix scores M >= 1 a handful of clues that
// evoke BOTH. This file is what makes that reproducible, the way
// `matrix-pairs.mjs` is for the matrix. Two things are defined here and
// nowhere else:
//
//   - `pairKey(a, b)` — the key a pair section is filed under. Canonical order
//     is curriculumRank, so `da:mor|da:far`, never the reverse.
//   - `relatedPairs(entries, matrix)` — WHICH pairs get a section: exactly the
//     ones the judged matrix puts at M >= 1.
//
// That second one is deliberate and it is the correction E1 left for this
// card. The dataset's `concepts` tags look like they would do the same job for
// free, and they do not: 18 of 36 `nature` pairs and 13 of 28 `place` pairs
// were judged 0 by both models, so half of what those tags call related is two
// words that share nothing a clue could reach (træ/hav, hav/butik). `food`
// (1/91) and `people` (7/78) are reliable, but a rule that is right for two
// tags and a coin-flip for two others is not a rule. The matrix is the gate.
//
//   node scripts/book-brief.mjs --kind words --out tmp-book-briefs --size 25
//   node scripts/book-brief.mjs --kind pairs --out tmp-book-briefs --size 213
//
// writes one brief per batch per model. The briefs are derivable and are not
// committed; the agent output under src/data/generated/book-city<N>/ is.
//
// RE-BRIEFING A SLICE. An authoring agent can come back short — one Fable pair
// batch of 210 stopped dead at 107 entries, which is an output ceiling and not
// an opinion about the pairs — so `--from`, `--to` and `--tag` cut any range of
// the pair list into its own brief:
//
//   node scripts/book-brief.mjs --kind pairs --from 427 --to 533 --tag 05
//
// The indexes are 1-based positions in `relatedPairs()`, which is derived from
// the matrix and is stable, so a range names the same pairs on every run. The
// tag only names the file: `merge-book.mjs` cares that no two files repeat a
// key, not which batch a key arrived in.
import { mkdirSync, writeFileSync } from 'node:fs'
import { cityPairs, cityWords, loadWords } from './matrix-pairs.mjs'
import { fromBase64, readJson, unpackMatrix } from './matrix-pack.mjs'

export const MODELS = ['opus', 'fable']

/** Associations per word, and the band the validator holds the book to. */
export const ASSOC_MIN = 25
export const ASSOC_MAX = 35
/** Clues per related pair. One is allowed; see validate-book.mjs's header. */
export const PAIR_MIN = 1
export const PAIR_MAX = 6
/**
 * A `why` is a phrase, not a sentence.
 *
 * The spec (`clue-engine.md` §6 "Stage 1") asks for 3-8 words and the floor is
 * **2**, deliberately. The brief handed to the agents said 3, and the merge
 * then found the same two-word phrase coming back from BOTH models on the
 * strongest entries in the book: «stor → lille, "its opposite", s 3», «hund →
 * hvalp, "its young", s 3», «smør → gul, "its colour"». 56 entries were dropped
 * on the word count alone and every one of them was exactly two words — an
 * antonym, a young-of-species, or a defining colour, which are the three links
 * that have no honest three-word phrasing. Padding them to «it is the opposite»
 * makes the rationale a player reads worse, not better, so the floor moved to
 * where the data was rather than the data being bent to the floor. The ceiling
 * of 8 is unchanged and nothing came near it.
 */
export const WHY_MIN_WORDS = 2
export const WHY_MAX_WORDS = 8

/** The key a pair section is filed under: both ids, curriculumRank order. */
export function pairKey(a, b) {
  return `${a.id}|${b.id}`
}

/** Read the packed matrix back as `(i, j) => score`. */
export function loadMatrix(lang = 'da') {
  const doc = readJson(`src/data/matrix.${lang}.json`)
  const cells = unpackMatrix(fromBase64(doc.data), doc.n)
  return { doc, at: (i, j) => cells[i * doc.n + j] }
}

/** The within-city pairs the matrix scores M >= 1 — the ones a book pairs. */
export function relatedPairs(entries, at, min = 1) {
  return cityPairs(entries).filter((p) => at(p.i, p.j) >= min)
}

const VOICE = `You are authoring the **opening book** of a clue engine for a Danish
vocabulary game. The game is Codenames: a clue-giver says ONE word and a
number, and the guesser picks cards. The book is the list of single words a
clue-giver could reasonably say to make a learner think of a given Danish
word. It is read by a program, offline, and it is the only association data
the engine has — a word you leave out is a clue the engine can never give.`

const rules = (disguise) => `## The rules every entry must obey

1. **One word.** Danish side and English side are each a single word, no
   spaces, no hyphenated pairs. The engine gives one word as a clue; anything
   with a space is rejected before it reaches a player.
2. **Never the word itself, in any disguise.** Not the headword, not an
   inflected form of it, not a compound that contains it, not one it contains,
   and not any of its English translations or a word containing one.
   ${disguise} The build rejects them and they are simply
   lost, so do not spend one.
3. **æ, ø and å, never ae/oe/aa.** «kæledyr», not «kaeledyr». The build
   rejects the ASCII spellings.
4. **Lowercase**, and only Danish letters (a-z, æ, ø, å).
5. **Learner-level, common over clever.** These are for someone with a few
   hundred Danish words. «kæledyr» before «gadekryds». Prefer the word a
   Dane would actually say out loud.
6. **Both languages carry the same idea.** \`da\` is the Danish clue,
   \`en\` is the English clue for the SAME association — Casey may clue in
   either language, so both are real clues, not a gloss and its label. If the
   natural English clue is a different word from the literal translation of
   the Danish one, write the natural English clue.
7. **\`why\` is a phrase of ${WHY_MIN_WORDS}-${WHY_MAX_WORDS} words**, lowercase, no full stop. It becomes
   the templated rationale a player reads: «"kæledyr" — a household pet». Say
   what the link IS, not that there is one. Good: \`a household pet\`, \`what
   it drinks\`, \`where you buy it\`. Bad: \`related\`, \`associated with dogs\`.

## What makes a good association

Shapes that work, roughly in order of how often they earn their place:

- the **category** it belongs to (hund → dyr, kæledyr)
- what you **do with it / what it does** (hund → gø, gå, tro)
- **where** it is found (hund → gård, park, hjem)
- its **parts**, or what it is part of (hund → pote, hale, pels)
- what it is **made of / made from** (ost → mælk)
- the **thing it habitually turns up with** (kaffe → morgen, kop)
- a **near-synonym or an opposite** (glad → lykkelig, trist)
- a **place or occasion** people meet it (kage → fødselsdag)
- a **quality** it famously has (sne → hvid, kold)

Avoid: proper nouns, brand names, anything a beginner would not know, and
anything that is really a definition rather than a clue.`

const STRENGTH = `## The strength field \`s\`

\`s\` is how hard the clue pulls the word — the same 1-3 scale the association
matrix uses, with 0 left out because a 0 does not belong in the book.

- **3 — most guessers land on it.** The defining category, a near-synonym, or
  the one thing the word is famous for. (kat → miav, kæledyr; mælk → ko)
- **2 — a strong, natural clue.** Many guessers get there, but the word is one
  of several the clue could mean. (kat → dyr, pels; kaffe → morgen)
- **1 — a real but loose link.** It would work with a second clue or with the
  board narrowing it down, not on its own. (kat → tag, fisk)

Be honest with this. A book where everything is a 3 tells the engine nothing.
A healthy word has a few 3s, a solid middle of 2s, and a tail of 1s.`

function wordsBrief({ batch, batches, model, city, lang, entries, outPath }) {
  const lines = []
  lines.push(`# Association book — ${lang} city ${city}, WORDS batch ${batch} of ${batches}`)
  lines.push('')
  lines.push(VOICE)
  lines.push('')
  lines.push(
    `Your batch is **${entries.length} Danish words**. For each one write **${ASSOC_MIN}-${ASSOC_MAX} associations**.`,
  )
  lines.push('')
  lines.push(
    rules(
      'Both sides are checked: for **hund** "dog", «hundehus», «hundemad», «hunde» and "doghouse" are all dead entries.',
    ),
  )
  lines.push('')
  lines.push(STRENGTH)
  lines.push('')
  lines.push('## Your words')
  lines.push('')
  lines.push(
    'The bracketed English is what prints on the card, and it is forbidden as a clue along with the Danish form.',
  )
  lines.push('')
  for (const w of entries) {
    lines.push(`- \`${w.id}\` **${w.da}** — ${w.en.join(' / ')} (${w.pos})`)
  }
  lines.push('')
  lines.push('## Output')
  lines.push('')
  lines.push(`Write a JSON file to \`${outPath}\` with exactly this shape:`)
  lines.push('')
  lines.push('```json')
  lines.push('{')
  lines.push(`  "model": "${model}", "city": ${city}, "kind": "words", "batch": ${batch},`)
  lines.push('  "words": {')
  lines.push('    "da:hund": [')
  lines.push('      { "da": "kæledyr", "en": "pet", "why": "a household pet", "s": 3 },')
  lines.push('      { "da": "gø", "en": "bark", "why": "the noise it makes", "s": 3 },')
  lines.push('      { "da": "pote", "en": "paw", "why": "the foot it walks on", "s": 2 }')
  lines.push('    ]')
  lines.push('  }')
  lines.push('}')
  lines.push('```')
  lines.push('')
  lines.push(
    `Every one of the ${entries.length} ids above must be a key, each with ${ASSOC_MIN}-${ASSOC_MAX} entries. No \`v\` field — the merge counts the votes.`,
  )
  lines.push('')
  lines.push(
    'Write the file with the Write tool. Do not read any other file in the repo — everything you need is in this brief, and the game key data is off limits to a data-authoring pass.',
  )
  lines.push('')
  lines.push(
    'Then reply with ONE line: the batch number, how many words you wrote, and the smallest and largest association count. Do not print the associations in your reply.',
  )
  lines.push('')
  return lines.join('\n')
}

function pairsBrief({ batch, batches, model, city, lang, pairs, outPath }) {
  const lines = []
  lines.push(`# Association book — ${lang} city ${city}, PAIRS batch ${batch} of ${batches}`)
  lines.push('')
  lines.push(VOICE)
  lines.push('')
  lines.push(`## What a pair clue is

A clue in this game carries a NUMBER: «frugt, 2» means two cards on the board
belong to that clue. So the engine needs, for two words that are related, the
single word that reaches BOTH of them at once — that is the clue that wins two
cards in one turn. Triples are composed from pairs at search time, so pairs are
all you write.

Your batch is **${pairs.length} pairs**. For each, write **2-3 single words that
evoke both halves**. Order them best first.

A pair clue is only worth writing if it genuinely reaches both. «frugt» for
æble/pære is a pair clue. «rød» for æble/blod is a weaker one but still real.
«ting» for anything is not a clue, it is a shrug — do not write it. If a pair
is loose enough that you can only find ONE honest clue, write one. Never pad.`)
  lines.push('')
  lines.push(
    rules(
      'For a pair clue this applies to **both words of the pair**: for hund/kat, «hundekat», «hunde», "doghouse" and "cats" are all dead entries.',
    ),
  )
  lines.push('')
  lines.push(`## The strength field \`s\`

For a pair clue \`s\` is how well it covers the **weaker** half — the 1-3 scale
above applied to whichever of the two the clue reaches less well. A clue that
is a 3 for one word and a 1 for the other is an \`s\` of 1: the guesser will
find the first card and stall on the second, which is exactly what the number
tells you.

- **3** — both halves land for most guessers. (mor/far → forældre)
- **2** — both are reachable, one needs a moment. (kaffe/mælk → morgenmad)
- **1** — the second half is a stretch but real. (træ/blomst → have)`)
  lines.push('')
  lines.push('## Your pairs')
  lines.push('')
  lines.push('`M` is how strongly the judged matrix says the two are associated (1 faint, 2 strong, 3 near-inseparable). A low M is a warning that a good pair clue may be hard to find, not an instruction to try harder.')
  lines.push('')
  for (const p of pairs) {
    lines.push(
      `- \`${p.key}\` **${p.a.da}** (${p.a.en.join('/')}) + **${p.b.da}** (${p.b.en.join('/')}) — M ${p.m}`,
    )
  }
  lines.push('')
  lines.push('## Output')
  lines.push('')
  lines.push(`Write a JSON file to \`${outPath}\` with exactly this shape:`)
  lines.push('')
  lines.push('```json')
  lines.push('{')
  lines.push(`  "model": "${model}", "city": ${city}, "kind": "pairs", "batch": ${batch},`)
  lines.push('  "pairs": {')
  lines.push('    "da:mor|da:far": [')
  lines.push('      { "da": "forældre", "en": "parents", "why": "the two of them together", "s": 3 },')
  lines.push('      { "da": "familie", "en": "family", "why": "who lives in the home", "s": 2 }')
  lines.push('    ]')
  lines.push('  }')
  lines.push('}')
  lines.push('```')
  lines.push('')
  lines.push(
    `All ${pairs.length} keys above must be present, each with 1-3 entries, keyed EXACTLY as printed (both ids, that order). No \`v\` field — the merge counts the votes.`,
  )
  lines.push('')
  lines.push(
    'Write the file with the Write tool. Do not read any other file in the repo — everything you need is in this brief, and the game key data is off limits to a data-authoring pass.',
  )
  lines.push('')
  lines.push(
    'Then reply with ONE line: the batch number, how many pairs you wrote, and how many of them got only one clue. Do not print the clues in your reply.',
  )
  lines.push('')
  return lines.join('\n')
}

function main() {
  const argv = process.argv.slice(2)
  const arg = (name, fallback) => {
    const i = argv.indexOf(`--${name}`)
    return i === -1 ? fallback : argv[i + 1]
  }
  const city = Number(arg('city', '1'))
  const lang = arg('lang', 'da')
  const kind = arg('kind', 'words')
  const outDir = arg('out', 'tmp-book-briefs')
  const bookDir = arg('book', `src/data/generated/book-city${city}`)

  const entries = cityWords(loadWords(lang), city)
  if (entries.length === 0) {
    console.error(`no words with curriculumRank in city ${city} — nothing to brief`)
    process.exit(2)
  }
  mkdirSync(outDir, { recursive: true })

  if (kind === 'words') {
    const size = Number(arg('size', '25'))
    const batches = Math.ceil(entries.length / size)
    for (let b = 0; b < batches; b++) {
      const slice = entries.slice(b * size, (b + 1) * size)
      const n = String(b + 1).padStart(2, '0')
      for (const model of MODELS) {
        writeFileSync(
          `${outDir}/${model}-words-${n}.md`,
          wordsBrief({
            batch: b + 1,
            batches,
            model,
            city,
            lang,
            entries: slice,
            outPath: `${bookDir}/${model}-words-${n}.json`,
          }),
          'utf8',
        )
      }
    }
    console.log(`${entries.length} words, ${batches} batches of ${size} → ${outDir}/`)
    return
  }

  if (kind === 'pairs') {
    const size = Number(arg('size', '213'))
    const { at } = loadMatrix(lang)
    const related = relatedPairs(entries, at).map((p) => ({
      ...p,
      key: pairKey(p.a, p.b),
      m: at(p.i, p.j),
    }))
    if (related.length === 0) {
      console.error(`the matrix scores no city ${city} pair at M >= 1 — nothing to brief`)
      process.exit(2)
    }
    const from = arg('from')
    const to = arg('to')
    if (from !== undefined || to !== undefined) {
      const lo = Number(from ?? 1)
      const hi = Number(to ?? related.length)
      if (!(lo >= 1 && hi <= related.length && lo <= hi)) {
        console.error(`--from/--to must be a range inside 1-${related.length}, got ${lo}-${hi}`)
        process.exit(2)
      }
      const slice = related.slice(lo - 1, hi)
      const tag = arg('tag', `${lo}-${hi}`)
      for (const model of MODELS) {
        writeFileSync(
          `${outDir}/${model}-pairs-${tag}.md`,
          pairsBrief({
            batch: tag,
            batches: `the re-briefed range ${lo}-${hi}`,
            model,
            city,
            lang,
            pairs: slice,
            outPath: `${bookDir}/${model}-pairs-${tag}.json`,
          }),
          'utf8',
        )
      }
      console.log(`pairs ${lo}-${hi} (${slice.length}) → ${outDir}/<model>-pairs-${tag}.md`)
      return
    }
    const batches = Math.ceil(related.length / size)
    for (let b = 0; b < batches; b++) {
      const slice = related.slice(b * size, (b + 1) * size)
      const n = String(b + 1).padStart(2, '0')
      for (const model of MODELS) {
        writeFileSync(
          `${outDir}/${model}-pairs-${n}.md`,
          pairsBrief({
            batch: b + 1,
            batches,
            model,
            city,
            lang,
            pairs: slice,
            outPath: `${bookDir}/${model}-pairs-${n}.json`,
          }),
          'utf8',
        )
      }
    }
    console.log(`${related.length} related pairs, ${batches} batches of ${size} → ${outDir}/`)
    return
  }

  console.error(`--kind must be "words" or "pairs", got "${kind}"`)
  process.exit(2)
}

// Run only when invoked directly. `file://${argv[1]}` does not match on
// Windows (argv[1] is a backslashed drive path), so compare the basename.
if (process.argv[1]?.endsWith('book-brief.mjs')) main()
