import { effectiveKey } from './bundled-key'
import type { ChatMessage } from './prompts'

export interface AiSettings {
  /** OpenAI-compatible base, e.g. https://ollama.com/v1 or a personal proxy. */
  baseUrl: string
  apiKey: string
  model: string
}

export type AiErrorKind =
  | 'cors'
  | 'network'
  | 'auth'
  | 'not-found'
  | 'rate-limit'
  | 'server'
  | 'invalid-response'

export class AiError extends Error {
  constructor(
    public kind: AiErrorKind,
    message: string,
  ) {
    super(message)
    this.name = 'AiError'
  }
}

export const DEFAULT_BASE_URL = 'https://ollama.com/v1'
export const DEFAULT_MODEL = 'gpt-oss:120b'

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1'])

/**
 * Resolve the endpoint, refusing anything that would carry the API key
 * somewhere it does not belong.
 *
 * The Base URL is free text the player types. Left to fetch, "myproxy.dev/v1"
 * is a RELATIVE url — it resolves against the page's own origin, so the request
 * (Authorization header and all) goes to whatever host is serving the app, and
 * the key lands in someone else's access log. "//host/v1" is worse: it is
 * protocol-relative and silently goes wherever it says.
 *
 * So: absolute only, https only, with plain http allowed just for a local
 * Ollama, where there is no network to intercept.
 */
export function resolveEndpoint(baseUrl: string): URL {
  const trimmed = baseUrl.trim().replace(/\/+$/, '')
  let url: URL
  try {
    // No base argument: anything relative or protocol-relative throws here.
    url = new URL(`${trimmed}/chat/completions`)
  } catch {
    throw new AiError(
      'network',
      'The Base URL must be a full address starting with https:// — check it in Settings.',
    )
  }
  const local = LOCAL_HOSTS.has(url.hostname)
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) {
    throw new AiError(
      'network',
      `The Base URL must use https:// (http:// is allowed only for a local Ollama). Check it in Settings.`,
    )
  }
  return url
}

export type ChatFn = (
  settings: AiSettings,
  messages: ChatMessage[],
  opts?: { temperature?: number },
) => Promise<unknown>

/**
 * One chat-completion call that must return JSON. Distinguishes CORS/auth/
 * model errors so Settings can give actionable advice; retries once on 5xx.
 */
export const chatJson: ChatFn = async (settings, messages, opts) => {
  // Before any header is built, let alone sent.
  const endpoint = resolveEndpoint(settings.baseUrl)
  // Only ollama.com is asked for a key here. A local Ollama takes none, and a
  // proxy may hold the key itself as a server-side secret — which is the setup
  // the deploy guide recommends, because it keeps the key off the phone
  // entirely. Guessing "no key means broken" would break that.
  if (!settings.model.trim()) {
    // Sent empty, this comes back a 404 and reads as a broken endpoint.
    throw new AiError(
      'not-found',
      `No model chosen. Set one in Settings — “List models this server accepts” fills it in, and the usual default is ${DEFAULT_MODEL}.`,
    )
  }
  // What the player typed, else the key shipped with the build.
  const key = effectiveKey(settings.apiKey)
  if (!key && endpoint.hostname === 'ollama.com') {
    throw new AiError(
      'auth',
      'No API key. Add one above, or point the Base URL at a proxy that holds the key — the steps are at the top of this screen.',
    )
  }
  const doFetch = async (): Promise<Response> => {
    try {
      return await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // Omitted entirely when empty: a bare "Bearer " would shadow the
          // key a proxy holds as its own secret.
          ...(key ? { Authorization: `Bearer ${key}` } : {}),
        },
        body: JSON.stringify({
          model: settings.model,
          messages,
          temperature: opts?.temperature ?? 0.5,
          response_format: { type: 'json_object' },
        }),
      })
    } catch {
      // fetch rejects without an HTTP status: offline or blocked by CORS.
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        throw new AiError('network', 'You appear to be offline.')
      }
      throw new AiError(
        'cors',
        endpoint.hostname === 'ollama.com'
          ? 'ollama.com refused the browser request. It is reported to answer the CORS preflight with a redirect, which browsers will not follow — a key or model name cannot fix that. Deploy the small proxy and set it as the Base URL; Settings has the steps.'
          : 'The AI server refused the browser request (likely CORS). Check the Base URL in Settings.',
      )
    }
  }

  let res = await doFetch()
  if (res.status >= 500) res = await doFetch()

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new AiError('auth', 'The API key was rejected. Check it in Settings.')
    }
    if (res.status === 404) {
      throw new AiError('not-found', 'Model or endpoint not found. Check the model name and Base URL in Settings.')
    }
    if (res.status === 429) {
      throw new AiError('rate-limit', 'Rate limited by the AI server. Wait a moment and retry.')
    }
    throw new AiError('server', `AI server error (HTTP ${res.status}).`)
  }

  let content: string
  try {
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
    content = data.choices?.[0]?.message?.content ?? ''
  } catch {
    throw new AiError('invalid-response', 'The AI server returned a non-JSON body.')
  }
  if (!content) throw new AiError('invalid-response', 'The AI reply was empty.')

  const stripped = content.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '')
  try {
    return JSON.parse(stripped) as unknown
  } catch {
    // Models sometimes wrap the object in prose; salvage the outermost braces.
    const start = stripped.indexOf('{')
    const end = stripped.lastIndexOf('}')
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(stripped.slice(start, end + 1)) as unknown
      } catch {
        // fall through
      }
    }
    throw new AiError('invalid-response', 'The AI reply was not valid JSON.')
  }
}

/**
 * The model names Ollama Cloud will actually accept, so nobody has to guess
 * between "gpt-oss:120b" and "gpt-oss:120b-cloud" and read the 404 as a broken
 * setup. Same auth and same base URL as a real call, so it doubles as a
 * connection test that says something useful when it succeeds.
 */
export async function listModels(settings: AiSettings): Promise<string[]> {
  const endpoint = new URL(resolveEndpoint(settings.baseUrl).href.replace(/\/chat\/completions$/, '/models'))
  let res: Response
  try {
    const key = effectiveKey(settings.apiKey)
    res = await fetch(endpoint, {
      headers: key ? { Authorization: `Bearer ${key}` } : {},
    })
  } catch {
    throw new AiError(
      'cors',
      'The AI server refused the browser request — the usual cause is CORS. If this is ollama.com, deploy the small proxy and set it as the Base URL; Settings has the steps.',
    )
  }
  if (res.status === 401 || res.status === 403) {
    throw new AiError('auth', 'The API key was rejected. Check it in Settings.')
  }
  if (!res.ok) throw new AiError('server', `Could not list models (HTTP ${res.status}).`)
  try {
    const data = (await res.json()) as { data?: { id?: string }[] }
    const ids = (data.data ?? []).map((m) => m.id).filter((id): id is string => !!id)
    if (ids.length === 0) throw new Error('empty')
    return ids.sort()
  } catch {
    throw new AiError('invalid-response', 'The model list was not in the expected format.')
  }
}

/** Cheap connectivity probe for the Settings screen. */
export async function testConnection(settings: AiSettings): Promise<void> {
  await chatJson(settings, [
    { role: 'user', content: 'Reply with exactly this JSON object: {"ok": true}' },
  ])
}
