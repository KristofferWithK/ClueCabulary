import type { WordEntry } from '../../data/types'
import functionWords from '../../data/function-words.da.json'
import raw from '../../data/words.da.json'
import type { LanguagePack } from '../types'
import { danishCopy } from './copy'
import { danishGrammar } from './grammar'
import { danishMorphology } from './morphology'
import { danishOrthography } from './orthography'
import { danishPrompts } from './prompts'
import { danishRoute } from './route'

/**
 * Danish: the only pack that ships, and the one every rule in the engine was
 * measured against.
 *
 * It is deliberately assembled the same way a second pack would be — nothing
 * here is a shortcut the seam allows only because Danish came first. If adding
 * German turns out to need a change outside `src/lang/`, that is the seam
 * leaking rather than German being unusual.
 */
export const danish: LanguagePack = {
  code: 'da',
  name: 'Danish',
  endonym: 'Dansk',
  words: raw as WordEntry[],
  speech: {
    tag: 'da-DK',
    // A touch slower for learners. Measured on the device voice, where the
    // default ran «hvad hedder du» together into one word.
    rate: 0.88,
  },
  orthography: danishOrthography,
  morphology: danishMorphology,
  grammar: danishGrammar,
  route: danishRoute,
  prompts: danishPrompts,
  copy: danishCopy,
  // The same file measure-function-words.mjs counts, so the measurement and
  // the story targets can never drift apart. Class order is target priority —
  // conjunctions first, because they are the measured hole (hvis 0/900).
  functionWords,
}
