import type { HistoryEntry } from '../../shared/types'
import type { LibraryFolder, LibraryPage, LibraryTrack } from '../../shared/serverProtocol'
import { trackSourceForUrl } from '../../shared/sources'

function normalize(filePath: string): string {
  return filePath.replace(/[\\/]+/g, '/').replace(/\/+$/, '')
}

function isMixCopy(filePath: string): boolean {
  return normalize(filePath)
    .split('/')
    .some((segment) => segment.toLowerCase() === 'mixes')
}

/** Folder under the download directory. Empty when the file sits in the root. */
export function relativeFolder(filePath: string, downloadDir: string): string {
  if (!downloadDir.trim() || isMixCopy(filePath)) return ''
  const file = normalize(filePath)
  const root = normalize(downloadDir)
  const lowerFile = file.toLowerCase()
  const lowerRoot = root.toLowerCase()
  if (lowerFile === lowerRoot || !lowerFile.startsWith(`${lowerRoot}/`)) return ''
  const relative = file.slice(root.length + 1)
  const parts = relative.split('/')
  parts.pop()
  return parts.join('/')
}

export function toLibraryTrack(entry: HistoryEntry, downloadDir = ''): LibraryTrack {
  return {
    trackId: entry.trackId,
    title: entry.title,
    artist: entry.artist,
    url: entry.url,
    source: entry.source ?? trackSourceForUrl(entry.url),
    sizeBytes: entry.sizeBytes,
    ts: entry.ts,
    folder: relativeFolder(entry.filePath, downloadDir)
  }
}

function isAvailable(entry: HistoryEntry, fileExists: (filePath: string) => boolean): boolean {
  if (!entry.filePath || entry.missing || isMixCopy(entry.filePath)) return false
  return fileExists(entry.filePath)
}

function inDirectory(folder: string, dir: string, deep: boolean): boolean {
  if (!dir) return deep ? true : folder === ''
  if (folder === dir) return true
  if (!deep) return false
  return folder.toLowerCase().startsWith(`${dir.toLowerCase()}/`)
}

function matchesQuery(entry: HistoryEntry, folder: string, q: string): boolean {
  if (!q) return true
  const haystack = `${entry.title}\n${entry.artist}\n${entry.url}\n${folder}`.toLowerCase()
  return haystack.includes(q)
}

function tracksUnder(folders: string[], path: string): number {
  const prefix = `${path.toLowerCase()}/`
  return folders.filter((folder) => {
    const lower = folder.toLowerCase()
    return lower === path.toLowerCase() || lower.startsWith(prefix)
  }).length
}

function asFolders(paths: string[], folders: string[]): LibraryFolder[] {
  return paths
    .map((path) => ({
      name: path.split('/').pop() ?? path,
      path,
      trackCount: tracksUnder(folders, path)
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
    .slice(0, 100)
}

/** Immediate child folders of `dir`. An empty dir lists the top level. */
function childFolders(folders: string[], dir: string): LibraryFolder[] {
  const prefix = dir ? `${dir}/` : ''
  const paths = new Set<string>()
  for (const folder of folders) {
    if (!folder) continue
    const lower = folder.toLowerCase()
    if (dir && lower !== dir.toLowerCase() && !lower.startsWith(prefix.toLowerCase())) continue
    const rest = dir ? folder.slice(prefix.length) : folder
    if (!rest) continue
    const name = rest.split('/')[0]
    if (!name) continue
    paths.add(dir ? `${dir}/${name}` : name)
  }
  return asFolders([...paths], folders)
}

/** Folders whose name matches the search. A child is hidden when its parent also matches. */
function searchFolders(folders: string[], q: string): LibraryFolder[] {
  const matching = [...new Set(folders.filter((folder) => folder.toLowerCase().includes(q)))]
  const shortest = matching.filter(
    (path) =>
      !matching.some(
        (other) => other !== path && path.toLowerCase().startsWith(`${other.toLowerCase()}/`)
      )
  )
  return asFolders(shortest, folders)
}

/**
 * Newest-first page. `q` matches title, artist, url, and folder name.
 * `dir` opens one folder. `deep` includes every track inside that folder.
 */
export function queryLibrary(
  history: HistoryEntry[],
  options: {
    q?: string
    cursor?: number
    limit?: number
    dir?: string
    deep?: boolean
    downloadDir?: string
    fileExists: (filePath: string) => boolean
  }
): LibraryPage {
  const q = (options.q ?? '').trim().toLowerCase()
  const dir = (options.dir ?? '').trim().replace(/[\\/]+/g, '/').replace(/^\/+|\/+$/g, '')
  const deep = options.deep === true
  const limit = Math.min(200, Math.max(1, Math.floor(options.limit ?? 50)))
  const cursor = Math.max(0, Math.floor(options.cursor ?? 0))
  const downloadDir = options.downloadDir ?? ''

  const present = history.filter((entry) => isAvailable(entry, options.fileExists))
  const located = present.map((entry) => ({
    entry,
    folder: relativeFolder(entry.filePath, downloadDir)
  }))

  const matched = located
    .filter(({ entry, folder }) => {
      if (dir && !inDirectory(folder, dir, deep)) return false
      if (!dir && !deep && !q) return true
      if (dir && !deep) return folder === dir && matchesQuery(entry, folder, q)
      return matchesQuery(entry, folder, q)
    })
    .sort((a, b) => b.entry.ts - a.entry.ts)

  const page = matched.slice(cursor, cursor + limit)
  const next = cursor + limit < matched.length ? cursor + limit : null
  const folderNames = located.map((item) => item.folder)
  const folders = deep ? [] : q && !dir ? searchFolders(folderNames, q) : childFolders(folderNames, dir)

  return {
    tracks: page.map((item) => toLibraryTrack(item.entry, downloadDir)),
    folders,
    nextCursor: next,
    total: matched.length
  }
}

export function pickRandomTrack(
  history: HistoryEntry[],
  downloadDir: string,
  fileExists: (filePath: string) => boolean,
  random: () => number = Math.random
): LibraryTrack | null {
  const present = history.filter((entry) => isAvailable(entry, fileExists))
  if (present.length === 0) return null
  const index = Math.min(present.length - 1, Math.max(0, Math.floor(random() * present.length)))
  return toLibraryTrack(present[index], downloadDir)
}
