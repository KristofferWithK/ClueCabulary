// Run the browser drives — the checks that open the real built app in a real
// Chromium and use it the way a thumb does.
//
// It exists because the alternative was a seventeen-name bash loop typed by
// hand every time, which is miserable on a phone and easy to get subtly wrong.
// Two mistakes in particular it makes impossible:
//
//   1. Forgetting `npm run build`. The drives serve `dist/` through
//      `vite preview`, so an unbuilt tree silently tests the PREVIOUS build.
//      That has already produced one confidently-wrong measurement in this
//      repo: a change was reported as not working when the change simply was
//      not in the bundle. `--no-build` is there for when you know better.
//   2. Forgetting CHROMIUM_PATH, which half the drives default differently on.
//
// Usage:
//   node scripts/run-drives.mjs                 every drive
//   node scripts/run-drives.mjs repeat layout   just those
//   node scripts/run-drives.mjs --no-build      trust the current dist/
//   node scripts/run-drives.mjs --list          names only
import { spawn } from 'node:child_process'
import { existsSync, readdirSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Drives NOT run by default, and why — a default that quietly skipped things
 * without saying so would be worse than no default.
 *
 *   live    needs a real API key and spends real tokens
 *   proxy   needs a deployed Cloudflare Worker
 *
 * `proxy` is in the list anyway because it runs against a local stand-in; only
 * `live` is genuinely opt-in. Everything else here is not a drive at all.
 */
const NOT_DRIVES = new Set(['fake-ollama.mjs', 'preview-server.mjs', 'worker-runtime.mjs'])
const OPT_IN = new Set(['live', 'map-preview', 'ollama-probe'])

const allDrives = readdirSync(resolve(ROOT, 'e2e'))
  .filter((f) => f.endsWith('.mjs') && !NOT_DRIVES.has(f) && !f.startsWith('_'))
  .map((f) => f.replace(/-drive\.mjs$|\.mjs$/, ''))
  .sort()

const argv = process.argv.slice(2)
const noBuild = argv.includes('--no-build')
const wanted = argv.filter((a) => !a.startsWith('--'))

if (argv.includes('--list')) {
  console.log(allDrives.map((d) => (OPT_IN.has(d) ? `${d} (opt-in)` : d)).join('\n'))
  process.exit(0)
}

const fileFor = (name) => {
  for (const candidate of [`e2e/${name}-drive.mjs`, `e2e/${name}.mjs`]) {
    if (existsSync(resolve(ROOT, candidate))) return candidate
  }
  return null
}

const selected = wanted.length ? wanted : allDrives.filter((d) => !OPT_IN.has(d))
const missing = selected.filter((d) => !fileFor(d))
if (missing.length) {
  console.error(`No such drive: ${missing.join(', ')}\nTry --list.`)
  process.exit(2)
}

const run = (cmd, args, env = {}, shell = false) =>
  new Promise((done) => {
    const p = spawn(cmd, args, { cwd: ROOT, env: { ...process.env, ...env }, shell })
    let out = ''
    p.stdout.on('data', (d) => (out += d))
    p.stderr.on('data', (d) => (out += d))
    p.on('close', (code) => done({ code, out }))
  })

// The pre-installed browser this image ships. Taken from the environment when
// it is set, so a machine that keeps Chromium elsewhere still works.
const CHROMIUM_PATH =
  process.env.CHROMIUM_PATH ??
  ['/opt/pw-browsers/chromium', '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find((p) =>
    existsSync(p),
  )

if (!CHROMIUM_PATH) {
  console.error(
    'No Chromium found. Set CHROMIUM_PATH, or check PLAYWRIGHT_BROWSERS_PATH — do not run\n' +
      '`playwright install`, this image ships the browsers already.',
  )
  process.exit(2)
}

// Screenshots the drives write, kept out of the repo root where they used to
// pile up. Gitignored either way, but a directory is tidier than fifteen loose
// PNGs and makes them easy to look at afterwards.
const SHOT_DIR = process.env.SHOT_DIR ?? resolve(ROOT, 'e2e-shots')
mkdirSync(SHOT_DIR, { recursive: true })

if (!noBuild) {
  process.stdout.write('building… ')
  // npm is npm.cmd on Windows, which spawn() cannot exec without a shell.
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  const built = await run(npm, ['run', 'build'], {}, process.platform === 'win32')
  if (built.code !== 0) {
    console.log('FAILED\n')
    console.log(built.out.split('\n').slice(-30).join('\n'))
    process.exit(1)
  }
  console.log('ok')
} else {
  console.log('skipping the build — dist/ is whatever it was')
}

const failed = []
const started = Date.now()

for (const name of selected) {
  process.stdout.write(`${name.padEnd(14)} `)
  const at = Date.now()
  const { code, out } = await run('node', [fileFor(name)], { CHROMIUM_PATH, SHOT_DIR })
  const secs = ((Date.now() - at) / 1000).toFixed(0)
  if (code === 0) {
    console.log(`PASS  ${secs}s`)
  } else {
    console.log(`FAIL  ${secs}s`)
    failed.push({ name, out })
  }
}

console.log(`\n${selected.length - failed.length}/${selected.length} in ${((Date.now() - started) / 1000).toFixed(0)}s`)

for (const f of failed) {
  console.log(`\n===== ${f.name} =====`)
  // The tail, not the whole log: a drive that fails prints its own OK/FAIL
  // lines and the checks that matter are at the bottom.
  console.log(f.out.split('\n').slice(-40).join('\n'))
}

process.exit(failed.length ? 1 : 0)
