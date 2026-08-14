const REPO = 'https://github.com/KristofferWithK/ClueCabulary'

/**
 * How to wake Cluey up, on the device you are holding.
 *
 * This used to be a paragraph of small print ending in a link to a markdown
 * file on GitHub — which on a phone means squinting, then leaving the app to
 * read a wall of text, then coming back. The steps are short and every one of
 * them is a tap, so they belong here.
 *
 * Collapsed once Cluey has actually answered: at that point it is history.
 */
export function ConnectCluey({ verified }: { verified: boolean }) {
  return (
    <details className="connect-cluey" open={!verified}>
      <summary>
        {verified ? 'Connected. How this was set up' : 'Cluey is not connected — 30 seconds to fix'}
      </summary>

      <p className="connect-lede">
        <strong>Use Gemini.</strong> Tap it above, paste a{' '}
        <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">
          Gemini key
        </a>
        , tap <strong>List models this server accepts</strong>, pick one. That is the whole setup —
        it has been played on from a phone, with no proxy involved.
      </p>
      <p className="connect-lede">
        <strong>Ollama Cloud will not work directly.</strong> Measured on a phone: it refuses
        browser requests, and no key or model name gets around it. Only if you want that service
        specifically do you need the steps below.
      </p>

      <ol className="connect-steps">
        <li>
          <a href="https://dash.cloudflare.com" target="_blank" rel="noreferrer">
            Create a free Cloudflare account
          </a>{' '}
          — no domain needed.
        </li>
        <li>
          <a href="https://dash.cloudflare.com/profile/api-tokens" target="_blank" rel="noreferrer">
            Create an API token
          </a>{' '}
          with the <em>Edit Cloudflare Workers</em> template. Your Account ID is on the Workers
          &amp; Pages page.
        </li>
        <li>
          <a href={`${REPO}/settings/secrets/actions/new`} target="_blank" rel="noreferrer">
            Add three repository secrets
          </a>
          : <code>CLOUDFLARE_API_TOKEN</code>, <code>CLOUDFLARE_ACCOUNT_ID</code>,{' '}
          <code>OLLAMA_API_KEY</code>.
        </li>
        <li>
          <a
            href={`${REPO}/actions/workflows/deploy-proxy.yml`}
            target="_blank"
            rel="noreferrer"
          >
            Run the “Deploy the AI proxy” workflow
          </a>
          . Its summary prints the address to use.
        </li>
        <li>
          Paste that address into <strong>Base URL</strong> below and leave <strong>API key</strong>{' '}
          empty — the proxy holds the key, so it never sits on this phone. For Gemini, set{' '}
          <code>UPSTREAM</code> on the worker to{' '}
          <code>https://generativelanguage.googleapis.com</code>; one worker serves either service.
        </li>
        <li>
          Tap <strong>List models this server accepts</strong>, pick one, and play.
        </li>
      </ol>

      <p className="connect-foot">
        Prefer the key on this phone? Paste it into the API key field instead — a key sent by the
        app is used ahead of the proxy's own.{' '}
        <a href={`${REPO}/blob/main/proxy/README.md`} target="_blank" rel="noreferrer">
          The full guide
        </a>{' '}
        covers the command-line route.
      </p>
    </details>
  )
}
