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
        root.style.setProperty('--kb', `${Math.round(info.keyboardHeight)}px`)
        root.classList.add('kb-up')
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
