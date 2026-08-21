// Cross-checks the word audio manifests against src/data/words.<lang>.json:
// every shipped headword must have a manifest row (and a clip on disk) in
// BOTH the ordinary and the slow source, and no manifest row may name a
// headword the dataset no longer has.
//
// This is the check WS2 added after 113 headwords left the dataset and 113
// arrived (docs/word-selection.md → docs/PLAN-2.md WS1/WS2) while the
// manifests kept the old rows and had none for the new ones — silent, because
// nothing else reads the manifest against the dataset. `--lang da` is the
// default; pass `--lang de` once a second dataset exists.
import { existsSync, readFileSync } from 'node:fs'
import { slugForId } from './audio-slug.mjs'

const argLang = process.argv.indexOf('--lang')
const LANG = argLang === -1 ? 'da' : (process.argv[argLang + 1] ?? 'da')
if (!/^[a-z]{2}$/.test(LANG)) {
  console.error(`--lang must be a two-letter code, got "${LANG}"`)
  process.exit(2)
}

const WORDS_PATH = new URL(`../src/data/words.${LANG}.json`, import.meta.url)
const words = JSON.parse(readFileSync(WORDS_PATH, 'utf8'))
const headwordIds = new Set(words.map((w) => w.id))
if (headwordIds.size === 0) {
  console.error(`read no headwords out of src/data/words.${LANG}.json — the check would pass vacuously`)
  process.exit(2)
}

/**
 * One entry per audio source: the manifest that stamps it, and the directory
 * its clips live in (see CLAUDE.md trap 6 — a slug is a filename, not the
 * word id, and `audio-slug.mjs` is the single source for how one becomes the
 * other).
 */
const SOURCES = [
  { label: 'words', dir: `public/audio/${LANG}` },
  { label: 'words-slow', dir: `public/audio/${LANG}/slow` },
]

const errors = []

for (const { label, dir } of SOURCES) {
  const manifestPath = new URL(`../${dir}/manifest.json`, import.meta.url)
  let manifest
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  } catch {
    errors.push(`${label}: no manifest at ${dir}/manifest.json`)
    continue
  }
  const entries = manifest.entries ?? {}
  const rowIds = new Set()
  for (const [slug, entry] of Object.entries(entries)) {
    rowIds.add(entry.id)
    if (!headwordIds.has(entry.id)) {
      errors.push(`${label}: manifest row "${slug}" names ${entry.id}, which is not in the dataset (orphaned)`)
      continue
    }
    const clipPath = new URL(`../${dir}/${slug}.mp3`, import.meta.url)
    if (!existsSync(clipPath)) {
      errors.push(`${label}: manifest row "${slug}" (${entry.id}) has no clip at ${dir}/${slug}.mp3`)
    }
  }
  for (const id of headwordIds) {
    if (!rowIds.has(id)) {
      const slug = slugForId(id) ?? '?'
      errors.push(`${label}: ${id} (slug "${slug}") has no manifest row — not baked`)
    }
  }
}

if (errors.length) {
  console.error(`${errors.length} audio/dataset mismatches for --lang ${LANG}:`)
  for (const e of errors.slice(0, 60)) console.error(`  ✗ ${e}`)
  if (errors.length > 60) console.error(`  … and ${errors.length - 60} more`)
  process.exit(1)
}

console.log(
  `${headwordIds.size} headwords, ${SOURCES.length} sources checked for --lang ${LANG}` +
    ` — every headword has a clip and manifest row in each, no orphans.`,
)
