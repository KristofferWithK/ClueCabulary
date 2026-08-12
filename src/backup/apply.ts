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
      stamps: j.stamps,
      banked: j.banked,
      trialsSpent: j.trialsSpent,
      arrivedAt: j.arrivedAt,
    },
    prefs: { gridSize: s.gridSize, clueLanguage: s.clueLanguage, studyPhase: s.studyPhase },
  }
}

const asNumberKeys = (r: Record<string, number>): Record<number, number> =>
  Object.fromEntries(Object.entries(r).map(([k, v]) => [Number(k), v]))

function writeSnapshot(next: Snapshot, restorePrefs: boolean) {
  useSrs.setState({ stats: next.stats, games: next.games })
  useJourney.setState({
    cityIndex: next.journey.cityIndex,
    stamps: asNumberKeys(next.journey.stamps as Record<string, number>),
    banked: next.journey.banked,
    trialsSpent: asNumberKeys(next.journey.trialsSpent as Record<string, number>),
    arrivedAt: asNumberKeys(next.journey.arrivedAt as Record<string, number>),
    // A restored exam would be a paper drawn on another device, with an
    // attempt spent there. Never carry one across.
    activeExam: null,
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
