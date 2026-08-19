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
  useJourney.setState({
    cityIndex: next.journey.cityIndex,
    wrapped: next.journey.wrapped,
    arrivedAt: asNumberKeys(next.journey.arrivedAt as unknown as Record<string, number>),
  })
  if (restorePrefs) {
    useSettings.getState().set({
      gridSize: next.prefs.gridSize as GridSize,
      clueLanguage: next.prefs.clueLanguage as 'da' | 'en',
      studyPhase: next.prefs.studyPhase as StudyMode,
    })
  }
}

export type RestoreMode = 'merge' | 'replace'

export function restore(backup: Backup, mode: RestoreMode) {
  const current = readSnapshot()
  if (mode === 'replace') writeSnapshot(replaceSnapshot(backup), true)
  else writeSnapshot(mergeSnapshot(current, backup), false)
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
      await nav.share({ files: [file], title: 'ClueCabulary collection' })
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
