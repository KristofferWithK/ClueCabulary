import { useEffect, useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { useGame } from '../../stores/gameStore'


/** How often an installed app looks for a new version. */
const CHECK_EVERY_MS = 60 * 60 * 1000

/**
 * An installed PWA can sit on the same build for weeks: nothing re-fetches the
 * service worker unless you ask. This asks — hourly and whenever the app comes
 * back to the foreground — and then tells the player, rather than swapping the
 * app out from under them.
 */
export function UpdateBanner() {
  const [dismissed, setDismissed] = useState(false)

  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return
      const check = () => {
        if (navigator.onLine) void registration.update()
      }
      const timer = setInterval(check, CHECK_EVERY_MS)
      const onVisible = () => {
        if (document.visibilityState === 'visible') check()
      }
      document.addEventListener('visibilitychange', onVisible)
      // The registration outlives the component, so nothing here unsubscribes;
      // both handlers are idempotent and cost a HEAD request at most.
      void timer
    },
  })

  // "You can play this on the plane" is worth saying once, and briefly. This
  // used to set its own state as its first act, which re-ran the effect and
  // cleared the very timeout meant to hide the notice — so it never went away.
  useEffect(() => {
    if (!offlineReady) return
    const t = setTimeout(() => setOfflineReady(false), 6000)
    return () => clearTimeout(t)
  }, [offlineReady, setOfflineReady])

  // Never interrupt a round in progress — a state a reload would spoil, and
  // the update will still be there afterwards.
  const busy = useGame((s) => !!s.game && s.game.phase !== 'finished')

  if (needRefresh && !dismissed && !busy) {
    return (
      <div className="update-banner" role="status">
        <span>A new version of 900words is ready.</span>
        <div className="update-actions">
          <button className="btn btn-small btn-primary" onClick={() => void updateServiceWorker(true)}>
            Reload
          </button>
          <button
            className="btn btn-small"
            onClick={() => {
              setDismissed(true)
              setNeedRefresh(false)
            }}
          >
            Later
          </button>
        </div>
      </div>
    )
  }

  if (offlineReady) {
    return (
      <div className="update-banner update-banner-quiet" role="status">
        <span>Ready to play offline.</span>
      </div>
    )
  }

  return null
}
