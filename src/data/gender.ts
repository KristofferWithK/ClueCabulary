

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
  /** Explicitly false only for mass and abstract nouns. */
  countable?: boolean
}

/** The gender in brackets, short enough for a 64px card. */
const bracketed = (w: Gendered): string | null =>
  w.gender === 'common' ? '(com)' : w.gender === 'neuter' ? '(neut)' : null

export function articleLabel(w: Gendered): string | null {
  if (w.pos !== 'noun') return null
  // Uncountable first: a mass noun may still carry an article in the data —
  // it is the gender, recorded the only way the source had — but printing it
  // in front of the word says you can count it, and you cannot.
  if (w.countable === false) return bracketed(w)
  if (w.article) return w.article
  return bracketed(w)
}

/** The same thing said in full, for a screen reader and the dictionary sheet. */
export function genderLabel(w: Gendered): string | null {
  if (w.pos !== 'noun') return null
  if (w.countable === false) {
    return w.gender === 'common' ? 'common gender' : w.gender === 'neuter' ? 'neuter gender' : null
  }
  if (w.article) return w.article
  return w.gender === 'common' ? 'common gender' : w.gender === 'neuter' ? 'neuter gender' : null
}
