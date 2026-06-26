import { existsSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import type { HistoryEntry } from '../shared/types'

/** Audio extensions scdl/yt-dlp can produce that count as library tracks. */
const AUDIO_EXTENSIONS = new Set([
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

const MAX_RECONCILE_DEPTH = 6
const MAX_RECONCILE_FILES = 100000

function hasAudioExtension(name: string): boolean {
  const dot = name.lastIndexOf('.')
  if (dot < 0) return false
  return AUDIO_EXTENSIONS.has(name.slice(dot).toLowerCase())
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
export function collectAudioFiles(rootDir: string): string[] {
  if (!rootDir?.trim() || !existsSync(rootDir)) return []

  const found: string[] = []
  const queue: Array<{ dir: string; depth: number }> = [{ dir: rootDir, depth: 0 }]
  let scanned = 0

  while (queue.length > 0) {
    const current = queue.shift()
    if (!current) break

    let entries: string[]
    try {
      entries = readdirSync(current.dir)
    } catch {
      continue
    }

    for (const entry of entries) {
      if (scanned >= MAX_RECONCILE_FILES) return found
      const fullPath = join(current.dir, entry)
      scanned += 1

      let stat
      try {
        stat = statSync(fullPath)
      } catch {
        continue
      }

      if (stat.isFile()) {
        if (hasAudioExtension(entry)) found.push(fullPath)
      } else if (stat.isDirectory() && current.depth < MAX_RECONCILE_DEPTH) {
        queue.push({ dir: fullPath, depth: current.depth + 1 })
      }
    }
  }

  return found
}

/** Normalize a path for comparison (case-insensitive, slash-agnostic). */
function normalizePathKey(filePath: string): string {
  return filePath.replace(/[\\/]+/g, '/').toLowerCase()
}

function buildEntryFromFile(filePath: string): HistoryEntry {
  const fileName = filePath.split(/[\\/]/).pop() ?? filePath
  const { trackId, artist, title } = parseTrackFileName(fileName)

  let sizeBytes = 0
  // mtime reflects when the file was actually downloaded - more accurate than now.
  let ts = Date.now()
  try {
    const stat = statSync(filePath)
    sizeBytes = stat.size
    ts = Math.round(stat.mtimeMs)
  } catch {
    // Keep defaults if the file vanished between scan and stat.
  }

  return { trackId, title, artist, url: '', filePath, sizeBytes, ts }
}

export interface ReconcileResult {
  /** Full history list (existing + added), sorted newest-first when anything changed. */
  merged: HistoryEntry[]
  /** Entries that were newly created from on-disk files. */
  added: HistoryEntry[]
}

/**
 * Reconcile history against the files actually on disk under `rootDir`.
 *
 * Treats the downloaded file - not a transient scdl log line - as the source of
 * truth for "what's in my library". Any audio file not already represented in
 * history (matched by file path) gets a synthesized entry. This recovers tracks
 * whose "[download] Download completed" line was never seen (e.g. the scdl
 * process was killed mid-output during a throttle backoff or chunk cooldown).
 */
export function reconcileHistoryEntries(existing: HistoryEntry[], rootDir: string): ReconcileResult {
  const knownPaths = new Set<string>()
  for (const entry of existing) {
    if (entry.filePath) knownPaths.add(normalizePathKey(entry.filePath))
  }

  const added: HistoryEntry[] = []
  for (const filePath of collectAudioFiles(rootDir)) {
    const key = normalizePathKey(filePath)
    if (knownPaths.has(key)) continue
    added.push(buildEntryFromFile(filePath))
    knownPaths.add(key)
  }

  if (added.length === 0) {
    return { merged: existing, added }
  }

  const merged = [...existing, ...added].sort((a, b) => b.ts - a.ts)
  return { merged, added }
}
