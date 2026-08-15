import { useEffect } from 'react'

/**
 * Keep the software keyboard from turning the app into a scrolling window.
 *
 * Every screen is built to fit the phone exactly — .app-shell is height: 100%
 * and deliberately never clips, so anything that outgrows the viewport becomes
 * document scroll (layout-drive measures precisely this). A keyboard breaks
 * that assumption from the outside: the visual viewport shrinks under the app,
 * and the browser scrolls the page to bring the focused input into view. Typing
 * a clue therefore turned the board into something you had to scroll.
 *
 * The fix has two halves. The viewport meta asks for the keyboard to overlay
 * the page rather than resize it (Chrome honours interactive-widget; Safari
 * does not yet, hence the rest of this). Here we measure how much of the
 * viewport the keyboard is covering and publish it as --kb, so the dock being
 * typed into can lift clear of it while everything else stays exactly where it
 * was. The board goes under the keyboard, which is the right thing to lose:
 * you are looking at what you are typing.
 *
 * The scroll is also actively undone. Safari scrolls on focus before any of
 * this runs, and a page that has been scrolled 200px up with no way to scroll
 * back is worse than one that never moved.
 */
export function useKeyboardInset() {
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return

    const root = document.documentElement
    // A keyboard takes a large bite. A URL bar collapsing takes a small one,
    // and treating that as a keyboard would jump the dock around while
    // scrolling a list — hence a floor rather than "anything above zero".
    const KEYBOARD_MIN = 120

    let open = false
    const apply = () => {
      const covered = Math.max(0, window.innerHeight - vv.height - vv.offsetTop)
      open = covered > KEYBOARD_MIN
      root.style.setProperty('--kb', `${open ? Math.round(covered) : 0}px`)
      root.classList.toggle('kb-open', open)
      if (open) window.scrollTo(0, 0)
    }

    // The browser's own scroll-to-the-input happens after focus, so undoing it
    // once is not enough — it has to lose the argument every time.
    const pin = () => {
      if (open) window.scrollTo(0, 0)
    }

    vv.addEventListener('resize', apply)
    vv.addEventListener('scroll', apply)
    window.addEventListener('scroll', pin, { passive: true })
    apply()

    return () => {
      vv.removeEventListener('resize', apply)
      vv.removeEventListener('scroll', apply)
      window.removeEventListener('scroll', pin)
      root.classList.remove('kb-open')
      root.style.removeProperty('--kb')
    }
  }, [])
}
