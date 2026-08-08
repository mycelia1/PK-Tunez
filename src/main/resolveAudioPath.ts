import { existsSync } from 'fs'
import type { ResolvedAudioPath } from '../shared/types'
import { findByPath, findByTrackId } from './libraryIndex'

/**
 * Where is this track's file right now?
 *
 * This used to guess by walking the download folder for a matching file name,
 * capped at 500 entries, which quietly failed on large libraries and made a
 * Backpack page fire tens of thousands of synchronous stats. The library scan
 * now keeps stored paths accurate by content fingerprint, so resolution is a
 * direct lookup and a file the scan could not account for is simply missing
 * until the user scans again.
 */
export function resolveAudioPath(storedPath: string, trackId?: string): ResolvedAudioPath {
  const trimmed = storedPath?.trim() ?? ''
  const id = trackId?.trim() ?? ''

  if (!trimmed && !id) {
    return { exists: false, resolvedPath: '' }
  }

  if (trimmed && existsSync(trimmed)) {
    return { exists: true, resolvedPath: trimmed }
  }

  // The renderer may still be holding a row from before the last scan relinked
  // it, so fall back to the entry's current path in the library.
  const indexed = (id ? findByTrackId(id) : undefined) ?? (trimmed ? findByPath(trimmed) : undefined)
  const currentPath = indexed?.filePath?.trim()
  if (currentPath && currentPath !== trimmed && existsSync(currentPath)) {
    return { exists: true, resolvedPath: currentPath }
  }

  return { exists: false, resolvedPath: trimmed }
}

/** Resolve a page of Backpack rows in one pass. */
export function resolveAudioPaths(
  items: Array<{ filePath: string; trackId?: string }>
): ResolvedAudioPath[] {
  if (!Array.isArray(items)) return []
  return items.map((item) => resolveAudioPath(item?.filePath ?? '', item?.trackId))
}

export function resolveCompletedTrackPath(storedPath: string, trackId: string | null): string {
  const trimmed = storedPath?.trim() ?? ''
  if (trimmed && existsSync(trimmed)) {
    return trimmed
  }

  const resolved = resolveAudioPath(trimmed, trackId ?? undefined)
  return resolved.exists ? resolved.resolvedPath : trimmed
}
