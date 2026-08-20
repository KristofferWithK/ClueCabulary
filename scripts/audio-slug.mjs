/**
 * The filename a word's baked clip lives under. The rule's real home is
 * `audioSlug` in `src/ui/speak.ts` — this is the copy the build script needs,
 * because a .mjs run by node cannot import TypeScript.
 *
 * The two are compared over the whole dataset by `src/ui/speak.test.ts`, which
 * imports this file rather than restating it. That matters more than it looks:
 * the app asks for the name the TS version produces and the script writes the
 * name this one produces, so a drift between them is not a wrong filename, it
 * is 900 words that silently stop playing.
 *
 * Why fold at all, when the ids are right there: a word id is `da:købe`, and a
 * colon cannot appear in a Windows filename, while `ø` in a URL has to be
 * percent-encoded in whatever normalisation the filesystem chose — macOS
 * stores NFD, the browser asks in NFC, and that mismatch is a 404 that appears
 * only after the iOS build copies the files. `koebe.mp3` has neither problem.
 */
export function audioSlug(headword) {
  return headword
    .normalize('NFC')
    .toLowerCase()
    // Before the decomposition below, which would otherwise split å into a plus
    // a ring and strip the ring — merging være/vare, bare/bære, tænke/tanke,
    // svær/svar, blød/blod and påstå/pasta, all six of which are in the 900.
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'oe')
    .replace(/å/g, 'aa')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** `da:købe` → `koebe`. Ids that are not `xx:word` return undefined. */
export function slugForId(wordId) {
  const parts = /^([a-z]{2}):(.+)$/.exec(wordId)
  if (!parts) return undefined
  return audioSlug(parts[2]) || undefined
}
