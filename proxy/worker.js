/**
 * ClueCabulary CORS proxy — a Cloudflare Worker that forwards OpenAI-compatible
 * requests to ollama.com and adds the CORS headers browsers need.
 *
 * Only needed if the app's "Test connection" reports a CORS failure when
 * talking to https://ollama.com/v1 directly. See proxy/README.md for the
 * 5-minute deploy guide. Your API key stays on your phone: it is passed
 * through per-request and never stored here.
 */

const UPSTREAM = 'https://ollama.com'

// Optionally lock this down to your GitHub Pages origin, e.g.
// 'https://kristofferwithk.github.io'. '*' works but lets any site use the
// proxy (they would still need your API key to do anything).
const ALLOWED_ORIGIN = '*'

const corsHeaders = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Max-Age': '86400',
}

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders })
    }
    if (request.method !== 'POST') {
      return new Response('Only POST is supported', { status: 405, headers: corsHeaders })
    }

    const url = new URL(request.url)
    const upstream = await fetch(`${UPSTREAM}${url.pathname}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: request.headers.get('Authorization') ?? '',
      },
      body: request.body,
    })

    const headers = new Headers(upstream.headers)
    for (const [k, v] of Object.entries(corsHeaders)) headers.set(k, v)
    return new Response(upstream.body, { status: upstream.status, headers })
  },
}
