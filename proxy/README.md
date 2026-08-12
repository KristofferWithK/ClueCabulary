# CORS proxy for Ollama Cloud (only if you need it)

The app first tries to talk to `https://ollama.com/v1` directly from your
phone's browser. If Settings → **Test connection** reports a CORS failure,
ollama.com doesn't allow browser requests, and you need this tiny proxy —
a free Cloudflare Worker that just forwards your requests and adds the CORS
headers. Your API key is never stored on the proxy.

## Deploy in ~5 minutes

1. Create a free account at https://dash.cloudflare.com (no domain needed).
2. Go to **Workers & Pages → Create → Worker**, give it a name like
   `cluecabulary-proxy`, and deploy the hello-world it offers.
3. Click **Edit code**, replace everything with the contents of
   [`worker.js`](./worker.js), and **Deploy**.
4. Copy your worker URL, e.g. `https://cluecabulary-proxy.<you>.workers.dev`.
5. In the app: **Settings → Base URL** → set it to your worker URL **plus
   `/v1`**, e.g. `https://cluecabulary-proxy.<you>.workers.dev/v1`.
6. Tap **Test connection** — it should succeed now.

## Optional hardening

In `worker.js`, change `ALLOWED_ORIGIN` from `'*'` to the exact origin you
play from (for GitHub Pages that is `https://<username>.github.io`) so no
other website can use your proxy. Requests still require your API key either
way. Note that it is the **origin** only — scheme, host and port, with no path
and no trailing slash.

## What it does, and what it refuses to do

It forwards the path and query to `ollama.com` and sends exactly two headers:
your `Authorization` and `Content-Type: application/json`. Nothing else on the
incoming request — cookies included — is passed on. The upstream status and
body come back untouched, with the CORS headers replaced rather than appended,
so the app's own error messages still say what went wrong.

If ollama.com cannot be reached, the worker answers `502` itself instead of
letting the request throw. An uncaught throw becomes Cloudflare's error page,
which carries no CORS headers, so your browser would call it a CORS failure and
the app would tell you to deploy the proxy you are already using.

## Is any of this actually tested?

Yes. `proxy/worker.test.mjs` covers the contract above, and
`node e2e/proxy-drive.mjs` runs **this file, unmodified** on the Cloudflare
runtime (via miniflare) with the app talking to it from a real browser and an
upstream that deliberately sends no CORS headers — including the origin lock
above, which has to both let you in and shut everyone else out.
