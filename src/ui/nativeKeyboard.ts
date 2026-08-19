import { useEffect } from 'react'

/**
 * The keyboard, in the native shell only — where the platform gives us what
 * the web never could.
 *
 * Four attempts at this in the browser all failed on a real iPhone, each for a
 * different reason, and all of them traceable to two missing facts: the web is
 * told the keyboard's height only AFTER it has moved, and the visual-viewport
 * pan that reveals a focused field is the browser's to perform, not ours to
 * prevent. Guessing the height panned the page; measuring it arrived a frame
 * late and lagged. That code is gone, and the mobile web keeps the platform's
 * own imperfect behaviour.
 *
 * Here neither problem exists. Keyboard.resize 'body' (capacitor.config.ts)
 * means the OS never resizes, pans or scrolls the WEBVIEW — the board cannot
 * move, by construction rather than by defence — and keyboardWillShow reports
 * the exact height BEFORE the animation, so the composer can be placed rather
 * than chased.
 *
 * What is left is not arithmetic but timing: the document shrinks to the
 * keyboard's top edge, and the composer, being last in the layout, lands on it
 * with no height to learn and no gap to tune. See the ride below for when that
 * shrink actually happens, which is later than the config comment used to say.
 */

/**
 * The iOS keyboard's own curve and duration, near enough that a layer moving
 * on this timing reads as attached to the keyboard rather than chasing it.
 * UIKit does not publish the curve as a bezier; this is the approximation the
 * platform's own animations are routinely matched with.
 *
 * Nothing rests on these being exactly right. They decide only how the dock
 * LOOKS while it travels — the position it comes to rest at is the layout's,
 * measured, and handed back at the end of the ride. See landing() below.
 */
const RIDE_MS = 250
const RIDE_EASE = 'cubic-bezier(0.38, 0.7, 0.125, 1)'
/**
 * If the document never shrinks, stop waiting and hand the dock back anyway.
 * The plugin skips its resize entirely when the height it would set is the one
 * already set (Keyboard.m, setKeyboardHeight: returns early on an unchanged
 * paddingBottom), which happens when focus moves between two fields without
 * the keyboard going down. Without this the transform would simply stay on.
 */
const RIDE_GIVEUP_MS = 1200

function flagOn(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1'
  } catch {
    /* private mode */
    return false
  }
}

/**
 * The numbers this places the composer with, on the screen it places it on.
 *
 * Two builds have now been spent on a gap I could not see, reasoning about
 * what iOS means by "keyboard height" from a thousand miles away. This puts
 * the arithmetic where the person holding the phone can read it, and it
 * costs one screenshot to settle instead of one build per guess.
 *
 * Merges rather than replaces, because the ride reports in three instalments
 * — measured, riding, handed back — and the point is to read them together.
 *
 * Shown only while the debug flag is on — Settings → the build stamp, or
 * localStorage cluecab-kbdebug — so it is not in anyone's way by default.
 */
const shown: Record<string, number> = {}
function report(n: Record<string, number>) {
  Object.assign(shown, n)
  if (!flagOn('cluecab-kbdebug')) return
  let box = document.getElementById('kbdebug')
  if (!box) {
    box = document.createElement('pre')
    box.id = 'kbdebug'
    box.style.cssText =
      'position:fixed;left:4px;top:4px;z-index:9999;margin:0;padding:4px 6px;' +
      'background:rgba(18,18,18,.85);color:#8f8;font:10px/1.3 ui-monospace,Menlo,monospace;' +
      'border-radius:5px;pointer-events:none;white-space:pre'
    document.body.appendChild(box)
  }
  box.textContent = Object.entries(shown)
    .map(([k, v]) => `${k.padEnd(8)}${v}`)
    .join('\n')
}

/**
 * Where the dock will end up once the document has shrunk — by shrinking it,
 * looking, and handing it straight back in the same tick, so nothing paints in
 * between.
 *
 * This is a measurement rather than a sum on purpose. The obvious arithmetic —
 * "move the dock up by the keyboard's height" — is the arithmetic that has
 * already cost this project three builds, once too high and once too low by
 * the height of the home indicator. The layout knows the answer; asking it is
 * cheaper than deriving it, and it stays right when the padding rules change.
 */
