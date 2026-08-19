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
const storage = {
  getItem: (k: string) => written.get(k) ?? null,
  setItem: (k: string, v: string) => void written.set(k, v),
  removeItem: (k: string) => void written.delete(k),
}
Object.defineProperty(globalThis, 'window', {
  configurable: true,
  // zustand reaches for window.localStorage specifically, so a bare
  // globalThis.localStorage is not enough.
  value: { localStorage: storage },
})
// And the bare global, because finishRound writes the daily challenge's result
// straight to `localStorage` — so without this the whole daily path throws in
// here rather than being testable, which is how it went untested.
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage })

const { migrateGame, useGame } = await import('./gameStore')
const { useJourney } = await import('./journeyStore')
const { useSettings } = await import('./settingsStore')
const { useSrs } = await import('./srsStore')
const { WORDS } = await import('../data/words')
const { newStats } = await import('../srs/scheduler')
const { wordsForCity } = await import('../journey/progress')
const { WRAP_UP_BANK_CAP } = await import('../journey/wrapup')

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

  /**
   * This block used to end with "a redemption answer never advances the
   * collection" — translating a word back in the last chance credited
   * redemptionRight, never greenByClue or greenByGuess, so a word could not be
   * collected by typing it. The last chance is retired and the counters are
   * frozen; the rule it protected is the one above it, that only a green earned
   * each way collects a word, and that is still pinned four ways.
   */

  /**
   * The round summary's other counter. It has to be read BEFORE recordRound,
   * because recordRound gives every word on the board an SRS record — after it
   * runs, a word met for the first time today is indistinguishable from one met
   * a year ago and the diff is uniformly empty.
   *
   * Mutation-checked: moving the `newlyDiscovered` line below the
   * `recordRound` call makes every test here read `[]` and all three fail.
   */
  describe('and which words it was the first sight of', () => {
    it('a board of words never seen before is all new', () => {
      useGame.setState({ game: finishedGame(), roundRecorded: false, lookedUp: [] })
      useGame.getState().finishRound()
      expect(useGame.getState().newlyDiscovered.sort()).toEqual(['a', 'b', 'c', 'd'])
    })

    it('a word with an SRS record from an earlier round is not new', () => {
      useSrs.setState({ stats: { a: newStats(1_700_000_000_000) } })
      useGame.setState({ game: finishedGame(), roundRecorded: false, lookedUp: [] })
      useGame.getState().finishRound()
      expect(useGame.getState().newlyDiscovered).not.toContain('a')
      expect(useGame.getState().newlyDiscovered.sort()).toEqual(['b', 'c', 'd'])
    })

    /**
     * Discovered is about meeting a word, not about doing well with it — 'd'
     * ends this round unrevealed and still counts, which is exactly what
     * `wordState` means by `discovered`.
     */
    it('counts a word that was never even revealed', () => {
      useGame.setState({ game: finishedGame(), roundRecorded: false, lookedUp: [] })
      useGame.getState().finishRound()
      expect(useGame.getState().newlyDiscovered).toContain('d')
    })
  })
})

/**
 * v4 -> v5 drops the debrief.
 *
 * This store HAS a partialize, which writes the saved blob back key for key —
 * so a `debrief` object stored once by an older build would ride along in every
 * save that device ever wrote again, long after nothing could read it. Unlike
 * v3 -> v4 this migration costs the player nothing: no persisted shape changed,
 * so a round in flight resumes as itself.
 *
 * Exported and tested directly for the reason migrateSrs is: under vitest there
 * is no localStorage, persist quietly becomes a passthrough, and a test reaching
 * through the middleware would be testing nothing.
 */
