import { z } from 'zod'

export const ClueResponseSchema = z.object({
  clue: z.string().min(1),
  number: z.number().int().min(1).max(4),
  // Over-long lists are trimmed by the companion rather than wasting a retry.
  targetWordIds: z.array(z.string()).min(1),
  rationale: z.string(),
})
export type ClueResponse = z.infer<typeof ClueResponseSchema>

export const GuessResponseSchema = z.object({
  guesses: z
    .array(
      z.object({
        wordId: z.string(),
        confidence: z.number().min(0).max(1),
        reasoning: z.string(),
      }),
    )
    .min(1),
})
export type GuessResponse = z.infer<typeof GuessResponseSchema>

/**
 * A translation, for the field the player uses to compose a Danish clue or to
 * read one of Cluey's. Deliberately tiny: the whole value is being able to ask
 * without leaving the round.
 */
export const TranslationResponseSchema = z.object({
  /** The Danish form, citation form for a noun or bare infinitive for a verb. */
  da: z.string().trim().min(1),
  /** The English meaning. */
  en: z.string().trim().min(1),
  /** en/et for a noun, when it is one AND it can be counted. */
  article: z.enum(['en', 'et']).optional(),
  /**
   * The gender, on every noun — including the mass and abstract ones that take
   * no indefinite article. "trafik" is not something you can have one of, but
   * it is still common gender, and the definite form and every agreeing
   * adjective turn on that. The shipped thousand carry this in the data; a word
   * from outside them has only Cluey to ask.
   */
  gender: z.enum(['common', 'neuter']).optional(),
  /** False for a noun with no ordinary indefinite singular. */
  countable: z.boolean().optional(),
  /** One short line where the word needs it — false friends, register, usage. */
  note: z.string().trim().optional(),
})
export type TranslationResponse = z.infer<typeof TranslationResponseSchema>
