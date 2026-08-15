/**
 * The service this app talks to.
 *
 * There were three: Gemini direct, Ollama Cloud direct, and the proxy. Both
 * direct routes are retired, because keeping them was keeping three ways to be
 * misconfigured for no gain that survives contact with the proxy:
 *
 * - Ollama direct never worked from a browser at all. Its CORS preflight is
 *   answered with a redirect, which the fetch spec forbids, measured on a real
 *   phone. Choosing it could only ever produce an error.
 * - Gemini direct worked, but only with a key each player had to fetch and
 *   paste. The proxy holds one key, at Cloudflare, for everybody.
 * - The proxy fronts either of them anyway. Which model answers — and which
 *   company's model it is — is a MODEL_ALIASES entry now, so switching no
 *   longer means switching service in Settings.
 *
 * The chip stays as one chip on purpose: it is how you get back to the working
 * default after typing a Base URL of your own, and a custom URL is still free
 * text, so a personal proxy or a local Ollama remains one field away.
 *
 * No model names here. The server is asked instead — see DEFAULT_MODEL.
 */
export interface Provider {
  id: string
  label: string
  /** Base URL; the client appends /chat/completions and /models. */
  baseUrl: string
  /**
   * Where to get a key, for the link next to the field. Absent where the
   * service needs no key from the player — the proxy holds its own.
   */
  keysAt?: string
  /** What is actually known about using it from a browser. */
  note: string
}

export const PROVIDERS: readonly Provider[] = [
  {
    id: 'cluecabulary',
    label: 'Cluey',
    baseUrl: 'https://cluecabulary-proxy.kristoffer-kai.workers.dev/v1',
    note: 'No key needed — this one is set up for you, and which model answers is set on the server.',
  },
]

/** Which preset a base URL corresponds to, for showing the chip as selected. */
export function providerFor(baseUrl: string): Provider | undefined {
  const normalized = baseUrl.trim().replace(/\/+$/, '').toLowerCase()
  return PROVIDERS.find((p) => p.baseUrl.toLowerCase() === normalized)
}
