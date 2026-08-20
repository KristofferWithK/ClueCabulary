/**
 * Bake every word of a language to an MP3 with a neural voice.
 *
 * The app plays `public/audio/<lang>/<slug>.mp3` when it is there and falls
 * back to the phone's own TTS when it is not (`src/ui/speak.ts`). The fallback
 * is free and offline but sounds like whatever da-DK voice the handset happens
 * to carry, and a great many iPhones carry none, so the words are pre-rendered
 * once with a voice chosen on purpose.
 *
 * ─────────────────────────────────────────────────────────────────────────
 *  WHAT TO DO IN THE MORNING (Google, the default — about ten minutes)
 * ─────────────────────────────────────────────────────────────────────────
 *  1. Open the Google Cloud console and pick a project, or make one.
 *  2. Turn billing on for it. The whole bake lands inside the free monthly
 *     allowance, but Google will not serve the API at all without billing
 *     enabled on the project.
 *  3. Enable "Cloud Text-to-Speech API" (search "text-to-speech" in the
 *     console's search bar, open it, press Enable).
 *  4. APIs & Services → Credentials → Create credentials → API key. Restrict
 *     the key to the Text-to-Speech API while you are on that screen.
 *  5. Put the key in your shell and run the bake:
 *
 *         export TTS_API_KEY=<the key>
 *         node scripts/make-audio.mjs
 *
 *     (PowerShell: `$env:TTS_API_KEY = '<the key>'`)
 *  6. Listen to a few — `public/audio/da/hus.mp3`, `koebe.mp3`, `roed.mp3`
 *     have the sounds worth checking. If the voice is wrong for you, pass
 *     `--voice da-DK-Wavenet-F` (or `-G`, the male one) and run it again; the
 *     manifest notices the voice changed and re-bakes rather than skipping.
 *  7. `npm run build && npx cap sync` puts them in the iOS app. Nothing else
 *     to wire up — the files are not committed and not precached, see below.
 *
 *  COST AND TIME, for the 900-word Danish set (4,809 characters of headwords):
 *    Google Neural2   $16/1M chars, first 1M free each month  →  $0.00, ~2 min
 *    Google WaveNet    $4/1M chars, first 4M free each month  →  $0.00, ~2 min
 *    Azure  Neural    $15/1M chars, F0 free tier 0.5M/month   →  $0.00–0.07,
 *                     but F0 allows only 20 requests a minute →  ~45 min
 *    ElevenLabs       ~$0.10 per 1,000 characters             →  ~$0.50, ~5 min
 *  Prices were read off the vendors' pages on 2026-08-20 and are not pinned by
 *  anything; re-check before assuming. At this volume the choice is about the
 *  voice, not the bill — 4,809 characters is a rounding error on every plan.
 *
 * ─────────────────────────────────────────────────────────────────────────
 *  Why Google Neural2 is the default
 * ─────────────────────────────────────────────────────────────────────────
 *  `da-DK-Neural2-F` is a Danish-locale model rather than a multilingual voice
 *  rendering Danish, which matters more here than anywhere else: these are
 *  isolated words with no sentence around them to disambiguate stød or vowel
 *  length, and a multilingual voice guessing at «hår» versus «har» teaches the
 *  guess. Azure's two da-DK neurals are locale-native too and are the first
 *  thing to try if the Google voice grates; ElevenLabs is in here because it is
 *  the easiest key in the world to get, but its Danish is not documented as a
 *  strength and it is the one to reach for last.
 *
 *  NOT LISTENED TO. This script has never been run against a real provider —
 *  the session that wrote it had no key and was not allowed to get one. It has
 *  been run end to end against `audio-stub-server.mjs`, which speaks all three
 *  providers' wire formats, so the request building, the retries, the resume
 *  and the file writing are exercised; the voice is the one thing nobody has
 *  checked. Step 6 above is that check.
 *
 * ─────────────────────────────────────────────────────────────────────────
 *  Usage
 * ─────────────────────────────────────────────────────────────────────────
 *   node scripts/make-audio.mjs                    bake what is missing
 *   node scripts/make-audio.mjs --dry-run          say what it would do, spend nothing
 *   node scripts/make-audio.mjs --provider azure --region northeurope
 *   node scripts/make-audio.mjs --voice da-DK-Wavenet-G
 *   node scripts/make-audio.mjs --only hus,koebe   just those, for a voice audition
 *   node scripts/make-audio.mjs --force            re-bake everything
 *   node scripts/make-audio.mjs --lang de          when H2 brings German
 *   node scripts/make-audio.mjs --provider stub    silent placeholders, no network
 *
 *  Resumable, and that is the point: every finished file is recorded in
 *  `<out>/manifest.json` with the provider, voice and text that made it, and a
 *  second run re-requests only what is missing or was made differently. An
 *  interrupted bake costs nothing to restart, and changing the voice re-bakes
 *  exactly the files whose voice changed.
 */
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { slugForId } from './audio-slug.mjs'
import { silentMp3 } from './silent-mp3.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/* ------------------------------------------------------------------ *
 * Providers
 * ------------------------------------------------------------------ */

