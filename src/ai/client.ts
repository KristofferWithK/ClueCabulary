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

/**
 * The project's own proxy, because it is the only default that needs no setup.
 *
 * Gemini was the default while it was the one measured to answer a browser at
 * all, but it still asked every new player for an API key before Cluey could
 * say a word. This worker holds the key as a Cloudflare secret, so a fresh
 * install plays immediately with the key field left empty.
 *
 * Measured against the deployed worker on 2026-08-15, not inferred: the CORS
 * preflight ollama.com answers with a redirect comes back 204 here with
 * Access-Control-Allow-Origin for the Pages origin, /models lists 18 ids, and a
 * real round played through it — clue «hverdag» guessed, «familie» (3) back.
 *
 * The worker is origin-locked to the deployed app (ALLOWED_ORIGIN in
 * proxy/wrangler.toml). Anyone typing their own key or Base URL overrides this
 * and never touches the proxy; see proxy/README.md.
 */
export const DEFAULT_BASE_URL = 'https://cluecabulary-proxy.kristoffer-kai.workers.dev/v1'

/**
 * An alias, not a model — the proxy decides what actually answers.
 *
 * This was empty for as long as the app talked to services directly, because
 * Ollama and Gemini publish conflicting ids for the same model and a wrong
 * default returns a 404 that reads as a broken endpoint. Then it was
 * gpt-oss:120b, which fixed a fresh install but pinned Cluey's brain inside the
 * bundle: changing it meant a release, and every phone waiting to notice one.
 *
 * "cluey" is resolved by MODEL_ALIASES on the worker (proxy/wrangler.toml), so
 * which model answers is a proxy deploy — and a model id retired upstream is
 * fixed in one place instead of breaking every install at once.
 *
 * Only meaningful against the proxy. Switching provider in Settings clears it,
 * because no other service has heard of this name.
 */
export const DEFAULT_MODEL = 'cluey'

/**
 * What a 401 says now that there is no key to check.
 *
 * It used to read "The API key was rejected. Check it in Settings." — which was
 * true when every player pasted their own key, and became a wild goose chase
 * the moment the proxy started holding one: a player saw it mid-round and was
 * sent to a field they had never filled in, for a credential the app does not
 * have. (Seen on a real phone, which is what retired the field.)
 *
 * So it says what is actually true: the server refused, and it is not
 * something the person playing can fix from here.
 */
const AUTH_REFUSED =
  'Cluey’s server refused the request. Nothing to fix on this phone — try again in a moment, or play on without Cluey.'

/**
 * How long to wait for a clue before giving up on it.
 *
 * Generous, because a large model composing a clue from a 1,800-token prompt
 * is genuinely slow and cutting it off early would be worse than waiting. But
 * finite: with no timeout at all a request on a weak mobile connection hangs
 * until the network gives up on its own, and the app sits on "Cluey is
 * thinking…" with nothing to retry.
 */
const REQUEST_TIMEOUT_MS = 90_000

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
  // Sent empty, the model comes back a 404 that reads as a broken endpoint.
  if (!settings.model.trim()) {
    throw new AiError(
      'not-found',
      'No model chosen. In Settings, tap “List models this server accepts” and pick one.',
    )
  }
  // What the player typed, else the key shipped with the build.
  const key = effectiveKey(settings.apiKey)
  // Only ollama.com is asked for a key here. A local Ollama takes none, and a
  // proxy may hold the key itself as a server-side secret — which is the setup
  // the deploy guide recommends, because it keeps the key off the phone
  // entirely. Guessing "no key means broken" would break that.
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
        // A clue from a large model is slow, and a phone on one bar can hold a
        // request open indefinitely. Without this, a stalled call showed
        // "Cluey is thinking…" forever, then failed — seen on the device.
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      })
    } catch (e) {
      // fetch rejects without an HTTP status. Which of the possible reasons
      // gets named matters: this message used to blame CORS for all of them,
      // which sent a player to check a Base URL that was working, on a phone
      // that had simply lost its connection mid-request.
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        throw new AiError('network', 'You appear to be offline.')
      }
      if (e instanceof DOMException && e.name === 'TimeoutError') {
        throw new AiError(
          'network',
          `Cluey took longer than ${Math.round(REQUEST_TIMEOUT_MS / 1000)} seconds and the request was dropped. Retry, or play on without him.`,
        )
      }
      // A rejected fetch is a TypeError either way: the browser does not tell
      // a page whether a request was refused by policy or died on the network.
      // So both are named, in the order they actually happen — on a phone mid
      // round, a lost connection is the common case and a policy problem is
      // not, and leading with CORS sent a player to check a Base URL that was
      // working perfectly.
      throw new AiError(
        'cors',
        endpoint.hostname === 'ollama.com'
          ? 'ollama.com refused the browser request. It is reported to answer the CORS preflight with a redirect, which browsers will not follow — a key or model name cannot fix that. Deploy the small proxy and set it as the Base URL; Settings has the steps.'
          : 'Could not reach Cluey — the connection dropped, or the server refused the browser request (CORS). Retry, or play on without him; if it keeps happening, check the Base URL in Settings.',
      )
    }
  }

  let res = await doFetch()
  if (res.status >= 500) res = await doFetch()

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new AiError('auth', AUTH_REFUSED)
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
