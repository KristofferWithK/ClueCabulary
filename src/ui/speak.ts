/**
 * Danish pronunciation: a baked clip when the build has one, the device's own
 * TTS when it does not.
 *
 * `speakDanish` is the original and stays — the Web Speech API costs nothing,
 * works offline, and is the only thing that can read an arbitrary sentence or a
 * word outside the dataset. What it cannot do is sound reliably Danish: it
 * borrows whatever da-DK voice the phone happens to carry, and a great many
 * iPhones carry none at all, in which case it is silent.
 *
 * `playWord` is the fix for the 900 words we know in advance.
 * `scripts/make-audio.mjs` bakes each of them to `public/audio/da/<slug>.mp3`
 * with a neural voice; this plays that file and falls back to `speakDanish`
 * whenever it cannot. **Until that script has been run against a real provider
 * there are no clips in the tree, so every call takes the fallback and the app
 * behaves exactly as it did before.** That is the intended resting state, not a
 * broken one.
 */
import { wordById } from '../data/words'
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
// the first tap already finds the Danish voice.
let cachedVoice: SpeechSynthesisVoice | undefined

function refreshVoice(): void {
  const voices = window.speechSynthesis.getVoices()
  cachedVoice =
    voices.find((v) => v.lang.toLowerCase() === 'da-dk') ??
    voices.find((v) => v.lang.toLowerCase().startsWith('da'))
}

if (canSpeak()) {
  refreshVoice()
  window.speechSynthesis.addEventListener?.('voiceschanged', refreshVoice)
}

/**
 * When speech was last cancelled from outside `speakDanish`.
 *
 * The WebKit quirk below keys off `synth.speaking || synth.pending`, which is
 * the right question only when `speakDanish` is the one doing the cancelling.
 * `stopWordAudio` also cancels — a new tap has to silence the old word — and
 * after it those flags can already read false while the engine is still tearing
 * down, which is exactly the window where a synchronously queued utterance goes
 * missing. Timestamping the cancel closes it.
 */
let cancelledAt = -Infinity
const TEARDOWN_MS = 90

export function speakDanish(text: string): void {
  if (!canSpeak()) return
  // The sound switch is checked here as well as in `playWord`, because this is
  // also the direct path for example sentences and looked-up words — the two
  // things that have no clip and never reach the player.
  if (!useSettings.getState().sound) return
  const synth = window.speechSynthesis
  const go = () => {
    if (!cachedVoice) refreshVoice()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = 'da-DK'
    if (cachedVoice) utterance.voice = cachedVoice
    utterance.rate = 0.88 // a touch slower for learners
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
export function audioSlug(headword: string): string {
  return (
    headword
      .normalize('NFC')
      .toLowerCase()
      // Before the decomposition below, which would otherwise split å into
      // a + ring and strip the ring, turning både `hår` and `har` into `har`.
      .replace(/æ/g, 'ae')
      .replace(/ø/g, 'oe')
      .replace(/å/g, 'aa')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
  )
}

const WORD_ID = /^([a-z]{2}):(.+)$/

/**
 * The URL of a word's baked clip, or undefined for an id that is not shaped
 * like one. The language comes out of the id's own prefix, so a second language
 * needs no second code path — `de:Haus` reads its clips from `audio/de/`.
 */
export function wordAudioUrl(wordId: string): string | undefined {
  const parts = WORD_ID.exec(wordId)
  if (!parts) return undefined
  const slug = audioSlug(parts[2])
  if (!slug) return undefined
  // BASE_URL is '/ClueCabulary/' on Pages and './' in the native shell, and
  // ends with a slash either way.
  return `${import.meta.env.BASE_URL}audio/${parts[1]}/${slug}.mp3`
}

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
  speak(text: string): void
  /** Whether the player wants sound at all. */
  wanted(): boolean
  /** The Danish behind an id, for the fallback and for nothing else. */
  danishFor(wordId: string): string | undefined
}

/**
 * How many clips to hold in memory. They are ~10 KB each, so this is about a
 * third of a megabyte at worst — enough that re-tapping a word in a round is
 * instant (and, more importantly, plays *inside* the tap: see `prime`), and far
 * short of holding all 900. The service worker's cache is the real store; this
 * is only the near end of it.
 */
const MEMO_MAX = 40

export function createWordPlayer(ports: WordAudioPorts) {
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

  async function attempt(wordId: string, text?: string): Promise<void> {
    const mine = ++ticket
    const current = () => mine === ticket
    // Before the `wanted` check, so turning sound off silences what is already
    // playing rather than only what comes next.
    ports.stop()
    if (!ports.wanted()) return
    ports.prime()

    const fallback = text ?? ports.danishFor(wordId)
    const url = wordAudioUrl(wordId)

    let clip = memo.get(wordId)
    if (!clip && url && !absent.has(wordId)) {
      const got = await ports.load(url).catch((): ClipLoad => ({ kind: 'unreachable' }))
      if (!current()) return
      if (got.kind === 'clip') {
        clip = got.clip
        memo.set(wordId, clip)
        // Map iterates in insertion order, so the first key is the oldest.
        if (memo.size > MEMO_MAX) memo.delete(memo.keys().next().value as string)
      } else if (got.kind === 'absent') {
        // A build with no baked audio is the whole of tonight's tree. Without
        // this the app would re-ask for the same missing file on every tap.
        absent.add(wordId)
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
    if (fallback) ports.speak(fallback)
  }

  return {
    /**
     * Never rejects, whatever the device or the ports do. Every call site is an
     * onClick that cannot await, so a rejection here is an unhandled promise on
     * an ordinary tap — and the worst case this is protecting is a word that
     * does not play, which is the resting state anyway.
     */
    async playWord(wordId: string, text?: string): Promise<void> {
      try {
        await attempt(wordId, text)
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
 * NOT VERIFIED ON A DEVICE — there was no iPhone in the session that wrote it.
 * It is a precaution with a known failure mode (the fallback), not a
 * measurement. If baked audio turns out to work on iPhone without it, delete
 * `prime`.
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

/** Exposed for the drives, which need to know a tap actually reached audio. */
export function stopWordAudio(): void {
  element?.pause()
  cancelSpeech()
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
      const res = await fetch(url, { cache: 'force-cache' })
      if (res.status === 404) return { kind: 'absent' }
      if (!res.ok) return { kind: 'unreachable' }
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
  prime() {
    if (primed || typeof Audio === 'undefined') return
    primed = true
    const el = audioElement()
    el.src = UNLOCK_WAV
    // No matching pause: the clip is 20 ms long and ends by itself. Pausing it
    // later would risk pausing the real clip that replaced it. When `play`
    // below swaps the src, this promise rejects with an abort — expected.
    void el.play().catch(() => {})
  },
  speak: speakDanish,
  wanted: () => useSettings.getState().sound,
  danishFor: (wordId) => wordById(wordId)?.da,
}

const player = createWordPlayer(browserPorts)

/**
 * Say a word of the dataset out loud: the baked clip if this build has one,
 * the device's Danish voice if not, nothing at all if the player has turned
 * sound off.
 *
 * Never rejects. Pass `text` when the caller already has the headword — it
 * saves a dictionary lookup and lets a word outside the dataset still fall
 * back to speech.
 */
export function playWord(wordId: string, text?: string): Promise<void> {
  return player.playWord(wordId, text)
}