/**
 * One adapter per service. Each turns a word into a request and a response into
 * MP3 bytes, and nothing else in this file knows which one is in use.
 *
 *   keyEnv     the environment variable holding the credential
 *   voices     the ones worth trying, first is the default
 *   host       overridable with --endpoint, which is how the stub server is
 *              driven: the real adapters are pointed at localhost and must
 *              still build a correct request
 *   perMillion price in USD per million characters, for the estimate only
 */
const PROVIDERS = {
  /**
   * https://texttospeech.googleapis.com/v1/text:synthesize
   * JSON in, JSON out, audio base64 in `audioContent`.
   * The key goes in a header rather than `?key=`, which Google asks for
   * specifically so it does not end up in logs and URL scans.
   */
  google: {
    keyEnv: 'TTS_API_KEY',
    host: 'https://texttospeech.googleapis.com',
    voices: {
      da: ['da-DK-Neural2-F', 'da-DK-Wavenet-F', 'da-DK-Wavenet-G', 'da-DK-Standard-F'],
      de: ['de-DE-Neural2-F'],
    },
    perMillion: 16,
    rps: 8, // documented 1000/min for these tiers; a comfortable eighth of it
    request(text, cfg) {
      return {
        url: `${cfg.host}/v1/text:synthesize`,
        init: {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'X-goog-api-key': cfg.key,
          },
          body: JSON.stringify({
            input: { text },
            voice: { languageCode: cfg.locale, name: cfg.voice },
            // Google's MP3 is 32 kbps unless a rate is asked for. These are
            // single words a learner is trying to hear precisely.
            audioConfig: { audioEncoding: 'MP3', sampleRateHertz: 24000, speakingRate: 0.9 },
          }),
        },
      }
    },
    async decode(res) {
      const body = await res.json()
      if (!body.audioContent) throw new Error('no audioContent in the response')
      return Buffer.from(body.audioContent, 'base64')
    },
  },

  /**
   * https://<region>.tts.speech.microsoft.com/cognitiveservices/v1
   * SSML in, raw MP3 bytes out.
   * Note the F0 free tier allows 20 requests a MINUTE, so --rps is forced down
   * unless the caller says otherwise; on S0 it is 30 a second.
   */
  azure: {
    keyEnv: 'AZURE_SPEECH_KEY',
    host: null, // built from --region
    voices: {
      da: ['da-DK-ChristelNeural', 'da-DK-JeppeNeural'],
      de: ['de-DE-KatjaNeural'],
    },
    perMillion: 15,
    rps: 0.3, // the F0 tier's 20/minute. Pass --rps 10 on a paid S0 resource.
    request(text, cfg) {
      const host = cfg.host ?? `https://${cfg.region}.tts.speech.microsoft.com`
      // Escaped because a headword is interpolated into markup. None of the
      // 900 contain a bracket today; a future one should not be a broken file.
      const safe = String(text).replace(/[<>&'"]/g, (c) => `&#${c.charCodeAt(0)};`)
      return {
        url: `${host}/cognitiveservices/v1`,
        init: {
          method: 'POST',
          headers: {
            'Ocp-Apim-Subscription-Key': cfg.key,
            'Content-Type': 'application/ssml+xml',
            'X-Microsoft-OutputFormat': 'audio-24khz-96kbitrate-mono-mp3',
            'User-Agent': '900words-make-audio',
          },
          body:
            `<speak version='1.0' xml:lang='${cfg.locale}'>` +
            `<voice xml:lang='${cfg.locale}' name='${cfg.voice}'>` +
            `<prosody rate='-10%'>${safe}</prosody>` +
            `</voice></speak>`,
        },
      }
    },
    async decode(res) {
      return Buffer.from(await res.arrayBuffer())
    },
  },

  /**
   * https://api.elevenlabs.io/v1/text-to-speech/<voiceId>
   * JSON in, raw MP3 bytes out. The "voice" here is a voice id from the
   * account's own library, not a locale name — so --voice is required, and
   * whichever id is passed had better be one that speaks Danish.
   */
  elevenlabs: {
    keyEnv: 'ELEVENLABS_API_KEY',
    host: 'https://api.elevenlabs.io',
    voices: { da: [], de: [] },
    perMillion: 100,
    rps: 3,
    request(text, cfg) {
      return {
        url: `${cfg.host}/v1/text-to-speech/${encodeURIComponent(cfg.voice)}?output_format=mp3_44100_128`,
        init: {
          method: 'POST',
          headers: { 'xi-api-key': cfg.key, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text,
            model_id: 'eleven_multilingual_v2',
            language_code: cfg.lang,
            voice_settings: { stability: 0.5, similarity_boost: 0.75, speed: 0.9 },
          }),
        },
      }
    },
    async decode(res) {
      return Buffer.from(await res.arrayBuffer())
    },
  },

  /**
   * No network, no key, no bill: writes silence of the right shape. It is what
   * proves the pipeline end to end when there is no key in the room, and what
   * gives the drives something real to cache. Never ship its output.
   */
  stub: {
    keyEnv: null,
    host: null,
    voices: { da: ['silence'], de: ['silence'] },
    perMillion: 0,
    rps: Infinity,
    request: () => null,
    decode: null,
    offline: (text) => silentMp3(220 + text.length * 40),
  },
}