function probeFinalTop(dock: HTMLElement, px: number): number {
  const body = document.body
  const had = body.style.height
  body.style.height = `${window.innerHeight - px}px`
  const top = dock.getBoundingClientRect().top
  body.style.height = had
  return top
}

/**
 * ---- the ride (localStorage cluecab-kbfast = '1', off otherwise) ----
 *
 * The complaint this answers: the composer's resting place is exactly right,
 * but it arrives late — it appears at the keyboard's top edge some time after
 * the keyboard has finished arriving, instead of travelling up with it.
 *
 * That is not a mystery, it is a line in the plugin. Keyboard.m,
 * onKeyboardWillShow:
 *
 *     double duration = [[... UIKeyboardAnimationDurationUserInfoKey ...]
 *                        doubleValue] + 0.2;
 *     [self setKeyboardHeight:(int)height delay:duration];
 *
 * The document is not shrunk on keyboardWillShow at all. It is shrunk by a
 * delayed perform, one keyboard-animation duration PLUS 200ms later — about
 * 450ms after the event, roughly 200ms after the keyboard has stopped moving.
 * (Hiding is not affected: willHide schedules the same call with a 10ms delay.)
 *
 * So the exact height is known at willShow and simply is not used until later.
 * The ride borrows it: the dock is translated to the place the shrunk layout
 * will put it, on the keyboard's own curve, and the transform is dropped again
 * the moment the shrink actually lands.
 *
 * The double-offset trap is the whole difficulty — when the document shrinks,
 * the layout moves the dock up too, and a transform still in force would move
 * it up twice. Two things keep the handover clean:
 *
 *   - it is triggered by the shrink ITSELF (a MutationObserver on the body's
 *     style attribute), not by a timer and not by keyboardDidShow. didShow is
 *     the tempting one and it is wrong: it fires when the keyboard stops, ~200ms
 *     BEFORE the plugin's resize, so releasing there would drop the dock back
 *     down and then jerk it up again.
 *   - the observer's callback is a microtask, so it runs after the plugin's
 *     script and before the frame is painted. The shrink and the release land
 *     in the same paint. There is no frame in which both are in force, and
 *     none in which neither is.
 *
 * The safety property, and the reason this cannot regress the resting position
 * that was expensive to get right: the transform is always released, and what
 * the dock rests on afterwards is the ordinary layout — the same one it rests
 * on today, reached by the same mechanism. A wrong probe could only show as a
 * visible correction at the handover, never as a wrong final position. The
 * debug overlay reports `drift` so that correction is a number rather than an
 * impression.
 *
 * Returns the release, or null when there is nothing to ride.
 */
let rideT0 = 0
function startRide(px: number): (() => void) | null {
  rideT0 = performance.now()
  const dock = document.querySelector<HTMLElement>('.dock.kb-lifted')
  if (!dock || !px) {
    report({ lift: 0 })
    return null
  }
  // The one thing on this screen that moves for its own sake rather than
  // because the layout changed, so it is also the one thing here that has to
  // ask. Off means today's behaviour: the dock arrives when the layout says.
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    report({ lift: 0 })
    return null
  }

  const from = dock.getBoundingClientRect().top
  const to = probeFinalTop(dock, px)
  const dy = Math.round(to - from)
  // Nothing to do: the document is already shrunk, which is what focus moving
  // from one field to another with the keyboard already up looks like.
  if (dy > -2) {
    report({ lift: 0 })
    return null
  }

  // From an explicit zero rather than from `none`, so there is no question
  // about what the transition starts at.
  dock.style.transition = 'none'
  dock.style.transform = 'translateY(0)'
  void dock.offsetHeight
  dock.style.transition = `transform ${RIDE_MS}ms ${RIDE_EASE}`
  dock.style.transform = `translateY(${dy}px)`
  report({ lift: dy, land: Math.round(to), ride: Math.round(performance.now() - rideT0) })

  let done = false
  return () => {
    if (done) return
    done = true
    const at = Math.round(performance.now() - rideT0)
    // Transition off BEFORE the transform comes off, or removing it would be
    // animated too — a 250ms slide back down to where we started.
    dock.style.transition = 'none'
    dock.style.transform = ''
    void dock.offsetHeight
    const rest = Math.round(dock.getBoundingClientRect().top)
    dock.style.transition = ''
    // drift 0 means the probe predicted the shrunk layout exactly and the
    // handover was invisible. Anything else is the size of the correction the
    // eye would see, in pixels, on the device it happened on.
    report({ hand: at, rest, drift: rest - Math.round(to) })
  }
}

