import type { HistoryEntry } from '../../shared/types'

export interface DuplicateHit {
  reason: 'track' | 'archive' | 'fingerprint'
  entry: HistoryEntry
}

/**
 * A phone upload is a duplicate only when the server already has the audio.
 * An archive line with no file on disk is not a duplicate: the upload restores it.
 */
export function findDuplicate(input: {
  trackId: string
  source: string
  fingerprint?: string
  history: HistoryEntry[]
  archiveIds: Set<string>
  fileExists: (filePath: string) => boolean
}): DuplicateHit | null {
  const present = (entry: HistoryEntry | undefined): entry is HistoryEntry =>
    !!entry && !entry.missing && !!entry.filePath && input.fileExists(entry.filePath)

  const id = input.trackId.trim()
  if (id) {
    const byId = input.history.find((entry) => entry.trackId === id)
    if (present(byId)) {
      const key = `${input.source} ${id}`.toLowerCase()
      const archived =
        (input.source === 'youtube' || input.source === 'soundcloud') && input.archiveIds.has(key)
      return { reason: archived ? 'archive' : 'track', entry: byId }
    }
  }

  if (input.fingerprint) {
    const byFingerprint = input.history.find((entry) => entry.fingerprint === input.fingerprint)
    if (present(byFingerprint)) return { reason: 'fingerprint', entry: byFingerprint }
  }

  return null
}
