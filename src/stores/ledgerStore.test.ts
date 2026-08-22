import { beforeEach, describe, expect, it } from 'vitest'

/**
 * The clue ledger (E4): what it counts, and the two things it must not do.
 *
 * zustand resolves its storage once, at first import, so the stand-in has to be
 * in place before the store module loads — hence the dynamic imports, the same
 * shape `gameStore.test.ts` uses.
 */
const written = new Map<string, string>()
const storage = {
  getItem: (k: string) => written.get(k) ?? null,
  setItem: (k: string, v: string) => void written.set(k, v),
  removeItem: (k: string) => void written.delete(k),
}
Object.defineProperty(globalThis, 'window', {
  configurable: true,
  value: { localStorage: storage },
})
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage })

const { readLedger, useLedger } = await import('./ledgerStore')
const { useGame } = await import('./gameStore')
const { BOARD } = await import('../engine/config')
const { applyEvent, createGame, targetableGreenIds } = await import('../engine/game')
const { danish } = await import('../lang/da')
const { WORDS } = await import('../data/words')
const { wordsForCity } = await import('../journey/progress')

describe('the clue ledger counts per arm', () => {
  beforeEach(() => useLedger.getState().clear())

  it('sums a clue at a time and keeps the arms apart', () => {
    const { record } = useLedger.getState()
    record({ number: 2, hits: 2, arm: 'engine', refused: false })
    record({ number: 3, hits: 1, arm: 'engine', refused: false })
    record({ number: 2, hits: 1, arm: 'cluey', refused: true })

    const rows = readLedger(useLedger.getState().arms)
    const engine = rows.find((r) => r.arm === 'engine')!
    expect(engine.tally).toEqual({ clues: 2, asked: 5, hits: 3, refused: 0 })
    expect(engine.hitsPerNumber).toBeCloseTo(0.6)
    expect(engine.refusalRate).toBe(0)

    const cluey = rows.find((r) => r.arm === 'cluey')!
    expect(cluey.tally).toEqual({ clues: 1, asked: 2, hits: 1, refused: 1 })
    // `r`, at last given a value by something other than a guess.
    expect(cluey.refusalRate).toBe(1)
  })

  it('reads busiest first, so the arm the player is actually on leads', () => {
    const { record } = useLedger.getState()
    record({ number: 1, hits: 1, arm: 'rare', refused: false })
    for (let i = 0; i < 3; i++) record({ number: 1, hits: 0, arm: 'busy', refused: false })
    expect(readLedger(useLedger.getState().arms).map((r) => r.arm)).toEqual(['busy', 'rare'])
  })

  it('says nothing rather than zero for an arm that has been asked nothing', () => {
    // Not reachable through `record`, but `readLedger` is exported and pure and
    // a caller may hand it whatever a future migration leaves behind.
    const [row] = readLedger({ ghost: { clues: 0, asked: 0, hits: 0, refused: 0 } })
    expect(row!.hitsPerNumber).toBeNull()
    expect(row!.refusalRate).toBeNull()
  })

  /**
   * The owner declined "a ledger schema designed as future training data"
   * (docs/clue-engine.md §3). Four integers and an arm name cannot become a
   * corpus by accident, and this is the pin that keeps it that way: if a clue's
   * TEXT or a word ID ever reaches this store, that decision has been reversed
   * without anybody saying so.
   */
  it('holds four numbers and a name, and never a clue or a word', () => {
    useLedger.getState().record({ number: 2, hits: 1, arm: 'cluey', refused: false })
    const saved = written.get('cluecab-ledger-v1')!
    expect(saved).not.toMatch(/da:/)
    expect(Object.keys(useLedger.getState().arms['cluey']!).sort()).toEqual([
      'asked',
      'clues',
      'hits',
      'refused',
    ])
  })

  it('is a counter, not a log — a hundred clues do not grow it', () => {
    const { record } = useLedger.getState()
    for (let i = 0; i < 100; i++) record({ number: 2, hits: 1, arm: 'cluey', refused: i % 4 === 0 })
    expect(Object.keys(useLedger.getState().arms)).toEqual(['cluey'])
    expect(useLedger.getState().arms['cluey']!.clues).toBe(100)
    expect(readLedger(useLedger.getState().arms)[0]!.refusalRate).toBe(0.25)
  })
})

