import { existsSync } from 'fs'
import { readdir, stat } from 'fs/promises'
import { join } from 'path'
import type { HistoryEntry, LibraryScanProgress, LibraryScanResult } from '../shared/types'
import { trackSourceForUrl } from '../shared/sources'
import { findSidecarForMedia, historyEntryFromSidecar } from './infoSidecar'
import { validateCompletedMedia } from './validateMedia'
import { FingerprintCache, readStamp, type FileStamp } from './fingerprint'
import { fileNameKey, normalizePathKey, relinkEntry, withLibraryLock } from './libraryIndex'
import { loadHistory, saveHistory } from './settings'

/** Audio extensions that count as library tracks. */
export const AUDIO_EXTENSIONS = new Set([
  '.mp3',
  '.m4a',
  '.aac',
  '.flac',
  '.wav',
  '.opus',
  '.ogg',
  '.oga',
  '.wma',
  '.alac',
  '.mka'
])

/**
 * Folder name reserved for exported mix copies (`downloadDir/mixes/<slug>`).
 * Never ingested, or every export would duplicate the library it came from.
 */
export const MIXES_FOLDER = 'mixes'

const MAX_RECONCILE_DEPTH = 6
const MAX_RECONCILE_FILES = 100000

/** Files hashed in parallel. Keeps a cold full-library pass I/O bound, not serial. */
const HASH_CONCURRENCY = 8

/** Files between progress emissions, so a big scan does not flood IPC. */
const PROGRESS_STRIDE = 25

export function hasAudioExtension(name: string): boolean {
  const dot = name.lastIndexOf('.')
  if (dot < 0) return false
  return AUDIO_EXTENSIONS.has(name.slice(dot).toLowerCase())
}

/** True when any segment of the path is the reserved mixes folder. */
export function isUnderMixesFolder(filePath: string): boolean {
  return filePath
    .split(/[\\/]+/)
    .some((segment) => segment.toLowerCase() === MIXES_FOLDER)
}

/**
 * Derive {trackId, artist, title} from a download file name, mirroring how
 * `parseDestination` interprets scdl's "[download] Destination:" lines so that
 * disk-reconciled entries key the same way as live-recorded ones.
 */
export function parseTrackFileName(fileName: string): {
  trackId: string
  artist: string
  title: string
} {
  // Legacy naming from an older `--name-format`; current downloads carry no id.
  const bracketMatch = fileName.match(/^\[(\d+)\]\s+(.+)\.[^.]+$/)
  if (bracketMatch) {
    const trackId = bracketMatch[1]
    const full = bracketMatch[2]
    const split = full.split(' - ')
    if (split.length >= 2) {
      return { trackId, artist: split[0].trim(), title: split.slice(1).join(' - ').trim() }
    }
    return { trackId, artist: 'Unknown', title: full }
  }

  const withoutExt = fileName.replace(/\.[^.]+$/, '')

  const split = withoutExt.split(' - ')
  if (split.length >= 2) {
    return { trackId: withoutExt, artist: split[0].trim(), title: split.slice(1).join(' - ').trim() }
  }

  return { trackId: fileName, artist: 'Unknown', title: fileName }
}

