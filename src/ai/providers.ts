/**
 * The OpenAI-compatible services this app is known to speak to.
 *
 * Data only. It exists because typing
 * "https://generativelanguage.googleapis.com/v1beta/openai" into a phone is a
 * miserable way to find out whether a provider works, and switching between
 * two of them should cost one tap.
 *
 * No model names here on purpose. Ollama and Gemini both publish conflicting
 * ids for the same model — gpt-oss:120b against gpt-oss:120b-cloud,
 * gemini-2.5-flash against a dated preview — and a wrong guess returns a 404
 * that reads as a broken endpoint. Settings asks the server instead.
 */
export interface Provider {
  id: string
  label: string
  /** Base URL; the client appends /chat/completions and /models. */
  baseUrl: string
  /** Where to get a key, for the link next to the field. */
  keysAt: string
  /** What is actually known about using it from a browser. */
  note: string
}

export const PROVIDERS: readonly Provider[] = [
  {
    id: 'gemini',
    label: 'Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    keysAt: 'https://aistudio.google.com/apikey',
    note: 'Works straight from the phone, no proxy — this is the one that has been played on.',
  },
  {
    id: 'ollama',
    label: 'Ollama Cloud',
    baseUrl: 'https://ollama.com/v1',
    keysAt: 'https://ollama.com/settings/keys',
    note: 'Refuses browser requests — measured on a real phone. This one needs the proxy.',
  },
]

/** Which preset a base URL corresponds to, for showing the chip as selected. */
export function providerFor(baseUrl: string): Provider | undefined {
  const normalized = baseUrl.trim().replace(/\/+$/, '').toLowerCase()
  return PROVIDERS.find((p) => p.baseUrl.toLowerCase() === normalized)
}
