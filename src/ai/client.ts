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
  // Say the obvious thing immediately. Without a key the request still goes
  // out, and comes back as a 401 — or, more often, as a browser CORS refusal
  // that tells the player to deploy a proxy they do not need. A locally run
  // Ollama takes no key, so only remote hosts are asked for one.
  if (!settings.apiKey.trim() && !LOCAL_HOSTS.has(endpoint.hostname)) {
    throw new AiError(
      'auth',
      'No API key yet — add one in Settings. You can still finish a round without Klaus.',
    )
  }
  const doFetch = async (): Promise<Response> => {
    try {
      return await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${settings.apiKey}`,
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
        'The AI server refused the browser request (likely CORS). If this is ollama.com, deploy the bundled proxy (see proxy/README.md) and set it as the Base URL in Settings.',
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

/** Cheap connectivity probe for the Settings screen. */
export async function testConnection(settings: AiSettings): Promise<void> {
  await chatJson(settings, [
    { role: 'user', content: 'Reply with exactly this JSON object: {"ok": true}' },
  ])
}
