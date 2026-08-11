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

export const DebriefResponseSchema = z.object({
  // Empty strings are "valid but blank" — force the retry flow instead.
  summary: z.string().trim().min(1),
  takeaways: z.array(z.string().trim().min(1)).min(1).max(6),
})
export type DebriefResponse = z.infer<typeof DebriefResponseSchema>
