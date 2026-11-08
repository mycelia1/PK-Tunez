import type { HistoryEntry } from '../../shared/types'
import type { LibraryPage, LibraryTrack } from '../../shared/serverProtocol'
import { trackSourceForUrl } from '../../shared/sources'

export function toLibraryTrack(entry: HistoryEntry): LibraryTrack {
  return {
    trackId: entry.trackId,
    title: entry.title,
    artist: entry.artist,
    url: entry.url,
    source: entry.source ?? trackSourceForUrl(entry.url),
    sizeBytes: entry.sizeBytes,
    ts: entry.ts
  }
}

/** Newest-first page. `q` matches title, artist, or url. Missing files are left out. */
export function queryLibrary(
  history: HistoryEntry[],
  options: { q?: string; cursor?: number; limit?: number; fileExists: (filePath: string) => boolean }
): LibraryPage {
  const q = (options.q ?? '').trim().toLowerCase()
  const limit = Math.min(200, Math.max(1, Math.floor(options.limit ?? 50)))
  const cursor = Math.max(0, Math.floor(options.cursor ?? 0))

  const available = history.filter((entry) => {
    if (!entry.filePath || entry.missing) return false
    if (!options.fileExists(entry.filePath)) return false
    if (!q) return true
    const haystack = `${entry.title}\n${entry.artist}\n${entry.url}`.toLowerCase()
    return haystack.includes(q)
  })

  const page = available.slice(cursor, cursor + limit)
  const next = cursor + limit < available.length ? cursor + limit : null
  return { tracks: page.map(toLibraryTrack), nextCursor: next }
}
