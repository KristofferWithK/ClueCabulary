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
/**
 * The ASCII spelling of each language's own letters, applied BEFORE the
 * decomposition below.
 *
 * German has the same hazard as Danish and more of it: without ä→ae, Mädchen
 * and Madchen are one file, and ß survives the ASCII filter as a hyphen.
 * Whatever is added here must match `orthography.fold` in that language's pack
 * — `speak.test.ts` compares the two over the whole dataset, and a drift
 * between them is not a wrong filename, it is 900 words that silently stop
 * playing.
 */
export const FOLDS = {
  da: [[/æ/g, 'ae'], [/ø/g, 'oe'], [/å/g, 'aa']],
  de: [[/ä/g, 'ae'], [/ö/g, 'oe'], [/ü/g, 'ue'], [/ß/g, 'ss']],
}

export function audioSlug(headword, lang = 'da') {
  let folded = headword.normalize('NFC').toLowerCase()
  for (const [from, to] of FOLDS[lang] ?? []) folded = folded.replace(from, to)
  // The fold above has to happen before this decomposition, which would
  // otherwise split å into a plus a ring and strip the ring — merging
  // får/far, tåge/tage, tænke/tanke, svær/svar, båd/bad, blød/blod and
  // påstå/pasta, all seven of which are in the Danish 900. (It used to be six:
  // være/vare and bare/bære left with the word selection and får/far, tåge/tage
  // and båd/bad arrived with it. speak.test.ts carries the current list.)
  return (
    folded
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      // Must match src/ui/speak.ts's audioSlug exactly, or this writes files
      // the app never asks for. See the note there: NUL and friends are device
      // names on Windows, extension and all, and \u00abnul\u00bb is the Danish for zero \u2014
      // so this bake opened the null device, poured a clip into it and reported
      // success.
      .replace(RESERVED_ON_WINDOWS, '$&_')
  )
}

/** CON, PRN, AUX, NUL and the numbered COM/LPT ports, whole names only. */
const RESERVED_ON_WINDOWS = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i

/** `da:købe` → `koebe`. Ids that are not `xx:word` return undefined. */
export function slugForId(wordId) {
  const parts = /^([a-z]{2}):(.+)$/.exec(wordId)
  if (!parts) return undefined
  return audioSlug(parts[2], parts[1]) || undefined
}
