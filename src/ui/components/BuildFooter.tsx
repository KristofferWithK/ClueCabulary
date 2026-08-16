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
  const [debug, setDebug] = useState(() => {
    try {
      return localStorage.getItem('cluecab-kbdebug') === '1'
    } catch {
      return false
    }
  })

  /**
   * Five taps on the build stamp turns on the keyboard readout.
   *
   * The one thing that cannot be debugged from here is what iOS does with the
   * keyboard on a real phone, and shipping a build per guess is a slow way to
   * find out. This is the old five-taps-for-developer-mode trick: invisible
   * until wanted, and reachable without a rebuild.
   */
  const [taps, setTaps] = useState(0)
  const tap = () => {
    const next = taps + 1
    setTaps(next)
    if (next < 5) return
    setTaps(0)
    const on = !debug
    setDebug(on)
    try {
      if (on) localStorage.setItem('cluecab-kbdebug', '1')
      else localStorage.removeItem('cluecab-kbdebug')
    } catch {
      /* private mode */
    }
  }

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
      <span onClick={tap}>Build {__BUILD_STAMP__}</span>
      {debug && <span className="build-note">Keyboard readout on. Tap the build five times to hide it.</span>}
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
