export type GridSize = 'beginner' | 'standard'

export interface GridConfig {
  rows: number
  cols: number
  totalWords: number
  /** Greens on each side's key. */
  greensPerSide: number
  /** Greens shared by both keys. */
  greenOverlap: number
  forbiddenPerSide: number
  /** Cross-side identity of each side's forbidden words (must sum to forbiddenPerSide). */
  forbiddenBothSides: number
  /** Per side: forbidden here, green on the other key. */
  forbiddenVsGreen: number
  /** Per side: forbidden here, bystander on the other key. */
  forbiddenVsBystander: number
  /** Total clues allowed across both sides (shared pool). */
  turnTokens: number
  /** SRS: cap on never-seen words per board. */
  maxNewWordsPerBoard: number
}

/**
 * Codenames-Duet ratios (25 words, 9 greens/side, 3 overlap, 3 forbidden/side
 * with 1-1-1 cross identity, 9 timer tokens) scaled down. Slightly more clues
 * per green than Duet — appropriate for learners. Tunable after playtesting.
 */
export const GRID_CONFIGS: Record<GridSize, GridConfig> = {
  beginner: {
    rows: 3,
    cols: 4,
    totalWords: 12,
    greensPerSide: 5,
    greenOverlap: 2, // 8 distinct greens
    forbiddenPerSide: 1,
    forbiddenBothSides: 0,
    forbiddenVsGreen: 0,
    forbiddenVsBystander: 1,
    turnTokens: 6,
    maxNewWordsPerBoard: 4,
  },
  standard: {
    rows: 4,
    cols: 5,
    totalWords: 20,
    greensPerSide: 7,
    greenOverlap: 2, // 12 distinct greens
    forbiddenPerSide: 3,
    forbiddenBothSides: 1,
    forbiddenVsGreen: 1,
    forbiddenVsBystander: 1,
    turnTokens: 8,
    maxNewWordsPerBoard: 6,
  },
}

export function assertConfigConsistent(c: GridConfig): void {
  if (c.rows * c.cols !== c.totalWords) {
    throw new Error(`grid ${c.rows}x${c.cols} != totalWords ${c.totalWords}`)
  }
  if (c.forbiddenBothSides + c.forbiddenVsGreen + c.forbiddenVsBystander !== c.forbiddenPerSide) {
    throw new Error('forbidden cross-identity counts must sum to forbiddenPerSide')
  }
  const perSideOnlyGreens = c.greensPerSide - c.greenOverlap - c.forbiddenVsGreen
  if (perSideOnlyGreens < 0) {
    throw new Error('greensPerSide too small for overlap + forbiddenVsGreen')
  }
  const used =
    c.greenOverlap +
    2 * perSideOnlyGreens +
    c.forbiddenBothSides +
    2 * c.forbiddenVsGreen +
    2 * c.forbiddenVsBystander
  if (used > c.totalWords) {
    throw new Error(`key slots (${used}) exceed board size (${c.totalWords})`)
  }
}
