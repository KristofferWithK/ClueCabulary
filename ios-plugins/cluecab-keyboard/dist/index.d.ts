import type { PluginListenerHandle } from '@capacitor/core'

/**
 * What the fork adds over upstream 8.0.5: `durationMs` and `curve` on the
 * willShow payload. Everything else in the plugin's surface exists natively
 * but is deliberately not declared here — this app calls addListener and
 * nothing else (src/ui/nativeKeyboard.ts is the only import site), and an
 * undeclared method is one nobody reaches for by accident.
 */
export interface KeyboardWillShowInfo {
  keyboardHeight: number
  /**
   * The keyboard animation's duration from
   * UIKeyboardAnimationDurationUserInfoKey, in milliseconds. The ride
   * animates the composer over exactly this. 0 can arrive (a keyboard
   * already on screen re-reporting) — callers must fall back.
   */
  durationMs: number
  /**
   * The raw UIView animation-curve constant from the notification (7 in
   * practice — a private spring UIKit does not name). Unused today; carried
   * so RIDE_EASE can be tuned per-curve from JS without a native build.
   */
  curve: number
}

export interface KeyboardPlugin {
  addListener(
    eventName: 'keyboardWillShow' | 'keyboardDidShow',
    listenerFunc: (info: KeyboardWillShowInfo) => void,
  ): Promise<PluginListenerHandle>
  addListener(
    eventName: 'keyboardWillHide' | 'keyboardDidHide',
    listenerFunc: () => void,
  ): Promise<PluginListenerHandle>
  removeAllListeners(): Promise<void>
}

export declare const Keyboard: KeyboardPlugin
