

/**
 * What to print in front of a noun.
 *
 * The indefinite article where one exists, and the gender in brackets where one
 * does not. A handful of nouns are plurale tantum — penge, bukser, briller —
 * so there is no "en penge" to show, and the board used to print nothing at all
 * beside them. That taught the learner less than any other card on the board:
 * the gender is what decides the definite ending and every agreeing adjective,
 * and it exists whether or not the word can be counted.
 *
 * Short forms because this sits on a 64px-wide card at 360px: (com) and (neut).
 */
/**
 * Structurally typed rather than tied to WordEntry, because the board carries
 * its own trimmed copy (BoardWord) whose `pos` is a plain string.
 */
interface Gendered {
  pos: string
  article?: 'en' | 'et'
  gender?: 'common' | 'neuter'
}

export function articleLabel(w: Gendered): string | null {
  if (w.pos !== 'noun') return null
  if (w.article) return w.article
  if (w.gender === 'common') return '(com)'
  if (w.gender === 'neuter') return '(neut)'
  return null
}

/** The same thing said in full, for a screen reader and the dictionary sheet. */
export function genderLabel(w: Gendered): string | null {
  if (w.pos !== 'noun') return null
  if (w.article) return w.article
  if (w.gender === 'common') return 'common gender'
  if (w.gender === 'neuter') return 'neuter gender'
  return null
}
