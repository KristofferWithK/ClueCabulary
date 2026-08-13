import { beforeEach, describe, expect, it } from 'vitest'

/**
 * A field that translates any word, open during a round, is one step away from
 * being a cheat channel. Two rules stop it, and both are worth a test:
 *
 *  - looking up a BOARD word here costs exactly what tapping ⓘ costs, or the
 *    clean-guess credit and the practice scheduler can be dodged for free;
 *  - it is shut during redemption and travel exams, which are precisely the
 *    two moments the game asks you to translate the board WITHOUT a dictionary.
 */
const written = new Map<string, string>()
Object.defineProperty(globalThis, 'window', {
  configurable: true,
  value: {
    localStorage: {
      getItem: (k: string) => written.get(k) ?? null,
      setItem: (k: string, v: string) => void written.set(k, v),
      removeItem: (k: string) => void written.delete(k),
    },
  },
})

const { useGame } = await import('./gameStore')
const { useJourney } = await import('./journeyStore')
const { useSettings } = await import('./settingsStore')

describe('translating during a round', () => {
  beforeEach(() => {
    // The practice companion answers offline, so these test the store's rules
    // rather than a network.
    useSettings.setState({ useMock: true })
    useJourney.getState().reset()
    useGame.getState().abandonGame()
    useGame.getState().newGame({ seed: 5 })
    // The opening study phase shows every translation anyway, so recordLookup
    // deliberately charges nothing during it — and the box only appears in the
    // clue dock and guess bar, both of which come after. Leave it.
    useGame.getState().endStudy()
  })

  it('answers a word that is not on the board without charging a lookup', async () => {
    await useGame.getState().translate('helicopter')
    expect(useGame.getState().lookedUp).toEqual([])
  })

  it('charges a lookup for a board word, in Danish', async () => {
    const board = useGame.getState().game!.words
    await useGame.getState().translate(board[0]!.da)
    expect(useGame.getState().lookedUp).toContain(board[0]!.wordId)
  })

  it('and in English, which is the direction that would otherwise leak', async () => {
    const board = useGame.getState().game!.words
    await useGame.getState().translate(board[0]!.en[0]!)
    expect(useGame.getState().lookedUp).toContain(board[0]!.wordId)
  })

  it('charges a board word answered from the shipped dictionary too', () => {
    // The offline half must not be the cheap way to read the board. This is
    // the path the browser drive caught: local hits never reached translate().
    const board = useGame.getState().game!.words
    useGame.getState().noteLookup(board[1]!.en[0]!)
    expect(useGame.getState().lookedUp).toContain(board[1]!.wordId)
  })

  it('and charges nothing for a word that is merely in the dictionary', () => {
    const onBoard = new Set(useGame.getState().game!.words.map((w) => w.da))
    const elsewhere = ['cykel', 'kirke', 'strand', 'sne'].find((w) => !onBoard.has(w))!
    useGame.getState().noteLookup(elsewhere)
    expect(useGame.getState().lookedUp).toEqual([])
  })

  it('notes nothing while an exam is open', () => {
    const board = useGame.getState().game!.words
    useJourney.getState().startExam(0, ['a'])
    useGame.getState().noteLookup(board[0]!.da)
    expect(useGame.getState().lookedUp).toEqual([])
  })

  it('refuses while a travel exam is open', async () => {
    useJourney.getState().startExam(0, ['a', 'b'])
    await expect(useGame.getState().translate('hund')).rejects.toThrow(/closed/i)
  })

  it('refuses during the redemption challenge', async () => {
    const game = useGame.getState().game!
    useGame.setState({ game: { ...game, phase: 'redemption' } })
    await expect(useGame.getState().translate('hund')).rejects.toThrow(/closed/i)
  })

  it('charges nothing when it refuses', async () => {
    const board = useGame.getState().game!.words
    const game = useGame.getState().game!
    useGame.setState({ game: { ...game, phase: 'redemption' } })
    await useGame.getState().translate(board[0]!.da).catch(() => undefined)
    expect(useGame.getState().lookedUp).toEqual([])
  })
})

/**
 * The store actions refused during an exam all along; the component did not.
 * TranslateBox reads the shipped dictionary directly, so the offline half
 * answered the exam paper's own words — and noteLookup declines to charge
 * during an exam, so it cost nothing either. These lock the store side; the
 * component side is asserted in e2e/translate-drive.mjs, where the box has to
 * actually disappear.
 */
describe('the dictionary is closed while a paper is out', () => {
  beforeEach(() => {
    useSettings.setState({ useMock: true })
    useJourney.getState().reset()
    useGame.getState().abandonGame()
    useGame.getState().newGame({ seed: 5 })
    useGame.getState().endStudy()
  })

  it('refuses to translate a word that is on the paper', async () => {
    useJourney.getState().startExam(0, ['a', 'b'])
    await expect(useGame.getState().translate('hus')).rejects.toThrow(/closed/i)
  })

  it('refuses even with no game in progress, so leaving the round is no way round it', async () => {
    useGame.getState().abandonGame()
    useJourney.getState().startExam(0, ['a', 'b'])
    await expect(useGame.getState().translate('hus')).rejects.toThrow(/closed/i)
  })
})
