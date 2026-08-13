/**
 * ClueCabulary's AI proxy — a Cloudflare Worker between the app and ollama.com.
 *
 * This is not optional and never was. A browser cannot call ollama.com: the
 * cloud API answers a CORS preflight with a redirect, and the fetch spec
 * forbids redirects on preflight, so Chrome and Safari refuse before the real
 * request is ever sent —
 *
 *   Access to fetch at 'https://ollama.com/...' has been blocked by CORS
 *   policy: Response to preflight request doesn't pass access control check:
 *   Redirect is not allowed for a preflight request.
 *
 * No API key, model name or app setting changes that. This worker answers the
 * preflight itself — never forwarding it, so there is no redirect to trip over
 * — and adds the headers the browser needs to the real response.
 *
 * Set OLLAMA_API_KEY as a Worker SECRET and the key never touches the app, the
 * repository, or the phone: the worker adds it per request and nothing that
 * reaches the browser contains it. A key sent by the app is used instead when
 * present, so both setups work.
 *
 * Whenever the key lives here, set ALLOWED_ORIGIN too. It is enforced on the
 * way in — see originAllowed — and without it this worker will attach your key
 * to a request from anyone who learns its URL.
 *
 * See proxy/README.md. Deploy: `npx wrangler deploy` from this directory, then
 * `npx wrangler secret put OLLAMA_API_KEY`.
 */

/**
 * Where requests are forwarded. Set UPSTREAM as a Worker variable to front a
 * different OpenAI-compatible service without editing this file — e.g.
 * https://generativelanguage.googleapis.com for Gemini, whose compatibility
 * layer wants the same Bearer token this worker already sends. The app's Base
 * URL keeps the path (/v1, or /v1beta/openai), so only the host moves.
 */
const DEFAULT_UPSTREAM = 'https://ollama.com'

/**
 * The origins allowed to spend this worker's key. Set ALLOWED_ORIGIN as a
 * Worker var — one origin, or several separated by commas — e.g.
 * https://kristofferwithk.github.io. Unset means anyone, which is only safe
 * while the worker holds no key of its own.
 */
const allowList = (env) =>
  (env?.ALLOWED_ORIGIN || '')
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean)

/**
 * Is this request allowed to use the worker's key?
 *
 * This has to be a real check on the way IN, and for a long time it was not:
 * ALLOWED_ORIGIN was only ever written into the Access-Control-Allow-Origin
 * response header, and that header is a rule the BROWSER applies to itself
 * when deciding whether a page may READ a reply. It stops nothing from being
 * sent. curl has no origin to lie about, a server-side script never asks
 * permission, and a third-party page can fire a no-cors POST it is not allowed
 * to read but which reaches the upstream all the same — with `Bearer
 * $OLLAMA_API_KEY` attached and billed to whoever deployed this. The
 * Content-Type rewrite below made that worse, laundering the text/plain body a
 * no-cors POST is limited to into the JSON the API accepts.
 *
 * A missing Origin is refused too, once a list is configured: the app is a
 * page on another host, so its requests always carry one, and the callers that
 * do not are exactly the ones this is for.
 */
function originAllowed(request, env) {
  const allowed = allowList(env)
  if (allowed.length === 0) return true
  const origin = (request.headers.get('Origin') ?? '').trim().replace(/\/+$/, '')
  return origin !== '' && allowed.includes(origin)
}

function corsHeaders(request, env) {
  const allowed = allowList(env)
  const origin = (request?.headers.get('Origin') ?? '').trim().replace(/\/+$/, '')
  return {
    // A single value, never the list: this header takes one origin, and a
    // comma-joined string matches nothing. Echo whichever entry asked, so a
    // list of several works; fall back to the first so a refusal is still
    // legible in devtools rather than silently header-less.
    'Access-Control-Allow-Origin':
      allowed.length === 0 ? '*' : allowed.includes(origin) ? origin : allowed[0],
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request, env)
    // Before anything else, and above all before the key is attached below.
    if (!originAllowed(request, env)) {
      return new Response('This proxy does not serve that origin.', { status: 403, headers: cors })
    }
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors })
    }
    // GET is allowed for /v1/models, which is how the app offers a list of
    // model names rather than making you guess one.
    if (request.method !== 'POST' && request.method !== 'GET') {
      return new Response('Only GET and POST are supported', { status: 405, headers: cors })
    }

    // The app's key wins when it sends one; otherwise the worker's own secret.
    // Either way the header is built here and never echoed back.
    // A bare "Bearer " counts as no key: older builds of the app sent that
    // when the field was blank, and it must not shadow the secret here.
    const fromApp = (request.headers.get('Authorization') ?? '').trim()
    const usable = fromApp && fromApp.toLowerCase() !== 'bearer' ? fromApp : ''
    const auth = usable || (env?.OLLAMA_API_KEY ? `Bearer ${env.OLLAMA_API_KEY}` : '')
    if (!auth) {
      return new Response(
        'No API key: send one from the app, or set OLLAMA_API_KEY as a secret on this worker.',
        { status: 401, headers: cors },
      )
    }

    const url = new URL(request.url)
    const base = (env?.UPSTREAM || DEFAULT_UPSTREAM).replace(/\/+$/, '')
    let upstream
    try {
      upstream = await fetch(`${base}${url.pathname}${url.search}`, {
        method: request.method,
        headers: { 'Content-Type': 'application/json', Authorization: auth },
        body: request.method === 'POST' ? request.body : undefined,
      })
    } catch {
      // An uncaught throw here becomes Cloudflare's error page, which carries
      // no CORS headers — so the browser reports a CORS failure and the app
      // tells you to deploy the proxy you are already using. Answer ourselves.
      return new Response('Could not reach the upstream AI server.', { status: 502, headers: cors })
    }

    const headers = new Headers(upstream.headers)
    for (const [k, v] of Object.entries(cors)) headers.set(k, v)
    return new Response(upstream.body, { status: upstream.status, headers })
  },
}
