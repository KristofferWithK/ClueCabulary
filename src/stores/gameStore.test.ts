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

/**
 * "I want a reroll button at the beginning to reroll the board if I have no
 * idea on how to connect the words."
 *
 * The interesting part is not dealing a second board — newGame already does
 * that — it is what the reroll tells the NEXT deal. Exactly three words of the
 * last board come back on every board, and the store remembers two boards deep
 * so a carried word has to sit one out before it can carry again. A board dealt
 * and rejected in ten seconds is not a board the player played, so it must
 * REPLACE the head of that window rather than push onto it. Pushing costs
 * twice: the genuinely-previous board falls out of the two-deep window, and the
 * reroll comes back holding three words of the board just rejected.
 */
describe('gameStore: rerolling the board before the first clue', () => {
  const ids = () => useGame.getState().game!.words.map((w) => w.wordId)

  beforeEach(() => {
    useSettings.setState({ apiKey: 'a-key', useMock: true })
    useGame.getState().abandonGame()
    useGame.setState({ recentBoards: [] })
  })

  it('deals a different board of the same size', () => {
    useGame.getState().newGame({ seed: 11, gridSize: 'standard' })
    const before = ids()
    const { seed: seedBefore, config: configBefore } = useGame.getState().game!
    useGame.getState().rerollBoard()
    const after = ids()
    expect(after).not.toEqual(before)
    expect(seedBefore).not.toBe(useGame.getState().game!.seed)
    // A reroll is a new deal, not a new difficulty: the board it came from
    // chooses the size, which is why rerollBoard never reads settings.gridSize.
    expect(useGame.getState().game!.config).toEqual(configBefore)
    expect(after).toHaveLength(before.length)
  })

  it('and the round it deals is untouched — no clue, nothing spent', () => {
    useGame.getState().newGame({ seed: 11 })
    useGame.setState({ lookedUp: ['x'], practiceFallback: true, error: 'boom' })
    useGame.getState().rerollBoard()
    const s = useGame.getState()
    expect(s.game!.clueHistory).toEqual([])
    expect(s.lookedUp).toEqual([])
    expect(s.practiceFallback).toBe(false)
    expect(s.error).toBeNull()
  })

  it('replaces the board it threw away rather than remembering it', () => {
    useGame.getState().newGame({ seed: 1 })
    const first = ids()
    useGame.getState().newGame({ seed: 2 })
    const second = ids()
    expect(useGame.getState().recentBoards).toEqual([second, first])

    useGame.getState().rerollBoard()
    const rerolled = ids()
    // The rejected board is gone; the one actually played is still there, so
    // the "may not carry over twice running" rule still has something to read.
    expect(useGame.getState().recentBoards).toEqual([rerolled, first])
  })

  /**
   * The consequence of the line above, stated as a behaviour rather than as a
   * data structure: the reroll carries words back from the last board the
   * player PLAYED, not from the one they just said they could not read.
   */
  it('so the new board carries its three words from the last board played', () => {
    useGame.getState().newGame({ seed: 1 })
    const played = ids()
    useGame.getState().newGame({ seed: 2 })
    useGame.getState().rerollBoard()
    const rerolled = ids()
    expect(rerolled.filter((id) => played.includes(id))).toHaveLength(3)
  })

  it('refuses once a clue is on the table', () => {
    useGame.getState().newGame({ seed: 11 })
    useGame.getState().submitPlayerClue('klods', 2)
    const dealt = ids()
    useGame.getState().rerollBoard()
    expect(ids()).toEqual(dealt)
  })

  /** One shared board per date. A rerolled daily is nobody's board. */
  it('refuses on the daily challenge', () => {
    useGame.getState().newGame({ seed: 20260814, dailyKey: '2026-08-14' })
    const dealt = ids()
    useGame.getState().rerollBoard()
    expect(ids()).toEqual(dealt)
    expect(useGame.getState().dailyKey).toBe('2026-08-14')
  })

  it('and does nothing at all with no game', () => {
    useGame.getState().abandonGame()
    expect(() => useGame.getState().rerollBoard()).not.toThrow()
    expect(useGame.getState().game).toBeNull()
  })
})
