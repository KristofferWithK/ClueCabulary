// Verifies the installed-PWA promise: after one online visit, the app must
// load with the network gone (service worker serves the precached shell,
// including the full dictionary — only AI calls need connectivity).
//
// Since F1 it also covers the baked word audio, which is the one asset class
// deliberately NOT precached: 900 clips at ~9MB would make the install
// download the whole dictionary's audio before the app would open offline. It
// is runtime-cached instead, and "runtime-cached" is a claim about a workbox
// config that nothing else in the repo would notice going wrong — the app
// falls back to the device voice on any failure, so a broken cache and a
// working one look identical from the outside.
//
// The clips are written into dist/ here rather than committed: public/audio/ is
// gitignored and `scripts/make-audio.mjs` needs a key this repo does not carry.
// A hand-built silent MP3 is enough — what is under test is the fetch, the
// cache and the fallback, not the voice.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { audioSlug } from '../scripts/audio-slug.mjs'
import { silentMp3 } from '../scripts/silent-mp3.mjs'
import { startPreview } from './preview-server.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const AUDIO_ROOT = resolve(ROOT, 'dist', 'audio')
const AUDIO_DIR = resolve(AUDIO_ROOT, 'da')

/**
 * Start from no audio at all, whatever the machine happens to have.
 *
 * `vite build` copies public/ into dist/, so a developer who has run
 * `make-audio.mjs` arrives here with all 900 clips already in place and the
 * "no baked file" half of this drive silently tests nothing — it looked like a
 * caching bug for three runs before it turned out to be exactly that. dist/ is
 * a build artefact and `npm run drives` rebuilds before every run, so clearing
 * it costs a developer nothing but determinism gained.
 */
rmSync(AUDIO_ROOT, { recursive: true, force: true })

/** Put one clip where the built app will look for it. */
function bake(danish) {
  mkdirSync(AUDIO_DIR, { recursive: true })
  writeFileSync(resolve(AUDIO_DIR, `${audioSlug(danish)}.mp3`), silentMp3(300))
  return `audio/da/${audioSlug(danish)}.mp3`
}

const PORT = 4175
const preview = await startPreview(PORT)
import { setTimeout as sleep } from 'node:timers/promises'

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium',
})
const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
const page = await context.newPage()
page.on('pageerror', (e) => console.log('PAGE CRASH:', e.message))

// playWord is called from onClick handlers that cannot await it, so a rejection
// would surface as an unhandled promise and nowhere else. Recording them is how
// "resolves without throwing" gets asserted — audible sound cannot be.
await page.addInitScript(() => {
  window.__rejections = []
  window.addEventListener('unhandledrejection', (e) => {
    window.__rejections.push(String(e.reason))
  })
})

const audioRequests = []
page.on('response', (r) => {
  if (r.url().includes('/audio/')) audioRequests.push({ url: r.url(), status: r.status() })
})

/** What the browser has actually stored under /audio/, cache by cache. */
const cachedAudio = () =>
  page.evaluate(async () => {
    const out = {}
    for (const name of await caches.keys()) {
      const c = await caches.open(name)
      out[name] = []
      for (const req of await c.keys()) {
        if (!req.url.includes('/audio/')) continue
        const res = await c.match(req)
        out[name].push(`${req.url.split('/audio/')[1]} ${res?.status} ${res?.headers.get('content-type')}`)
      }
    }
    return out
  })
const countAudio = (dump) => Object.values(dump).reduce((n, list) => n + list.length, 0)

const openSuitcase = async () => {
  await page.click('.cluey-button')
  await page.waitForSelector('.suitcase-screen')
}
const tapTile = async (nth) => {
  await page.locator('.case-tile.case-collected').nth(nth).click()
  await page.waitForSelector('.sheet')
  await page.keyboard.press('Escape')
  await page.waitForSelector('.sheet', { state: 'detached' })
}

const fail = (msg) => {
  throw new Error(msg)
}

