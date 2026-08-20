import { beforeEach, describe, expect, it } from 'vitest'
import { useCoverage } from './coverageStore'

/**
 * The ledger side of H5. `pickStoryTargets` is pure and tested with the story
 * suite; what this file pins is the recording — what a verified story writes
 * into the store, and what it must never write.
 */
describe('coverageStore.recordStory', () => {
  beforeEach(() => {
    useCoverage.setState({ met: {} })
  })

  it('marks every inventory word the story contains, namespaced by language', () => {
    useCoverage.getState().recordStory({
      sentences: [
        { da: 'Hvis jeg ser huset, smiler jeg.', en: 'x' },
        { da: 'Jeg køber brød, fordi jeg er sulten.', en: 'x' },
      ],
    })
    const met = useCoverage.getState().met
    // The asked-for targets…
    expect(met['da:hvis']).toBe(1)
    expect(met['da:fordi']).toBe(1)
    // …and the connective tissue that came along for free. Counting it is the
    // point: words every story contains stop being picked as targets.
    expect(met['da:jeg']).toBe(1)
    expect(met['da:er']).toBe(1)
  })

  it('does not invent entries for words outside the inventory', () => {
    useCoverage.getState().recordStory({
      sentences: [
        { da: 'Huset er stort.', en: 'x' },
        { da: 'Katten sover.', en: 'x' },
      ],
    })
    const met = useCoverage.getState().met
    expect(met['da:huset']).toBeUndefined()
    expect(met['da:katten']).toBeUndefined()
    expect(met['da:er']).toBe(1)
  })

  it('counts stories, not occurrences: a word twice in one story is one story', () => {
    useCoverage.getState().recordStory({
      sentences: [
        { da: 'Jeg ser, og jeg smiler.', en: 'x' },
        { da: 'Og jeg går.', en: 'x' },
      ],
    })
    expect(useCoverage.getState().met['da:og']).toBe(1)
    expect(useCoverage.getState().met['da:jeg']).toBe(1)
  })

  it('accumulates across stories', () => {
    const s = { sentences: [{ da: 'Jeg går nu.', en: 'x' }, { da: 'Og jeg ser.', en: 'x' }] }
    useCoverage.getState().recordStory(s)
    useCoverage.getState().recordStory(s)
    expect(useCoverage.getState().met['da:jeg']).toBe(2)
  })
})
