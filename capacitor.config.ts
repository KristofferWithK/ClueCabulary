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
  plugins: {
    Keyboard: {
      resize: 'none',
    },
  },
}

export default config
