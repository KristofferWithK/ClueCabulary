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
export function useNativeKeyboard() {
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
        // How far to move it is measured, not assumed. Translating by the
        // keyboard's own height leaves the dock floating above it by whatever
        // sat underneath — the screen's padding plus the home-indicator safe
        // area, about 46px on a notched phone, which reads as a gap rather
        // than as a composer attached to the keyboard.
        //
        // What is wanted is the dock's bottom edge just above the keyboard's
        // top edge, so that is what is computed: the overlap, plus a hair.
        const dock = document.querySelector<HTMLElement>('.dock.kb-lifted')
        if (!dock) return
        // Measure from a clean slate: a --kb left over from the last time the
        // keyboard was up would still be transforming this dock, and every
        // number below would be read through it.
        root.style.setProperty('--kb', '0px')
        const resting = dock.getBoundingClientRect().bottom

        // iOS reports a keyboard height that reaches the bottom of the SCREEN,
        // including the home-indicator inset the page is already padded away
        // from — so subtracting it twice is what left a gap the size of that
        // inset. Read it rather than assume a number: it is 0 on a phone with
        // a home button and about 34 on one without.
        const probe = document.createElement('div')
        probe.style.cssText =
          'position:fixed;left:0;bottom:0;width:0;height:env(safe-area-inset-bottom);pointer-events:none'
        document.body.appendChild(probe)
        const inset = probe.getBoundingClientRect().height
        probe.remove()

        const GAP = 6
        const keyboardTop = window.innerHeight - info.keyboardHeight + inset
        const shift = Math.max(0, Math.round(resting - keyboardTop + GAP))
        root.style.setProperty('--kb', `${shift}px`)
        root.classList.add('kb-up')
        report({
          kb: Math.round(info.keyboardHeight),
          inner: window.innerHeight,
          inset: Math.round(inset),
          resting: Math.round(resting),
          top: Math.round(keyboardTop),
          shift,
        })
      })
      const hide = Keyboard.addListener('keyboardWillHide', () => {
        root.classList.remove('kb-up')
        root.style.setProperty('--kb', '0px')
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
