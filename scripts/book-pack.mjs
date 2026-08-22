// The two things `merge-book.mjs` and `validate-book.mjs` have to agree about:
// what makes a book entry well formed, and whether it is a legal clue for the
// word it is filed under.
//
// LEGALITY is the load-bearing one, and it is not restated here. A book entry
// that `checkClueLegality` rejects is a dead entry — the engine can never give
// it, because the same function runs on every clue at play time — so the
// merge drops those and the validator refuses to ship a file containing one.
// The rule is Danish morphology (stem, gemination, short-word inflection,
// derived forms, irregular pairs) and reimplementing any of it in a `.mjs`
// would pass happily on the day `src/lang/da/morphology.ts` changed. So the
// real module is loaded through Vite, exactly the way `matrix-pack.mjs` loads
// `conflicts()` from the sampler.
//
// Both sides of an entry are checked. Casey clues in Danish or in English
// (`view.clueLanguage`), so `da` and `en` are each a clue that will really be
// spoken, and each is checked against the headword AND its glosses. That also
// picks up the single-word rule for free: `checkClueLegality` rejects anything
// containing whitespace before it looks at meaning.
//
// ORTHOGRAPHY is the cheap one and it needs an allowlist rather than a flat
// ban. "æ, ø, å are never written ae/oe/aa" is the authoring rule, but a few
// real Danish words spell those two letters side by side across a morpheme
// boundary — `koen` is "the cow", not a mangled `køn` — so the ban is on the
// sequence UNLESS the word is on the short list below. The list is short on
// purpose: every addition to it is a hole in the check, so a word goes on it
// only after somebody has confirmed the spelling is genuinely what was meant.

/** Real Danish words that contain ae/oe/aa and are not mis-spelled æ/ø/å. */
export const ASCII_DIGRAPH_ALLOW = new Set([
  'koen', // the cow — ko + the definite ending -en
  'roe', // a beet — both models reached for it as the source of sukker
  'roen', // the beet / the calm — ro + -en
  'toer', // a two (the numeral as a noun)
  'aerobic',
])

const DIGRAPH = /(ae|oe|aa)/

/** Letters a Danish clue may be written with. Lowercase, no punctuation. */
const DA_LETTERS = /^[a-zæøå]+$/
const EN_LETTERS = /^[a-z]+$/

/**
 * Shape and orthography, with no knowledge of the word it belongs to.
 * Returns a list of complaints; empty means well formed.
 */
export function checkEntryShape(e, { whyMin, whyMax }) {
  const bad = []
  if (typeof e !== 'object' || e === null) return ['is not an object']
  for (const k of ['da', 'en', 'why']) {
    if (typeof e[k] !== 'string' || e[k].trim() === '') bad.push(`${k} is missing or empty`)
  }
  if (bad.length > 0) return bad
  if (!DA_LETTERS.test(e.da)) bad.push(`da "${e.da}" is not lowercase Danish letters`)
  if (!EN_LETTERS.test(e.en)) bad.push(`en "${e.en}" is not a single lowercase English word`)
  if (DIGRAPH.test(e.da) && !ASCII_DIGRAPH_ALLOW.has(e.da)) {
    bad.push(`da "${e.da}" spells æ/ø/å as ae/oe/aa`)
  }
  const words = e.why.trim().split(/\s+/)
  if (words.length < whyMin || words.length > whyMax) {
    bad.push(`why "${e.why}" is ${words.length} words, not ${whyMin}-${whyMax}`)
  }
  if (!Number.isInteger(e.s) || e.s < 1 || e.s > 3) bad.push(`s is ${e.s}, not an integer 1-3`)
  return bad
}

/**
 * Open the real `checkClueLegality`, the real `normalize` and the real Danish
 * pack, hand them to `fn` as `{ isLegal, normalize }`, and close the server.
 * `isLegal(clue, words)` answers with the rejection reason, or null.
 */
export async function withLegality(fn) {
  const { createServer } = await import('vite')
  const server = await createServer({
    configFile: false,
    root: process.cwd(),
    // Nothing here renders; the dependency scan would crawl the whole app and
    // complain about the PWA virtual module for no benefit.
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true },
    logLevel: 'silent',
  })
  try {
    const { checkClueLegality } = await server.ssrLoadModule('/src/engine/legality.ts')
    const { normalize } = await server.ssrLoadModule('/src/engine/text.ts')
    const { danish } = await server.ssrLoadModule('/src/lang/da/index.ts')
    if (typeof checkClueLegality !== 'function') {
      throw new Error('src/engine/legality.ts no longer exports checkClueLegality')
    }
    const isLegal = (clue, words) => {
      const verdict = checkClueLegality(clue, words, danish)
      return verdict.legal ? null : verdict.reason
    }
    // A canary: the one thing that would make every call below pass silently
    // is a legality function that says yes to everything.
    if (isLegal('hund', [{ da: 'hund', en: ['dog'], pos: 'noun' }]) === null) {
      throw new Error('checkClueLegality called a board word legal — the loaded module is wrong')
    }
    return await fn({ isLegal, normalize })
  } finally {
    await server.close()
  }
}

/** Both sides of one entry, against every word it must not resemble. */
export function entryLegality(e, words, isLegal) {
  const bad = []
  for (const side of ['da', 'en']) {
    const reason = isLegal(e[side], words)
    if (reason) bad.push(`${side} "${e[side]}": ${reason}`)
  }
  return bad
}
