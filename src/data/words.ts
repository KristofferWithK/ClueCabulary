import type { WordEntry } from './types'
import raw from './words.da.json'

export const WORDS: WordEntry[] = raw as WordEntry[]

const byId = new Map(WORDS.map((w) => [w.id, w]))

export function wordById(id: string): WordEntry | undefined {
  return byId.get(id)
}