/** Recursively collect absolute paths of audio files under `rootDir`. */
export async function collectAudioFiles(
  rootDir: string,
  onCount?: (found: number) => void
): Promise<string[]> {
  if (!rootDir?.trim() || !existsSync(rootDir)) return []

  const found: string[] = []
  const queue: Array<{ dir: string; depth: number }> = [{ dir: rootDir, depth: 0 }]
  let scanned = 0

  while (queue.length > 0) {
    const current = queue.shift()
    if (!current) break

    let entries: Array<{ name: string; isFile: boolean; isDirectory: boolean }>
    try {
      const dirents = await readdir(current.dir, { withFileTypes: true })
      entries = dirents.map((dirent) => ({
        name: dirent.name,
        isFile: dirent.isFile(),
        isDirectory: dirent.isDirectory()
      }))
    } catch {
      continue
    }

    for (const entry of entries) {
      if (scanned >= MAX_RECONCILE_FILES) return found
      scanned += 1

      const fullPath = join(current.dir, entry.name)

      if (entry.isDirectory) {
        if (entry.name.toLowerCase() === MIXES_FOLDER) continue
        if (current.depth < MAX_RECONCILE_DEPTH) {
          queue.push({ dir: fullPath, depth: current.depth + 1 })
        }
        continue
      }

      // Symlinks report neither isFile nor isDirectory; stat to find out.
      if (!entry.isFile) {
        try {
          const info = await stat(fullPath)
          if (info.isDirectory()) {
            if (entry.name.toLowerCase() === MIXES_FOLDER) continue
            if (current.depth < MAX_RECONCILE_DEPTH) {
              queue.push({ dir: fullPath, depth: current.depth + 1 })
            }
            continue
          }
          if (!info.isFile()) continue
        } catch {
          continue
        }
      }

      if (hasAudioExtension(entry.name)) {
        found.push(fullPath)
        onCount?.(found.length)
      }
    }
  }

  return found
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0

  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    let index = next
    next += 1
    while (index < items.length) {
      results[index] = await worker(items[index])
      index = next
      next += 1
    }
  })

  await Promise.all(runners)
  return results
}

/** Content-addressed id for files with no download provenance. */
export function localTrackId(fingerprint: string): string {
  return `local:${fingerprint.split('-').pop()?.slice(0, 16) ?? fingerprint}`
}

interface ScannedFile {
  filePath: string
  stamp: FileStamp
  fingerprint: string | null
}

function buildEntryFromFile(
  file: ScannedFile,
  allowSmall: boolean
): HistoryEntry | null {
  const sidecarPath = findSidecarForMedia(file.filePath)
  const validation = validateCompletedMedia(file.filePath, sidecarPath, { allowSmall })
  if (!validation.ok) return null

  // Prefer the exact metadata in a sibling .info.json sidecar (real id + url),
  // falling back to parsing the file name when no sidecar is present.
  if (sidecarPath) {
    const fromSidecar = historyEntryFromSidecar(sidecarPath, file.filePath)
    if (fromSidecar) {
      return {
        ...fromSidecar,
        sizeBytes: file.stamp.sizeBytes,
        mtimeMs: file.stamp.mtimeMs,
        fingerprint: file.fingerprint ?? undefined,
        source: trackSourceForUrl(fromSidecar.url)
      }
    }
  }

  const fileName = file.filePath.split(/[\\/]/).pop() ?? file.filePath
  const parsed = parseTrackFileName(fileName)

  return {
    // A filename-derived id collides across folders, so content-addressed ids
    // are used whenever a fingerprint is available.
    trackId: file.fingerprint ? localTrackId(file.fingerprint) : parsed.trackId,
    title: parsed.title,
    artist: parsed.artist,
    url: '',
    filePath: file.filePath,
    sizeBytes: file.stamp.sizeBytes,
    // mtime reflects when the file was actually written - more accurate than now.
    ts: Math.round(file.stamp.mtimeMs),
    mtimeMs: file.stamp.mtimeMs,
    fingerprint: file.fingerprint ?? undefined,
    source: 'local'
  }
}

export interface ReconcileOptions {
  onProgress?: (progress: LibraryScanProgress) => void
  /** Accept files below the truncated-download size floor. */
  allowSmall?: boolean
  /**
   * Mark entries whose file cannot be found as missing. Only safe for a scan of
   * the whole download folder; a session-scoped scan sees a small subtree and
   * would flag the rest of the library.
   */
  markMissing?: boolean
}

export interface ReconcileResult {
  /** Full history list (existing + added), sorted newest-first when anything changed. */
  merged: HistoryEntry[]
  /** Entries that were newly created from on-disk files. */
  added: HistoryEntry[]
  /** Existing entries whose stored path was stale and has been corrected. */
  relinked: number
  /** Entries whose file could not be found anywhere. */
  missing: number
  /** True when anything at all changed and history should be persisted. */
  changed: boolean
}

