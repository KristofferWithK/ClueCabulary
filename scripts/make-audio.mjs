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
 *   node scripts/make-audio.mjs --source words-slow  the 0.6 set behind the 🐢
 *   node scripts/make-audio.mjs --source stories      the travel-story sentences
 *   node scripts/make-audio.mjs --source stories-en   the same, in English
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
    /**
     * The ones worth trying, first is the default.
     *
     * Chosen by ear from a 35-voice audition (the `Audition TTS voices`
     * workflow bakes every voice Google serves reading the same four
     * sentences). Aoede is a Chirp3-HD voice — a tier that did not exist when
     * this list was first written, and which is 30 of the 35 today. The
     * legacy names below it are kept as fallbacks rather than aspirations.
     *
     * Do NOT add a name here without checking it against `listVoices`: a
     * retired name is SERVED rather than refused, as a different voice.
     */
    voices: {
      da: ['da-DK-Chirp3-HD-Aoede', 'da-DK-Neural2-F', 'da-DK-Wavenet-F', 'da-DK-Wavenet-G'],
      de: ['de-DE-Chirp3-HD-Aoede', 'de-DE-Neural2-F'],
      // Not a dataset language: this is the voice the ride's translation half
      // is read in. Aoede again, so one narrator carries both languages. If
      // Google does not serve this exact name the guard below prints the ones
      // it does — it is the same Chirp3 family, so a sibling name is the fix.
      en: ['en-US-Chirp3-HD-Aoede', 'en-US-Neural2-F'],
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
            audioConfig: { audioEncoding: 'MP3', sampleRateHertz: 24000, speakingRate: cfg.rate },
          }),
        },
      }
    },
    async decode(res) {
      const body = await res.json()
      if (!body.audioContent) throw new Error('no audioContent in the response')
      return Buffer.from(body.audioContent, 'base64')
    },
    /**
     * The names Google actually serves for the locale. The guard before the
     * bake asks this, because the synthesize endpoint SERVES a retired name
     * rather than refusing it — da-DK-Neural2-D answers 200 with Neural2-F's
     * audio, da-DK-Wavenet-A with Wavenet-F's (measured 2026-08-20, audition
     * workflow run 3) — so a mistyped voice bakes 900 words in the wrong voice
     * and reports "900 made, 0 failed". Only a name outside Google's pattern
     * is refused. The list above is a frozen convenience; this is the truth.
     */
    async listVoices(cfg) {
      const res = await fetch(`${cfg.host}/v1/voices?languageCode=${cfg.locale}`, {
        headers: { 'X-goog-api-key': cfg.key },
        signal: AbortSignal.timeout(10_000),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return ((await res.json()).voices ?? []).map((v) => v.name)
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
      en: ['en-US-JennyNeural'],
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
            // Azure wants the rate as a percentage OFF normal, signed, where
            // Google wants a multiplier. 0.6 here is '-40%'.
            `<prosody rate='${cfg.rate >= 1 ? '+' : ''}${Math.round((cfg.rate - 1) * 100)}%'>${safe}</prosody>` +
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
    voices: { da: [], de: [], en: [] },
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
            voice_settings: { stability: 0.5, similarity_boost: 0.75, speed: cfg.rate },
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
/**
 * What gets baked: the nine hundred words at their ordinary pace, the same
 * nine hundred slowly, or the travel stories.
 *
 * One script rather than three, because everything around the text is the same
 * problem — the voice, the rate, the guard that refuses a voice Google does
 * not serve, the manifest that resumes an interrupted run, the retry on a 429.
 * A second script would have been a second copy of all of it, drifting.
 *
 * Each source carries its own rate and its own directory, and that is on
 * purpose: bake-audio.yml passes neither, so there is exactly one place where
 * "slow means 0.6" is written down for the bake to disagree with.
 */
const SOURCES = {
  words: { rate: 1, out: (l) => `public/audio/${l}` },
  // The 🐢 in the dictionary sheet. Same words, same voice, a second file each
  // — see wordAudioUrl in src/ui/speak.ts for why it is a bake and not a
  // playbackRate.
  'words-slow': { rate: 0.6, out: (l) => `public/audio/${l}/slow` },
  // The ride plays each sentence four times: Danish, its translation, Danish
  // slowly, Danish again. Three of those four are files baked here and the
  // fourth is the first one replayed, so a sentence costs three clips.
  stories: { rate: 1, out: (l) => `public/audio/${l}/story` },
  'stories-slow': { rate: 0.6, out: (l) => `public/audio/${l}/story/slow` },
  // The one source that is not in the language being taught: the English
  // sentence, in the same narrator's voice, so the switch a learner hears is
  // the language and not the reader.
  'stories-en': {
    rate: 1,
    out: (l) => `public/audio/${l}/story/en`,
    locale: 'en-US',
    voiceKey: 'en',
    /** Which side of the sentence to read. */
    side: 'en',
  },
}
const isStory = (src) => src.startsWith('stories')
const source = flag('source', 'words')
if (!SOURCES[source]) {
  console.error(`Unknown --source "${source}". One of: ${Object.keys(SOURCES).join(', ')}`)
  process.exit(2)
}
// Each source gets its own directory, and therefore its own manifest: a
// sentence and a word are different work with different resume state, a flat
// namespace would let a word called "0-001" collide with a sentence, and the
// two word bakes share every filename by design.
const outDir = resolve(ROOT, flag('out', SOURCES[source].out(lang)))
const only = flag('only') ? new Set(flag('only').split(',').map((s) => s.trim())) : null
const limit = Number(flag('limit', Infinity))
const region = flag('region', 'northeurope')
const rps = Number(flag('rps', provider.rps))
const retries = Number(flag('retries', 4))

/**
 * How fast the voice speaks, as a multiplier of its normal pace. The source
 * decides it; `--rate` is an override for an audition.
 *
 * 0.6 for the slow set and the stories, by design and not by default: the
 * owner picked it by ear from a rate audition (1.0 / 0.9 / 0.7 / 0.6 / 0.5 of
 * the same sentence — audition/da-rate/, and the workflow that made them), and
 * below about 0.6 a neural voice stops sounding patient and starts sounding
 * drawn out. It was every word's rate until the sheet grew a 🐢; the ordinary
 * board tap is 1.0 now and 0.6 is what the button asks for.
 *
 * Each provider spells it differently — Google a multiplier, Azure a signed
 * percentage, ElevenLabs a speed — so the number is normalised here and each
 * adapter converts. It is part of the stamp below, so changing it re-bakes.
 */
const rate = Number(flag('rate', SOURCES[source].rate))
if (!Number.isFinite(rate) || rate < 0.25 || rate > 4) {
  console.error(`--rate must be between 0.25 and 4; got "${flag('rate')}".`)
  process.exit(2)
}

const voice = flag('voice', provider.voices[SOURCES[source].voiceKey ?? lang]?.[0])
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
  rate,
  lang,
  // The BCP-47 tag each provider wants, and it is NOT derivable from the code:
  // da is da-DK, not da-DA. Uppercasing the code happens to be right for German
  // and wrong for most others, so the pairs are stated rather than computed.
  // Must match `speech.tag` in the language's pack.
  // The source can override it: stories-en is read in English inside a Danish
  // route, so the locale follows the TEXT and not the dataset.
  locale: flag('locale', SOURCES[source].locale ?? LOCALES[lang]),
  region,
  host: flag('endpoint', provider.host),
}

/* ------------------------------------------------------------------ *
 * The work list
 * ------------------------------------------------------------------ */

const readJson = (path, what) => {
  try {
    return JSON.parse(readFileSync(resolve(ROOT, path), 'utf8'))
  } catch {
    // Reachable today by typing `--lang de`: the language seam is H1 and the
    // German dataset is H2, so `da` is the only one that exists.
    console.error(`No ${what} at ${path} — there is nothing to bake for "${lang}".`)
    process.exit(2)
  }
}

const jobs = []
const bySlug = new Map()

if (!isStory(source)) {
  const words = readJson(`src/data/words.${lang}.json`, 'dataset')
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
} else {
  // The slug is `<city>-<3-digit sentence>`, and it MUST agree with
  // `storySlug` in src/journey/travelStory.ts — the app asks for these names
  // by computing them. travelStory.test.ts pins the format from the other
  // side, and a test asserts every sentence has a clip on disk, so a drift
  // between these two lines fails the suite rather than the ride.
  const stories = readJson(`src/data/travel-stories.${lang}.json`, 'travel stories')
  // 'da' for the two Danish bakes, 'en' for the translation half.
  const side = SOURCES[source].side ?? 'da'
  for (const [key, story] of Object.entries(stories)) {
    const sentences = story.chapters.flatMap((c) => c.sentences)
    sentences.forEach((s, i) => {
      const slug = `${key}-${String(i).padStart(3, '0')}`
      if (!s[side]) {
        // A sentence with no English is a silent step in the middle of the
        // cycle, which reads as a broken ride rather than as missing content.
        console.error(`Sentence ${slug} has no "${side}" text to read.`)
        process.exit(2)
      }
      bySlug.set(slug, slug)
      jobs.push({ id: `story:${key}:${i}`, slug, text: s[side] })
    })
  }
  if (jobs.length === 0) {
    console.error(`No sentences in src/data/travel-stories.${lang}.json.`)
    process.exit(2)
  }
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

/**
 * What identifies "the same file as last time": change any of it and re-bake.
 *
 * The RATE is in here, and it has to be. It was not, for as long as the speed
 * was a literal inside each adapter — which meant changing it and re-running
 * would have matched every stamp, skipped all 900 words, and printed
 * "0 to make · Nothing to do." The one thing you changed would have been the
 * one thing the manifest could not see.
 */
const stamp = (job) =>
  createHash('sha256')
    .update([providerName, cfg.voice, cfg.locale, String(cfg.rate), job.text].join(' '))
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
  `${providerName}${providerName === 'stub' ? '' : ` · ${cfg.voice} · rate ${cfg.rate}`} → ${outDir.replace(ROOT, '.')}`,
)
console.log(
  `${jobs.length} ${isStory(source) ? 'sentences' : 'words'} · ${skipped.length} already baked · ${todo.length} to make · ` +
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
 * The voice guard
 *
 * Refuse a voice the service does not serve, BEFORE spending the bake. Without
 * this the mistake is invisible: Google answers a retired name with SOME
 * voice's audio and a 200, so the wrong voice bakes clean through and the only
 * check left is a human listening to 900 files. A failed listing is a warning
 * rather than a stop — the guard must never be the reason an offline stub run
 * or a flaky network breaks a bake that was going to work.
 * ------------------------------------------------------------------ */

if (provider.listVoices) {
  try {
    const served = await provider.listVoices(cfg)
    if (served.length && !served.includes(cfg.voice)) {
      console.error(
        `"${cfg.voice}" is not a voice ${providerName} serves for ${cfg.locale} — and it would not refuse it: ` +
          `a retired name is answered with some OTHER voice's audio, the bake reports success, and every word comes out wrong.\n` +
          `Voices it serves for ${cfg.locale}:\n  ${served.join('\n  ')}`,
      )
      process.exit(2)
    }
  } catch (e) {
    console.warn(`Could not check "${cfg.voice}" against ${providerName}'s voice list (${e.message}) — continuing unguarded.`)
  }
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
    manifest.rate = cfg.rate
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
