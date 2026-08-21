import { describe, expect, it } from 'vitest'
import { HINT_KEYS, markHintSeen, shouldShowHint } from './hints'

/**
 * The first-encounter flags (O4). The drive proves each line appears exactly
 * once in the real app; this pins the decision half, injectable storage the
 * flow.ts way. Mutation-checked when written: with markHintSeen writing a
 * different key than it was given, 'never again once seen' fails.
 */

const fakeStorage = () => {
  const m = new Map<string, string>()
  return {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => void m.set(k, v),
  }
}

const throwing = {
  getItem: (): string | null => {
    throw new Error('private mode')
  },
  setItem: (): void => {
    throw new Error('private mode')
  },
}

describe('first-encounter hints', () => {
  it('shows on a device that has never seen the line', () => {
    expect(shouldShowHint(HINT_KEYS.clue, fakeStorage())).toBe(true)
  })

  it('never again once seen', () => {
    const s = fakeStorage()
    markHintSeen(HINT_KEYS.clue, s)
    expect(shouldShowHint(HINT_KEYS.clue, s)).toBe(false)
  })

  it('the two flags are independent', () => {
    const s = fakeStorage()
    markHintSeen(HINT_KEYS.clue, s)
    expect(shouldShowHint(HINT_KEYS.guess, s)).toBe(true)
  })

  it('storage that throws means quiet, not a hint forever', () => {
    // A private-mode device can never record "seen", so showing once would
    // mean showing every round. The trade is pinned: no storage, no hint.
    expect(shouldShowHint(HINT_KEYS.clue, throwing)).toBe(false)
    expect(() => markHintSeen(HINT_KEYS.clue, throwing)).not.toThrow()
  })

  it('no storage at all means no hint', () => {
    expect(shouldShowHint(HINT_KEYS.clue, undefined)).toBe(false)
  })

  it('the flags carry the cluecab- prefix every stored key here carries', () => {
    for (const key of Object.values(HINT_KEYS)) expect(key).toMatch(/^cluecab-hint-/)
  })
})