/* ------------------------------------------------------------------ *
 * Arguments
 * ------------------------------------------------------------------ */

const argv = process.argv.slice(2)
const flag = (name, fallback = undefined) => {
  const at = argv.indexOf(`--${name}`)
  return at >= 0 && argv[at + 1] && !argv[at + 1].startsWith('--') ? argv[at + 1] : fallback
}
const has = (name) => argv.includes(`--${name}`)

if (has('help')) {
  console.log(readFileSync(new URL(import.meta.url), 'utf8').split('*/')[0].replace(/^\/\*\*?/, ''))
  process.exit(0)
}

const lang = flag('lang', 'da')
const providerName = flag('provider', 'google')
const provider = PROVIDERS[providerName]
if (!provider) {
  console.error(`Unknown provider "${providerName}". One of: ${Object.keys(PROVIDERS).join(', ')}`)
  process.exit(2)
}

const dryRun = has('dry-run')
const force = has('force')
const outDir = resolve(ROOT, flag('out', `public/audio/${lang}`))
const only = flag('only') ? new Set(flag('only').split(',').map((s) => s.trim())) : null
const limit = Number(flag('limit', Infinity))
const region = flag('region', 'northeurope')
const rps = Number(flag('rps', provider.rps))
const retries = Number(flag('retries', 4))

const voice = flag('voice', provider.voices[lang]?.[0])
if (!voice) {
  console.error(
    `No default voice for --lang ${lang} on ${providerName}. Pass --voice.` +
      (providerName === 'elevenlabs' ? ' ElevenLabs voices are account-specific ids.' : ''),
  )
  process.exit(2)
}

