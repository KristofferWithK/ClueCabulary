/**
 * Pronunciation: a baked clip when the build has one, the device's own TTS
 * when it does not.
 *
 * `speakText` is the original and stays — the Web Speech API costs nothing,
 * works offline, and is the only thing that can read an arbitrary sentence or a
 * word outside the dataset. What it cannot do is sound reliably like the
 * language: it borrows whatever voice for the tag the phone happens to carry,
 * and a great many iPhones carry no Danish one at all, in which case it is
 * silent. (It was called `speakDanish` until the language seam. Renamed rather
 * than kept because the name was a claim about behaviour that stopped being
 * true — unlike the `cluey-*` names CLAUDE.md protects, which are labels
 * nobody reads.)
 *
 * `playWord` is the fix for the 900 words we know in advance.
 * `scripts/make-audio.mjs` bakes each of them twice with a neural voice — the
 * ordinary reading to `public/audio/<lang>/<slug>.mp3` and a 0.6 one to
 * `public/audio/<lang>/slow/<slug>.mp3` — and this plays whichever was asked
 * for, falling back to `speakText` whenever it cannot. **Until that script has
 * been run against a real provider there are no clips in the tree, so every
 * call takes the fallback and the app behaves exactly as it did before.** That
 * is the intended resting state, not a broken one.
 */
import { wordById } from '../data/words'
import { ACTIVE } from '../lang/active'
import { LANGUAGES } from '../lang/index'
import type { LanguageCode } from '../lang/types'
import { useSettings } from '../stores/settingsStore'

