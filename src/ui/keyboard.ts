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
/**
 * ?kbdebug=1 — what the phone is actually doing, on the phone.
 *
 * Three keyboard designs have been shipped and judged by screenshot, each one
 * a hypothesis about which iOS behaviour was firing, none of them measured.
 * This ends that: it prints the numbers over the app, so one screenshot says
 * which mechanism is at work instead of another guess.
 *
 * Deliberately not behind devSwitchesAllowed(): the whole point is to run it
 * on the deployed site, on the real device, where the problem lives. It shows
 * nothing unless the URL asks for it.
 */
function useKeyboardDebug() {
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has('kbdebug')) return
    const box = document.createElement('pre')
    box.style.cssText =
      'position:fixed;left:6px;top:6px;z-index:9999;margin:0;padding:6px 8px;' +
      'background:rgba(18,18,18,.86);color:#8f8;font:11px/1.35 ui-monospace,Menlo,monospace;' +
      'border-radius:6px;pointer-events:none;white-space:pre'
    document.body.appendChild(box)
    const vv = window.visualViewport
    let raf = 0
    const draw = () => {
      raf = 0
      const el = document.activeElement
      const root = document.documentElement
      box.textContent = [
        `inner   ${window.innerHeight}   outer ${window.outerHeight}`,
        `visual  ${vv ? Math.round(vv.height) : '—'}   top ${vv ? Math.round(vv.offsetTop) : '—'}`,
        `scroll  ${Math.round(window.scrollY)} / ${document.scrollingElement?.scrollHeight ?? '—'}`,
        `--vvh ${root.style.getPropertyValue('--vvh') || '—'}  --app-h ${root.style.getPropertyValue('--app-h') || '—'}`,
        `kb-open ${root.classList.contains('kb-open')}  native ${Boolean(
          (window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.(),
        )}`,
        `focus   ${el?.tagName ?? '—'}${el instanceof HTMLElement && el.id ? `#${el.id}` : ''}`,
      ].join('\n')
    }
    const tick = () => {
      if (!raf) raf = requestAnimationFrame(draw)
    }
    vv?.addEventListener('resize', tick)
    vv?.addEventListener('scroll', tick)
    window.addEventListener('scroll', tick, { passive: true })
    window.addEventListener('resize', tick)
    window.addEventListener('focusin', tick)
    window.addEventListener('focusout', tick)
    const id = setInterval(tick, 250)
    draw()
    return () => {
      clearInterval(id)
      cancelAnimationFrame(raf)
      vv?.removeEventListener('resize', tick)
      vv?.removeEventListener('scroll', tick)
      window.removeEventListener('scroll', tick)
      window.removeEventListener('resize', tick)
      window.removeEventListener('focusin', tick)
      window.removeEventListener('focusout', tick)
      box.remove()
    }
  }, [])
}

export function useKeyboardInset() {
  useKeyboardDebug()

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
    // This device's real keyboard height, learned once and reused to place the
    // composer before the next keyboard has opened.
    const REMEMBERED = 'cluecab-kb-height'

    // The height of this device with no keyboard: what the shell is frozen at.
    // Only trusted while nothing editable is focused, or the shrunken webview
    // of an installed PWA would be mistaken for the phone's real size.
    let fullH = window.innerHeight
    let raf = 0
    // Set at pointerdown, before focus. It holds the composer up through the
    // gap between the tap and the keyboard actually reporting a height — a
    // gap in which the reactive path would otherwise measure "no keyboard",
    // drop the composer back into the danger zone, and hand iOS the very
    // reason to pan that all of this exists to remove.
    let preLifted = false

    const editableFocused = () => {
      const el = document.activeElement
      return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement
    }

    const remember = (px: number) => {
      try {
        localStorage.setItem(REMEMBERED, String(Math.round(px)))
      } catch {
        // Private mode. The default guess is fine.
      }
    }

    const apply = () => {
      raf = 0
      if (!editableFocused()) {
        preLifted = false
        fullH = Math.max(window.innerHeight, vv.height)
      }
      const covered = Math.max(0, fullH - vv.height)
      const measured = covered > KEYBOARD_MIN
      if (measured) {
        // The real height, which replaces the guess on this device for good.
        remember(covered)
        root.style.setProperty('--vvh', `${Math.round(vv.height)}px`)
        root.style.setProperty('--vvt', `${Math.round(vv.offsetTop)}px`)
      }
      root.style.setProperty('--app-h', `${Math.round(fullH)}px`)
      root.classList.toggle('kb-open', editableFocused() && (measured || preLifted))
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

    /**
     * Lift the composer BEFORE the field takes focus. This is the whole fix.
     *
     * iOS pans the visual viewport to reveal a focused element that would sit
     * under the keyboard. The pan is not document scroll: scrollTop stays 0,
     * overflow: hidden does nothing, and no CSS prevents it — measured on the
     * device, where the status bar ended up over the board and the header
     * disappeared off the top while the composer looked perfectly placed.
     *
     * Reacting cannot win, because by the time the keyboard reports its height
     * the pan has already happened. So the decision is made at pointerdown,
     * which fires before focus: the composer moves to where the keyboard will
     * leave it, using the height last measured on this device, and iOS then
     * finds the field already visible and has no reason to pan at all.
     *
     * The guess only has to be close. Land slightly high and the field is
     * still clear of the keyboard; the real measurement arrives milliseconds
     * later and corrects it.
     */
    // A middle-of-the-road iPhone keyboard with its suggestion strip. Replaced
    // by a real measurement the first time this device opens one.
    const guessHeight = () => {
      let seen = 0
      try {
        seen = Number(localStorage.getItem(REMEMBERED))
      } catch {
        // Private mode.
      }
      return seen > KEYBOARD_MIN && seen < window.innerHeight * 0.75 ? seen : 336
    }

    const onPointerDown = (e: PointerEvent) => {
      const el = e.target
      if (!(el instanceof HTMLElement)) return
      const field = el.closest('input, textarea')
      const dock = el.closest('.dock')
      if (!field || !dock) return
      preLifted = true
      fullH = window.innerHeight
      root.style.setProperty('--app-h', `${Math.round(fullH)}px`)
      root.style.setProperty('--dock-h', `${Math.round(dock.getBoundingClientRect().height)}px`)
      root.style.setProperty('--vvt', '0px')
      root.style.setProperty('--vvh', `${Math.round(fullH - guessHeight())}px`)
      root.classList.add('kb-open')
      // A tap that never becomes a focus — a scroll, a cancelled press — must
      // not leave the composer hanging in mid-air.
      setTimeout(schedule, 700)
    }

    // Capture: the field's own handlers must not be able to stop this.
    window.addEventListener('pointerdown', onPointerDown, true)
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
