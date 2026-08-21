/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Deployed as a GitHub Pages project site: https://kristofferwithk.github.io/ClueCabulary/
// Stamped into the bundle so a screenshot of Settings says which build it is.
// Without it, "have you got the update?" is unanswerable, and an installed PWA
// can sit on a version for days.
const BUILD_STAMP =
  process.env.GITHUB_SHA?.slice(0, 7) ?? new Date().toISOString().slice(0, 16).replace('T', ' ')

// CAP_BUILD=1 builds for the native shell instead of GitHub Pages: assets are
// served from the app bundle, so the base is relative rather than the Pages
// project path, and the service worker stays out — updates ride TestFlight
// builds there, and a worker inside a WKWebView is a second update mechanism
// fighting the first.
const CAP = process.env.CAP_BUILD === '1'

// The TestFlight build number, stamped in by the workflow. Empty for the web,
// where the git sha above is the identity that matters — but on a phone the
// number TestFlight shows is the only one a player can compare against.
const TF_BUILD = process.env.TF_BUILD ?? ''

export default defineConfig({
  base: CAP ? './' : '/ClueCabulary/',
  define: {
    __BUILD_STAMP__: JSON.stringify(BUILD_STAMP),
    __TF_BUILD__: JSON.stringify(TF_BUILD),
  },
  plugins: [
    react(),
    VitePWA({
      disable: CAP,
      // 'prompt', not 'autoUpdate': autoUpdate can swap the app out from under
      // a round in progress, and it gave the player no way to know a new
      // version existed. UpdateBanner asks instead.
      registerType: 'prompt',
      includeAssets: ['icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-512-maskable.png'],
      manifest: {
        // Display name only. `start_url`/`scope` below stay on the
        // /ClueCabulary/ path — that is the repo name, and the rename is held
        // for the owner (docs/DECISIONS.md). Moving one without the other
        // breaks the deploy.
        name: '900words',
        short_name: '900words',
        description:
          'Learn Danish vocabulary through a cooperative word-association game with an AI companion.',
        start_url: '/ClueCabulary/',
        scope: '/ClueCabulary/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#ffffff',
        theme_color: '#ffffff',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            // Its own artwork: a maskable icon may be cropped to a circle, and
            // the plain one's grid runs too close to the edge to survive it.
            src: 'icons/icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // The app shell and word data are precached; AI calls are network-only.
        globPatterns: ['**/*.{js,css,html,png,svg,json,woff2}'],
        // The baked word clips are the one thing in dist/ that must NOT be
        // precached. There are ~900 of them and they are ~9MB together, so
        // precaching would make the install download the entire dictionary's
        // audio before the app would open offline — for a player who may only
        // ever hear a few hundred words. They are runtime-cached instead, below.
        // Only manifest.json would be caught by the patterns above (mp3 is not
        // in them), but the ignore is stated so that adding mp3 to the list
        // later cannot quietly undo the decision.
        globIgnores: ['**/audio/**'],
        runtimeCaching: [
          {
            // CacheFirst, not StaleWhileRevalidate: the clip for «hus» is the
            // same bytes for ever, so a background revalidation would be a
            // request per word per session buying nothing. A re-bake with a
            // different voice keeps the same filenames, so it needs the
            // cacheName below bumped to v2 in the same commit — that is the
            // only way an already-installed phone hears the new voice before
            // the year is out.
            urlPattern: /\/audio\/.*\.mp3$/,
            handler: 'CacheFirst',
            options: {
              // v2: the word clips were re-baked at 1.0 when the 0.6 set moved
              // to audio/<lang>/slow, and the new ordinary clips have the same
              // filenames as the slow ones they replaced. Without the bump an
              // installed phone would keep the old slow audio for the year.
              cacheName: 'word-audio-v2',
              expiration: {
                // A little over the 1831 that exist — 900 ordinary, 900 slow
                // and 31 story sentences — so hearing every word both ways
                // never evicts the first one heard.
                maxEntries: 2000,
                maxAgeSeconds: 60 * 60 * 24 * 365,
                // Audio is the most disposable thing the app stores: losing it
                // costs the device voice, losing the shell costs the app. If
                // the browser runs the origin out of quota, this goes first.
                purgeOnQuotaError: true,
              },
              // 200 only. A 206 Partial Content cannot be put in the Cache API
              // at all, which is why speak.ts fetches the bytes itself and
              // hands them to the audio element as a blob rather than letting
              // the element request byte ranges of its own.
              cacheableResponse: { statuses: [200] },
              plugins: [
                {
                  /**
                   * A 200 is not enough: a single-page host answers an unknown
                   * path with index.html rather than a 404, so a word with no
                   * baked clip comes back 200 text/html — which is the state
                   * every word in this repo is in until the bake is run. Without
                   * this, CacheFirst files the app's own HTML under the clip's
                   * URL and keeps it there for a year.
                   *
                   * offline-drive measured exactly that and failed on it twice:
                   * once before the client-side check existed, and again after,
                   * because the client's clean-up raced workbox's write and lost.
                   * Refusing the write is the half that actually holds.
                   *
                   * The function is stringified into the generated worker, so it
                   * may not close over anything in this file.
                   */
                  cacheWillUpdate: async ({ response }: { response: Response }) => {
                    const type = response.headers.get('content-type') ?? ''
                    return type.toLowerCase().startsWith('audio/') ? response : null
                  },
                },
              ],
            },
          },
        ],
        navigateFallback: '/ClueCabulary/index.html',
        // Prompt mode turns both of these off. skipWaiting must stay off — that
        // is what lets the player choose the moment. clientsClaim has to come
        // back on: without it the very first visit is uncontrolled, so a player
        // who installs the app and goes offline has nothing cached yet. It only
        // affects a worker that is already activating, so it cannot jump the
        // queue past the prompt.
        clientsClaim: true,
        skipWaiting: false,
      },
    }),
  ],
  preview: {
    // e2e/story-drive.mjs maps this name to the local server so one context can
    // load the app as a non-local origin, where devSwitchesAllowed() is false.
    // Without it the first-run intro's dependence on that guard was invisible:
    // every drive ran on 127.0.0.1, which the app treats as local. `preview` is
    // a dev-server option and no part of the built output.
    allowedHosts: ['deployed.test'],
  },
  test: {
    environment: 'node',
    // proxy/ is plain JS, outside the app's tsconfig on purpose: it is pasted
    // into a Cloudflare dashboard, not bundled.
    include: ['src/**/*.test.ts', 'proxy/**/*.test.mjs'],
    // Agents' throwaway probes live here and are gitignored; they must not
    // join the suite that gates a commit.
    exclude: ['**/__probe__/**', '**/__fuzz__/**', '**/__scratch__/**', '**/probe_tmp/**', '**/node_modules/**'],
  },
})
