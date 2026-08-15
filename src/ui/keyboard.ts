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

    // The dock carries the composing state itself, so the lift does not depend
    // on :focus-within — which is not true yet at pointerdown, when the move
    // has to have already happened.
    const stopComposing = () => {
      for (const d of document.querySelectorAll('.dock.composing')) d.classList.remove('composing')
    }

    const apply = () => {
      raf = 0
      if (!editableFocused()) {
        preLifted = false
        stopComposing()
        fullH = Math.max(window.innerHeight, vv.height)
      }
      const covered = Math.max(0, fullH - vv.height)
      const measured = covered > KEYBOARD_MIN
      if (measured) {
        // Only for the composer's max-height — its POSITION deliberately
        // depends on none of this.
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
     * Open the composing state BEFORE the field takes focus.
     *
     * iOS pans the visual viewport to reveal a focused element that would sit
     * under the keyboard, and the pan is not document scroll — scrollTop stays
     * zero, overflow: hidden does nothing, and no CSS prevents it. Reacting to
     * the keyboard cannot win either: by the time a height is reported, the
     * pan has happened and any correction arrives a frame late, which is the
     * lag you can feel.
     *
     * So the composer no longer sits above the keyboard at all — it goes to
     * the top of the screen (see index.css), where its position depends on no
     * measurement, and the board goes behind an opaque layer. There is nothing
     * for iOS to reveal and nothing on screen that can appear to move.
     *
     * This still has to happen at pointerdown rather than on focus: the pan
     * decision is made when the field takes focus, so the field must already
     * be somewhere safe by then.
     */
    const onPointerDown = (e: PointerEvent) => {
      const el = e.target
      if (!(el instanceof HTMLElement)) return
      const field = el.closest<HTMLElement>('input, textarea')
      const dock = el.closest('.dock')
      if (!field || !dock) return
      // Already typing here: leave the tap alone so the caret can be placed.
      if (document.activeElement === field) return

      // Take the tap over. The default action would focus the field where it
      // currently sits — at the bottom, in the strip iOS is about to cover —
      // and the pan is decided at that instant. So: move first, focus second,
      // both before the keyboard exists.
      e.preventDefault()
      preLifted = true
      fullH = window.innerHeight
      root.style.setProperty('--app-h', `${Math.round(fullH)}px`)
      dock.classList.add('composing')
      root.classList.add('kb-open')
      // Read the box back to force the move to be laid out NOW, so the focus
      // below happens with the field already at the top.
      dock.getBoundingClientRect()
      // Synchronously, inside this handler: iOS opens the keyboard only for a
      // focus that happens within the gesture that asked for it. A frame later
      // — via requestAnimationFrame — is outside it, and the keyboard never
      // appears. preventScroll stops the browser adding its own reveal.
      field.focus({ preventScroll: true })
      // A tap that never becomes a focus — a cancelled press, a stray touch —
      // must not leave the app composing.
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
      stopComposing()
      for (const p of ['--vvh', '--vvt', '--app-h', '--dock-h']) root.style.removeProperty(p)
    }
  }, [])
}
