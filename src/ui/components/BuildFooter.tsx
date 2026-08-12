import { useState } from 'react'

/**
 * Which build this is, and a way to go and get a newer one.
 *
 * An installed PWA can sit on the same version for days: the service worker
 * only looks for an update when something asks it to. UpdateBanner asks
 * hourly, but a player staring at a screen that does not match the
 * instructions they were given needs to be able to ask themselves — and to say
 * which version they are on when they report a problem.
 */
export function BuildFooter() {
  const [state, setState] = useState<'idle' | 'checking' | 'current' | 'found' | 'error'>('idle')

  const check = async () => {
    setState('checking')
    try {
      const reg = await navigator.serviceWorker?.getRegistration()
      if (!reg) {
        setState('error')
        return
      }
      await reg.update()
      // A worker that is installing or waiting means a newer build exists.
      setState(reg.waiting || reg.installing ? 'found' : 'current')
    } catch {
      setState('error')
    }
  }

  return (
    <p className="build-footer">
      <span>Build {__BUILD_STAMP__}</span>
      <button className="btn btn-small" disabled={state === 'checking'} onClick={check}>
        {state === 'checking' ? 'Checking…' : 'Check for updates'}
      </button>
      {state === 'current' && <span className="build-note">Up to date.</span>}
      {state === 'found' && (
        <span className="build-note">
          A newer build is downloading — close and reopen the app to take it.
        </span>
      )}
      {state === 'error' && (
        <span className="build-note">Could not check. Close and reopen the app instead.</span>
      )}
    </p>
  )
}
