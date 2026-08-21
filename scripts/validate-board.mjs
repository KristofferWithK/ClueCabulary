// Cross-checks the two places a card's status is written down.
//
// docs/PLAN-2.md is the board a session reads; docs/dispatch/index.html's
// CARDS array is the page the owner reads. PLAN-2 says, in as many words,
// that a card which lands updates BOTH in the same PR — and on the night of
// 2026-08-21/22, when eight cards landed from parallel sessions, that hand
// edit went wrong four times: two Done entries dropped while resolving a
// rebase, a `PR #PRNUM` placeholder shipped unsubstituted, K2 silently
// reverted from ready to blocked by a conflict resolution that protected
// only `st:'done'` lines, and a Ready line left behind for a card already in
// Done. None of it was caught by anything except a person re-reading the
// file, which is the least reliable check in the repo.
//
// Every one of those is machine-checkable, so this checks them. It reads the
// CARDS array out of the page (the array is plain data at the bottom of the
// file, by design) and the ### headings out of PLAN-2.
import { readFileSync } from 'node:fs'

const PAGE = 'docs/dispatch/index.html'
const PLAN = 'docs/PLAN-2.md'

const errors = []
const warnings = []

// ── the page's CARDS array ────────────────────────────────────────────────
const page = readFileSync(new URL(`../${PAGE}`, import.meta.url), 'utf8')
const start = page.indexOf('var CARDS = [')
const end = page.indexOf('];', start)
if (start === -1 || end === -1) {
  console.error(`${PAGE}: could not find the CARDS array — the page's shape changed`)
  process.exit(2)
}
/** @type {{w:number,id:string,st:string,dep?:string,m?:string,lane?:string}[]} */
const CARDS = new Function(page.slice(start, end + 2) + ';return CARDS;')()
if (!Array.isArray(CARDS) || CARDS.length === 0) {
  console.error(`${PAGE}: CARDS is empty — the check would pass vacuously`)
  process.exit(2)
}

const ids = new Set(CARDS.map((c) => c.id))
const done = new Set(CARDS.filter((c) => c.st === 'done').map((c) => c.id))

// Every card carries the fields the page renders and the plan sorts by.
const STATUSES = new Set(['done', 'active', 'ready', 'blocked', 'held', 'parked'])
const MODELS = new Set(['fable', 'opus', 'sonnet', 'owner'])
for (const c of CARDS) {
  const at = `${PAGE} ${c.id}`
  if (!STATUSES.has(c.st)) errors.push(`${at}: unknown status "${c.st}"`)
  if (c.m && !MODELS.has(c.m)) errors.push(`${at}: unknown model tier "${c.m}"`)
  if (!c.m) warnings.push(`${at}: no model tier`)
  if (c.st === 'blocked' && !c.dep) errors.push(`${at}: blocked with no dep`)
}

const dupes = CARDS.map((c) => c.id).filter((id, i, a) => a.indexOf(id) !== i)
if (dupes.length) errors.push(`${PAGE}: duplicate card ids: ${[...new Set(dupes)].join(', ')}`)

// A dep must name a real card, and a card whose deps have all landed is not
// blocked any more — that is the check K2 needed and did not have.
for (const c of CARDS) {
  if (!c.dep) continue
  const named = c.dep.split(/[·,]/).map((d) => d.trim()).filter((d) => /^[A-Z]+[0-9]$/.test(d))
  for (const d of named) {
    if (!ids.has(d)) errors.push(`${PAGE} ${c.id}: dep "${d}" is not a card`)
  }
  if (c.st === 'blocked' && named.length && named.every((d) => done.has(d))) {
    errors.push(
      `${PAGE} ${c.id}: still blocked on "${c.dep}", but every card it names is done — promote it to ready`,
    )
  }
}

// ── PLAN-2's own lists ────────────────────────────────────────────────────
const plan = readFileSync(new URL(`../${PLAN}`, import.meta.url), 'utf8')
/** The card ids bulleted under a `### <heading>` in PLAN-2's Board section. */
const listed = (heading) => {
  const m = plan.match(new RegExp(`### ${heading}\\r?\\n([\\s\\S]*?)(?=\\r?\\n### )`))
  if (!m) return null
  const out = new Set()
  for (const line of m[1].split(/\r?\n/)) {
    // "- **K2** — ..." and "- **D4 · D5** — ..." both name cards.
    const bullet = line.match(/^- \*\*([^*]+)\*\*/)
    if (!bullet) continue
    for (const id of bullet[1].split('·').map((s) => s.trim())) {
      if (/^[A-Z]+[0-9]$/.test(id)) out.add(id)
    }
  }
  return out
}

const planDone = listed('Done')
const planReady = listed('Ready')
if (planDone === null || planReady === null) {
  console.error(`${PLAN}: could not find the Ready and Done headings`)
  process.exit(2)
}

// The two documents must agree about what has landed. Cards closed outside
// the schedule (wave 8) are the page's business only.
const scheduled = new Set(CARDS.filter((c) => c.w <= 7).map((c) => c.id))
for (const id of done) {
  if (!scheduled.has(id)) continue
  if (!planDone.has(id)) errors.push(`${id} is done on the page but not in ${PLAN}'s Done list`)
}
for (const id of planDone) {
  if (!ids.has(id)) {
    warnings.push(`${PLAN} Done names "${id}", which is not a card on the page`)
  } else if (!done.has(id)) {
    errors.push(`${id} is in ${PLAN}'s Done list but the page still says "${CARDS.find((c) => c.id === id).st}"`)
  }
}
// A card cannot be waiting to start and already finished.
for (const id of planReady) {
  if (planDone.has(id)) errors.push(`${id} is in ${PLAN}'s Ready list AND its Done list`)
  if (done.has(id)) errors.push(`${id} is still in ${PLAN}'s Ready list but the page says done`)
}

// A placeholder that never got substituted. This shipped once.
for (const m of plan.matchAll(/PR #(PRNUM|TBD|\?+|NNN)/gi)) {
  errors.push(`${PLAN}: unsubstituted PR placeholder "${m[0]}"`)
}

// ── report ────────────────────────────────────────────────────────────────
for (const w of warnings) console.warn(`  ! ${w}`)
if (errors.length) {
  console.error(`\n${errors.length} board inconsistencies:`)
  for (const e of errors) console.error(`  ✗ ${e}`)
  process.exit(1)
}
console.log(
  `board: ${CARDS.length} cards, ${done.size} done — ${PLAN} and the dispatch page agree` +
    (warnings.length ? ` (${warnings.length} warning${warnings.length === 1 ? '' : 's'})` : ''),
)