describe('gameStore: the v4 -> v5 migration', () => {
  const v4 = () => ({
    recentBoards: [['w1']],
    game: { phase: 'playerGuessing' },
    lookedUp: ['w1'],
    roundRecorded: false,
    dailyKey: null,
    studying: false,
    mode: 'normal',
    packed: [],
    packingMissed: [],
    packingDone: true,
    debrief: { summary: 'Cluey said something.', takeaways: ['one thing'] },
    debriefFailed: false,
    newlyLearned: ['w1'],
    practiceFallback: false,
  })

  it('drops both dead keys rather than leaving them to rot in the blob', () => {
    const out = migrateGame(v4(), 4) as Record<string, unknown>
    expect(out).not.toHaveProperty('debrief')
    expect(out).not.toHaveProperty('debriefFailed')
  })

  it('gives the summary its new counter', () => {
    expect((migrateGame(v4(), 4) as { newlyDiscovered: string[] }).newlyDiscovered).toEqual([])
  })

  it('and keeps the round in flight — nothing in it changed shape', () => {
    const out = migrateGame(v4(), 4) as Record<string, unknown>
    expect(out.game).toEqual({ phase: 'playerGuessing' })
    expect(out.lookedUp).toEqual(['w1'])
    expect(out.newlyLearned).toEqual(['w1'])
    expect(out.recentBoards).toEqual([['w1']])
  })

  it('leaves a save already at v5 exactly as it found it', () => {
    const already = { game: null, newlyDiscovered: ['w9'] }
    expect(migrateGame(already, 5)).toBe(already)
  })

  /**
   * An older save still takes the v3 -> v4 road — the round is thrown away
   * because it may hold roles that no longer exist — and must not arrive
   * carrying the dead keys either.
   */
  it('an older save arrives with no game, no debrief keys, and its boards', () => {
    const out = migrateGame(
      { recentBoards: [['w1']], debrief: { summary: 's', takeaways: ['t'] } },
      3,
    ) as Record<string, unknown>
    expect(out.game).toBeNull()
    expect(out).not.toHaveProperty('debrief')
    expect(out).not.toHaveProperty('debriefFailed')
    expect(out.newlyDiscovered).toEqual([])
    expect(out.recentBoards).toEqual([['w1']])
  })

  it('and a v1 save still finds its one remembered board', () => {
    const out = migrateGame({ lastBoard: ['w1', 'w2'] }, 1) as Record<string, unknown>
    expect(out.recentBoards).toEqual([['w1', 'w2']])
    expect(out.newlyDiscovered).toEqual([])
  })
})

/**
 * The wrap-up round: dealt from collected words, opened by a packing phase,
 * and the reason the mode exists — packed words found green go into the
 * suitcase for good.
 *
 * Mutation-checked: dropping the `packed.includes` conjunct in finishRound's
 * wrap step fails "a skipped card ... does NOT wrap"; letting the deal write
 * recentBoards fails its test; loosening the reroll guard fails that one.
 */
