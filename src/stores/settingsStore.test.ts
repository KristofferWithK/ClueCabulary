import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_BASE_URL, DEFAULT_MODEL } from '../ai/client'
import { onPracticeCompanion } from './gameStore'
import { migrateSettings, useSettings } from './settingsStore'

/**
 * klausVerifiedAt is what tells Home the difference between "no key" and "a key
 * that has never been shown to work". Getting its invalidation wrong in either
 * direction is bad: too sticky and a broken key looks fine, too eager and the
 * player is nagged forever.
 */
const NOW = 1_700_000_000_000

describe('settingsStore: has Klaus ever answered?', () => {
  beforeEach(() => {
    useSettings.setState({
      apiKey: 'key-one',
      baseUrl: DEFAULT_BASE_URL,
      model: DEFAULT_MODEL,
      useMock: false,
      klausVerifiedAt: NOW,
    })
  })

  it('starts unverified', () => {
    useSettings.setState({ klausVerifiedAt: null })
    expect(useSettings.getState().klausVerifiedAt).toBeNull()
  })

  it.each([
    ['apiKey', { apiKey: 'key-two' }],
    ['baseUrl', { baseUrl: 'https://proxy.example.com/v1' }],
    ['model', { model: 'another-model' }],
  ])('changing the %s invalidates it', (_field, patch) => {
    useSettings.getState().set(patch)
    expect(useSettings.getState().klausVerifiedAt).toBeNull()
  })

  it.each([
    ['gridSize', { gridSize: 'standard' as const }],
    ['studyPhase', { studyPhase: 'never' as const }],
    ['clueLanguage', { clueLanguage: 'da' as const }],
  ])('changing the %s does not', (_field, patch) => {
    useSettings.getState().set(patch)
    expect(useSettings.getState().klausVerifiedAt).toBe(NOW)
  })

  it('setting a field to the value it already has is not a change', () => {
    useSettings.getState().set({ apiKey: 'key-one', model: DEFAULT_MODEL })
    expect(useSettings.getState().klausVerifiedAt).toBe(NOW)
  })

  it('markKlausVerified records the moment', () => {
    useSettings.setState({ klausVerifiedAt: null })
    useSettings.getState().markKlausVerified(NOW + 500)
    expect(useSettings.getState().klausVerifiedAt).toBe(NOW + 500)
  })

  it('a credential change after a success re-arms the nudge', () => {
    useSettings.getState().markKlausVerified(NOW)
    useSettings.getState().set({ apiKey: 'rotated' })
    expect(useSettings.getState().klausVerifiedAt).toBeNull()
    useSettings.getState().markKlausVerified(NOW + 1000)
    expect(useSettings.getState().klausVerifiedAt).toBe(NOW + 1000)
  })
})

/**
 * The board opens on Danish words and nothing else. Asked for twice: "there
 * should be no global translation at the beginning, it's cluttering it", and
 * then again once it kept happening anyway.
 *
 * Changing the default was not enough, and that is the whole point of these.
 * Settings persist, so a device that stored studyPhase before the default moved
 * kept the old value and kept opening every round with the whole board
 * translated — measured on a v1 save: study dock present, 12 of 12 glosses on
 * screen. The default is only the value a device that has never stored one gets.
 */
describe('the study phase, which the board should no longer open with', () => {
  const migrate = migrateSettings

  it('is off for anyone who has never stored a setting', () => {
    expect(useSettings.getInitialState().studyPhase).toBe('never')
  })

  it('and is turned off on a v1 save that still holds the old default', () => {
    const upgraded = migrate({ studyPhase: 'auto', apiKey: 'k' }, 1) as Record<string, unknown>
    expect(upgraded.studyPhase).toBe('never')
    // Everything else survives: this is one field, not a reset.
    expect(upgraded.apiKey).toBe('k')
  })

  it('but a deliberate "always" is left alone — it was never a default', () => {
    expect((migrate({ studyPhase: 'always' }, 1) as Record<string, unknown>).studyPhase).toBe(
      'always',
    )
  })

  it('and a v2 save is passed through untouched', () => {
    expect((migrate({ studyPhase: 'auto' }, 2) as Record<string, unknown>).studyPhase).toBe('auto')
  })

  it('survives a save with no studyPhase at all', () => {
    expect(() => migrate({ apiKey: 'k' }, 1)).not.toThrow()
    expect(() => migrate(undefined, 1)).not.toThrow()
  })
})

/**
 * "Why did it pick hvid at foster?" — one candidate answer was that the player
 * was not talking to Klaus at all. `?mock=1` writes useMock permanently into
 * persisted settings, and the practice companion ranks guesses by
 * djb2(clue + wordId): measured statistically indistinguishable from naming a
 * card at random, and at chance on greens too.
 *
 * It said nothing. The in-round note keyed on the FALLBACK flag, which is the
 * other route to the same object, and useMock additionally suppressed both of
 * Home's setup warnings — so a player with no API key and this switched on was
 * told nothing anywhere.
 */
describe('knowing when Klaus is not playing', () => {
  it('the practice companion is announced by either route to it', () => {
    useSettings.setState({ useMock: false })
    expect(onPracticeCompanion(false)).toBe(false)
    expect(onPracticeCompanion(true)).toBe(true) // fell back mid-round
    useSettings.setState({ useMock: true })
    expect(onPracticeCompanion(false)).toBe(true) // chosen in Settings, or ?mock=1
    expect(onPracticeCompanion(true)).toBe(true)
    useSettings.setState({ useMock: false })
  })
})
