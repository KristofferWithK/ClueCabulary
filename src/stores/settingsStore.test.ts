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

describe('settingsStore: has Casey ever answered?', () => {
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
    ['clueLanguage', { clueLanguage: 'target' as const }],
  ])('changing the %s does not', (_field, patch) => {
    useSettings.getState().set(patch)
    expect(useSettings.getState().klausVerifiedAt).toBe(NOW)
  })

  it('setting a field to the value it already has is not a change', () => {
    useSettings.getState().set({ apiKey: 'key-one', model: DEFAULT_MODEL })
    expect(useSettings.getState().klausVerifiedAt).toBe(NOW)
  })

  it('markClueyVerified records the moment', () => {
    useSettings.setState({ klausVerifiedAt: null })
    useSettings.getState().markClueyVerified(NOW + 500)
    expect(useSettings.getState().klausVerifiedAt).toBe(NOW + 500)
  })

  it('a credential change after a success re-arms the nudge', () => {
    useSettings.getState().markClueyVerified(NOW)
    useSettings.getState().set({ apiKey: 'rotated' })
    expect(useSettings.getState().klausVerifiedAt).toBeNull()
    useSettings.getState().markClueyVerified(NOW + 1000)
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
    const upgraded = migrate({ studyPhase: 'auto', gridSize: 'standard' }, 1) as Record<
      string,
      unknown
    >
    expect(upgraded.studyPhase).toBe('never')
    // Everything else survives: this is one field, not a reset. (The API key
    // is the exception, and only because v7 retires it outright.)
    expect(upgraded.gridSize).toBe('standard')
  })

  it('but a deliberate "always" is left alone — it was never a default', () => {
    expect((migrate({ studyPhase: 'always' }, 1) as Record<string, unknown>).studyPhase).toBe(
      'always',
    )
  })

  it('and a v2 save keeps its study phase', () => {
    expect((migrate({ studyPhase: 'auto' }, 2) as Record<string, unknown>).studyPhase).toBe('auto')
  })

  it('survives a save with no studyPhase at all', () => {
    expect(() => migrate({ apiKey: 'k' }, 1)).not.toThrow()
    expect(() => migrate(undefined, 1)).not.toThrow()
  })
})

/**
 * "Why did it pick hvid at foster?" — one candidate answer was that the player
 * was not talking to Casey at all. `?mock=1` writes useMock permanently into
 * persisted settings, and the practice companion ranks guesses by
 * djb2(clue + wordId): measured statistically indistinguishable from naming a
 * card at random, and at chance on greens too.
 *
 * It said nothing. The in-round note keyed on the FALLBACK flag, which is the
 * other route to the same object, and useMock additionally suppressed both of
 * Home's setup warnings — so a player with no API key and this switched on was
 * told nothing anywhere.
 */
