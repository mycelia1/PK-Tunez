import { appendHistory, ensureArchiveFile, loadHistory } from './settings'
import type { HistoryEntry } from '../shared/types'

export { loadHistory, appendHistory, ensureArchiveFile }

export function createHistoryEntry(input: Omit<HistoryEntry, 'ts'>): HistoryEntry {
  return {
    ...input,
    ts: Date.now()
  }
}
