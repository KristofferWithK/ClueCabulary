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

export default defineConfig({
  base: '/ClueCabulary/',
  define: { __BUILD_STAMP__: JSON.stringify(BUILD_STAMP) },
  plugins: [
    react(),
    VitePWA({
      // 'prompt', not 'autoUpdate': autoUpdate can swap the app out from under
      // a round in progress, and it gave the player no way to know a new
      // version existed. UpdateBanner asks instead.
      registerType: 'prompt',
      includeAssets: ['icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-512-maskable.png'],
      manifest: {
        name: 'ClueCabulary',
        short_name: 'ClueCabulary',
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
