import { useState } from 'react'
import { AiError, listModels, resolveEndpoint, testConnection } from '../../ai/client'
import { ACTIVE, setActiveLanguage } from '../../lang/active'
import { availableLanguages, hasLanguageChoice } from '../../lang/index'
import type { LanguageCode } from '../../lang/types'
import { PROVIDERS, providerFor, type Provider } from '../../ai/providers'
import { useGame } from '../../stores/gameStore'
import { useJourney } from '../../stores/journeyStore'
import type { StudyMode } from '../../journey/progress'
import { useSettings } from '../../stores/settingsStore'
import { useSrs } from '../../stores/srsStore'
import { useUi } from '../../stores/uiStore'
import { BackupPanel } from '../components/BackupPanel'
import { BuildFooter } from '../components/BuildFooter'
import { ClueLedgerPanel } from '../components/ClueLedgerPanel'
import { ConnectCluey } from '../components/ConnectCluey'

/**
 * Which language you are learning.
 *
 * Renders nothing while only one ships — see `hasLanguageChoice` for why that
 * is the choice rather than a one-entry list. Changing it reloads the app,
 * which is honest rather than lazy: the whole word list, every index, the route
 * and the map all change at once, and `src/lang/active.ts` explains why the
 * value cannot live in a store.
 *
 * Nothing is lost by switching. The collection is keyed by word id and holds
 * both languages side by side; the journey position on the language being left
 * is parked by journeyStore and comes back untouched.
 */
function LanguagePicker() {
  const languages = availableLanguages()
  if (!hasLanguageChoice()) return null
  return (
    <label className="field">
      <span>Language</span>
      <select
        value={ACTIVE.code}
        onChange={(e) => setActiveLanguage(e.target.value as LanguageCode)}
      >
        {languages.map((l) => (
          <option key={l.code} value={l.code}>
            {l.name} — {l.endonym}
          </option>
        ))}
      </select>
      <small>
        What you are learning. Switching reloads the app; your collection and both journeys are
        kept.
      </small>
    </label>
  )
}

