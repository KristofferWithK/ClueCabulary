import { useRef, useState } from 'react'
import { backupText, downloadBackup, restore, type RestoreMode } from '../../backup/apply'
import { parseBackup, summarize, type Backup } from '../../backup/backup'
import { cityAt } from '../../journey/cities'
import { LEARN_REPS } from '../../journey/progress'

type Status =
  | { kind: 'idle' }
  | { kind: 'error'; message: string }
  | { kind: 'saved'; message: string }
  | { kind: 'restored'; message: string }

export function BackupPanel() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const [pending, setPending] = useState<Backup | null>(null)
  const [pasting, setPasting] = useState(false)
  const [pasted, setPasted] = useState('')

  const offer = (text: string) => {
    const parsed = parseBackup(text)
    if (!parsed.ok) {
      setPending(null)
      setStatus({ kind: 'error', message: parsed.error })
      return
    }
    setPending(parsed.backup)
    setStatus({ kind: 'idle' })
  }

  const onFile = async (file: File | undefined) => {
    if (!file) return
    try {
      offer(await file.text())
    } catch {
      setStatus({ kind: 'error', message: 'That file could not be read.' })
    }
  }

  const apply = (mode: RestoreMode) => {
    if (!pending) return
    const sum = summarize(pending, LEARN_REPS)
    if (
      mode === 'replace' &&
      !window.confirm(
        'Replace everything on this device with the backup? Anything you have learned since it was made will be lost.',
      )
    ) {
      return
    }
    restore(pending, mode)
    setPending(null)
    setPasting(false)
    setPasted('')
    setStatus({
      kind: 'restored',
      message:
        mode === 'merge'
          ? `Merged. Nothing you had was lost — ${sum.learned} learned words folded in.`
          : `Restored ${sum.learned} learned words and ${sum.stamps} stempler.`,
    })
  }

  const sum = pending ? summarize(pending, LEARN_REPS) : null

  return (
    <>
      <p className="settings-note">
        Your collection lives on this phone only. A backup is one small file — keep one somewhere
        safe before you change phone or clear your browser data. Your API key is never in it.
      </p>

      <div className="backup-actions">
        <button
          className="btn"
          onClick={async () => {
            try {
              const how = await downloadBackup(Date.now())
              setStatus({
                kind: 'saved',
                message: how === 'shared' ? 'Backup handed to your phone.' : 'Backup downloaded.',
              })
            } catch {
              setStatus({ kind: 'error', message: 'Could not write the backup file.' })
            }
          }}
        >
          Save a backup
        </button>

        <button className="btn" onClick={() => fileRef.current?.click()}>
          Restore from a file
        </button>
        <input
          ref={fileRef}
          className="visually-hidden"
          type="file"
          accept="application/json,.json"
          onChange={(e) => {
            void onFile(e.target.files?.[0])
            // Let the same file be chosen twice in a row.
            e.target.value = ''
          }}
        />
      </div>

      <button
        className="backup-fallback"
        onClick={() => {
          setPasting((v) => !v)
          setStatus({ kind: 'idle' })
        }}
      >
        {pasting ? 'Hide text backup' : 'No file picker? Use text instead'}
      </button>

      {pasting && (
        <div className="backup-paste">
          <button
            className="btn btn-small"
            onClick={async () => {
              const text = backupText(Date.now())
              try {
                await navigator.clipboard.writeText(text)
                setStatus({ kind: 'saved', message: 'Backup copied to the clipboard.' })
              } catch {
                setPasted(text)
                setStatus({
                  kind: 'error',
                  message: 'Clipboard blocked — select the text below and copy it yourself.',
                })
              }
            }}
          >
            Copy my collection
          </button>
          <label className="field">
            <span>Paste a backup here</span>
            <textarea
              rows={4}
              value={pasted}
              spellCheck={false}
              onChange={(e) => setPasted(e.target.value)}
              placeholder={'{"app":"cluecabulary",…}'}
            />
          </label>
          <button className="btn btn-small" disabled={!pasted.trim()} onClick={() => offer(pasted)}>
            Read it
          </button>
        </div>
      )}

      {sum && (
        <div className="backup-preview">
          <h4>This backup holds</h4>
          <ul>
            <li>
              <strong>{sum.learned}</strong> learned words, {sum.words} met in all
            </li>
            <li>
              <strong>{sum.stamps}</strong> stempler · {cityAt(sum.cityIndex).name}
            </li>
            <li>
              {sum.games} {sum.games === 1 ? 'round' : 'rounds'} played · saved{' '}
              {new Date(sum.exportedAt).toLocaleDateString()}
            </li>
          </ul>
          <div className="backup-choice">
            <button className="btn btn-primary" onClick={() => apply('merge')}>
              Merge into this device
            </button>
            <button className="btn" onClick={() => apply('replace')}>
              Replace everything
            </button>
            <button
              className="backup-fallback"
              onClick={() => {
                setPending(null)
                setPasted('')
              }}
            >
              Cancel
            </button>
          </div>
          <p className="settings-note">
            Merging keeps the better of the two records for every word, so it can never cost you a
            green. Replacing throws this device's progress away.
          </p>
        </div>
      )}

      {/* Its own class as well as the shared style: Settings has other
          .test-fail messages, and "the error" has to mean this one. */}
      {status.kind === 'error' && <p className="test-fail backup-error">{status.message}</p>}
      {(status.kind === 'saved' || status.kind === 'restored') && (
        <p className="test-ok">✓ {status.message}</p>
      )}
    </>
  )
}