/**
 * Stand a keyboard up on demand, so a screenshot can be taken of the thing
 * itself rather than of a description of it.
 *
 * localStorage cluecab-kbsim = the height to pretend a keyboard has. The app
 * then does exactly what it does for a real one — freeze the board, mark the
 * composer, shrink the document the way the plugin's 'body' mode would — with
 * no keyboard, no tapping and no device. It is what lets iOS-simulator CI
 * photograph this state without automating a touch, and it works in a browser
 * too.
 *
 * What it cannot show is timing. There is no keyboard animating alongside it,
 * so it stands the finished state up rather than arriving at it, and a film of
 * it says nothing about whether the dock rides or trails. It is a check on
 * where things end up, in both modes, and that is all it is.
 *
 * Off unless the key is set, so it cannot affect anyone playing.
 */
function useSimulatedKeyboard() {
  useEffect(() => {
    let px = 0
    try {
      px = Number(localStorage.getItem('cluecab-kbsim') ?? 0)
    } catch {
      /* private mode */
    }
    if (!px) return
    const root = document.documentElement
    // Which screen is showing is not persisted, so a seeded save still opens
    // on Home. The round is there — it says "Continue game" — it just has to
    // be resumed, and there is nothing here that can tap the button.
    void import('../stores/uiStore').then(({ useUi }) => useUi.getState().goTo('game'))
    let ride: ReturnType<typeof setTimeout> | undefined
    let t: ReturnType<typeof setTimeout>
    let tries = 0
    /**
     * Wait for the board and a dock to exist, rather than for a length of time
     * that looked like enough.
     *
     * It used to be a flat 1200ms, and on an idle machine that is plenty. On a
     * busy one it is not: the screen had not rendered, so there was no grid to
     * freeze and no dock to lift, and the keyboard state was applied to a page
     * that was not ready for it. That produced a screenshot of the wrong thing
     * on CI and, once the ride existed, a drive that reported a working ride
     * as absent roughly one run in three. The delay stays as a settle; what
     * follows it is a condition.
     */
    const arm = () => {
      const grid = document.querySelector<HTMLElement>('.board-grid')
      const dock = document.querySelector<HTMLElement>('.dock')
      if ((!grid || !dock) && tries++ < 80) {
        t = setTimeout(arm, 100)
        return
      }
      if (grid) root.style.setProperty('--board-h', `${Math.round(grid.getBoundingClientRect().height)}px`)
      dock?.classList.add('kb-lifted')
      root.classList.add('kb-up')
      // What Keyboard.resize 'body' does: the document ends where the keyboard
      // begins, and the page lays itself out inside what is left.
      const shrink = () => {
        document.body.style.height = `${window.innerHeight - px}px`
      }
      if (flagOn('cluecab-kbfast')) {
        const release = startRide(px)
        if (release) {
          // The plugin's late shrink, stood up the same way the keyboard is:
          // the dock travels first and the document catches up underneath it.
          // The two land together, which is the part worth checking here.
          ride = setTimeout(() => {
            shrink()
            release()
          }, RIDE_MS)
          return
        }
      }
      shrink()
    }
    t = setTimeout(arm, 1200)
    return () => {
      clearTimeout(t)
      clearTimeout(ride)
    }
  }, [])
}