describe('gameStore: wrap-up rounds', () => {
  const city = wordsForCity(WORDS, 0)

  const collectCity = (n: number) => {
    const stats = Object.fromEntries(
      city.slice(0, n).map((w) => [
        w.id,
        { ...newStats(1_700_000_000_000), greenByClue: 1, greenByGuess: 1 },
      ]),
    )
    useSrs.setState({ stats })
  }

  beforeEach(() => {
    useSettings.setState({ apiKey: 'a-key', useMock: true })
    useJourney.getState().reset()
    useSrs.getState().reset()
    useGame.getState().abandonGame()
    useGame.setState({ recentBoards: [] })
    collectCity(40)
    // A wrap-up round has to be earned before it can be dealt. These tests are
    // about the round rather than the economy — the economy is the describe
    // below — so they are handed a full bank.
    useSrs.setState({ wrapUpsBanked: WRAP_UP_BANK_CAP })
  })

  it('deals a full board of collected words, English-side up, packing open', () => {
    useGame.getState().newWrapUpGame({ seed: 5 })
    const s = useGame.getState()
    expect(s.game).not.toBeNull()
    expect(s.game!.words).toHaveLength(20)
    expect(s.mode).toBe('wrapup')
    expect(s.packingDone).toBe(false)
    expect(s.packed).toEqual([])
    const collected = new Set(city.slice(0, 40).map((w) => w.id))
    for (const w of s.game!.words) expect(collected.has(w.wordId)).toBe(true)
  })

  it('refuses to deal below a full board of collected words', () => {
    useSrs.getState().reset()
    collectCity(10)
    useGame.getState().newWrapUpGame({ seed: 5 })
    expect(useGame.getState().game).toBeNull()
  })

  it('neither reads nor writes recentBoards — wrap-ups live outside the carry-over rule', () => {
    useGame.getState().newGame({ seed: 1 })
    const prior = useGame.getState().recentBoards
    useGame.getState().newWrapUpGame({ seed: 5 })
    expect(useGame.getState().recentBoards).toEqual(prior)
  })

  it('packing a card right flips it; the last card opens the round', () => {
    useGame.getState().newWrapUpGame({ seed: 5 })
    const words = useGame.getState().game!.words
    for (const [i, w] of words.entries()) {
      expect(useGame.getState().submitPacking(w.wordId, w.da)).toBe(true)
      expect(useGame.getState().packed).toContain(w.wordId)
      expect(useGame.getState().packingDone).toBe(i === words.length - 1)
    }
    expect(useGame.getState().packingMissed).toEqual([])
  })

  it('a miss is recorded once, and retries are free', () => {
    useGame.getState().newWrapUpGame({ seed: 5 })
    const w = useGame.getState().game!.words[0]!
    expect(useGame.getState().submitPacking(w.wordId, 'zzzz')).toBe(false)
    expect(useGame.getState().submitPacking(w.wordId, 'zzzz')).toBe(false)
    expect(useGame.getState().packingMissed).toEqual([w.wordId])
    expect(useGame.getState().submitPacking(w.wordId, w.da)).toBe(true)
    expect(useGame.getState().packed).toContain(w.wordId)
    // Packed after a miss: the miss stands.
    expect(useGame.getState().packingMissed).toEqual([w.wordId])
  })

  it('starting early opens the round with cards still unpacked', () => {
    useGame.getState().newWrapUpGame({ seed: 5 })
    const w = useGame.getState().game!.words[0]!
    useGame.getState().submitPacking(w.wordId, w.da)
    useGame.getState().startRoundEarly()
    expect(useGame.getState().packingDone).toBe(true)
    expect(useGame.getState().packed).toEqual([w.wordId])
  })

  it('the dictionary is closed while packing — it would be the answer key', async () => {
    useGame.getState().newWrapUpGame({ seed: 5 })
    const w = useGame.getState().game!.words[0]!
    await expect(useGame.getState().translate(w.da)).rejects.toThrow(/closed/i)
    useGame.getState().recordLookup(w.wordId)
    expect(useGame.getState().lookedUp).toEqual([])
    // Open again once the packing is done.
    useGame.getState().startRoundEarly()
    useGame.getState().recordLookup(w.wordId)
    expect(useGame.getState().lookedUp).toEqual([w.wordId])
  })

  it('rerolls only before the first packing attempt — a miss is owed, not unseen', () => {
    useGame.getState().newWrapUpGame({ seed: 5 })
    const before = useGame.getState().game!.words.map((w) => w.wordId)
    useGame.getState().rerollBoard()
    const after = useGame.getState().game!.words.map((w) => w.wordId)
    expect(after).not.toEqual(before)
    expect(useGame.getState().mode).toBe('wrapup')
    expect(useGame.getState().packingDone).toBe(false)

    // One MISS is an attempt: the board must now stand.
    const w = useGame.getState().game!.words[0]!
    useGame.getState().submitPacking(w.wordId, 'zzzz')
    const dealt = useGame.getState().game!.words.map((x) => x.wordId)
    useGame.getState().rerollBoard()
    expect(useGame.getState().game!.words.map((x) => x.wordId)).toEqual(dealt)
  })

  const finishWrapUp = (
    reveal: (wordId: string, i: number) => 'green' | 'hidden',
  ) => {
    const game = useGame.getState().game!
    const reveals = Object.fromEntries(
      game.words.map((w, i) => [w.wordId, { kind: reveal(w.wordId, i) }]),
    )
    useGame.setState({
      game: {
        ...game,
        phase: 'finished',
        reveals,
        outcome: { result: 'lost', reason: 'timeout' },
      } as never,
      roundRecorded: false,
    })
    useGame.getState().finishRound()
  }

  it('a packed word found green is wrapped — win or lose', () => {
    useGame.getState().newWrapUpGame({ seed: 5 })
    const words = useGame.getState().game!.words
    useGame.getState().submitPacking(words[0]!.wordId, words[0]!.da)
    useGame.getState().submitPacking(words[1]!.wordId, words[1]!.da)
    useGame.getState().startRoundEarly()
    // words[0] green, words[1] never revealed, everything else green too.
    finishWrapUp((id) => (id === words[1]!.wordId ? 'hidden' : 'green'))
    const wrapped = useJourney.getState().wrapped
    expect(wrapped).toHaveProperty(words[0]!.wordId)
    // Packed but never found: not wrapped.
    expect(wrapped).not.toHaveProperty(words[1]!.wordId)
  })

  it('a skipped card revealed green does NOT wrap — the risk the skip buys', () => {
    useGame.getState().newWrapUpGame({ seed: 5 })
    const words = useGame.getState().game!.words
    useGame.getState().submitPacking(words[0]!.wordId, words[0]!.da)
    useGame.getState().startRoundEarly()
    finishWrapUp(() => 'green')
    const wrapped = useJourney.getState().wrapped
    expect(wrapped).toHaveProperty(words[0]!.wordId)
    for (const w of words.slice(1)) expect(wrapped).not.toHaveProperty(w.wordId)
  })

  it('a normal round wraps nothing, whatever is revealed', () => {
    useGame.getState().newGame({ seed: 5 })
    useGame.getState().endStudy()
    finishWrapUp(() => 'green')
    expect(Object.keys(useJourney.getState().wrapped)).toHaveLength(0)
  })
})

/**
 * Winning earns a wrap-up round, and starting one spends it.
 *
 * The rule that carries the most weight is the one that looks like an edge
 * case: a wrap-up win must earn nothing. If it earned, one win would chain
 * into an unbroken run of wrap-ups and the rationing would be gone. The rest
 * of the economy exists so that losing can never lock a player out of packing
 * words — which is the only route onward — so a loss costs nothing and the
 * bank cannot go negative.
 *
 * Mutation-checked: passing `mode` through as a constant 'normal' in
 * finishRound (i.e. reverting the "only normal rounds earn" rule) fails "a
 * won wrap-up earns no second wrap-up"; deleting the spendWrapUp call in
 * newWrapUpGame fails both spend tests.
 */
