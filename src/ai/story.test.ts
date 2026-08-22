import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AiSettings } from './client'
import { OllamaCompanion, storyProblem, storyTokens } from './companion'
import { MockCompanion } from './mock/mockCompanion'
import { buildStoryView, type StoryView } from './projections'
import { buildStoryPrompt } from './prompts'
import { StoryResponseSchema, type StoryResponse } from './schemas'
import type { ChatMessage } from './prompts'
import { BOARD } from '../engine/config'
import { createGame } from '../engine/game'
import type { BoardWord, CardRole } from '../engine/types'
import { danish } from '../lang/da'
import { pickStoryTargets } from '../stores/coverageStore'

const settings: AiSettings = { baseUrl: 'http://x', apiKey: 'k', model: 'm' }

const view: StoryView = {
  kind: 'story',
  words: [
    { da: 'hus', en: ['house'], pos: 'noun' },
    { da: 'købe', en: ['to buy'], pos: 'verb' },
  ],
  targets: ['hvis', 'fordi'],
}

const story = (...da: string[]): StoryResponse => ({
  sentences: da.map((s) => ({ da: s, en: 'x' })),
})

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => {
  vi.restoreAllMocks()
})

describe('storyProblem — what the tracker is allowed to record', () => {
  it('accepts a story containing every target and every word, inflected', () => {
    // «huset» is hus doing its job; «køber» is købe's present tense. Both must
    // count, or the check teaches the model to write unnaturally bare Danish.
    const s = story('Hvis jeg ser huset, smiler jeg.', 'Jeg køber brød, fordi jeg er sulten.')
    expect(storyProblem(s, view)).toBeNull()
  })

  /**
   * THE MUTATION CHECK for this feature. The ledger records what a story was
   * verified to contain — a reply that merely claims «hvis» must be refused,
   * or the coverage numbers become fiction. Checked to fail without the fix:
   * with the missing-target branch of storyProblem disabled, this test is the
   * one that goes red.
   */
  it('refuses a story missing a target, naming it', () => {
    const s = story('Jeg ser huset.', 'Jeg køber brød, fordi jeg er sulten.')
    expect(storyProblem(s, view)).toContain('«hvis»')
  })

  it('refuses a story that skipped a round word', () => {
    const s = story('Hvis jeg ser huset, smiler jeg.', 'Fordi det er godt.')
    expect(storyProblem(s, view)).toContain('«købe»')
  })

  it('matches targets whole-token, not as substrings', () => {
    // «hvisker» (whispers) contains "hvis" but is not the conjunction; a
    // substring match would record the word as taught by a story that never
    // used it.
    const s = story('Hun hvisker i huset.', 'Jeg køber brød, fordi jeg er sulten.')
    expect(storyProblem(s, view)).toContain('«hvis»')
  })

  it('tokenizes across Danish letters and punctuation', () => {
    expect(storyTokens('Hvis — jeg køber, siger han: «gør det!»')).toEqual([
      'hvis',
      'jeg',
      'køber',
      'siger',
      'han',
      'gør',
      'det',
    ])
  })
})

describe('the story schema', () => {
  it('rejects one sentence and five, accepts two to four', () => {
    expect(StoryResponseSchema.safeParse(story('En.')).success).toBe(false)
    expect(StoryResponseSchema.safeParse(story('En.', 'To.')).success).toBe(true)
    expect(StoryResponseSchema.safeParse(story('En.', 'To.', 'Tre.', 'Fire.')).success).toBe(true)
    expect(StoryResponseSchema.safeParse(story('1.', '2.', '3.', '4.', '5.')).success).toBe(false)
  })
})

describe('the story prompt', () => {
  it('carries the two machine-readable list lines the fake server parses', () => {
    const text = buildStoryPrompt(view, danish)
      .map((m) => m.content)
      .join('\n')
    expect(text).toMatch(/^WORDS TO WEAVE IN: hus \(house\), købe \(to buy\)$/m)
    expect(text).toMatch(/^SMALL WORDS TO INCLUDE: hvis, fordi$/m)
  })
})

describe('getStory', () => {
  const chatOf = (...replies: unknown[]) => {
    const opts: unknown[] = []
    let i = 0
    const chat = async (_s: AiSettings, _m: ChatMessage[], o?: unknown) => {
      opts.push(o)
      if (i >= replies.length) throw new Error('unexpected extra AI call')
      return replies[i++]
    }
    return { chat, opts }
  }

  it('rejects a target-less reply and takes the corrected one — escalated', async () => {
    const bad = story('Jeg ser huset.', 'Jeg køber brød.')
    const good = story('Hvis jeg ser huset, smiler jeg.', 'Jeg køber brød, fordi jeg er sulten.')
    const { chat, opts } = chatOf(bad, good)
    const res = await new OllamaCompanion(settings, chat).getStory(view)
    expect(res).toEqual(good)
    // The retry is the cascade: same contract as every other call in the file.
    expect((opts[0] as { escalate: boolean }).escalate).toBe(false)
    expect((opts[1] as { escalate: boolean }).escalate).toBe(true)
  })

  it("the mock's story passes the same verification the real one must", async () => {
    const res = await new MockCompanion().getStory(view)
    expect(storyProblem(res, view)).toBeNull()
  })
})

describe('buildStoryView — the firewall holds after the round too', () => {
  it('is byte-identical under a permutation of both keys', () => {
    const words: BoardWord[] = Array.from({ length: BOARD.totalWords }, (_, i) => ({
      wordId: `w${i}`,
      da: `ord${i}`,
      en: [`gloss${i}`],
      pos: 'noun',
    }))
    const state = createGame({ config: BOARD, words, seed: 7, firstGiver: 'player' })
    const swap = (key: Record<string, CardRole>): Record<string, CardRole> => {
      const ids = Object.keys(key)
      const out = { ...key }
      out[ids[0]!] = key[ids[1]!]!
      out[ids[1]!] = key[ids[0]!]!
      return out
    }
    const permuted = { ...state, playerKey: swap(state.playerKey), aiKey: swap(state.aiKey) }
    const a = buildStoryView(state, ['w2', 'w5'], ['hvis'])
    const b = buildStoryView(permuted, ['w2', 'w5'], ['hvis'])
    expect(JSON.stringify(buildStoryPrompt(a, danish))).toBe(
      JSON.stringify(buildStoryPrompt(b, danish)),
    )
    // And nothing key-shaped is in the view at all.
    expect(JSON.stringify(a)).not.toMatch(/key|reveal|green|bystander/i)
  })
})

describe('pickStoryTargets', () => {
  it('starts at the measured hole: the never-met conjunctions, in listed order', () => {
    expect(pickStoryTargets({}, 3, danish)).toEqual(['hvis', 'fordi', 'selvom'])
  })

  it('moves past what stories have already delivered', () => {
    const met = { 'da:hvis': 1, 'da:selvom': 2 }
    expect(pickStoryTargets(met, 3, danish)).toEqual(['fordi', 'mens', 'eller'])
  })

  it('prefers the less-met over the more-met once everything has appeared', () => {
    const met: Record<string, number> = {}
    for (const cls of Object.values(danish.functionWords))
      for (const w of cls) met[`da:${w}`] = 5
    met['da:pludselig'] = 1
    expect(pickStoryTargets(met, 1, danish)).toEqual(['pludselig'])
  })
})
