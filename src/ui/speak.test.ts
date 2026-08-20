import { describe, expect, it } from 'vitest'
import { WORDS } from '../data/words'
import { type ClipLoad, type WordAudioPorts, audioSlug, createWordPlayer, wordAudioUrl } from './speak'

/**
 * The filename rule is written twice — once in `speak.ts` for the app, once in
 * `scripts/audio-slug.mjs` for the build script, because a .mjs run by node
 * cannot import TypeScript. Two copies of a rule is a bug waiting for a quiet
 * week, so this compares them over the whole dataset rather than trusting
 * either.
 *
 * The failure mode if they ever drift is not a wrong filename. The script
 * writes `koebe.mp3`, the app asks for `kobe.mp3`, every request 404s, and
 * every word falls back to the device voice — which is exactly what the app
 * does today with no audio at all, so nothing would look broken.
 */
async function scriptSlug() {
  // Not a literal specifier, so tsc leaves the untyped .mjs alone.
  const href = new URL('../../scripts/audio-slug.mjs', import.meta.url).href
  const mod = (await import(/* @vite-ignore */ href)) as {
    audioSlug: (s: string) => string
    slugForId: (id: string) => string | undefined
  }
  return mod
}

describe('the name a clip is baked under', () => {
  it('folds Danish letters to ASCII rather than percent-encoding them', () => {
    expect(audioSlug('købe')).toBe('koebe')
    expect(audioSlug('æble')).toBe('aeble')
    expect(audioSlug('hånd')).toBe('haand')
  })

  it('keeps æøå apart from their ASCII bases, which the obvious rule does not', () => {
    // The obvious rule is NFD-then-strip-marks, and it turns å into a, æ into
    // ae's first letter and ø into o. Six pairs in the dataset differ by
    // exactly that, so the obvious rule hands each pair one file — and the app
    // would play «vare» when asked for «være» with nothing looking broken.
    const naive = (s: string) =>
      s
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/æ/g, 'a')
        .replace(/ø/g, 'o')
    const pairs = [
      ['være', 'vare'],
      ['bare', 'bære'],
      ['tænke', 'tanke'],
      ['svær', 'svar'],
      ['blød', 'blod'],
      ['påstå', 'pasta'],
    ]
    const inDataset = new Set(WORDS.map((w) => w.da))
    for (const [a, b] of pairs) {
      expect(inDataset.has(a), a).toBe(true)
      expect(inDataset.has(b), b).toBe(true)
      expect(naive(a), `${a}/${b} is why the fold happens first`).toBe(naive(b))
      expect(audioSlug(a)).not.toBe(audioSlug(b))
    }
  })

  it('does not care which normalisation the word arrived in', () => {
    // macOS filesystems hand back NFD; the JSON is NFC. Same file either way.
    expect(audioSlug('hår'.normalize('NFD'))).toBe(audioSlug('hår'.normalize('NFC')))
  })

  it('gives all 900 words a distinct, filesystem-safe name', () => {
    const seen = new Map<string, string>()
    for (const w of WORDS) {
      const url = wordAudioUrl(w.id)
      expect(url, w.id).toBeDefined()
      const file = url!.split('/').pop()!
      // The underscore is here for one word and one operating system: «nul» is
      // the Danish for zero and NUL is a Windows device, extension included.
      expect(file, w.id).toMatch(/^[a-z0-9-]+_?\.mp3$/)
      expect(seen.has(file), `${w.id} and ${seen.get(file)} both want ${file}`).toBe(false)
      seen.set(file, w.id)
    }
    expect(seen.size).toBe(WORDS.length)
  })

  /**
   * Found by git refusing to add the file, which is a late and confusing place
   * to find it. Windows reserves CON, PRN, AUX, NUL and the numbered COM/LPT
   * ports as device names, and the reservation ignores the extension — so
   * `nul.mp3` IS the null device. Baking Danish on Windows therefore opened
   * that device, wrote the clip into it, and reported success: the word had no
   * audio, and nothing said so.
   *
   * «nul» is the only one of the 900, but the rule is cheap and German or any
   * later language may bring another.
   */
  it('escapes the names Windows keeps for its own devices', () => {
    for (const reserved of ['nul', 'con', 'prn', 'aux', 'com1', 'lpt9']) {
      expect(audioSlug(reserved, (s) => s), reserved).toBe(`${reserved}_`)
    }
  })

  it('leaves a word that merely contains one alone', () => {
    // «nullpunkt» is an ordinary filename; only the whole name is reserved.
    expect(audioSlug('nullpunkt', (s) => s)).toBe('nullpunkt')
    expect(audioSlug('contact', (s) => s)).toBe('contact')
  })

  it('agrees with the copy the build script bakes with, word for word', async () => {
    const script = await scriptSlug()
    for (const w of WORDS) {
      const mine = wordAudioUrl(w.id)!.split('/').pop()!.replace('.mp3', '')
      expect(script.slugForId(w.id), w.id).toBe(mine)
    }
  })

  it('reads the language out of the id, so a second language needs no new path', () => {
    expect(wordAudioUrl('da:hus')).toMatch(/audio\/da\/hus\.mp3$/)
    expect(wordAudioUrl('de:Haus')).toMatch(/audio\/de\/haus\.mp3$/)
  })

  it('has no url for something that is not a word id', () => {
    expect(wordAudioUrl('hus')).toBeUndefined()
    expect(wordAudioUrl('da:')).toBeUndefined()
    expect(wordAudioUrl('da:???')).toBeUndefined()
  })
})

