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
 * all, but it still asked every new player for an API key before Casey could
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
 * gpt-oss:120b, which fixed a fresh install but pinned Casey's brain inside the
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
  'Casey’s server refused the request. Nothing to fix on this phone — try again in a moment, or play on without Casey.'

/**
 * What a 429 says when it is the proxy's own daily cap rather than the
 * upstream's transient rate limit.
 *
 * The two are the same status code and mean opposite things: an upstream rate
 * limit clears in seconds and the right advice is "retry", while the cap lasts
 * until midnight UTC and retrying is the one thing that cannot help. Telling a
 * player to come back tomorrow when they could retry now would cost them the
 * session; telling them to keep retrying against a spent cap would waste the
 * evening. So the worker marks its own, and the two are told apart below.
 *
 * Names the button that is actually on screen. The error banner offers "Retry"
 * and "Play on without Casey" side by side, and Retry is the wrong one here —
 * the practice companion needs no network at all, so the round can still be
 * finished. Same lesson as the 401 above: say the thing the player can do.
 */
const DAILY_CAP_SPENT =
  'Casey has done all her thinking for today — this phone’s daily limit on her server is used up, and it resets at midnight UTC. Play on without Casey to finish the round: the practice companion needs no connection at all.'

/** The `code` the proxy puts in its own 429 body. See proxy/worker.js. */
const DAILY_CAP_CODE = 'cluecabulary_daily_cap'

/**
 * A random id for this install, so the proxy can meter per phone.
 *
 * Opaque and meaningless on purpose: a UUID with nothing in it derived from the
 * person, the device or anything they typed. It exists so a runaway retry loop
 * on one phone cannot spend the whole budget, and it identifies an install
 * rather than a player — clearing site data or reinstalling mints a new one,
 * which is fine, because the cap is a fuse and not an account.
 *
 * Sent ONLY when the app has no key of its own, which is exactly when the
 * server is paying. That rule does two things at once. It keeps the id off
 * every third-party endpoint a player might point their own key at — nobody
 * else needs to know this install exists — and it avoids adding a custom header
 * to a request bound for a service whose CORS policy has never heard of it,
 * which would turn the bring-your-own-key escape hatch into a preflight
 * failure.
 *
 * One case slips through that rule: a local Ollama also takes no key, so it
 * gets the header too. Whether it lists X-Install-Id in its preflight has not
 * been measured here — if a local endpoint ever fails at the preflight with
 * this header in it, that is the reason, and the fix is to send the id only to
 * hosts that are known proxies. It is left as-is because a local Ollama is a
 * deliberate Base URL edit on a developer's own machine, not a path any player
 * takes, and there is nothing to leak to your own laptop.
 */
const INSTALL_ID_KEY = 'cluecab-install-id'
let installIdCache: string | null = null

export function installId(): string {
  if (installIdCache) return installIdCache
  const mint = () =>
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : // Older WebViews have crypto but not randomUUID. Any random string does;
        // this is a bucket key, not a secret.
        `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
  try {
    const stored = localStorage.getItem(INSTALL_ID_KEY)
    if (stored) return (installIdCache = stored)
    const made = mint()
    localStorage.setItem(INSTALL_ID_KEY, made)
    return (installIdCache = made)
  } catch {
    // Private mode, or storage full. A per-session id still buckets a runaway
    // loop, which is the case this is really for; it just does not persist.
    return (installIdCache = mint())
  }
}

/**
 * How long to wait for a clue before giving up on it.
 *
 * Generous, because a large model composing a clue from a 1,800-token prompt
 * is genuinely slow and cutting it off early would be worse than waiting. But
 * finite: with no timeout at all a request on a weak mobile connection hangs
 * until the network gives up on its own, and the app sits on "Casey is
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

/**
 * The proxy's cascade marker: "the last answer was refused, give me the better
 * model". A query parameter rather than a header on purpose — a custom header
 * has to be listed in the proxy's Access-Control-Allow-Headers or the browser
 * refuses the request at the preflight, and the app and the worker deploy
 * separately, so a new app talking to an older worker would lose every
 * corrective retry to a CORS failure mid-round. An unknown query parameter is
 * ignored instead, and the retry simply happens on the same model as today.
 *
 * The app never learns which model this means. That stays in MODEL_ALIASES on
 * the worker (`escalate`), the same division of labour the alias itself has:
 * changing Casey's brain, either tier of it, is a proxy deploy and not a
 * release every phone has to notice.
 */
const TIER_PARAM = 'tier'
const ESCALATE_TIER = 'escalate'

export type ChatFn = (
  settings: AiSettings,
  messages: ChatMessage[],
  opts?: {
    temperature?: number
    /** Ask the proxy for its escalation tier. See TIER_PARAM. */
    escalate?: boolean
  },
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
  // Only when the server is the one paying, which is the same rule X-Install-Id
  // follows above and for the same reason: that is exactly the case where the
  // Base URL is our proxy, and nobody else's endpoint needs to be sent a
  // parameter it has never heard of. A player using their own key gets today's
  // retry, to today's model, on today's URL.
  if (opts?.escalate && !key) endpoint.searchParams.set(TIER_PARAM, ESCALATE_TIER)
  const doFetch = async (): Promise<Response> => {
    try {
      return await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // One or the other, never both. A key is omitted entirely when empty
          // — a bare "Bearer " would shadow the key a proxy holds as its own
          // secret — and having none is precisely the case where the server is
          // paying and wants to know which install is asking.
          ...(key ? { Authorization: `Bearer ${key}` } : { 'X-Install-Id': installId() }),
        },
        body: JSON.stringify({
          model: settings.model,
          messages,
          temperature: opts?.temperature ?? 0.5,
          response_format: { type: 'json_object' },
        }),
        // A clue from a large model is slow, and a phone on one bar can hold a
        // request open indefinitely. Without this, a stalled call showed
        // "Casey is thinking…" forever, then failed — seen on the device.
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
          `Casey took longer than ${Math.round(REQUEST_TIMEOUT_MS / 1000)} seconds and the request was dropped. Retry, or play on without her.`,
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
          : 'Could not reach Casey — the connection dropped, or the server refused the browser request (CORS). Retry, or play on without her; if it keeps happening, check the Base URL in Settings.',
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
      // Readable cross-origin because the proxy puts its CORS headers on the
      // 429 too; an upstream 429 that arrives without a body simply misses the
      // marker and gets the transient advice, which is the safe way round.
      const body = await res.text().catch(() => '')
      throw new AiError(
        'rate-limit',
        body.includes(DAILY_CAP_CODE)
          ? DAILY_CAP_SPENT
          : 'Rate limited by the AI server. Wait a moment and retry.',
      )
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
      // Same either/or as a chat call: whoever is paying is who gets told.
      headers: key ? { Authorization: `Bearer ${key}` } : { 'X-Install-Id': installId() },
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