describe('knowing when Casey is not playing', () => {
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


/**
 * "Also the clues Cluey sends should be in danish as well." (Said before the
 * rename; Casey is the same suitcase.)
 *
 * The clue dock has always asked the PLAYER for "ét dansk ord"; this setting
 * governed only Casey's own clues, and its default had him answering in English
 * on a Danish board. Same shape of trap as the study phase: moving the default
 * does nothing for a device that already stored one, which is every device that
 * has ever opened Settings.
 */
describe('which language Casey clues in', () => {
  const migrate = migrateSettings

  it('is Danish for anyone who has never stored a setting', () => {
    expect(useSettings.getInitialState().clueLanguage).toBe('target')
  })

  it('and is switched to Danish on a save that still holds the old default', () => {
    expect((migrate({ clueLanguage: 'en' }, 2) as Record<string, unknown>).clueLanguage).toBe('target')
    expect((migrate({ clueLanguage: 'en' }, 1) as Record<string, unknown>).clueLanguage).toBe('target')
  })

  it('a v3 save keeps its clue language, whatever it holds', () => {
    expect((migrate({ clueLanguage: 'en' }, 3) as Record<string, unknown>).clueLanguage).toBe('en')
  })

  it('and the v1 study-phase fix still happens on the way past', () => {
    const up = migrate({ studyPhase: 'auto', clueLanguage: 'en' }, 1) as Record<string, unknown>
    expect(up).toMatchObject({ studyPhase: 'never', clueLanguage: 'target' })
  })
})

/**
 * "3x5 grid is now the default."
 *
 * Third time this exact trap has been laid: settings persist, so the default is
 * only what a device that has never stored one gets, and this store has no
 * partialize — every save ever written carries a gridSize whether the player
 * touched the picker or not. Moving the default alone would have left every
 * existing device dealing 3x4 from Play forever.
 *
 * Unlike the study phase, the old value cannot be told apart from a deliberate
 * choice of it, so this migration moves everyone. That is a decision, recorded
 * here rather than discovered later: 3x4 is one tap away on Home and the tap
 * sticks, whereas not moving means the board that was asked for never arrives.
 */
describe('which board Play deals', () => {
  const migrate = migrateSettings

  it('is 3x5 for anyone who has never stored a setting', () => {
    expect(useSettings.getInitialState().gridSize).toBe('middle')
  })

  it.each([1, 2, 3])('and a v%i save holding the old default is moved to it', (from) => {
    expect((migrate({ gridSize: 'beginner' }, from) as Record<string, unknown>).gridSize).toBe(
      'middle',
    )
  })

  it('a deliberate 4x5 survives — it was never a default', () => {
    expect((migrate({ gridSize: 'standard' }, 3) as Record<string, unknown>).gridSize).toBe(
      'standard',
    )
  })

  it('a v4 save is left alone entirely', () => {
    expect((migrate({ gridSize: 'beginner' }, 4) as Record<string, unknown>).gridSize).toBe(
      'beginner',
    )
  })

  it('and every other field survives the trip', () => {
    // Not the model: a save with no Base URL is one the v5 rule moves to the
    // proxy, and the model comes along with the server it belongs to.
    const up = migrate({ gridSize: 'beginner', clueLanguage: 'da', studyPhase: 'never' }, 3) as Record<
      string,
      unknown
    >
    expect(up).toMatchObject({ gridSize: 'middle', clueLanguage: 'target', studyPhase: 'never' })
  })

  it('survives a save with no gridSize at all', () => {
    expect((migrate({ apiKey: 'k' }, 1) as Record<string, unknown>).gridSize).toBeUndefined()
  })
})

/**
 * Casey answers a fresh install with no key typed anywhere.
 *
 * The proxy holds the key as a Cloudflare secret, so the default Base URL now
 * points at it. Fourth outing of the persisted-default trap — and the first
 * where the old value CAN be told apart from a deliberate choice: a save
 * holding the Gemini default with an empty key has never had a working Casey
 * and could not have, because the build bundles no key and Gemini direct
 * answers nothing without one. That group is pure gain to move. A typed key or
 * a hand-entered Base URL is a decision, possibly on a paid account, and
 * survives untouched.
 */
describe('which server a device talks to', () => {
  const migrate = migrateSettings
  const GEMINI_DIRECT = 'https://generativelanguage.googleapis.com/v1beta/openai'

  it('is the proxy for anyone who has never stored a setting', () => {
    expect(useSettings.getInitialState().baseUrl).toBe(DEFAULT_BASE_URL)
    expect(useSettings.getInitialState().model).toBe(DEFAULT_MODEL)
    expect(useSettings.getInitialState().apiKey).toBe('')
  })

  it.each([1, 2, 3, 4])('and a v%i save that never had a key is moved to it', (from) => {
    const up = migrate({ baseUrl: GEMINI_DIRECT, apiKey: '', model: '' }, from) as Record<
      string,
      unknown
    >
    expect(up).toMatchObject({ baseUrl: DEFAULT_BASE_URL, model: DEFAULT_MODEL })
  })

  it('a save with no baseUrl at all is moved too — same position, older shape', () => {
    const up = migrate({ apiKey: '' }, 3) as Record<string, unknown>
    expect(up.baseUrl).toBe(DEFAULT_BASE_URL)
  })

  it('but a typed key means the server was a decision, and that survives', () => {
    // The key itself does not: v7 retires it. What a typed key still proves is
    // that this device chose where to talk to, so the Base URL is not moved.
    const up = migrate({ baseUrl: GEMINI_DIRECT, apiKey: 'their-own-key' }, 4) as Record<
      string,
      unknown
    >
    expect(up.baseUrl).toBe(GEMINI_DIRECT)
  })

  it('and so is a Base URL somebody typed themselves', () => {
    const up = migrate({ baseUrl: 'https://my-own-proxy.example.com/v1', apiKey: '' }, 4) as Record<
      string,
      unknown
    >
    expect(up.baseUrl).toBe('https://my-own-proxy.example.com/v1')
    expect(up.model).toBeUndefined()
  })

  it('a whitespace key counts as no key', () => {
    const up = migrate({ baseUrl: GEMINI_DIRECT, apiKey: '   ' }, 4) as Record<string, unknown>
    expect(up.baseUrl).toBe(DEFAULT_BASE_URL)
  })

  it('a trailing slash does not hide the old default', () => {
    const up = migrate({ baseUrl: `${GEMINI_DIRECT}/`, apiKey: '' }, 4) as Record<string, unknown>
    expect(up.baseUrl).toBe(DEFAULT_BASE_URL)
  })

  /**
   * v8 -> v9: the stored 'da' stops naming Danish.
   *
   * The value always meant "clue me in the language I am learning" and only
   * happened to be spelled 'da'. With a language seam under it, a German
   * player's saved 'da' would have read as a request for Danish clues and the
   * prompt would have obliged, so every save is rewritten.
   */
  it('rewrites the clue language from da to target, and leaves en alone', () => {
    expect((migrate({ clueLanguage: 'da' }, 8) as Record<string, unknown>).clueLanguage).toBe(
      'target',
    )
    expect((migrate({ clueLanguage: 'en' }, 8) as Record<string, unknown>).clueLanguage).toBe('en')
  })

  it('does not touch a save that is already v9', () => {
    const at9 = { clueLanguage: 'en', sound: false, gridSize: 'beginner' }
    expect(migrate(at9, 9)).toBe(at9)
  })

  it('changes nothing else about a v8 save while renaming it', () => {
    const v8 = {
      clueLanguage: 'da',
      gridSize: 'beginner',
      studyPhase: 'always',
      sound: false,
      baseUrl: 'https://example.test/v1',
      model: 'mine',
      apiKey: '',
    }
    const up = migrate(v8, 8) as Record<string, unknown>
    expect(up).toEqual({ ...v8, clueLanguage: 'target' })
  })

  it('a v6 save is left alone entirely', () => {
    const up = migrate({ baseUrl: GEMINI_DIRECT, apiKey: '' }, 6) as Record<string, unknown>
    expect(up.baseUrl).toBe(GEMINI_DIRECT)
  })

  it('and the older fixes still happen on the way past', () => {
    const up = migrate({ studyPhase: 'auto', clueLanguage: 'en', gridSize: 'beginner' }, 1) as Record<
      string,
      unknown
    >
    expect(up).toMatchObject({
      studyPhase: 'never',
      // v3 rewrites 'en' to 'da' and v9 rewrites 'da' to 'target', so the two
      // compose on the way past rather than one undoing the other. That is the
      // whole reason this case is here.
      clueLanguage: 'target',
      gridSize: 'middle',
      baseUrl: DEFAULT_BASE_URL,
    })
  })
})

/**
 * Casey's brain stops being named in the bundle.
 *
 * "cluey" is an alias the proxy resolves (MODEL_ALIASES in
 * proxy/wrangler.toml), so which model actually answers is a proxy deploy
 * rather than an app release every phone has to notice — and a model id
 * retired upstream gets fixed in one place instead of breaking every install.
 *
 * The fifth outing of the persisted-default trap, and the narrowest: only the
 * exact pair the previous migration itself wrote is moved. A model somebody
 * picked from the Settings list is a decision, and "cluey" is a name no other
 * service has heard of, so overwriting a pick with it would take the pick away.
 */
describe('the model name, once the proxy resolves it', () => {
  const migrate = migrateSettings

  it('is the alias for anyone who has never stored a setting', () => {
    expect(useSettings.getInitialState().model).toBe('cluey')
  })

  it('moves the exact pair the previous migration wrote', () => {
    const up = migrate({ baseUrl: DEFAULT_BASE_URL, model: 'gpt-oss:120b' }, 5) as Record<
      string,
      unknown
    >
    expect(up.model).toBe('cluey')
  })

  it('and does so from every older version too', () => {
    for (const from of [1, 2, 3, 4]) {
      const up = migrate({ baseUrl: DEFAULT_BASE_URL, model: 'gpt-oss:120b' }, from) as Record<
        string,
        unknown
      >
      expect(up.model).toBe('cluey')
    }
  })

  it('leaves a model picked from the list alone, proxy or not', () => {
    const up = migrate({ baseUrl: DEFAULT_BASE_URL, model: 'mistral-large-3:675b' }, 5) as Record<
      string,
      unknown
    >
    expect(up.model).toBe('mistral-large-3:675b')
  })

  it('and does not send the alias to a service that never heard of it', () => {
    const up = migrate({ baseUrl: 'https://ollama.com/v1', model: 'gpt-oss:120b' }, 5) as Record<
      string,
      unknown
    >
    expect(up.model).toBe('gpt-oss:120b')
  })

  it('a v7 save keeps whatever it holds', () => {
    const up = migrate({ baseUrl: DEFAULT_BASE_URL, model: 'gpt-oss:120b' }, 7) as Record<
      string,
      unknown
    >
    expect(up.model).toBe('gpt-oss:120b')
  })
})

/**
 * The API key, retired — and a stale one cleared out with it.
 *
 * A key typed in an older build overrides the one the proxy holds. That was
 * deliberate, so another service could be used without a code change, and it
 * is why the v5 migration treated a typed key as a decision and left it alone.
 * For a key that had since been revoked, "left alone" meant it kept being
 * sent, kept being forwarded ahead of the proxy's own, and kept coming back
 * rejected — mid-round, pointing the player at a Settings field for a key the
 * app no longer needs. Observed on a real phone.
 */
describe('the API key, now that nothing asks for one', () => {
  const migrate = migrateSettings

  it('is empty for anyone who has never stored a setting', () => {
    expect(useSettings.getInitialState().apiKey).toBe('')
  })

  it.each([1, 2, 3, 4, 5, 6])('and is cleared out of a v%i save', (from) => {
    const up = migrate({ apiKey: 'a-revoked-key', baseUrl: DEFAULT_BASE_URL }, from) as Record<
      string,
      unknown
    >
    expect(up.apiKey).toBe('')
  })

  it('including one pointing somewhere else entirely', () => {
    const up = migrate({ apiKey: 'k', baseUrl: 'https://my-own.example/v1' }, 6) as Record<
      string,
      unknown
    >
    expect(up.apiKey).toBe('')
    // Their endpoint is still their decision; only the credential goes.
    expect(up.baseUrl).toBe('https://my-own.example/v1')
  })

  it('and a v7 save is not touched again', () => {
    const up = migrate({ apiKey: 'still-here' }, 7) as Record<string, unknown>
    expect(up.apiKey).toBe('still-here')
  })
})

/**
 * The sound switch, and the fifth outing of the trap CLAUDE.md records three
 * times — with the sign flipped, which is the only reason it is one line.
 *
 * The previous four were defaults that MOVED and left every existing device on
 * the old value. This one is a field that did not exist: no blob written before
 * it carries `sound`, this store has no partialize so every blob overwrites the
 * whole state, and an old save restoring `sound: undefined` over the default
 * would come up silent. The default and the migration have to agree, and the
 * migration is what actually reaches an existing phone.
 */
describe('the sound switch', () => {
  const migrate = migrateSettings

  it('is on for a device that has never stored a setting', () => {
    expect(useSettings.getInitialState().sound).toBe(true)
  })

  it.each([1, 2, 3, 4, 5, 6, 7])('and is written into a v%i save that predates it', (from) => {
    const up = migrate({ apiKey: '' }, from) as Record<string, unknown>
    expect(up.sound).toBe(true)
  })

  it('but a v8 save that turned it off stays off', () => {
    const up = migrate({ sound: false }, 8) as Record<string, unknown>
    expect(up.sound).toBe(false)
  })
})
