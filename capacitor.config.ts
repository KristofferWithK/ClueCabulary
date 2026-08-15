import type { CapacitorConfig } from '@capacitor/cli'

/**
 * The native shell around the web app, and the reason it exists is one line:
 * Keyboard.resize 'none'.
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
  appName: 'ClueCabulary',
  webDir: 'dist',
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
      resize: 'none',
    },
  },
}

export default config
