import { existsSync, readdirSync, statSync } from 'fs'
import { basename, join } from 'path'
import { loadSettings } from './settings'

const MAX_SEARCH_DEPTH = 5
const MAX_FILES_SCANNED = 500

function findFileByName(rootDir: string, fileName: string): string | null {
  if (!rootDir?.trim() || !fileName) return null

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

      if (stat.isFile() && entry === fileName) {
        return fullPath
      }

      if (stat.isDirectory() && current.depth < MAX_SEARCH_DEPTH) {
        queue.push({ dir: fullPath, depth: current.depth + 1 })
      }
    }
  }

  return null
}

export function resolveAudioPath(
  storedPath: string,
  downloadDir = loadSettings().downloadDir
): { exists: boolean; resolvedPath: string } {
  const trimmed = storedPath?.trim()
  if (!trimmed) {
    return { exists: false, resolvedPath: '' }
  }

  if (existsSync(trimmed)) {
    return { exists: true, resolvedPath: trimmed }
  }

  if (!downloadDir?.trim()) {
    return { exists: false, resolvedPath: trimmed }
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
