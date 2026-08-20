import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { storyTokens } from '../ai/companion'
import type { StoryResponse } from '../ai/schemas'
import { ACTIVE } from '../lang/active'
import type { LanguagePack } from '../lang/types'

/**
 * Which function words the post-round stories have actually shown the player.
 *
 * The dataset cannot carry these words — nothing in the nine hundred is a
 * conjunction or a particle, and the example sentences were measured to reach
 * barely half the inventory (`scripts/measure-function-words.mjs`, the
 * measurement that justified H5). So the stories are written TO this ledger:
 * `pickStoryTargets` hands the least-met words to the prompt, the companion
 * verifies they are really in the reply, and `recordStory` marks everything
 * the verified story contained. Round by round the targets walk the tail —
 * hvis, fordi, selvom — because the common words mark themselves met in any
 * story's connective tissue and stop being picked.
 *
 * Keys are `da:hvis`-shaped: the language travels in the id, so every
 * language shares this ONE store — the same rule as `srsStore.stats` and
 * `journeyStore.wrapped`, and the note at the bottom of `src/lang/index.ts`
 * says why splitting per language would be the mistake.
 */
interface CoverageStore {
  /** functionWordId -> number of verified stories it has appeared in. */
  met: Record<string, number>
  /**
   * Record one verified story. Counts every inventory word the story
   * contains — targets and incidental alike — because the player met them
   * either way, and counting only the targets would keep re-picking words
   * every story already teaches for free.
   */
  recordStory: (story: StoryResponse) => void
}

const fwId = (form: string) => `${ACTIVE.code}:${form}`

/** The active language's inventory as a flat set of surface forms. */
const inventory = (pack: LanguagePack): string[] => [
  ...new Set(Object.values(pack.functionWords).flat()),
]

export const useCoverage = create<CoverageStore>()(
  persist(
    (set) => ({
      met: {},
      recordStory: (story) => {
        const text = story.sentences.map((s) => s.da).join(' ')
        const tokens = new Set(storyTokens(text))
        const present = inventory(ACTIVE).filter((w) => tokens.has(w))
        if (present.length === 0) return
        set((s) => {
          const met = { ...s.met }
          for (const w of present) met[fwId(w)] = (met[fwId(w)] ?? 0) + 1
          return { met }
        })
      },
    }),
    { name: 'cluecab-coverage-v1', version: 1 },
  ),
)

/**
 * The function words the next story should be written around.
 *
 * Least-met first; ties broken by the pack's own order, which is a priority
 * list on purpose — classes are ordered with the measured hole (the
 * conjunctions) first, and words within a class with the measured absentees
 * first, so the very first story a player ever earns is asked for «hvis».
 * Pure and exported for tests; the store's `met` is passed in rather than
 * read, so a test needs no store at all.
 */
export function pickStoryTargets(
  met: Record<string, number>,
  count = 3,
  pack: LanguagePack = ACTIVE,
): string[] {
  const seen = new Set<string>()
  const ordered: string[] = []
  for (const cls of Object.values(pack.functionWords)) {
    for (const w of cls) {
      if (!seen.has(w)) {
        seen.add(w)
        ordered.push(w)
      }
    }
  }
  return ordered
    .map((w, i) => ({ w, i, n: met[`${pack.code}:${w}`] ?? 0 }))
    .sort((a, b) => a.n - b.n || a.i - b.i)
    .slice(0, count)
    .map((x) => x.w)
}