describe('gameStore: wins earn wrap-up rounds', () => {
  const city = wordsForCity(WORDS, 0)

  beforeEach(() => {
    useSettings.setState({ apiKey: 'a-key', useMock: true })
    useJourney.getState().reset()
    useSrs.getState().reset()
    useGame.getState().abandonGame()
    useGame.setState({ recentBoards: [] })
    const stats = Object.fromEntries(
      city.slice(0, 40).map((w) => [
        w.id,
        { ...newStats(1_700_000_000_000), greenByClue: 1, greenByGuess: 1 },
      ]),
    )
    useSrs.setState({ stats })
  })

  /** End whatever round is in flight with a given result. */
  const finishAs = (result: 'won' | 'lost') => {
    const game = useGame.getState().game!
    useGame.setState({
      game: {
        ...game,
        phase: 'finished',
        reveals: Object.fromEntries(game.words.map((w) => [w.wordId, { kind: 'green' }])),
        outcome:
          result === 'won'
            ? { result: 'won', reason: 'all-greens' }
            : { result: 'lost', reason: 'sudden-death' },
      } as never,
      roundRecorded: false,
    })
    useGame.getState().finishRound()
  }

  it('a won round banks one, and says so on the summary', () => {
    useGame.getState().newGame({ seed: 5 })
    finishAs('won')
    expect(useSrs.getState().wrapUpsBanked).toBe(1)
    expect(useGame.getState().earnedWrapUp).toBe(true)
  })

  it('a lost round banks nothing, and claims nothing', () => {
    useGame.getState().newGame({ seed: 5 })
    finishAs('lost')
    expect(useSrs.getState().wrapUpsBanked).toBe(0)
    expect(useGame.getState().earnedWrapUp).toBe(false)
  })

  it('a won daily challenge earns one like any other round', () => {
    useGame.getState().newGame({ seed: 20260820, dailyKey: '2026-08-20' })
    finishAs('won')
    expect(useSrs.getState().wrapUpsBanked).toBe(1)
  })

  it('starting a wrap-up spends one', () => {
    useSrs.setState({ wrapUpsBanked: 2 })
    useGame.getState().newWrapUpGame({ seed: 5 })
    expect(useGame.getState().mode).toBe('wrapup')
    expect(useSrs.getState().wrapUpsBanked).toBe(1)
  })

  it('an empty bank deals no wrap-up board at all', () => {
    useSrs.setState({ wrapUpsBanked: 0 })
    useGame.getState().newWrapUpGame({ seed: 5 })
    expect(useGame.getState().game).toBeNull()
    expect(useSrs.getState().wrapUpsBanked).toBe(0)
  })

  it('a board that cannot be dealt costs nothing — the token is not burned', () => {
    useSrs.setState({ stats: {}, wrapUpsBanked: 1 })
    useGame.getState().newWrapUpGame({ seed: 5 })
    expect(useGame.getState().game).toBeNull()
    expect(useSrs.getState().wrapUpsBanked).toBe(1)
  })

  it('a reroll re-deals on the same token', () => {
    useSrs.setState({ wrapUpsBanked: 1 })
    useGame.getState().newWrapUpGame({ seed: 5 })
    useGame.getState().rerollBoard()
    expect(useGame.getState().mode).toBe('wrapup')
    expect(useSrs.getState().wrapUpsBanked).toBe(0)
  })

  it('a won wrap-up earns no second wrap-up — they would chain forever', () => {
    useSrs.setState({ wrapUpsBanked: 1 })
    useGame.getState().newWrapUpGame({ seed: 5 })
    expect(useSrs.getState().wrapUpsBanked).toBe(0)
    finishAs('won')
    expect(useSrs.getState().wrapUpsBanked).toBe(0)
    expect(useGame.getState().earnedWrapUp).toBe(false)
  })

  it('caps the bank, and says nothing was earned once it is full', () => {
    useSrs.setState({ wrapUpsBanked: WRAP_UP_BANK_CAP })
    useGame.getState().newGame({ seed: 5 })
    finishAs('won')
    expect(useSrs.getState().wrapUpsBanked).toBe(WRAP_UP_BANK_CAP)
    expect(useGame.getState().earnedWrapUp).toBe(false)
  })

  it('the bank survives a reload — it is persisted beside the tally', () => {
    useSrs.setState({ wrapUpsBanked: 2 })
    const raw = written.get('cluecab-srs-v1')
    expect(raw).toBeDefined()
    expect(JSON.parse(raw!).state.wrapUpsBanked).toBe(2)
  })
})
