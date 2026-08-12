import { useState } from 'react'
import { AiError, DEFAULT_MODEL, listModels, resolveEndpoint, testConnection } from '../../ai/client'
import { useGame } from '../../stores/gameStore'
import { useJourney } from '../../stores/journeyStore'
import type { StudyMode } from '../../journey/progress'
import { useSettings } from '../../stores/settingsStore'
import { useSrs } from '../../stores/srsStore'
import { useUi } from '../../stores/uiStore'
import { BackupPanel } from '../components/BackupPanel'
import { BuildFooter } from '../components/BuildFooter'
import { ConnectKlaus } from '../components/ConnectKlaus'

export function SettingsScreen() {
  const goTo = useUi((s) => s.goTo)
  const settings = useSettings()
  const resetSrs = useSrs((s) => s.reset)
  const resetJourney = useJourney((s) => s.reset)
  const abandonGame = useGame((s) => s.abandonGame)
  const [test, setTest] = useState<'idle' | 'testing' | 'ok' | string>('idle')
  const [models, setModels] = useState<string[] | null>(null)
  const [modelsError, setModelsError] = useState<string | null>(null)

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
    : `No model. Type one, or tap “List models this server accepts”. The usual default is ${DEFAULT_MODEL}.`

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

  const runTest = async () => {
    setTest('testing')
    try {
      await testConnection({
        baseUrl: settings.baseUrl,
        apiKey: settings.apiKey,
        model: settings.model,
      })
      settings.markKlausVerified(Date.now())
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

      <section className="settings-section">
        <h3>AI companion</h3>
        <ConnectKlaus verified={settings.klausVerifiedAt !== null} />
        <label className="field">
          <span>Ollama API key</span>
          <input
            type="password"
            value={settings.apiKey}
            placeholder="paste your key from ollama.com/settings/keys"
            autoComplete="off"
            onChange={(e) => settings.set({ apiKey: e.target.value })}
          />
          <small>Stored only on this device, sent only to the Base URL below.</small>
        </label>
        <label className="field">
          <span>Base URL</span>
          <input
            type="url"
            value={settings.baseUrl}
            onChange={(e) => settings.set({ baseUrl: e.target.value })}
          />
          <small>
            Your proxy's address plus <code>/v1</code>, or{' '}
            <code>https://ollama.com/v1</code> to try the cloud directly. Must start with
            https://, since your API key is sent to it.
          </small>
          {baseUrlProblem && <p className="test-fail">{baseUrlProblem}</p>}
        </label>
        <label className="field">
          <span>Model</span>
          <input
            type="text"
            value={settings.model}
            placeholder={DEFAULT_MODEL}
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
        {test === 'ok' && <p className="test-ok">✓ Connected — Klaus is awake.</p>}
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
        <label className="field">
          <span>Clue language</span>
          <select
            value={settings.clueLanguage}
            onChange={(e) => settings.set({ clueLanguage: e.target.value as 'da' | 'en' })}
          >
            <option value="en">English clues (gentler)</option>
            <option value="da">Danish clues (immersion)</option>
          </select>
        </label>

        <label className="field">
          <span>Study phase</span>
          <select
            value={settings.studyPhase}
            onChange={(e) => settings.set({ studyPhase: e.target.value as StudyMode })}
          >
            <option value="auto">Auto — fades after Viborg</option>
            <option value="always">Always show translations first</option>
            <option value="never">Never — straight into the round</option>
          </select>
          <small>
            A round can open with the whole board translated. On auto it disappears once the
            journey turns north at Aalborg. Studying never counts as looking a word up.
          </small>
        </label>
      </section>

      <section className="settings-section">
        <h3>Your collection</h3>
        <BackupPanel />
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
                'Reset all learning progress, your journey through Denmark, and the current game?',
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
  )
}