export function SettingsScreen() {
  const goTo = useUi((s) => s.goTo)
  const settings = useSettings()
  const resetSrs = useSrs((s) => s.reset)
  const resetJourney = useJourney((s) => s.reset)
  const abandonGame = useGame((s) => s.abandonGame)
  const [test, setTest] = useState<'idle' | 'testing' | 'ok' | string>('idle')
  const [models, setModels] = useState<string[] | null>(null)
  const [modelsError, setModelsError] = useState<string | null>(null)
  const provider = providerFor(settings.baseUrl)

  // Say it while they are typing, not after a request has already carried the
  // key somewhere. A relative Base URL would post it to whatever serves the app.
  const baseUrlProblem = (() => {
    if (!settings.baseUrl.trim()) return null
    try {
      resolveEndpoint(settings.baseUrl)
      return null
    } catch (e) {
      return e instanceof AiError ? e.message : 'That Base URL cannot be used.'
    }
  })()

  // An empty model field is silently fatal: the request goes out with no model
  // and comes back a 404, which reads as "wrong endpoint". Name it here, next
  // to the box, the way the Base URL problem is named.
  const modelProblem = settings.model.trim()
    ? null
    : 'No model yet — tap “List models this server accepts” below and pick one.'

  // Ollama Cloud names its models "gpt-oss:120b-cloud" in some places and
  // "gpt-oss:120b" in others; guessing wrong returns a 404 that reads like a
  // broken setup. Ask the server which names it accepts.
  const runModels = async () => {
    setModelsError(null)
    setModels(null)
    try {
      setModels(await listModels({ baseUrl: settings.baseUrl, apiKey: settings.apiKey, model: settings.model }))
    } catch (e) {
      setModelsError(e instanceof AiError ? e.message : 'Could not list models.')
    }
  }

  // Switching service clears the model on purpose: Ollama and Gemini publish
  // conflicting ids for the same model, and a wrong one returns a 404 that
  // reads as a broken endpoint. Ask the server instead — which also means this
  // one tap is the fastest test of whether the service talks to browsers.
  const pickProvider = (p: Provider) => {
    settings.set({ baseUrl: p.baseUrl, model: '' })
    setTest('idle')
    setModels(null)
    setModelsError(null)
    void listModels({ baseUrl: p.baseUrl, apiKey: settings.apiKey, model: '' })
      .then(setModels)
      .catch((e) => setModelsError(e instanceof AiError ? e.message : 'Could not list models.'))
  }

  const runTest = async () => {
    setTest('testing')
    try {
      await testConnection({
        baseUrl: settings.baseUrl,
        apiKey: settings.apiKey,
        model: settings.model,
      })
      settings.markClueyVerified(Date.now())
      setTest('ok')
    } catch (e) {
      setTest(e instanceof AiError ? e.message : 'Connection failed.')
    }
  }

  return (
    <div className="screen settings-screen">
      <header className="screen-header">
        <button className="icon-btn" aria-label="Back" onClick={() => goTo('home')}>
          ←
        </button>
        <h1>Settings</h1>
      </header>

      {/* Settings is the one screen with more to say than a phone is tall.
          The DOCUMENT still must not scroll — this container does, under a
          header that stays put by construction. */}
      <div className="screen-scroll">
      <section className="settings-section">
        <h3>AI companion</h3>
        <ConnectCluey verified={settings.klausVerifiedAt !== null} />
        <div className="field">
          <span>Service</span>
          <div className="provider-list">
            {PROVIDERS.map((p) => (
              <button
                key={p.id}
                className={`chip${provider?.id === p.id ? ' chip-on' : ''}`}
                onClick={() => pickProvider(p)}
              >
                {p.label}
              </button>
            ))}
          </div>
          <small>{provider ? provider.note : 'A custom Base URL — your own proxy, or a local Ollama.'}</small>
        </div>
        {/* There was an API key field here, and retiring it fixed a real
            failure rather than tidying one away.

            A key typed here has always overridden the one the proxy holds, on
            purpose, so that another service could be used without a code
            change. Once the proxy became the only service, that rule turned
            into a trap: a key left behind from an older setup kept being sent,
            the proxy forwarded it in preference to its own, and the upstream
            rejected it. What the player saw mid-round was "The API key was
            rejected. Check it in Settings" — pointing at a field they had not
            touched in weeks, for a key the app no longer needs at all.

            Nothing here needs a key now: the proxy holds one, at Cloudflare,
            for everybody. */}
        <label className="field">
          <span>Base URL</span>
          <input
            type="url"
            value={settings.baseUrl}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            onChange={(e) => settings.set({ baseUrl: e.target.value })}
          />
          <small>
            Set by the button above, or type your own proxy's address plus <code>/v1</code>. Must
            start with https://, so nothing about your game travels in the clear.
          </small>
          {baseUrlProblem && <p className="test-fail">{baseUrlProblem}</p>}
        </label>
        <label className="field">
          <span>Model</span>
          <input
            type="text"
            value={settings.model}
            placeholder="tap List models below"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            onChange={(e) => settings.set({ model: e.target.value })}
          />
          {modelProblem && <p className="test-fail">{modelProblem}</p>}
          <button className="btn btn-small" disabled={!!baseUrlProblem} onClick={runModels}>
            List models this server accepts
          </button>
          {models && (
            <div className="model-list">
              {models.map((m) => (
                <button
                  key={m}
                  className={`chip${m === settings.model ? ' chip-on' : ''}`}
                  onClick={() => settings.set({ model: m })}
                >
                  {m}
                </button>
              ))}
            </div>
          )}
          {modelsError && <p className="test-fail">{modelsError}</p>}
        </label>
        <button
          className="btn"
          disabled={test === 'testing' || !!baseUrlProblem || !!modelProblem}
          onClick={runTest}
        >
          {test === 'testing' ? 'Testing…' : 'Test connection'}
        </button>
        {test === 'ok' && <p className="test-ok">✓ Connected — Casey is awake.</p>}
        {test !== 'idle' && test !== 'testing' && test !== 'ok' && (
          <p className="test-fail">{test}</p>
        )}
        <label className="field field-row">
          <input
            type="checkbox"
            checked={settings.useMock}
            onChange={(e) => settings.set({ useMock: e.target.checked })}
          />
          <span>Practice companion (offline, no AI — for trying the rules)</span>
        </label>
      </section>

      <section className="settings-section">
        <h3>Game</h3>
        {/* The Board size picker was here. One board now (N1), so there is
            nothing to choose — and the label that said "4×5 — Standard, 8
            clues" of a board with seven tokens retires with it. */}
        <LanguagePicker />

        <label className="field">
          <span>Clue language</span>
          <select
            value={settings.clueLanguage}
            onChange={(e) => settings.set({ clueLanguage: e.target.value as 'target' | 'en' })}
          >
            <option value="en">English clues (gentler)</option>
            <option value="target">{ACTIVE.name} clues (immersion)</option>
          </select>
        </label>

        <label className="field">
          <span>Study phase</span>
          <select
            value={settings.studyPhase}
            onChange={(e) => settings.set({ studyPhase: e.target.value as StudyMode })}
          >
            <option value="auto">Auto — fades after Aalborg</option>
            <option value="always">Always show translations first</option>
            <option value="never">Never — straight into the round</option>
          </select>
          <small>
            A round can open with the whole board translated. On auto it disappears once the
            journey reaches Skagen. Studying never counts as looking a word up.
          </small>
        </label>

        <div className="field">
          <label className="field field-row">
            <input
              type="checkbox"
              checked={settings.sound}
              onChange={(e) => settings.set({ sound: e.target.checked })}
            />
            <span>Say words out loud when you tap them</span>
          </label>
          <small>Nothing ever plays on its own — every sound follows a tap.</small>
        </div>

        <div className="field">
          {/* A transient re-run of the first-run flow (O1): the same train,
              the same ticket, and the done flag is not touched — so this can
              be tapped freely without re-arming the intro for every load. */}
          <button className="btn replay-intro" onClick={() => useUi.getState().startOnboarding()}>
            Replay the intro
          </button>
          <small>The train in, once more. Nothing about your progress changes.</small>
        </div>
      </section>

      <section className="settings-section">
        <h3>Your collection</h3>
        <BackupPanel />
      </section>

      <section className="settings-section">
        <h3>Casey’s clues</h3>
        <ClueLedgerPanel />
      </section>

      <section className="settings-section">
        <h3>Data</h3>
        <button
          className="btn btn-danger"
          onClick={() => {
            // The journey must reset with the words: gates passed against zero
            // collected words would be a broken state.
            if (
              window.confirm(
                `Reset all learning progress, your ${ACTIVE.name} journey, and the current game?`,
              )
            ) {
              resetSrs()
              resetJourney()
              abandonGame()
            }
          }}
        >
          Reset progress
        </button>
        <BuildFooter />
      </section>
      </div>
    </div>
  )
}