export function useNativeKeyboard() {
  useSimulatedKeyboard()

  useEffect(() => {
    const cap = (window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
    if (!cap?.isNativePlatform?.()) return

    const root = document.documentElement
    let removers: Array<() => void> = []
    let cancelled = false
    let endRide: (() => void) | null = null
    let watcher: MutationObserver | null = null
    let giveUp: ReturnType<typeof setTimeout> | undefined

    // Every way the ride can end goes through here, so the transform is never
    // left on: the document shrank, nothing shrank in time, the keyboard went
    // away again, a second field was focused, or the app unmounted.
    const land = () => {
      clearTimeout(giveUp)
      watcher?.disconnect()
      watcher = null
      endRide?.()
      endRide = null
    }

    // Which dock to lift: the one holding what is focused. Read at focus time
    // rather than assumed, because the clue dock, the lookup and the packing
    // dock are all docks with fields in them.
    const markDock = (e: FocusEvent) => {
      const dock = e.target instanceof HTMLElement ? e.target.closest('.dock') : null
      for (const d of document.querySelectorAll('.dock.kb-lifted')) {
        if (d !== dock) d.classList.remove('kb-lifted')
      }
      if (dock) dock.classList.add('kb-lifted')
    }
    window.addEventListener('focusin', markDock)

    void import('@capacitor/keyboard').then(({ Keyboard }) => {
      if (cancelled) return
      const show = Keyboard.addListener('keyboardWillShow', (info) => {
        // The only measurement left, and it is of OUR OWN board rather than of
        // the keyboard: how tall the grid is right now, so it can be held at
        // exactly that while the screen shrinks around it.
        //
        // Everything else went away with Keyboard.resize 'body'. The OS ends
        // the document where the keyboard begins, so the composer is simply the
        // last thing in the layout — touching the keyboard on every device,
        // with no height to learn and no gap to tune. Three builds were spent
        // on that sum, once too high and once too low by the height of the
        // home indicator, because iOS measures its keyboard to the bottom of
        // the SCREEN while the page is padded away from that inset.
        //
        // Taken on willShow, before the resize, or it would measure the board
        // already squeezed.
        const grid = document.querySelector<HTMLElement>('.board-grid')
        const h = grid ? Math.round(grid.getBoundingClientRect().height) : 0
        if (h) root.style.setProperty('--board-h', `${h}px`)
        root.classList.add('kb-up')
        report({ kb: Math.round(info.keyboardHeight), inner: window.innerHeight, board: h })

        // Everything above this line is what ships. Below it is the experiment,
        // and with the flag unset nothing below it touches the document.
        if (!flagOn('cluecab-kbfast')) return
        land()
        endRide = startRide(Math.round(info.keyboardHeight))
        if (!endRide) return
        // The handover, triggered by the shrink itself. The plugin performs it
        // as `el.style.height = ...` through the bridge, so it arrives here as
        // an attribute mutation on the body — and a MutationObserver callback
        // is a microtask, which puts the release in the same paint.
        watcher = new MutationObserver(land)
        watcher.observe(document.body, { attributes: true, attributeFilter: ['style'] })
        giveUp = setTimeout(land, RIDE_GIVEUP_MS)
      })
      const hide = Keyboard.addListener('keyboardWillHide', () => {
        land()
        root.classList.remove('kb-up')
        root.style.removeProperty('--board-h')
        for (const d of document.querySelectorAll('.dock.kb-lifted')) d.classList.remove('kb-lifted')
      })
      removers = [() => void show.then((h) => h.remove()), () => void hide.then((h) => h.remove())]
    })

    return () => {
      cancelled = true
      land()
      window.removeEventListener('focusin', markDock)
      for (const off of removers) off()
      root.classList.remove('kb-up')
      root.style.removeProperty('--kb')
      for (const d of document.querySelectorAll('.dock.kb-lifted')) d.classList.remove('kb-lifted')
    }
  }, [])
}
