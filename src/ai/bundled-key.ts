/**
 * An API key shipped with the build, used when Settings has none.
 *
 * Empty by deliberate choice, not by caution. The only key available to bundle
 * was the Ollama one, and that key cannot work from the phone this app runs on
 * — ollama.com refuses the browser, measured on the real device. Shipping it
 * would have delivered nothing while a live secret in the working tree blocked
 * the tooling needed to finish and release the change.
 *
 * Paste a key between the quotes to bundle one. It then applies immediately,
 * on an already-installed build, because it is a fallback rather than a stored
 * default — zustand's persist merges saved state over defaults, so a new
 * default would never reach a phone that already has settings.
 *
 * Worth knowing before you do: this is a static site, so anything in the bundle
 * is readable by anyone who opens the page. A client-side app cannot keep a
 * secret. proxy/README.md describes the arrangement that can, where the key
 * lives on a Cloudflare Worker instead.
 */
export const BUNDLED_API_KEY = ''

/** Whether the build carries a key at all — Settings says so when it does. */
export const hasBundledKey = BUNDLED_API_KEY.trim().length > 0

/** The key to actually send: what the player typed, else the bundled one. */
export const effectiveKey = (typed: string): string =>
  typed.trim() ? typed.trim() : BUNDLED_API_KEY.trim()