const key = provider.keyEnv ? (process.env[provider.keyEnv] ?? '').trim() : ''
if (provider.keyEnv && !key && !dryRun) {
  console.error(
    `No key. ${providerName} reads $${provider.keyEnv}:\n\n` +
      `    export ${provider.keyEnv}=<the key>\n\n` +
      `Or try it without spending anything:\n\n` +
      `    node scripts/make-audio.mjs --dry-run\n` +
      `    node scripts/make-audio.mjs --provider stub\n`,
  )
  process.exit(2)
}

const LOCALES = { da: 'da-DK', de: 'de-DE' }
if (!LOCALES[lang]) {
  console.error()
  process.exit(2)
}

const cfg = {
  key,
  voice,
  lang,
  // The BCP-47 tag each provider wants, and it is NOT derivable from the code:
  // da is da-DK, not da-DA. Uppercasing the code happens to be right for German
  // and wrong for most others, so the pairs are stated rather than computed.
  // Must match `speech.tag` in the language's pack.
  locale: flag('locale', LOCALES[lang]),
  region,
  host: flag('endpoint', provider.host),
}

/* ------------------------------------------------------------------ *
 * The work list
 * ------------------------------------------------------------------ */

const wordsPath = resolve(ROOT, `src/data/words.${lang}.json`)
let words
try {
  words = JSON.parse(readFileSync(wordsPath, 'utf8'))
} catch {
  // Reachable today by typing `--lang de`: the language seam is H1 and the
  // German dataset is H2, so `da` is the only one that exists.
  console.error(`No dataset at src/data/words.${lang}.json — there is nothing to bake for "${lang}".`)
  process.exit(2)
}

const jobs = []
const bySlug = new Map()
for (const w of words) {
  const slug = slugForId(String(w.id))
  if (!slug) {
    console.error(`"${w.id}" has no usable filename. Fix the slug rule before baking.`)
    process.exit(2)
  }
  if (bySlug.has(slug)) {
    // Two words, one file: whichever baked second would silently win and the
    // other would play the wrong word. Refuse rather than guess.
    console.error(`"${w.id}" and "${bySlug.get(slug)}" both want ${slug}.mp3.`)
    process.exit(2)
  }
  bySlug.set(slug, w.id)
  jobs.push({ id: w.id, slug, text: w.da })
}

const manifestPath = resolve(outDir, 'manifest.json')
let manifest = { entries: {} }
try {
  manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  if (!manifest.entries) manifest = { entries: {} }
} catch {
  // No manifest yet, or an unreadable one. Either way, start a fresh record —
  // the files on disk are still checked below, so nothing is re-spent that
  // does not need to be.
}

/** What identifies "the same file as last time": change any of it and re-bake. */
const stamp = (job) =>
  createHash('sha256')
    .update([providerName, cfg.voice, cfg.locale, job.text].join(' '))
    .digest('hex')
    .slice(0, 16)

const fileBytes = (slug) => {
  try {
    return statSync(resolve(outDir, `${slug}.mp3`)).size
  } catch {
    return 0
  }
}

const todo = []
const skipped = []
for (const job of jobs) {
  if (only && !only.has(job.slug) && !only.has(job.id)) continue
  const was = manifest.entries[job.slug]
  // A file counts as done when it is on disk, not empty, and was made from the
  // same text by the same voice. The size check catches a bake killed
  // mid-write, which is the one way to end up with a file that exists and
  // cannot be played.
  const done = !force && was && was.stamp === stamp(job) && fileBytes(job.slug) > 0
  if (done) skipped.push(job)
  else todo.push(job)
  if (todo.length >= limit) break
}

const chars = todo.reduce((n, j) => n + j.text.length, 0)
const estimate = (chars / 1_000_000) * provider.perMillion

