import { beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_BASE_URL, DEFAULT_MODEL } from '../ai/client'
import { useSettings } from './settingsStore'

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