/**
 * Reconcile history against the files actually on disk under `rootDir`.
 *
 * Treats the file - not a transient scdl log line - as the source of truth for
 * "what's in my library". Any audio file not already represented gets an entry,
 * which recovers tracks whose "[download] Download completed" line was never
 * seen (e.g. the process was killed during a throttle backoff).
 *
 * Fingerprints additionally let a file that moved or was renamed inside the
 * download folder be recognized as the same track, so reorganizing the folder
 * updates paths instead of orphaning rows.
 */
export async function reconcileHistoryEntries(
  existing: HistoryEntry[],
  rootDir: string,
  options: ReconcileOptions = {}
): Promise<ReconcileResult> {
  const { onProgress, allowSmall = false, markMissing = false } = options

  onProgress?.({ phase: 'walking', processed: 0, total: 0 })
  const filePaths = await collectAudioFiles(rootDir, (found) => {
    if (found % PROGRESS_STRIDE === 0) {
      onProgress?.({ phase: 'walking', processed: found, total: 0 })
    }
  })

  const cache = FingerprintCache.fromHistory(existing)

  // Phase one: read stamps and fingerprints. Concurrent because it is pure I/O
  // with no shared decisions; all matching happens afterwards in a fixed order.
  let processed = 0
  const scanned = await mapWithConcurrency(filePaths, HASH_CONCURRENCY, async (filePath) => {
    const stamp = await readStamp(filePath)
    const fingerprint = stamp ? await cache.fingerprintFor(filePath, stamp) : null

    processed += 1
    if (processed % PROGRESS_STRIDE === 0 || processed === filePaths.length) {
      onProgress?.({ phase: 'fingerprinting', processed, total: filePaths.length })
    }

    return stamp ? { filePath, stamp, fingerprint } : null
  })

  const files = scanned.filter((file): file is ScannedFile => file !== null)

  // Phase two: match every file against the library, in a deterministic order.
  const onDiskKeys = new Set(files.map((file) => normalizePathKey(file.filePath)))
  const byPath = new Map<string, HistoryEntry>()
  const byFingerprint = new Map<string, HistoryEntry>()
  for (const entry of existing) {
    if (entry.filePath) byPath.set(normalizePathKey(entry.filePath), entry)
    if (entry.fingerprint && !byFingerprint.has(entry.fingerprint)) {
      byFingerprint.set(entry.fingerprint, entry)
    }
  }

  // Bridge key for the first pass over a pre-fingerprint library: an entry that
  // has no fingerprint yet cannot be matched by content, so its file name is
  // used to reunite it with a file that has since moved.
  const staleByName = new Map<string, HistoryEntry[]>()
  for (const entry of existing) {
    if (!entry.filePath || entry.fingerprint) continue
    if (onDiskKeys.has(normalizePathKey(entry.filePath))) continue
    const key = fileNameKey(entry.filePath)
    const bucket = staleByName.get(key)
    if (bucket) bucket.push(entry)
    else staleByName.set(key, [entry])
  }

  const claimed = new Set<HistoryEntry>()
  const added: HistoryEntry[] = []
  let relinked = 0
  let changed = false

  const takeNameCandidate = (file: ScannedFile): HistoryEntry | undefined => {
    const bucket = staleByName.get(fileNameKey(file.filePath))
    if (!bucket?.length) return undefined

    // A size match makes the pairing near certain; fall back to name alone.
    const sizeIndex = bucket.findIndex((entry) => entry.sizeBytes === file.stamp.sizeBytes)
    const index = sizeIndex >= 0 ? sizeIndex : 0
    const [candidate] = bucket.splice(index, 1)
    return candidate
  }

  for (const file of files) {
    const pathKey = normalizePathKey(file.filePath)

    const atSamePath = byPath.get(pathKey)
    if (atSamePath) {
      claimed.add(atSamePath)
      // Backfills fingerprint, size and mtime on a pre-existing entry.
      if (relinkEntry(atSamePath, file.filePath, file.stamp, file.fingerprint ?? undefined)) {
        changed = true
      }
      // Registered so a second copy of this file elsewhere in the folder is
      // recognized as a duplicate rather than added as its own track.
      if (file.fingerprint && !byFingerprint.has(file.fingerprint)) {
        byFingerprint.set(file.fingerprint, atSamePath)
      }
      continue
    }

    const sameContent = file.fingerprint ? byFingerprint.get(file.fingerprint) : undefined
    if (sameContent) {
      const previousKey = normalizePathKey(sameContent.filePath)
      const previousStillOnDisk = onDiskKeys.has(previousKey)
      if (!previousStillOnDisk && !claimed.has(sameContent)) {
        // Same content at a new location: the track moved.
        claimed.add(sameContent)
        byPath.delete(previousKey)
        byPath.set(pathKey, sameContent)
        if (relinkEntry(sameContent, file.filePath, file.stamp, file.fingerprint ?? undefined)) {
          relinked += 1
          changed = true
        }
        continue
      }
      // The original is still there, so this is a duplicate copy on disk. Left
      // out of the library rather than shown twice.
      continue
    }

    const byName = takeNameCandidate(file)
    if (byName) {
      claimed.add(byName)
      byPath.set(pathKey, byName)
      if (relinkEntry(byName, file.filePath, file.stamp, file.fingerprint ?? undefined)) {
        relinked += 1
        changed = true
      }
      if (byName.fingerprint) byFingerprint.set(byName.fingerprint, byName)
      continue
    }

    const entry = buildEntryFromFile(file, allowSmall)
    if (!entry) continue
    added.push(entry)
    byPath.set(pathKey, entry)
    if (entry.fingerprint) byFingerprint.set(entry.fingerprint, entry)
  }

  let missing = 0
  if (markMissing) {
    for (const entry of existing) {
      if (claimed.has(entry)) continue
      if (onDiskKeys.has(normalizePathKey(entry.filePath))) continue
      // The entry may point outside the scanned root (an older download folder,
      // an external drive), so confirm before flagging it.
      if (entry.filePath && existsSync(entry.filePath)) {
        if (entry.missing) {
          delete entry.missing
          changed = true
        }
        continue
      }

      missing += 1
      if (!entry.missing) {
        entry.missing = true
        changed = true
      }
    }
  }

  if (added.length === 0) {
    return { merged: existing, added, relinked, missing, changed }
  }

  onProgress?.({ phase: 'saving', processed: files.length, total: files.length })
  const merged = [...existing, ...added].sort((a, b) => b.ts - a.ts)
  return { merged, added, relinked, missing, changed: true }
}

/**
 * Scan the whole download folder and bring the library in line with it.
 *
 * This is what the Backpack's Scan button runs. Unlike the session-scoped
 * reconcile it may flag missing files, and it accepts short files because
 * anything the user put in the folder is intentional.
 */
export async function scanLibraryFolder(
  downloadDir: string,
  onProgress?: (progress: LibraryScanProgress) => void
): Promise<LibraryScanResult> {
  if (!downloadDir?.trim() || !existsSync(downloadDir)) {
    return { ok: false, added: 0, relinked: 0, missing: 0, error: 'Download folder not found.' }
  }

  try {
    return await withLibraryLock(async () => {
      const result = await reconcileHistoryEntries(loadHistory(), downloadDir, {
        onProgress,
        allowSmall: true,
        markMissing: true
      })

      if (result.changed) {
        saveHistory(result.merged)
      }

      return {
        ok: true,
        added: result.added.length,
        relinked: result.relinked,
        missing: result.missing
      }
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Library scan failed.'
    return { ok: false, added: 0, relinked: 0, missing: 0, error: message }
  }
}
