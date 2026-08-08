import { statSync } from 'fs'
import { basename } from 'path'
import type { HistoryEntry } from '../shared/types'
import { historyFilePath, loadHistory } from './settings'
import type { FileStamp } from './fingerprint'

/**
 * In-memory lookup over history.json.
 *
 * Path resolution used to guess where a file went by walking the download
 * folder, which was bounded and unreliable on large libraries. Now the scan
 * keeps stored paths accurate by content fingerprint and this index answers
 * lookups directly. Fingerprint matching itself lives in the scan, which is the
 * only place that has freshly hashed files to compare against.
 *
 * The cache is keyed on the history file's mtime rather than invalidated by
 * callers, so writes from anywhere (live downloads, reconcile, import) are
 * picked up without every writer having to remember to invalidate.
 */

export interface LibraryIndex {
  byPath: Map<string, HistoryEntry>
  byTrackId: Map<string, HistoryEntry>
}

/** Normalize a path for comparison (case-insensitive, slash-agnostic). */
export function normalizePathKey(filePath: string): string {
  return filePath.replace(/[\\/]+/g, '/').toLowerCase()
}

/** Lowercased file name, used as the bridge key when backfilling fingerprints. */
export function fileNameKey(filePath: string): string {
  return basename(filePath).toLowerCase()
}

function build(entries: HistoryEntry[]): LibraryIndex {
  const byPath = new Map<string, HistoryEntry>()
  const byTrackId = new Map<string, HistoryEntry>()

  for (const entry of entries) {
    if (entry.filePath) byPath.set(normalizePathKey(entry.filePath), entry)
    // First writer wins so the oldest entry stays canonical for duplicate ids.
    if (entry.trackId && !byTrackId.has(entry.trackId)) {
      byTrackId.set(entry.trackId, entry)
    }
  }

  return { byPath, byTrackId }
}

let cached: { index: LibraryIndex; stamp: string } | null = null

/** Size as well as mtime, so two writes in the same millisecond cannot go unseen. */
function historyStamp(): string {
  try {
    const info = statSync(historyFilePath())
    return `${info.mtimeMs}:${info.size}`
  } catch {
    return 'missing'
  }
}

export function getLibraryIndex(): LibraryIndex {
  const stamp = historyStamp()
  if (cached && cached.stamp === stamp) {
    return cached.index
  }

  const index = build(loadHistory())
  cached = { index, stamp }
  return index
}

let libraryQueue: Promise<unknown> = Promise.resolve()

/**
 * Serialize whole-library read-modify-write operations.
 *
 * A scan or import loads history, works for a while, then writes it all back.
 * Two of those overlapping would silently drop whichever finished first.
 */
export function withLibraryLock<T>(operation: () => Promise<T>): Promise<T> {
  const run = libraryQueue.then(operation, operation)
  libraryQueue = run.catch(() => undefined)
  return run
}

export function findByPath(filePath: string): HistoryEntry | undefined {
  if (!filePath?.trim()) return undefined
  return getLibraryIndex().byPath.get(normalizePathKey(filePath))
}

export function findByTrackId(trackId: string): HistoryEntry | undefined {
  if (!trackId?.trim()) return undefined
  return getLibraryIndex().byTrackId.get(trackId)
}

/**
 * Point an existing entry at the file's current location.
 *
 * Returns true when something actually changed, so a scan can count relinks and
 * skip writing history when nothing moved. Mutates the entry in place because
 * callers are working with the array they are about to persist.
 */
export function relinkEntry(
  entry: HistoryEntry,
  livePath: string,
  stamp: FileStamp,
  fingerprint?: string
): boolean {
  const pathChanged = normalizePathKey(entry.filePath) !== normalizePathKey(livePath)
  const sizeChanged = entry.sizeBytes !== stamp.sizeBytes
  const mtimeChanged = entry.mtimeMs !== stamp.mtimeMs
  const fingerprintChanged = fingerprint !== undefined && entry.fingerprint !== fingerprint
  const wasMissing = entry.missing === true

  if (!pathChanged && !sizeChanged && !mtimeChanged && !fingerprintChanged && !wasMissing) {
    return false
  }

  entry.filePath = livePath
  entry.sizeBytes = stamp.sizeBytes
  entry.mtimeMs = stamp.mtimeMs
  if (fingerprint !== undefined) entry.fingerprint = fingerprint
  delete entry.missing

  return true
}
