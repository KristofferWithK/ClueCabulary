import { useEffect } from 'react'

/**
 * The software keyboard, made survivable.
 *
 * Every screen is built to fit the phone exactly, and the board must not move,
 * shrink, or scroll while someone types. The keyboard attacks that three ways,
 * and each needs its own defence:
 *
 * 1. iOS Safari PANS the visual viewport to reveal a focused input — before
 *    any script runs, unstoppable by CSS, and position: fixed elements appear
 *    to slide away because they anchor to the layout viewport, which the pan
 *    moves under them. Two earlier attempts lost to exactly this. The answer
 *    is not to fight the pan but to ride it: this hook publishes the visual
 *    viewport's live top and height (--vvt, --vvh), and the focused dock pins
 *    itself to THAT — wherever the pan takes it, the dock tracks the keyboard.
 *
 * 2. An installed PWA on iOS has its whole webview RESIZED by the keyboard, so
 *    an app shell of height: 100% reflows and the board rearranges. The shell
 *    is therefore frozen at the last keyboard-closed height (--app-h) while
 *    typing: same pixels, same board, the covered part simply sits under the
 *    keyboard.
 *
 * 3. With the page taller than the visual viewport there is somewhere to
 *    scroll to, so scrolling is locked (CSS, on .kb-open) while the keyboard
 *    is up.
 *
 * The dock's own height is captured at focus time (--dock-h) so the screen can
 * hold its place with a placeholder while the dock is lifted out of the flow —
 * without it, the board would grow into the vacated space, which is the
 * "rearranging" this exists to end.
 */
export function useKeyboardInset() {
  // Inside the native shell the OS is the source of truth instead: with
  // Keyboard.resize 'none' the webview is never resized or panned — the three
  // failure modes above simply do not exist — and the keyboard's exact height
  // arrives as an event. That height feeds the very same CSS variables, so the
  // composer CSS has one implementation with two informants.
  useEffect(() => {
    const cap = (window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
    if (!cap?.isNativePlatform?.()) return

    const root = document.documentElement
    // The lifted dock's seat-holder needs the dock's height here too.
    const onFocusIn = (e: FocusEvent) => {
      const dock = e.target instanceof HTMLElement ? e.target.closest('.dock') : null
      if (dock) root.style.setProperty('--dock-h', `${Math.round(dock.getBoundingClientRect().height)}px`)
    }
    window.addEventListener('focusin', onFocusIn)
    let cleanup: (() => void) | undefined
    let gone = false
    void import('@capacitor/keyboard').then(({ Keyboard }) => {
      if (gone) return
      const show = Keyboard.addListener('keyboardWillShow', (info) => {
        const kb = Math.round(info.keyboardHeight)
        root.style.setProperty('--vvh', `${window.innerHeight - kb}px`)
        root.style.setProperty('--vvt', '0px')
        root.style.setProperty('--app-h', `${window.innerHeight}px`)
        root.classList.add('kb-open')
      })
      const hide = Keyboard.addListener('keyboardWillHide', () => {
        root.classList.remove('kb-open')
      })
      cleanup = () => {
        void show.then((h) => h.remove())
        void hide.then((h) => h.remove())
      }
    })
    return () => {
      gone = true
      cleanup?.()
      window.removeEventListener('focusin', onFocusIn)
      root.classList.remove('kb-open')
    }
  }, [])

  useEffect(() => {
    // The web informant. It must stand down entirely in the shell: with the
    // webview never resizing, it would compute "no keyboard" on every focus
    // and strip the class the native listener just set.
    const cap = (window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor
    if (cap?.isNativePlatform?.()) return
    const vv = window.visualViewport
    if (!vv) return

    const root = document.documentElement
    // A keyboard takes a large bite; a collapsing URL bar takes a small one
    // and must not trigger any of this.
    const KEYBOARD_MIN = 120

    // The height of this device with no keyboard: what the shell is frozen at.
    // Only trusted while nothing editable is focused, or the shrunken webview
    // of an installed PWA would be mistaken for the phone's real size.
    let fullH = window.innerHeight
    let raf = 0

    const editableFocused = () => {
      const el = document.activeElement
      return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement
    }

    const apply = () => {
      raf = 0
      if (!editableFocused()) fullH = Math.max(window.innerHeight, vv.height)
      const covered = Math.max(0, fullH - vv.height)
      const open = covered > KEYBOARD_MIN && editableFocused()
      root.style.setProperty('--vvh', `${Math.round(vv.height)}px`)
      root.style.setProperty('--vvt', `${Math.round(vv.offsetTop)}px`)
      root.style.setProperty('--app-h', `${Math.round(fullH)}px`)
      root.classList.toggle('kb-open', open)
    }

    // The visual viewport streams events through the keyboard's animation;
    // one write per frame is plenty.
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(apply)
    }

    const onFocusIn = (e: FocusEvent) => {
      // Measured before the lift, so the placeholder is the dock's true size.
      const dock = e.target instanceof HTMLElement ? e.target.closest('.dock') : null
      if (dock) root.style.setProperty('--dock-h', `${Math.round(dock.getBoundingClientRect().height)}px`)
      schedule()
    }

    vv.addEventListener('resize', schedule)
    vv.addEventListener('scroll', schedule)
    window.addEventListener('resize', schedule)
    window.addEventListener('focusin', onFocusIn)
    window.addEventListener('focusout', schedule)
    apply()

    return () => {
      vv.removeEventListener('resize', schedule)
      vv.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      window.removeEventListener('focusin', onFocusIn)
      window.removeEventListener('focusout', schedule)
      cancelAnimationFrame(raf)
      root.classList.remove('kb-open')
      for (const p of ['--vvh', '--vvt', '--app-h', '--dock-h']) root.style.removeProperty(p)
    }
  }, [])
}