/**
 * And the half that a store test cannot reach on its own: the wiring.
 *
 * Several bugs in this repo have been true in the module and false in the app,
 * so the rows below are driven through `gameStore`'s own `playerStop` /
 * `playerGuess`, on a real board, exactly as a thumb would.
 * `pendingClueArm` is what `runAiClue` sets; everything after it is the code
 * under test.
 */
describe('gameStore writes the ledger when a turn under Casey ends', () => {
  const board = wordsForCity(WORDS, 0)
    .slice(0, BOARD.totalWords)
    .map((w) => ({ wordId: w.id, da: w.da, en: [...w.en], pos: w.pos }))

  /** A round parked in playerGuessing under one of Casey's clues. */
  const underCaseysClue = (seed: number) => {
    let s = createGame({ config: BOARD, words: board, seed })
    if (s.phase === 'playerClueInput') {
      // The deal decides who clues first; play out the player's turn when it is
      // theirs so the fixture is the same either way. A turn cannot be stopped
      // before a guess, so Casey names one of the player's own greens.
      s = applyEvent(s, { type: 'SUBMIT_CLUE', by: 'player', text: 'klods', number: 1 }, danish)
      s = applyEvent(s, { type: 'GUESS', wordId: targetableGreenIds(s, 'player')[0]! }, danish)
      if (s.phase === 'aiGuessing') s = applyEvent(s, { type: 'STOP_GUESSING' }, danish)
    }
    const targets = targetableGreenIds(s, 'ai').slice(0, 3)
    return applyEvent(
      s,
      { type: 'SUBMIT_CLUE', by: 'ai', text: 'klods', number: targets.length, targets },
      danish,
    )
  }

  beforeEach(() => {
    useLedger.getState().clear()
    useGame.getState().abandonGame()
  })

  it('records the number, the greens found, and the arm that gave it', () => {
    const game = underCaseysClue(7)
    const number = game.clueHistory[game.clueHistory.length - 1]!.number
    const green = targetableGreenIds(game, 'ai')[0]!
    useGame.setState({ game, pendingClueArm: { arm: 'cluey', refused: true } })

    useGame.getState().playerGuess(green)
    useGame.getState().playerStop()

    const row = readLedger(useLedger.getState().arms)[0]!
    expect(row.arm).toBe('cluey')
    expect(row.tally).toEqual({ clues: 1, asked: number, hits: 1, refused: 1 })
    // Written once, and the arm is spent: a second stop must not double-count.
    expect(useGame.getState().pendingClueArm).toBeNull()
  })

  it('writes nothing under the PLAYER own clue — there is no arm to credit', () => {
    let s = createGame({ config: BOARD, words: board, seed: 11 })
    if (s.phase === 'aiClueInput') {
      const targets = targetableGreenIds(s, 'ai').slice(0, 1)
      s = applyEvent(s, { type: 'SUBMIT_CLUE', by: 'ai', text: 'klods', number: 1, targets }, danish)
      s = applyEvent(s, { type: 'GUESS', wordId: targets[0]! }, danish)
      if (s.phase === 'playerGuessing') s = applyEvent(s, { type: 'STOP_GUESSING' }, danish)
    }
    s = applyEvent(s, { type: 'SUBMIT_CLUE', by: 'player', text: 'klods', number: 1 }, danish)
    // The player clued, so this is Casey guessing — not a turn the ledger owns.
    useGame.setState({ game: s, pendingClueArm: { arm: 'cluey', refused: false } })
    useGame.getState().playerStop()
    expect(readLedger(useLedger.getState().arms)).toEqual([])
  })

  it('writes nothing when no arm was recorded, rather than guessing one', () => {
    const game = underCaseysClue(13)
    useGame.setState({ game, pendingClueArm: null })
    useGame.getState().playerGuess(targetableGreenIds(game, 'ai')[0]!)
    useGame.getState().playerStop()
    expect(readLedger(useLedger.getState().arms)).toEqual([])
  })
})