export function canSpeak(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

/**
 * Whether a *dataset word* can be made audible — which is a wider question than
 * `canSpeak`, because a baked clip needs no speech engine. Gate the word
 * buttons on this and the sentence buttons on `canSpeak`: a sentence has no
 * clip and never will.
 */
export function canPlayWords(): boolean {
  return canSpeak() || typeof Audio !== 'undefined'
}

// Voice lists load asynchronously on iOS/Android — cache on voiceschanged so
// the first tap already finds the right voice.
let cachedVoice: SpeechSynthesisVoice | undefined

/**
 * The exact tag first, then anything in the same language: a phone with
 * de-AT but no de-DE should still speak German rather than English.
 */
function refreshVoice(): void {
  const voices = window.speechSynthesis.getVoices()
  const tag = ACTIVE.speech.tag.toLowerCase()
  const prefix = `${ACTIVE.code}-`
  cachedVoice =
    voices.find((v) => v.lang.toLowerCase() === tag) ??
    voices.find((v) => v.lang.toLowerCase().startsWith(prefix))
}

if (canSpeak()) {
  refreshVoice()
  window.speechSynthesis.addEventListener?.('voiceschanged', refreshVoice)
}

/**
 * A voice for a tag that is not the active language's. Exact match first, then
 * anything in the same language, the same order `refreshVoice` uses.
 */
function voiceFor(tag: string): SpeechSynthesisVoice | undefined {
  if (!canSpeak()) return undefined
  const voices = window.speechSynthesis.getVoices()
  const want = tag.toLowerCase()
  const prefix = `${want.split('-')[0]}-`
  return (
    voices.find((v) => v.lang.toLowerCase() === want) ??
    voices.find((v) => v.lang.toLowerCase().startsWith(prefix))
  )
}

/**
 * When speech was last cancelled from outside `speakText`.
 *
 * The WebKit quirk below keys off `synth.speaking || synth.pending`, which is
 * the right question only when `speakText` is the one doing the cancelling.
 * `stopWordAudio` also cancels — a new tap has to silence the old word — and
 * after it those flags can already read false while the engine is still tearing
 * down, which is exactly the window where a synchronously queued utterance goes
 * missing. Timestamping the cancel closes it.
 */
let cancelledAt = -Infinity
const TEARDOWN_MS = 90

export function speakText(
  text: string,
  rate: number = ACTIVE.speech.rate,
  tag: string = ACTIVE.speech.tag,
): void {
  if (!canSpeak()) return
  // The sound switch is checked here as well as in `playWord`, because this is
  // also the direct path for example sentences and looked-up words — the two
  // things that have no clip and never reach the player.
  if (!useSettings.getState().sound) return
  const synth = window.speechSynthesis
  const go = () => {
    if (!cachedVoice) refreshVoice()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = tag
    // The cache holds the voice for the language being taught. Anything else —
    // today only the ride's English translation — is looked up per utterance
    // rather than cached: it is the no-clip path of one step of one screen,
    // and a second cache to keep warm would cost more than it saves.
    const voice = tag === ACTIVE.speech.tag ? cachedVoice : voiceFor(tag)
    if (voice) utterance.voice = voice
    // The pack's normal rate unless the caller asked for its slow one. This is
    // the no-clip path, so it is the only place a rate is still spoken rather
    // than baked.
    utterance.rate = rate
    synth.speak(utterance)
  }
  // WebKit quirk: an utterance queued synchronously after cancel() is often
  // silently dropped — give the engine a beat to tear down first.
  if (synth.speaking || synth.pending || Date.now() - cancelledAt < TEARDOWN_MS) {
    synth.cancel()
    cancelledAt = Date.now()
    setTimeout(go, TEARDOWN_MS)
  } else {
    go()
  }
}

function cancelSpeech(): void {
  if (!canSpeak()) return
  const synth = window.speechSynthesis
  if (!synth.speaking && !synth.pending) return
  synth.cancel()
  cancelledAt = Date.now()
}

/* ------------------------------------------------------------------ *
 * Where a baked clip lives
 * ------------------------------------------------------------------ */

/**
 * The filename a word's clip is baked under.
 *
 * Word ids look like `da:mor`, and neither half of that survives contact with a
 * filesystem: a colon is illegal in a Windows filename outright, and `æøå` in a
 * URL means percent-encoding that has to agree with whatever normalisation the
 * filesystem chose — macOS stores NFD, the browser asks in NFC, and the
 * mismatch is a 404 that only appears once the iOS build copies the files. So
 * the name is folded down to plain ASCII: `da:købe` becomes `koebe.mp3`, which
 * is also how a Dane would write it without the keys.
 *
 * Verified collision-free across all 900 words by `speak.test.ts`, which is the
 * only thing standing between two words and one file. `make-audio.mjs` repeats
 * the rule and refuses to run if the two ever disagree.
 */
export function audioSlug(
  headword: string,
  fold: (s: string) => string = ACTIVE.orthography.fold,
): string {
  return (
    fold(headword.normalize('NFC').toLowerCase())
      // The fold has to happen before this decomposition, which would otherwise
      // split å into a + ring and strip the ring. Six pairs in the Danish 900
      // differ only by a Danish letter and its ASCII base — være/vare,
      // bare/bære, tænke/tanke, svær/svar, blød/blod, påstå/pasta — so the
      // naive strip gives each pair one file between them and teaches whichever
      // word baked second. Counted over the dataset by speak.test.ts, not
      // guessed at. German is worse: Mädchen/Madchen, and ß left as a hyphen.
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      // Windows keeps a handful of names for devices, and NUL is one \u2014 as is
      // NUL.mp3, since the reservation ignores the extension. The Danish for
      // zero is \u00abnul\u00bb, so baking on Windows opened the null device, wrote the
      // clip into it, and reported success: the word had no audio and git
      // could not index the file that was not there. A trailing underscore is
      // enough \u2014 only the exact base name is reserved \u2014 and it must be applied
      // in the bake script's copy of this too, or the app asks for a file
      // nobody wrote.
      .replace(RESERVED_ON_WINDOWS, '$&_')
  )
}

/**
 * CON, PRN, AUX, NUL and the numbered COM/LPT ports, matched whole and
 * case-insensitively. Anchored, because a slug merely CONTAINING "nul" \u2014
 * \u00abnullpunkt\u00bb would \u2014 is a perfectly ordinary filename.
 */
const RESERVED_ON_WINDOWS = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i

const WORD_ID = /^([a-z]{2}):(.+)$/

/**
 * The URL of a word's baked clip, or undefined for an id that is not shaped
 * like one. The language comes out of the id's own prefix, so a second language
 * needs no second code path — `de:Haus` reads its clips from `audio/de/`.
 *
 * Each word is baked TWICE, and the variant picks between the two directories:
 * `audio/da/hus.mp3` is the ordinary reading, `audio/da/slow/hus.mp3` the 0.6
 * one behind the dictionary's 🐢. Two files rather than one file played at
 * `playbackRate` 0.6, because a stretched clip is a processed clip and both of
 * these are real synthesis at the rate they claim. The slow set is the audio
 * that used to be the app's only audio (DECISIONS.md, «The voice is Aoede at
 * 0.6»), moved sideways rather than re-made.
 *
 * The FOLD comes out of the same prefix, via the registry. An id for a language
 * with no pack registered is not folded at all rather than folded by Danish's
 * rules: applying æ→ae to a German word would be a confidently wrong filename,
 * where no fold is an incomplete one that becomes right the moment the pack
 * lands.
 */
export function wordAudioUrl(wordId: string, variant: SpeechVariant = 'normal'): string | undefined {
  const parts = WORD_ID.exec(wordId)
  if (!parts) return undefined
  const pack = LANGUAGES[parts[1] as LanguageCode]
  const slug = audioSlug(parts[2], pack ? pack.orthography.fold : (s) => s)
  if (!slug) return undefined
  const dir = variant === 'slow' ? `${parts[1]}/slow` : parts[1]
  // BASE_URL is '/ClueCabulary/' on Pages and './' in the native shell, and
  // ends with a slash either way.
  return `${import.meta.env.BASE_URL}audio/${dir}/${slug}.mp3`
}

/**
 * Which of the two bakes a word is being asked for. Not a setting — nothing
 * persists it and nothing defaults to 'slow'; it is what one button passes.
 */
export type SpeechVariant = 'normal' | 'slow'

/**
 * The URL of one travel-story sentence's baked clip.
 *
 * A sentence, unlike a word, is not addressed by a dataset id — there is
 * nothing to fold or to guard against Windows device names, because the name
 * is two numbers. It must agree with `storySlug` in journey/travelStory.ts and
 * with the story branch of make-audio.mjs; journey-drive asks the built app
 * for these files, so the three cannot drift apart quietly.
 *
 * Three bakes of one sentence, because the ride says each one four times:
 * `story/` is the Danish at its ordinary pace and is also the fourth pass,
 * `story/en/` is the English translation between them, and `story/slow/` is
 * the Danish at 0.6 — the clips that used to be the ride's only audio.
 */
export function storyAudioUrl(
  cityIndex: number,
  sentenceIndex: number,
  variant: StoryVariant = 'normal',
): string {
  const slug = `${cityIndex}-${String(sentenceIndex).padStart(3, '0')}`
  const dir = variant === 'normal' ? 'story' : `story/${variant}`
  return `${import.meta.env.BASE_URL}audio/${ACTIVE.code}/${dir}/${slug}.mp3`
}

/** Which of a sentence's three clips: the Danish, its translation, the slow Danish. */
export type StoryVariant = 'normal' | 'en' | 'slow'

/**
 * The tag the device voice reads a TRANSLATION in, when there is no baked clip
 * for it. Must match the locale the `stories-en` source bakes with in
 * make-audio.mjs, or the same sentence arrives in two accents depending on
 * whether the build has audio. English is not a dataset language and has no
 * pack, which is why this is a literal here rather than a field on one.
 */
export const TRANSLATION_TAG = 'en-US'

/* ------------------------------------------------------------------ *
 * The player
 * ------------------------------------------------------------------ */

/** What a fetch for a clip came back with. The three cases are not the same. */
export type ClipLoad =
  /** The bytes. */
  | { kind: 'clip'; clip: Blob }
  /** A 404: this build has no clip for that word, and never will. Remember it. */
  | { kind: 'absent' }
  /** Offline, or the server is unhappy. Try again on the next tap. */
  | { kind: 'unreachable' }

/**
 * Everything `playWord` touches that is not pure. Split out so the decision
 * logic — what to fetch, what to remember, when to fall back — can be tested in
 * node, where there is no `Audio`, no `fetch` worth having and no speech engine.
 */
export interface WordAudioPorts {
  load(url: string): Promise<ClipLoad>
  /** Rejects if the device refuses to play: autoplay policy, or a bad decode. */
  play(clip: Blob): Promise<void>
  /** Silence everything, at once. */
  stop(): void
  /**
   * Called synchronously inside the tap that asked for sound, before the first
   * await. See `unlock` below for why.
   */
  prime(): void
  /** The no-clip path. The rate is the caller's, not the port's. */
  speak(text: string, rate: number): void
  /** Whether the player wants sound at all. */
  wanted(): boolean
  /** The headword behind an id, for the fallback and for nothing else. */
  headwordFor(wordId: string): string | undefined
}

/**
 * How many clips to hold in memory, counted across both bakes — a word tapped
 * and then heard slowly holds two. They are ~10 KB each, so this is about a
 * third of a megabyte at worst — enough that re-tapping a word in a round is
 * instant (and, more importantly, plays *inside* the tap: see `prime`), and far
 * short of holding all 900. The service worker's cache is the real store; this
 * is only the near end of it.
 */
const MEMO_MAX = 40

export function createWordPlayer(ports: WordAudioPorts) {
  /**
   * Both caches are keyed by variant AND id, never by id alone. Keyed by id,
   * the first tap on «hus» would answer every later tap — so 🐢 would replay
   * the ordinary clip and look like a dead button, and a word missing from one
   * bake would fall silent in the other. `slow:da:hus` and `normal:da:hus` are
   * two files and two separate questions.
   */
  const memo = new Map<string, Blob>()
  const absent = new Set<string>()
  /**
   * Rapid taps. Each call takes a ticket, and any call whose ticket is no
   * longer the newest gives up wherever it has got to — including inside the
   * `play()` rejection, because interrupting a clip rejects the promise of the
   * one being interrupted and that is a success, not a failure to fall back
   * from.
   */
  let ticket = 0

  async function attempt(
    wordId: string,
    text: string | undefined,
    variant: SpeechVariant,
  ): Promise<void> {
    const mine = ++ticket
    const current = () => mine === ticket
    // Before the `wanted` check, so turning sound off silences what is already
    // playing rather than only what comes next.
    ports.stop()
    if (!ports.wanted()) return
    ports.prime()

    const fallback = text ?? ports.headwordFor(wordId)
    const url = wordAudioUrl(wordId, variant)
    const key = `${variant}:${wordId}`

    let clip = memo.get(key)
    if (!clip && url && !absent.has(key)) {
      const got = await ports.load(url).catch((): ClipLoad => ({ kind: 'unreachable' }))
      if (!current()) return
      if (got.kind === 'clip') {
        clip = got.clip
        memo.set(key, clip)
        // Map iterates in insertion order, so the first key is the oldest.
        if (memo.size > MEMO_MAX) memo.delete(memo.keys().next().value as string)
      } else if (got.kind === 'absent') {
        // A build with no baked audio is the whole of tonight's tree. Without
        // this the app would re-ask for the same missing file on every tap.
        absent.add(key)
      }
      // 'unreachable' is deliberately not remembered: the clip may exist and
      // simply be out of reach, and a player who goes offline for a bus ride
      // should not lose baked audio for the rest of the session.
    }

    if (clip) {
      try {
        await ports.play(clip)
        return
      } catch {
        if (!current()) return
        // Autoplay refused, or the bytes would not decode. Speech is still
        // worth a try, and the clip stays memoised — the next tap may be
        // allowed where this one was not.
      }
    }

    if (!current()) return
    if (fallback) {
      ports.speak(fallback, variant === 'slow' ? ACTIVE.speech.slowRate : ACTIVE.speech.rate)
    }
  }

  return {
    /**
     * Never rejects, whatever the device or the ports do. Every call site is an
     * onClick that cannot await, so a rejection here is an unhandled promise on
     * an ordinary tap — and the worst case this is protecting is a word that
     * does not play, which is the resting state anyway.
     */
    async playWord(wordId: string, text?: string, opts?: { slow?: boolean }): Promise<void> {
      try {
        await attempt(wordId, text, opts?.slow ? 'slow' : 'normal')
      } catch {
        // Nothing useful left to try: `attempt` has already fallen back once.
      }
    },
    /** Tests only: drop everything learned so far. */
    reset() {
      memo.clear()
      absent.clear()
      ticket = 0
    },
  }
}

/* ------------------------------------------------------------------ *
 * The browser wiring
 * ------------------------------------------------------------------ */

/**
 * 20 ms of PCM silence.
 *
 * iOS will only let an audio element start playing from inside a user gesture,
 * and it grants that permission to the *element*, once, for good. Fetching a
 * clip takes us out of the gesture — by the time the bytes arrive the tap is
 * over — so the very first word would be refused and fall back to speech for
 * ever after. Playing this inside the tap, before the fetch, spends the gesture
 * on unlocking the element while it is still ours to spend.
 *
 * STILL NOT VERIFIED ON A DEVICE — there was no iPhone in the session that
 * wrote it, and none in the session (S1) that gave it a second call site
 * (`primeWordAudio`, exported below `audioElement`) for Casey's guesses to
 * unlock ahead of. It remains a precaution with a known failure mode (the
 * fallback), not a measurement, until a TestFlight build is actually heard —
 * that listen is the owner's, not a session's. If baked audio turns out to
 * work on iPhone without it, delete `prime` and `primeWordAudio` together.
 */
const UNLOCK_WAV =
  'data:audio/wav;base64,UklGRsQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YaAAAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA'

let element: HTMLAudioElement | undefined
let objectUrl: string | undefined
let primed = false

function audioElement(): HTMLAudioElement {
  if (!element) {
    element = new Audio()
    element.preload = 'auto'
  }
  return element
}

/**
 * Unlock the audio element inside a real user gesture, ahead of the sound
 * that will need it. `playWord` already primes on its own first call (the
 * `prime` port below, idempotent on `primed`), which covers every sound that
 * follows directly from a tap. It does NOT cover Casey's guesses (S1):
 * `stepAiGuess` runs on a `setInterval`, so by the time it calls `playWord`
 * the gesture that started the AI turn is long over, and on iOS priming from
 * inside that callback is priming too late — the same failure `prime`'s own
 * comment describes, just reached from a different call site.
 *
 * So the composer's Give-clue tap — the gesture that starts the chain ending
 * in Casey's first guess — calls this directly, synchronously, before the
 * async `submit()` it also triggers. `docs/DECISIONS.md`'s amendment to "every
 * sound follows a tap" is this: a sound follows a tap, or follows FROM one.
 *
 * Exported standalone (rather than only reachable through `playWord`) so a
 * call site can prime without also asking for a word to be spoken — the
 * Give-clue button has no word in hand at all, only the gesture.
 */
export function primeWordAudio(): void {
  if (primed || typeof Audio === 'undefined') return
  primed = true
  const el = audioElement()
  el.src = UNLOCK_WAV
  // No matching pause: the clip is 20 ms long and ends by itself. Pausing it
  // later would risk pausing the real clip that replaced it. When `play`
  // below swaps the src, this promise rejects with an abort — expected.
  void el.play().catch(() => {})
}

/**
 * Silence everything at once — the clip and any utterance behind it. Called at
 * the top of every `playWord`, so a second tap never lands on top of the first.
 */
export function stopWordAudio(): void {
  element?.pause()
  cancelSpeech()
}

/**
 * There is no clip here — and get rid of whatever the cache thinks there is.
 *
 * Needed because "no clip" does not reliably arrive as a 404. A single-page
 * host answers an unknown path with index.html and a 200: `vite preview` does,
 * and so does the Capacitor shell the iOS build runs inside. offline-drive
 * measured it — a word with no baked file came back 200, and the service
 * worker filed the HTML under the clip's URL, where CacheFirst would have kept
 * it for a year. Deleting it costs one pass over the cache names, once per word
 * per session, since the answer is memoised after that.
 */
function noClipAt(url: string): ClipLoad {
  if (typeof caches !== 'undefined') {
    void caches
      .keys()
      .then((names) => Promise.all(names.map((n) => caches.open(n).then((c) => c.delete(url)))))
      .catch(() => {})
  }
  return { kind: 'absent' }
}

const browserPorts: WordAudioPorts = {
  async load(url) {
    try {
      // The bytes are fetched rather than handed to the element as a `src`
      // because WebKit asks media elements' sources for byte ranges, and a 206
      // Partial Content is a response the Cache API refuses to store — the
      // service worker's runtime cache for /audio/ would fill with nothing and
      // offline playback would quietly never work. A plain GET returns a plain
      // 200, which caches. See the workbox block in vite.config.ts.
      // No `cache: 'force-cache'`. It reads like the right thing for a file
      // that never changes, and it buys nothing — the service worker's
      // CacheFirst already keeps the network out of a repeat play, and the
      // native shell reads the clip off local storage. What it would cost is
      // the miss path: a word with no clip answers 200 text/html with a
      // max-age, and force-cache would keep serving that HTML from the HTTP
      // cache after the bake had put a real clip there.
      const res = await fetch(url)
      if (res.status === 404) return noClipAt(url)
      if (!res.ok) return { kind: 'unreachable' }
      // Trust the type, not the status. See `noClipAt`: a 200 here is as likely
      // to be the app's own index.html as it is to be a clip.
      if (!/^audio\//i.test(res.headers.get('content-type') ?? '')) return noClipAt(url)
      return { kind: 'clip', clip: await res.blob() }
    } catch {
      return { kind: 'unreachable' }
    }
  },
  play(clip) {
    const el = audioElement()
    if (objectUrl) URL.revokeObjectURL(objectUrl)
    objectUrl = URL.createObjectURL(clip)
    el.src = objectUrl
    return el.play()
  },
  stop: stopWordAudio,
  // `primeWordAudio` above — a standalone export so S1's Give-clue call site
  // can reach it without going through a word at all.
  prime: primeWordAudio,
  speak: speakText,
  wanted: () => useSettings.getState().sound,
  headwordFor: (wordId) => wordById(wordId)?.da,
}

const player = createWordPlayer(browserPorts)

/**
 * Say a word of the dataset out loud: the baked clip if this build has one,
 * the device's Danish voice if not, nothing at all if the player has turned
 * sound off.
 *
 * Never rejects. Pass `text` when the caller already has the headword — it
 * saves a dictionary lookup and lets a word outside the dataset still fall
 * back to speech. `{ slow: true }` asks for the 0.6 bake instead of the
 * ordinary one, and falls back to the device voice at the pack's slow rate;
 * only the dictionary sheet passes it.
 */
export function playWord(wordId: string, text?: string, opts?: { slow?: boolean }): Promise<void> {
  return player.playWord(wordId, text, opts)
}
