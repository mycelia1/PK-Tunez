import { existsSync, readdirSync, statSync } from 'fs'
import { basename, join } from 'path'
import { loadSettings } from './settings'

const MAX_SEARCH_DEPTH = 5
const MAX_FILES_SCANNED = 500

function findFileInTree(rootDir: string, matches: (entry: string) => boolean): string | null {
  if (!rootDir?.trim()) return null

  let scanned = 0
  const queue: Array<{ dir: string; depth: number }> = [{ dir: rootDir, depth: 0 }]

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
      if (scanned >= MAX_FILES_SCANNED) return null

      const fullPath = join(current.dir, entry)
      scanned += 1

      let stat
      try {
        stat = statSync(fullPath)
      } catch {
        continue
      }

      if (stat.isFile() && matches(entry)) {
        return fullPath
      }

      if (stat.isDirectory() && current.depth < MAX_SEARCH_DEPTH) {
        queue.push({ dir: fullPath, depth: current.depth + 1 })
      }
    }
  }

  return null
}

export function findFileByTrackId(rootDir: string, trackId: string): string | null {
  if (!trackId?.trim() || !/^\d+$/.test(trackId)) return null

  const prefix = `[${trackId}]`
  return findFileInTree(rootDir, (entry) => entry.startsWith(prefix))
}

function findFileByName(rootDir: string, fileName: string): string | null {
  if (!fileName) return null
  return findFileInTree(rootDir, (entry) => entry === fileName)
}

export function resolveAudioPath(
  storedPath: string,
  downloadDir = loadSettings().downloadDir,
  trackId?: string
): { exists: boolean; resolvedPath: string } {
  const trimmed = storedPath?.trim()
  if (!trimmed && !trackId?.trim()) {
    return { exists: false, resolvedPath: '' }
  }

  if (trimmed && existsSync(trimmed)) {
    return { exists: true, resolvedPath: trimmed }
  }

  if (!downloadDir?.trim()) {
    return { exists: false, resolvedPath: trimmed ?? '' }
  }

  if (trackId?.trim()) {
    const byTrackId = findFileByTrackId(downloadDir, trackId.trim())
    if (byTrackId) {
      return { exists: true, resolvedPath: byTrackId }
    }
  }

  if (!trimmed) {
    return { exists: false, resolvedPath: '' }
  }

  const fileName = basename(trimmed)
  const candidates = new Set<string>()
  candidates.add(join(downloadDir, fileName))

  const parts = trimmed.split(/[/\\]/).filter(Boolean)
  for (let depth = 1; depth <= Math.min(4, parts.length - 1); depth++) {
    candidates.add(join(downloadDir, ...parts.slice(-(depth + 1))))
  }

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return { exists: true, resolvedPath: candidate }
    }
  }

  const found = findFileByName(downloadDir, fileName)
  if (found) {
    return { exists: true, resolvedPath: found }
  }

  return { exists: false, resolvedPath: trimmed }
}

export function resolveCompletedTrackPath(
  storedPath: string,
  soundCloudTrackId: string | null,
  downloadDir = loadSettings().downloadDir
): string {
  const trimmed = storedPath?.trim()
  if (trimmed && existsSync(trimmed)) {
    return trimmed
  }

  if (soundCloudTrackId) {
    const byTrackId = findFileByTrackId(downloadDir, soundCloudTrackId)
    if (byTrackId) {
      return byTrackId
    }
  }

  const resolved = resolveAudioPath(trimmed ?? '', downloadDir, soundCloudTrackId ?? undefined)
  return resolved.exists ? resolved.resolvedPath : trimmed ?? ''
}
