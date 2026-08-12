import { useState } from 'react'
import { AiError, testConnection } from '../../ai/client'
import { useGame } from '../../stores/gameStore'
import { useJourney } from '../../stores/journeyStore'
import type { StudyMode } from '../../journey/progress'
import { useSettings } from '../../stores/settingsStore'
import { useSrs } from '../../stores/srsStore'
import { useUi } from '../../stores/uiStore'
import { BackupPanel } from '../components/BackupPanel'

export function SettingsScreen() {
  const goTo = useUi((s) => s.goTo)
  const settings = useSettings()
  const resetSrs = useSrs((s) => s.reset)
  const resetJourney = useJourney((s) => s.reset)
  const abandonGame = useGame((s) => s.abandonGame)
  const [test, setTest] = useState<'idle' | 'testing' | 'ok' | string>('idle')

  const runTest = async () => {
    setTest('testing')
    try {
      await testConnection({
        baseUrl: settings.baseUrl,
        apiKey: settings.apiKey,
        model: settings.model,
      })
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
            Default: https://ollama.com/v1 — switch to your own proxy if Test connection reports a
            CORS problem (see proxy/README.md in the repo).
          </small>
        </label>
        <label className="field">
          <span>Model</span>
          <input
            type="text"
            value={settings.model}
            onChange={(e) => settings.set({ model: e.target.value })}
          />
        </label>
        <button className="btn" disabled={test === 'testing'} onClick={runTest}>
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
      </section>
    </div>
  )
}
