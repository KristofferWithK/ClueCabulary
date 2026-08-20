import type { CapacitorConfig } from '@capacitor/cli'

/**
 * The native shell around the web app, and the reason it exists is one line:
 * the Keyboard.resize setting below.
 *
 * On the mobile web the software keyboard pans the visual viewport, resizes an
 * installed PWA's webview, and makes the page scrollable — three behaviours,
 * all hostile to a board that must never move, none of them reliably
 * preventable from inside a page. Three successive web-side designs each lost
 * to one of them on a real iPhone. In the shell the OS simply promises it:
 * with resize 'none' the webview is never resized or scrolled by the keyboard,
 * and the keyboard's exact height arrives as an event
 * (src/ui/keyboard.ts feeds it to the same CSS the web uses).
 *
 * The app id is registered at developer.apple.com and named in the App Store
 * Connect app record — all three must match, so changing it is a decision,
 * not a tidy-up.
 */
const config: CapacitorConfig = {
  appId: 'com.kristofferwithk.cluecabulary',
  appName: '900words',
  webDir: 'dist',
  /**
   * The colour of everything that is not the page: the window behind the
   * webview, and the strip the keyboard animates over. It defaults to black,
   * which is what flashed under the keyboard on the phone. The app's own
   * background, so the seam is invisible.
   */
  backgroundColor: '#ffffff',
  ios: {
    backgroundColor: '#ffffff',
  },
  /**
   * Deliberately BUNDLED — no server.url.
   *
   * Pointing the webview at the deployed site would keep the instant update
   * loop, and it was configured that way for one commit. Capacitor's own docs
   * retired the idea: server.url is "intended for use with live-reload
   * servers" and "not intended for use in production", and whether the native
   * bridge reaches a remote page is not documented at all.
   *
   * The no-resize guarantee below would hold either way, since it is native
   * config rather than something the page asks for. The keyboard HEIGHT
   * listener would not: it needs the bridge. Three web-side keyboard designs
   * have already failed on this device, so the build that finally settles it
   * rests on nothing undocumented.
   *
   * Instant iteration stays where it is documented to work: the PWA for web
   * changes, `npx cap run ios --live-reload` for native development, and an
   * OTA layer later if TestFlight rebuilds start to chafe.
   */
  plugins: {
    Keyboard: {
      /**
       * 'native', not 'none' — and the difference is that this one needs no
       * arithmetic.
       *
       * With 'none' the webview keeps the whole screen and the app has to work
       * out where the keyboard's top edge is in order to put the composer
       * above it. Three builds went on that sum: too high by the height of the
       * home indicator, then too low by it, because iOS measures its keyboard
       * to the bottom of the SCREEN while the page is padded away from that
       * inset. It is a number nothing in the page can see and nothing in CI
       * can check.
       *
       * 'native' resizes the WEBVIEW, and that showed on the phone twice over:
       * the window behind it is black, so the strip under the keyboard flashed
       * black, and iOS performs that resize after its keyboard animation, so
       * the composer jumped up late instead of riding with it.
       *
       * 'body' keeps the webview full-screen — nothing black can appear
       * because the page still covers it — and shrinks the document instead.
       * The composer is still simply the last thing in the layout, so it still
       * needs no arithmetic.
       *
       * It does not, however, fix the lateness, and this comment claimed it did
       * for several builds. The shrink is not performed on keyboardWillShow.
       * Keyboard.m schedules it:
       *
       *     double duration = [[... AnimationDurationUserInfoKey ...]
       *                        doubleValue] + 0.2;
       *     [self setKeyboardHeight:(int)height delay:duration];
       *
       * — one keyboard-animation duration plus 200ms after the event, so about
       * 450ms later, roughly 200ms after the keyboard has stopped moving. The
       * EXACT height is known at willShow and simply is not used until then.
       * (Hiding is unaffected: willHide schedules the same call with a 10ms
       * delay, which is why only coming up ever looked wrong.)
       *
       * Borrowing that height to move the composer early is the experiment
       * behind localStorage cluecab-kbfast — see src/ui/nativeKeyboard.ts. It
       * ships off, and it changes only when the composer arrives, never where.
       *
       * What either costs is the board reflowing into the smaller space, which
       * is the one thing it must never do. So the board is frozen at its full
       * height while the keyboard is up and clipped by the shrinking document
       * — see .kb-up in index.css. Clipped and covered look the same; resized
       * does not.
       */
      resize: 'body',
    },
  },
}

export default config
