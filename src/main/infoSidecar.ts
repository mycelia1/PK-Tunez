import { existsSync, readdirSync, readFileSync, statSync } from 'fs'
import { dirname, join } from 'path'
import type { HistoryEntry } from '../shared/types'

/**
 * yt-dlp `--write-info-json` support.
 *
 * yt-dlp (and scdl, which wraps it) can drop a `*.info.json` sidecar next to each
 * downloaded file containing exact metadata (id, title, uploader, webpage_url,
 * filesize). PK-Tunez uses these sidecars as the authoritative source for history
 * instead of scraping human-readable stdout, which is fragile across process
 * kills, chunk cooldowns, and log-format changes.
 *
 * Sidecar naming is NOT consistent between callers (verified empirically):
 * - scdl with `--name-format "%(uploader)s - %(title)s"` (no `.%(ext)s`) writes
 *   `<mediafile.ext>.info.json` (appended) e.g. `Artist - Title.m4a.info.json`.
 * - bare yt-dlp with `-o "...%(ext)s"` writes the ext-replaced `<name>.info.json`.
 * The robust rule used here: strip the trailing `.info.json` to get the media
 * path; if that is not a real file, fall back to ext-replace, then sibling glob.
 */

const INFO_JSON_SUFFIX = '.info.json'

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

function hasAudioExtension(name: string): boolean {
  const dot = name.lastIndexOf('.')
  return dot >= 0 && AUDIO_EXTENSIONS.has(name.slice(dot).toLowerCase())
}

function stripExtension(filePath: string): string {
  const dot = filePath.lastIndexOf('.')
  const slash = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'))
  return dot > slash ? filePath.slice(0, dot) : filePath
}

/** True for the `.info.json` sidecar files written by `--write-info-json`. */
export function isInfoJson(name: string): boolean {
  return name.toLowerCase().endsWith(INFO_JSON_SUFFIX)
}

/**
 * Locate the `.info.json` sidecar for a given media file, handling both the
 * scdl "append" convention and the bare-yt-dlp "ext-replace" convention.
 */
export function findSidecarForMedia(mediaPath: string): string | null {
  if (!mediaPath?.trim()) return null

  const appended = `${mediaPath}${INFO_JSON_SUFFIX}`
  if (existsSync(appended)) return appended

  const replaced = `${stripExtension(mediaPath)}${INFO_JSON_SUFFIX}`
  if (existsSync(replaced)) return replaced

  return null
}

/**
 * Resolve the media file a sidecar belongs to. Strips `.info.json`; if that is
 * a real file (scdl append convention) uses it, otherwise looks for a sibling
 * audio file sharing the stem (bare-yt-dlp ext-replace convention).
 */
export function mediaPathForSidecar(sidecarPath: string): string | null {
  if (!sidecarPath || !isInfoJson(sidecarPath)) return null

  const stripped = sidecarPath.slice(0, -INFO_JSON_SUFFIX.length)
  if (existsSync(stripped) && hasAudioExtension(stripped)) return stripped

  // Ext-replace convention: stripped is the extension-less stem; find a sibling
  // audio file that starts with that stem.
  const dir = dirname(stripped)
  const stem = stripped.slice(dir.length + 1)
  if (!stem) return null

  let entries: string[]
  try {
    entries = readdirSync(dir)
  } catch {
    return null
  }

  for (const entry of entries) {
    if (!hasAudioExtension(entry)) continue
    if (stripExtension(entry) === stem) return join(dir, entry)
  }

  return null
}

interface InfoJson {
  id?: string | number
  title?: string
  track?: string
  fulltitle?: string
  uploader?: string
  artist?: string
  channel?: string
  uploader_id?: string
  webpage_url?: string
  original_url?: string
  filesize?: number
  filesize_approx?: number
}

function firstString(...values: Array<string | number | undefined>): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  }
  return ''
}

/**
 * Parse a sidecar and build a `HistoryEntry` for the given media file.
 * `filePath` is always the matched media path (the JSON's internal `filepath`
 * is unreliable/relative). `ts` defaults to the media file's mtime so recovered
 * entries land in the right chronological spot. Returns null if the sidecar is
 * missing required identifying metadata.
 */
export function historyEntryFromSidecar(
  sidecarPath: string,
  mediaPath: string,
  ts?: number
): HistoryEntry | null {
  let data: InfoJson
  try {
    data = JSON.parse(readFileSync(sidecarPath, 'utf8')) as InfoJson
  } catch {
    return null
  }

  const trackId = firstString(data.id)
  const title = firstString(data.title, data.track, data.fulltitle)
  if (!trackId && !title) return null

  const artist = firstString(data.uploader, data.artist, data.channel, data.uploader_id) || 'Unknown'
  const url = firstString(data.webpage_url, data.original_url)

  let sizeBytes = 0
  let resolvedTs = ts
  try {
    const stat = statSync(mediaPath)
    sizeBytes = stat.size
    if (resolvedTs === undefined) resolvedTs = Math.round(stat.mtimeMs)
  } catch {
    // Media file may have been moved; keep zero size and provided/now ts.
  }

  return {
    trackId: trackId || stripExtension(mediaPath).split(/[\\/]/).pop() || mediaPath,
    title: title || (mediaPath.split(/[\\/]/).pop() ?? mediaPath),
    artist,
    url,
    filePath: mediaPath,
    sizeBytes,
    ts: resolvedTs ?? Date.now()
  }
}

const MAX_SIDECAR_DEPTH = 6

/** Collect absolute paths of all `.info.json` sidecars under `dir` (recursive). */
export function collectSidecars(dir: string): string[] {
  if (!dir?.trim() || !existsSync(dir)) return []

  const found: string[] = []
  const queue: Array<{ dir: string; depth: number }> = [{ dir, depth: 0 }]

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
      const fullPath = join(current.dir, entry)
      let stat
      try {
        stat = statSync(fullPath)
      } catch {
        continue
      }
      if (stat.isFile()) {
        if (isInfoJson(entry)) found.push(fullPath)
      } else if (stat.isDirectory() && current.depth < MAX_SIDECAR_DEPTH) {
        queue.push({ dir: fullPath, depth: current.depth + 1 })
      }
    }
  }

  return found
}
