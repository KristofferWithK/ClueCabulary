import type { TargetCopy } from '../types'

/**
 * The four places the Danish build speaks Danish at the player rather than
 * English. See `TargetCopy` for why each one is an exception to the
 * English-chrome rule.
 */
export const danishCopy: TargetCopy = {
  welcome: 'Velkommen til',
  journeyOver: 'Rejsen er slut',
  answerPlaceholder: 'dansk…',
  tips: [
    'æ, ø and å can only be Danish. A word with one of them is never English.',
    'Danish nouns carry their gender like luggage: learn «et hus», not just «hus».',
    'A compound of two words you know is a word you know: morgenmad, dyreliv.',
    'The definite article goes on the END in Danish: huset is “the house”.',
    'Danes count in twenties: halvtreds — fifty — is “half third times twenty”.',
  ],
}
