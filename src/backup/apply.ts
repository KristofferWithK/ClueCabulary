import { ACTIVE } from '../lang/active'
import { useJourney } from '../stores/journeyStore'
import { useSettings } from '../stores/settingsStore'
import { useSrs } from '../stores/srsStore'
import type { GridSize } from '../engine/config'
import type { StudyMode } from '../journey/progress'
import {
  BACKUP_FILENAME,
  buildBackup,
  mergeSnapshot,
  replaceSnapshot,
  type Backup,
  type Snapshot,
} from './backup'

/** The live stores, flattened into the shape the pure module works on. */
export function readSnapshot(): Snapshot {
  const srs = useSrs.getState()
  const j = useJourney.getState()
  const s = useSettings.getState()
  return {
    stats: srs.stats,
    games: srs.games,
    journey: {
      cityIndex: j.cityIndex,
      wrapped: j.wrapped,
      arrivedAt: j.arrivedAt,
    },
    prefs: { gridSize: s.gridSize, clueLanguage: s.clueLanguage, studyPhase: s.studyPhase },
    language: ACTIVE.code,
  }
}

const asNumberKeys = (r: Record<string, number>): Record<number, number> =>
  Object.fromEntries(Object.entries(r).map(([k, v]) => [Number(k), v]))

function writeSnapshot(next: Snapshot, restorePrefs: boolean) {
  // Two keys, deliberately: the earned wrap-up bank is NOT in the backup and
  // is not touched by a restore. It is a spendable token rather than a record
  // of what happened, and the merge rule for everything here is Math.max —
  // which on a spendable would mint one back every time a file was reloaded.
  // The cost is that a restored device needs one win before its first wrap-up,
  // which is the unlock beat every device meets anyway.
  useSrs.setState({ stats: next.stats, games: next.games })
  // The words always land. The POSITION only lands if it is a position on the
  // route being travelled — a city index from another language counts
  // different cities, and writing it would move the player to a stop whose
  // hundred words they have never seen. A replace from a foreign file
  // therefore restores the whole collection and leaves the journey standing
  // where it was; `restore` returns that fact so the panel can say it.
  useJourney.setState(
    next.language === ACTIVE.code
      ? {
          cityIndex: next.journey.cityIndex,
          wrapped: next.journey.wrapped,
          arrivedAt: asNumberKeys(next.journey.arrivedAt as unknown as Record<string, number>),
        }
      : { wrapped: next.journey.wrapped },
  )
  if (restorePrefs) {
    useSettings.getState().set({
      gridSize: next.prefs.gridSize as GridSize,
      clueLanguage: next.prefs.clueLanguage,
      studyPhase: next.prefs.studyPhase as StudyMode,
    })
  }
}

export type RestoreMode = 'merge' | 'replace'

/**
 * Returns whether the file was from the language being played. False means the
 * words were restored and the journey position was not — see `writeSnapshot`.
 */
export function restore(backup: Backup, mode: RestoreMode): { sameLanguage: boolean } {
  const current = readSnapshot()
  if (mode === 'replace') writeSnapshot(replaceSnapshot(backup), true)
  else writeSnapshot(mergeSnapshot(current, backup), false)
  return { sameLanguage: backup.language === ACTIVE.code }
}

export function backupText(now: number): string {
  return JSON.stringify(buildBackup(readSnapshot(), now), null, 2)
}

/**
 * Hand the file to the phone. The share sheet is the only route that reliably
 * reaches Files or a mail app from an installed iOS PWA, so try it first and
 * keep the anchor download as the desktop and Android path.
 */
export async function downloadBackup(now: number): Promise<'shared' | 'downloaded'> {
  const text = backupText(now)
  const file = new File([text], BACKUP_FILENAME, { type: 'application/json' })

  const nav = navigator as Navigator & {
    canShare?: (data: { files?: File[] }) => boolean
    share?: (data: { files?: File[]; title?: string }) => Promise<void>
  }
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: '900Words collection' })
      return 'shared'
    } catch (e) {
      // A cancelled share is not a failure worth reporting; fall through to
      // the download so the button always does something.
      if (e instanceof DOMException && e.name === 'AbortError') return 'shared'
    }
  }

  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = BACKUP_FILENAME
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
  return 'downloaded'
}