/* ------------------------------------------------------------------ */

const CLIP = new Blob([new Uint8Array([1, 2, 3])])

/** A player with every side effect counted. */
function harness(over: Partial<WordAudioPorts> = {}) {
  const calls = {
    load: [] as string[],
    played: 0,
    spoke: [] as string[],
    stopped: 0,
    primed: 0,
    /** What happened, in order — the only way to ask "before the await?". */
    order: [] as string[],
  }
  let answer: ClipLoad = { kind: 'clip', clip: CLIP }
  let playFails: Error | null = null

  const ports: WordAudioPorts = {
    async load(url) {
      calls.load.push(url)
      calls.order.push('load')
      return answer
    },
    async play() {
      calls.played++
      calls.order.push('play')
      if (playFails) throw playFails
    },
    stop: () => void (calls.stopped++, calls.order.push('stop')),
    prime: () => void (calls.primed++, calls.order.push('prime')),
    speak: (t) => void (calls.spoke.push(t), calls.order.push('speak')),
    wanted: () => true,
    headwordFor: (id) => id.replace(/^[a-z]{2}:/, ''),
    ...over,
  }
  return {
    calls,
    player: createWordPlayer(ports),
    answers(next: ClipLoad) {
      answer = next
    },
    playThrows(e: Error | null) {
      playFails = e
    },
  }
}