console.log(
  `${providerName}${providerName === 'stub' ? '' : ` · ${cfg.voice}`} → ${outDir.replace(ROOT, '.')}`,
)
console.log(
  `${jobs.length} words · ${skipped.length} already baked · ${todo.length} to make · ` +
    // List price. Every provider here has a free monthly allowance far larger
    // than one bake, so the real bill is almost certainly zero — this is the
    // number to compare runs against, not the one to expect on a statement.
    `${chars} characters · about $${estimate.toFixed(2)} at list price`,
)

if (!todo.length) {
  console.log('Nothing to do.')
  process.exit(0)
}
if (dryRun) {
  console.log(`\nDry run. First few: ${todo.slice(0, 8).map((j) => `${j.text}→${j.slug}.mp3`).join(', ')}`)
  console.log(`Set $${provider.keyEnv} and drop --dry-run to spend the $${estimate.toFixed(2)}.`)
  process.exit(0)
}

/* ------------------------------------------------------------------ *
 * Baking
 * ------------------------------------------------------------------ */

mkdirSync(outDir, { recursive: true })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const gap = Number.isFinite(rps) && rps > 0 ? 1000 / rps : 0

/** One word, with backoff. Returns the bytes or throws with a readable reason. */
async function bake(job) {
  if (provider.offline) return provider.offline(job.text)

  let wait = 1000
  for (let attempt = 0; ; attempt++) {
    const { url, init } = provider.request(job.text, cfg)
    let res
    try {
      res = await fetch(url, { ...init, signal: AbortSignal.timeout(30_000) })
    } catch (e) {
      if (attempt >= retries) throw new Error(`network: ${e.message}`)
      await sleep(wait)
      wait *= 2
      continue
    }
    // 429 is the rate limit on every provider here; Azure's docs are explicit
    // that most of theirs are backend capacity rather than quota, and that
    // waiting is the only cure. 5xx gets the same treatment.
    if (res.status === 429 || res.status >= 500) {
      if (attempt >= retries) throw new Error(`HTTP ${res.status} after ${retries} retries`)
      const after = Number(res.headers.get('retry-after'))
      await sleep(Number.isFinite(after) && after > 0 ? after * 1000 : wait)
      wait *= 2
      continue
    }
    if (!res.ok) {
      const body = (await res.text()).slice(0, 300)
      throw new Error(`HTTP ${res.status} ${body}`)
    }
    const bytes = await provider.decode(res)
    if (!bytes?.length) throw new Error('empty response body')
    return bytes
  }
}

const failures = []
const started = Date.now()
let made = 0

for (const job of todo) {
  try {
    const bytes = await bake(job)
    writeFileSync(resolve(outDir, `${job.slug}.mp3`), bytes)
    manifest.entries[job.slug] = {
      id: job.id,
      text: job.text,
      stamp: stamp(job),
      bytes: bytes.length,
      at: new Date().toISOString(),
    }
    made++
    // Written every time rather than at the end, so a bake killed halfway —
    // Ctrl-C, a dropped connection, a laptop lid — resumes from where it got
    // to instead of paying for the first half again.
    manifest.provider = providerName
    manifest.voice = cfg.voice
    manifest.lang = lang
    writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  } catch (e) {
    failures.push({ job, why: e.message })
    // Keep going. One word that upsets the service should not cost the other
    // 899, and a second run picks up only what is still missing.
  }
  if (made % 50 === 0 && made) process.stdout.write(`${made}… `)
  if (gap) await sleep(gap)
}

const secs = ((Date.now() - started) / 1000).toFixed(0)
const onDisk = readdirSync(outDir).filter((f) => f.endsWith('.mp3')).length
console.log(`\n${made} made, ${failures.length} failed, ${secs}s. ${onDisk} clips in ${outDir.replace(ROOT, '.')}.`)

for (const f of failures.slice(0, 20)) console.log(`  ${f.job.slug}: ${f.why}`)
if (failures.length > 20) console.log(`  …and ${failures.length - 20} more`)
if (failures.length) console.log('Run it again — everything that worked is skipped.')

process.exit(failures.length ? 1 : 0)
