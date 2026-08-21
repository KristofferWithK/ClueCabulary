/**
 * Check the grammar crash course against the shipped dataset.
 *
 * `docs/grammar-da.md` teaches rules with examples, and an example that
 * contradicts the data is worse than no example: the same word would carry one
 * gender on a card and another in the lesson. So every claim this file can
 * check mechanically, it checks.
 *
 * What it verifies:
 *   1. ARTICLE CLAIMS. Every "en x" / "et x" written in the doc matches the
 *      article the dataset gives that word. This is the one that would bite.
 *   2. VOCABULARY GATE. A chapter is told leaving city N, so it may only use
 *      words from cities 0..N. A chapter reaching forward teaches a rule with
 *      a word the player does not have yet.
 *   3. WORDS EXIST. Every headword named in an example is one of the 900.
 *
 * What it deliberately does NOT check: whether the Danish is natural, whether
 * an irregular form is right, or whether the rule itself is true. Those need a
 * Danish speaker — see the doc's own note.
 *
 *   node scripts/validate-grammar.mjs
 */
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const doc = readFileSync(resolve(ROOT, 'docs/grammar-da.md'), 'utf8')
const words = JSON.parse(readFileSync(resolve(ROOT, 'src/data/words.da.json'), 'utf8'))

const WORDS_PER_CITY = 100
const byDa = new Map()
for (const w of words) byDa.set(w.da.toLowerCase(), w)
const cityOf = (w) => Math.floor((w.curriculumRank - 1) / WORDS_PER_CITY)

/**
 * The dataset stores citation forms; a grammar course exists to show INFLECTED
 * ones. So a lookup tries the word as written and then peels the endings this
 * course teaches — the neuter -t and plural -e of an adjective, the glued
 * definite, the plural and the definite plural of a noun.
 *
 * Deliberately generous: this check exists to catch a word the player has not
 * met yet, not to grade morphology. A false accept costs nothing; a false
 * reject would train the next reader to ignore the validator.
 */
const SUFFIXES = ['', 't', 'e', 'n', 'r', 'en', 'et', 'er', 'ne', 'ene', 'erne', 'ere']
function lookup(da) {
  if (byDa.has(da)) return byDa.get(da)
  for (const suf of SUFFIXES) {
    if (!suf || !da.endsWith(suf)) continue
    const stem = da.slice(0, da.length - suf.length)
    if (stem.length < 2) continue
    // hus -> huset, but also pige -> pigen, where the -e belongs to the stem.
    for (const cand of [stem, `${stem}e`]) {
      if (byDa.has(cand)) return byDa.get(cand)
    }
  }
  return undefined
}

/** Split the doc into chapters, keeping the leg number each one is told on. */
const chapters = []
for (const m of doc.matchAll(/^## (\d+) · Leaving ([^\s—]+)[^\n]*\n([\s\S]*?)(?=^## |\Z)/gm)) {
  chapters.push({ n: Number(m[1]), city: m[2], body: m[3] })
}
if (chapters.length !== 9) {
  console.error(`Expected 9 chapters, found ${chapters.length}.`)
  process.exit(2)
}

/**
 * The city a chapter is told leaving, by its position: chapter 1 leaves the
 * first city. Derived rather than parsed from the name, so a renamed stop on
 * the route does not silently break the gate.
 */
const legOf = (ch) => ch.n - 1

const problems = []
const stats = { articles: 0, words: 0 }

/** Strip the doc's own markup so a word is a word, not `**bil**`. */
const plain = (s) => s.replace(/\*\*/g, '').replace(/`/g, '')

for (const ch of chapters) {
  const leg = legOf(ch)
  const body = plain(ch.body)

  // ---- 1. article claims -------------------------------------------------
  // "en hund", "et hus" — only where the next token is a bare lowercase word,
  // so prose like "en gang" inside a sentence is checked too, which is right.
  for (const m of body.matchAll(/\b(en|et) ([a-zæøå]+)\b/g)) {
    const [, art, da] = m
    const entry = byDa.get(da)
    if (!entry) continue // not a citation form; covered by check 3 below
    if (!entry.article) continue // uncountable: the doc may still name it
    stats.articles++
    if (entry.article !== art) {
      problems.push(
        `ch.${ch.n}: writes "${art} ${da}" but the dataset says "${entry.article} ${da}"`,
      )
    }
  }

  // ---- 2 + 3. vocabulary gate -------------------------------------------
  // Only the words the doc presents AS examples: the lines that show a form,
  // not the running prose (which legitimately names later words when it
  // explains what is coming).
  const exampleLines = body
    .split('\n')
    .filter((l) => /^[|>-]/.test(l.trim()) || l.includes('→'))
    .join(' ')
  for (const m of plain(exampleLines).matchAll(/\b(en|et) ([a-zæøå]+)\b/g)) {
    const da = m[2]
    const entry = lookup(da)
    if (!entry) {
      problems.push(`ch.${ch.n}: example uses "${da}", which is not one of the 900 (nor a form of one)`)
      continue
    }
    stats.words++
    const c = cityOf(entry)
    if (c > leg) {
      problems.push(
        `ch.${ch.n} (told leaving city ${leg}) uses "${da}", which the player does not meet until city ${c}`,
      )
    }
  }
}

console.log(
  `grammar-da.md · ${chapters.length} chapters · ${stats.articles} article claims checked · ${stats.words} example words gated`,
)
if (problems.length === 0) {
  console.log('OK — every article claim matches the dataset, and no chapter reaches forward.')
  process.exit(0)
}
console.error(`\n${problems.length} problem${problems.length === 1 ? '' : 's'}:`)
for (const p of problems) console.error(`  ${p}`)
process.exit(1)
