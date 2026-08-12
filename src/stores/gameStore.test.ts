import { beforeEach, describe, expect, it } from 'vitest'

/**
 * The practice fallback exists so a round is not lost when Klaus cannot be
 * reached — no key yet, the wrong key, or a browser that will not talk to
 * ollama.com. Three rules make it a rescue rather than a trap: it must not
 * touch settings, it must not survive into the next round, and it must survive
 * a reload of the round it belongs to.
 *
 * zustand resolves its storage once, when the module is first imported, so the
 * stand-in below has to be in place before the store is loaded — hence the
 * dynamic import. This suite runs in node, with no DOM.
 */
const written = new Map<string, string>()
Object.defineProperty(globalThis, 'window', {
  configurable: true,
  // zustand reaches for window.localStorage specifically, so a bare
  // globalThis.localStorage is not enough.
  value: {
    localStorage: {
      getItem: (k: string) => written.get(k) ?? null,
      setItem: (k: string, v: string) => void written.set(k, v),
      removeItem: (k: string) => void written.delete(k),
    },
  },
})

const { useGame } = await import('./gameStore')
const { useSettings } = await import('./settingsStore')

describe('gameStore: finishing a round without Klaus', () => {
  beforeEach(() => {
    useSettings.setState({ apiKey: 'a-key', useMock: false })
    useGame.getState().abandonGame()
  })

  it('starts off', () => {
    expect(useGame.getState().practiceFallback).toBe(false)
  })

  it('turns on and clears the error in one tap, since clearing is what resumes', () => {
    useGame.setState({ error: 'The API key was rejected.' })
    useGame.getState().fallBackToPractice()
    expect(useGame.getState().practiceFallback).toBe(true)
    expect(useGame.getState().error).toBeNull()
  })

  it('changes no setting — the next round still tries Klaus', () => {
    useGame.getState().fallBackToPractice()
    expect(useSettings.getState().useMock).toBe(false)
    expect(useSettings.getState().apiKey).toBe('a-key')
  })

  it('does not carry into the next round', () => {
    useGame.getState().fallBackToPractice()
    useGame.getState().newGame({ seed: 42 })
    expect(useGame.getState().practiceFallback).toBe(false)
  })

  it('is dropped when the round is abandoned', () => {
    useGame.getState().fallBackToPractice()
    useGame.getState().abandonGame()
    expect(useGame.getState().practiceFallback).toBe(false)
  })

  it('is written to storage, so a reload mid-round does not walk back into it', () => {
    useGame.getState().fallBackToPractice()
    expect(JSON.parse(written.get('cluecab-game-v1')!).state).toMatchObject({
      practiceFallback: true,
    })
  })
})