try {
  // The generated worker itself, before a browser is involved. The runtime
  // route is what everything below depends on, and reading it here says
  // "misconfigured" rather than "nothing got cached, cause unknown".
  //
  // The precache half of this can only bite on a machine that has actually run
  // the bake: with no clips in public/ there are no .mp3 files in dist/ for the
  // precache manifest to have picked up, so it is a guard for later rather than
  // a measurement now. Say so rather than let it read as proof.
  const sw = readFileSync(resolve(ROOT, 'dist', 'sw.js'), 'utf8')
  const at = sw.indexOf('word-audio-v1')
  if (at < 0) fail('the worker has no runtime cache for /audio/')
  // The route must refuse a response that is not audio. Asserted on the route's
  // own text because the browser cannot show it: speak.ts ALSO deletes a
  // mis-cached entry, and that clean-up hides a missing guard here from every
  // black-box check — it was written because the guard lost this exact race
  // once, so "the cache came out clean" is not evidence the guard exists.
  // Looked for in the route's own options rather than the whole file: the
  // route's URL pattern mentions /audio/ too, and it sits BEFORE the cache name
  // in the generated source, so slicing forward from the name skips it and the
  // only `audio/` left to find is the type the guard insists on. A minifier
  // rewrites names, not string literals.
  if (!sw.slice(at, at + 600).includes('audio/')) {
    fail('the /audio/ route caches whatever it is given, without checking the type')
  }
  const precacheManifest = sw.slice(0, sw.indexOf('cleanupOutdatedCaches'))
  if (precacheManifest.includes('.mp3')) fail('an mp3 reached the precache manifest')
  console.log('worker: /audio/ runtime-cached, type-checked, absent from the precache manifest')

  // First visit online: let the service worker install and precache.
  await page.goto(preview.base + '?mock=1&howto=0&collected=5')
  await page.waitForSelector('h1:has-text("900words")')
  await page.waitForFunction(
    async () => {
      const reg = await navigator.serviceWorker.getRegistration()
      return reg?.active?.state === 'activated'
    },
    undefined,
    { timeout: 20000 },
  )
  // Give workbox a beat to finish precaching after activation.
  await sleep(1500)
  console.log('service worker activated; going offline')

  /* ---------------- the audio, still online ---------------- */

  await openSuitcase()
  const tiles = await page.locator('.case-tile.case-collected').allTextContents()
  if (tiles.length < 2) fail(`need two collected words to test with, saw ${tiles.length}`)
  const [noClip, withClip] = tiles.map((t) => t.trim())

  // 1. The state this repo is actually in: no baked file anywhere. Tapping a
  //    word must fall back to the device voice and must not throw.
  //    Note the response is a 200, not a 404: this host answers an unknown path
  //    with index.html, which is why speak.ts checks the content type rather
  //    than the status. Getting that wrong files HTML under the clip's URL and
  //    CacheFirst keeps it for a year — this assertion is that check.
  await tapTile(0)
  await sleep(600)
  const missSeen = audioRequests.map((r) => `${r.status}`).join(',')
  console.log(`no baked clip for «${noClip}» — the host answered: ${missSeen || 'nothing'}`)
  let rejections = await page.evaluate(() => window.__rejections)
  if (rejections.length) fail(`tapping a word with no clip rejected: ${rejections.join('; ')}`)
  const afterMiss = await cachedAudio()
  if (countAudio(afterMiss)) fail(`a missing clip was left in a cache: ${JSON.stringify(afterMiss)}`)

  // 2. Now give one word a clip and tap it. It has to be fetched and stored.
  const relative = bake(withClip)
  audioRequests.length = 0
  await tapTile(1)
  await sleep(600)
  if (!audioRequests.some((r) => r.status === 200)) {
    fail(`tapping «${withClip}» never fetched ${relative} (saw ${JSON.stringify(audioRequests)})`)
  }
  const afterHit = await cachedAudio()
  if ((afterHit['word-audio-v1'] ?? []).length !== 1) {
    fail(`expected 1 clip in word-audio-v1, got ${JSON.stringify(afterHit)}`)
  }
  const precached = Object.entries(afterHit)
    .filter(([name]) => name.includes('precache'))
    .reduce((n, [, list]) => n + list.length, 0)
  if (precached > 0) fail(`audio was precached after all: ${JSON.stringify(afterHit)}`)
  console.log(`«${withClip}» fetched and runtime-cached; ${precached} audio files precached`)

  /* ---------------- and now with the network gone ---------------- */

  await context.setOffline(true)
  await page.reload()
  await page.waitForSelector('h1:has-text("900words")', { timeout: 15000 })

  // The dictionary must work offline too (bundled data).
  await openSuitcase()
  await page.locator('.case-tile.case-collected').first().click()
  await page.waitForSelector('.sheet')
  const word = await page.locator('.sheet h2').textContent()
  console.log('offline dictionary lookup:', word?.trim())
  await page.keyboard.press('Escape')
  await page.waitForSelector('.sheet', { state: 'detached' })

  // 3. The cached word plays with no network at all. Nothing here can hear it,
  //    so what is asserted is that the tap resolves, the bytes are still in the
  //    cache, and the app got them without asking the network.
  audioRequests.length = 0
  await page.evaluate(() => (window.__rejections = []))
  await tapTile(1)
  await sleep(600)
  rejections = await page.evaluate(() => window.__rejections)
  if (rejections.length) fail(`playing a cached word offline rejected: ${rejections.join('; ')}`)
  const offlineCache = await cachedAudio()
  if ((offlineCache['word-audio-v1'] ?? []).length !== 1) {
    fail(`the clip did not survive going offline: ${JSON.stringify(offlineCache)}`)
  }
  const reachedNetwork = audioRequests.filter((r) => r.status === 0 || r.status >= 400)
  console.log(
    `offline replay of «${withClip}»: no rejection, still cached, ` +
      `${reachedNetwork.length} failed network attempts`,
  )

  console.log('OFFLINE DRIVE OK')
} catch (e) {
  console.log('OFFLINE DRIVE FAILED:', e.message)
  process.exitCode = 1
} finally {
  await browser.close()
  preview.stop()
  // The next drive in the run serves the same dist/, and a stray clip is a
  // difference between drives that nobody asked for.
  rmSync(AUDIO_ROOT, { recursive: true, force: true })
}
