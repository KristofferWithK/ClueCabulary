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
 * See proxy/README.md. Deploy: `npx wrangler deploy` from this directory, then
 * `npx wrangler secret put OLLAMA_API_KEY`.
 */

const UPSTREAM = 'https://ollama.com'

function corsHeaders(env) {
  // Optionally lock this to the origin you play from, e.g.
  // https://kristofferwithk.github.io — set ALLOWED_ORIGIN as a Worker var.
  // Do that whenever the key lives here: without it, any website could spend
  // your subscription through this worker.
  return {
    'Access-Control-Allow-Origin': env?.ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

export default {
  async fetch(request, env) {
    const cors = corsHeaders(env)
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
    let upstream
    try {
      upstream = await fetch(`${UPSTREAM}${url.pathname}${url.search}`, {
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