describe('playWord', () => {
  it('plays the baked clip and stays off the speech engine', async () => {
    const h = harness()
    await h.player.playWord('da:hus')
    expect(h.calls.load).toEqual([wordAudioUrl('da:hus')])
    expect(h.calls.played).toBe(1)
    expect(h.calls.spoke).toEqual([])
  })

  it('falls back to speech when the build has no clip — tonight, all 900 of them', async () => {
    const h = harness()
    h.answers({ kind: 'absent' })
    await h.player.playWord('da:hus')
    expect(h.calls.played).toBe(0)
    expect(h.calls.spoke).toEqual(['hus'])
  })

  it('asks once for a clip that is not there, however many times it is tapped', async () => {
    const h = harness()
    h.answers({ kind: 'absent' })
    await h.player.playWord('da:hus')
    await h.player.playWord('da:hus')
    await h.player.playWord('da:hus')
    expect(h.calls.load).toHaveLength(1)
    expect(h.calls.spoke).toEqual(['hus', 'hus', 'hus'])
  })

  it('but keeps asking when the answer was only that it could not be reached', async () => {
    // Offline is not the same as absent. Remembering it would cost the player
    // baked audio for the rest of the session over one dropped connection.
    const h = harness()
    h.answers({ kind: 'unreachable' })
    await h.player.playWord('da:hus')
    await h.player.playWord('da:hus')
    expect(h.calls.load).toHaveLength(2)
    expect(h.calls.spoke).toEqual(['hus', 'hus'])
  })

  it('fetches a clip once and plays it from memory after that', async () => {
    const h = harness()
    await h.player.playWord('da:hus')
    await h.player.playWord('da:hus')
    expect(h.calls.load).toHaveLength(1)
    expect(h.calls.played).toBe(2)
  })

  it('falls back to speech when the device refuses to play', async () => {
    // iOS autoplay policy, or bytes that will not decode.
    const h = harness()
    h.playThrows(new DOMException('blocked', 'NotAllowedError'))
    await h.player.playWord('da:hus')
    expect(h.calls.played).toBe(1)
    expect(h.calls.spoke).toEqual(['hus'])
  })

  it('and keeps the clip, because the next tap may be allowed', async () => {
    const h = harness()
    h.playThrows(new DOMException('blocked', 'NotAllowedError'))
    await h.player.playWord('da:hus')
    h.playThrows(null)
    await h.player.playWord('da:hus')
    expect(h.calls.load).toHaveLength(1)
    expect(h.calls.spoke).toEqual(['hus'])
  })

  it('unlocks the element inside the tap, before anything is awaited', async () => {
    const h = harness()
    const going = h.player.playWord('da:hus')
    // Read before awaiting, so what is asserted is what ran synchronously —
    // which on iOS is the whole of the gesture the element can be unlocked in.
    // If `prime` ever moves below the fetch, the gesture is over by the time it
    // runs and the first word of every session falls back to speech.
    expect(h.calls.order).toEqual(['stop', 'prime', 'load'])
    await going
    expect(h.calls.order).toEqual(['stop', 'prime', 'load', 'play'])
  })

  it('silences the previous word before starting the next', async () => {
    const h = harness()
    await h.player.playWord('da:hus')
    await h.player.playWord('da:kat')
    expect(h.calls.stopped).toBe(2)
  })

  it('lets the newest tap win when three arrive together', async () => {
    // Every one of them is mid-fetch when the next arrives. Only the last may
    // reach the speaker; the ones cut off must not also fall back to speech,
    // which would stack utterances behind the clip that did play.
    let release: (() => void) | undefined
    const gate = new Promise<void>((r) => (release = r))
    const h = harness({
      async load() {
        await gate
        return { kind: 'absent' }
      },
    })
    const all = [
      h.player.playWord('da:hus'),
      h.player.playWord('da:kat'),
      h.player.playWord('da:hund'),
    ]
    release!()
    await Promise.all(all)
    expect(h.calls.spoke).toEqual(['hund'])
  })

  it('and does not let an overtaken clip play on top of the one that won', async () => {
    // The same race with clips rather than fallbacks, which is the version that
    // is actually audible: three fetches land at once and, without the check
    // after the await, all three reach the speaker — the player taps «hund» and
    // hears «hus» over it.
    let release: (() => void) | undefined
    const gate = new Promise<void>((r) => (release = r))
    const h = harness({
      async load() {
        await gate
        return { kind: 'clip', clip: CLIP }
      },
    })
    const all = [
      h.player.playWord('da:hus'),
      h.player.playWord('da:kat'),
      h.player.playWord('da:hund'),
    ]
    release!()
    await Promise.all(all)
    expect(h.calls.played).toBe(1)
  })

  it('says nothing at all when the player has turned sound off', async () => {
    const h = harness({ wanted: () => false })
    await h.player.playWord('da:hus')
    expect(h.calls.load).toEqual([])
    expect(h.calls.played).toBe(0)
    expect(h.calls.spoke).toEqual([])
    expect(h.calls.primed).toBe(0)
  })

  it('and stops what is already playing when it is turned off mid-clip', async () => {
    const h = harness({ wanted: () => false })
    await h.player.playWord('da:hus')
    expect(h.calls.stopped).toBe(1)
  })

  it('speaks a word from outside the dataset rather than dropping it', async () => {
    // TranslateBox can be holding a word Cluey translated that has no id and
    // no clip. The caller passes the text; speech is the only route.
    const h = harness({ headwordFor: () => undefined })
    await h.player.playWord('not-an-id', 'kæledyr')
    expect(h.calls.load).toEqual([])
    expect(h.calls.spoke).toEqual(['kæledyr'])
  })

  it('never rejects, whatever the device does', async () => {
    const h = harness({ load: () => Promise.reject(new Error('boom')) })
    // A rejection here would be an unhandled promise on an ordinary tap: every
    // call site is an onClick, and none of them can await.
    await expect(h.player.playWord('da:hus')).resolves.toBeUndefined()
    // And a thrown load is treated as unreachable, so the word is still said.
    expect(h.calls.spoke).toEqual(['hus'])
  })
})
