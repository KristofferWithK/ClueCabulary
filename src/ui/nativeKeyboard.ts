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
 * Here neither problem exists. Keyboard.resize 'none' (capacitor.config.ts)
 * means the OS never resizes, pans or scrolls the webview — the board cannot
 * move, by construction rather than by defence — and keyboardWillShow reports
 * the exact height BEFORE the animation, so the composer can be placed rather
 * than chased.
 *
 * What is left is arithmetic: raise the dock being typed into by the height
 * the keyboard is about to occupy. No estimate, no correction, nothing to
 * arrive late.
 */
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
    const t = setTimeout(() => {
      const grid = document.querySelector<HTMLElement>('.board-grid')
      if (grid) root.style.setProperty('--board-h', `${Math.round(grid.getBoundingClientRect().height)}px`)
      document.querySelector('.dock')?.classList.add('kb-lifted')
      root.classList.add('kb-up')
      // What Keyboard.resize 'body' does: the document ends where the keyboard
      // begins, and the page lays itself out inside what is left.
      document.body.style.height = `${window.innerHeight - px}px`
    }, 1200)
    return () => clearTimeout(t)
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

    /**
     * The numbers this places the composer with, on the screen it places it on.
     *
     * Two builds have now been spent on a gap I could not see, reasoning about
     * what iOS means by "keyboard height" from a thousand miles away. This puts
     * the arithmetic where the person holding the phone can read it, and it
     * costs one screenshot to settle instead of one build per guess.
     *
     * Shown only while the debug flag is on — Settings → the build stamp, or
     * localStorage cluecab-kbdebug — so it is not in anyone's way by default.
     */
    const report = (n: Record<string, number>) => {
      let on = false
      try {
        on = localStorage.getItem('cluecab-kbdebug') === '1'
      } catch {
        /* private mode */
      }
      if (!on) return
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
      box.textContent = Object.entries(n)
        .map(([k, v]) => `${k.padEnd(8)}${v}`)
        .join('\n')
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
        // Everything else went away with Keyboard.resize 'native'. The OS ends
        // the webview where the keyboard begins, so the composer is simply the
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
      })
      const hide = Keyboard.addListener('keyboardWillHide', () => {
        root.classList.remove('kb-up')
        root.style.removeProperty('--board-h')
        for (const d of document.querySelectorAll('.dock.kb-lifted')) d.classList.remove('kb-lifted')
      })
      removers = [() => void show.then((h) => h.remove()), () => void hide.then((h) => h.remove())]
    })

    return () => {
      cancelled = true
      window.removeEventListener('focusin', markDock)
      for (const off of removers) off()
      root.classList.remove('kb-up')
      root.style.removeProperty('--kb')
      for (const d of document.querySelectorAll('.dock.kb-lifted')) d.classList.remove('kb-lifted')
    }
  }, [])
}
