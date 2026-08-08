import { appendHistory, ensureArchiveFile, loadHistory } from './settings'
import { trackSourceForUrl } from '../shared/sources'
import type { HistoryEntry } from '../shared/types'

export { loadHistory, appendHistory, ensureArchiveFile }

export function createHistoryEntry(input: Omit<HistoryEntry, 'ts'>): HistoryEntry {
  return {
    ...input,
    // Fingerprint and mtime are backfilled by the post-session reconcile, which
    // already has the finished file on disk.
    source: input.source ?? trackSourceForUrl(input.url),
    ts: Date.now()
  }
}
