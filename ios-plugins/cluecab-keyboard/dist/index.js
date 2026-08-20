// The whole JS of the fork. Upstream's dist is nothing but this call plus
// types; re-registering under the same name keeps `plugins.Keyboard.resize`
// in capacitor.config.ts and the scraped packageClassList entry working
// unchanged. Hand-written and committed — no build step to break.
import { registerPlugin } from '@capacitor/core'

export const Keyboard = registerPlugin('Keyboard')
