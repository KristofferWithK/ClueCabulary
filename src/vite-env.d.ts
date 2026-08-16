/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />

/** Build identity, injected by vite.config.ts. */
declare const __BUILD_STAMP__: string
/** The TestFlight build number, or '' on the web. See vite.config.ts. */
declare const __TF_BUILD__: string
