import { beforeEach, describe, expect, it } from 'vitest'

/**
 * The practice fallback exists so a round is not lost when Cluey cannot be
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
const { useSrs } = await import('./srsStore')

describe('gameStore: finishing a round without Cluey', () => {
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

  it('changes no setting — the next round still tries Cluey', () => {
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

/**
 * Collection depends on knowing whose work earned each green, and finishRound
 * is the only place that can still tell: a guess is judged against the
 * clue-giver's key, so a green under a clue `by: 'player'` is Cluey finding
 * the player's word (clue credit), a green under `by: 'ai'` is the player's
 * own tap (guess credit), and a green reveal that appears in NO clue's guess
 * list was named in sudden death — the reducer writes that reveal without a
 * guess record — which is the player naming it with no clue-giver at all.
 *
 * Mutation-checked: swapping the two `by` comparisons fails the first two
 * tests; dropping the sudden-death fallback fails the third.
 */
describe('gameStore: which side earned each green', () => {
  const word = (id: string) => ({ wordId: id, da: id, en: [id], pos: 'noun' })

  const finishedGame = () =>
    ({
      config: { rows: 2, cols: 2, totalWords: 4 },
      seed: 1,
      words: ['a', 'b', 'c', 'd'].map(word),
      reveals: {
        a: { kind: 'green' },
        b: { kind: 'green' },
        c: { kind: 'green' },
        d: { kind: 'hidden' },
      },
      playerKey: { a: 'green', b: 'bystander', c: 'green', d: 'bystander' },
      aiKey: { a: 'bystander', b: 'green', c: 'green', d: 'green' },
      phase: 'finished',
      turnsLeft: 0,
      clueHistory: [
        { by: 'player', text: 'x', number: 1, guesses: [{ wordId: 'a', result: 'green' }] },
        { by: 'ai', text: 'y', number: 2, guesses: [{ wordId: 'b', result: 'green' }] },
        // 'c' is revealed green but appears in no guess list: sudden death.
      ],
      outcome: { result: 'lost', reason: 'sudden-death' },
    }) as never

  beforeEach(() => {
    useSettings.setState({ useMock: true })
    useSrs.getState().reset()
    useGame.getState().abandonGame()
  })

  it("credits the player's clue when Cluey finds the word", () => {
    useGame.setState({ game: finishedGame(), roundRecorded: false, lookedUp: [] })
    useGame.getState().finishRound()
    expect(useSrs.getState().stats.a).toMatchObject({ greenByClue: 1, greenByGuess: 0 })
  })

  it("credits the player's guess when they find Cluey's word", () => {
    useGame.setState({ game: finishedGame(), roundRecorded: false, lookedUp: [] })
    useGame.getState().finishRound()
    expect(useSrs.getState().stats.b).toMatchObject({ greenByClue: 0, greenByGuess: 1 })
  })

  it('a sudden-death green is the player naming it: guess credit', () => {
    useGame.setState({ game: finishedGame(), roundRecorded: false, lookedUp: [] })
    useGame.getState().finishRound()
    expect(useSrs.getState().stats.c).toMatchObject({ greenByClue: 0, greenByGuess: 1 })
  })

  it('an unrevealed word earns neither', () => {
    useGame.setState({ game: finishedGame(), roundRecorded: false, lookedUp: [] })
    useGame.getState().finishRound()
    expect(useSrs.getState().stats.d).toMatchObject({ greenByClue: 0, greenByGuess: 0 })
  })

  it('a redemption answer never advances the collection', () => {
    const game = finishedGame() as {
      reveals: Record<string, unknown>
      redemption?: unknown
      outcome: unknown
      clueHistory: unknown[]
    }
    game.clueHistory.length = 0
    game.reveals = {
      a: { kind: 'forbidden' },
      b: { kind: 'hidden' },
      c: { kind: 'hidden' },
      d: { kind: 'hidden' },
    }
    game.redemption = {
      promptWordIds: ['a', 'b', 'c', 'd'],
      results: [
        { wordId: 'b', given: 'b', accepted: true },
        { wordId: 'c', given: 'wrong', accepted: false },
      ],
    }
    game.outcome = { result: 'won', reason: 'redeemed' }
    useGame.setState({ game: game as never, roundRecorded: false, lookedUp: [] })
    useGame.getState().finishRound()
    const stats = useSrs.getState().stats
    expect(stats.b).toMatchObject({ greenByClue: 0, greenByGuess: 0, redemptionRight: 1 })
    expect(stats.c).toMatchObject({ greenByClue: 0, greenByGuess: 0, redemptionWrong: 1 })
  })
})
