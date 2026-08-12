/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Deployed as a GitHub Pages project site: https://kristofferwithk.github.io/ClueCabulary/
export default defineConfig({
  base: '/ClueCabulary/',
  plugins: [
    react(),
    VitePWA({
      // 'prompt', not 'autoUpdate': autoUpdate can swap the app out from under
      // a round in progress, and it gave the player no way to know a new
      // version existed. UpdateBanner asks instead.
      registerType: 'prompt',
      includeAssets: ['icons/icon-192.png', 'icons/icon-512.png'],
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
            src: 'icons/icon-512.png',
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
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
