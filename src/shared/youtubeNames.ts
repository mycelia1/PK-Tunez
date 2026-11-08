/**
 * YouTube file names.
 *
 * New downloads use `%(title)s.%(ext)s`. Older downloads used
 * `%(uploader)s - %(title)s.%(ext)s`. The cleanup planner strips that
 * channel prefix when the history row or sidecar still knows the channel.
 */

/** yt-dlp `-o` basename for every YouTube download. */
export const YOUTUBE_OUTPUT_BASENAME = '%(title)s.%(ext)s'

export interface PlannedRename {
  from: string
  to: string
}

export interface CleanupCandidate {
  filePath: string
  /** True when this row is a YouTube download. Other sources are ignored. */
  youtube: boolean
  /** Channel names to try, longest match wins. `Unknown` is ignored. */
  channelNames: string[]
}

export interface CleanupPlan {
  renames: PlannedRename[]
  missing: number
  skipped: number
}

export interface CleanupFs {
  exists(filePath: string): boolean
  names(dir: string): string[]
}

/**
 * Close to yt-dlp's default (non-restricted) `sanitize_filename`.
 * Used only to rebuild the old `Channel - Title` prefix.
 */
export function sanitizeYtDlpFilePart(value: string): string {
  const withTimestamps = value.replace(/[0-9]+(?::[0-9]+)+/g, (match) => match.replace(/:/g, '_'))
  let out = ''
  for (const char of withTimestamps) {
    const code = char.codePointAt(0) ?? 0
    if (char === '?' || code < 32 || code === 127) continue
    if (char === '"') {
      out += "'"
      continue
    }
    if (char === ':') {
      out += ' -'
      continue
    }
    if ('\\/|*<>'.includes(char)) continue
    out += char
  }
  const trimmed = out.replace(/^[\s.]+/g, '').replace(/[\s.]+$/g, '')
  return trimmed || '_'
}

function splitPath(filePath: string): { dir: string; base: string } {
  const norm = filePath.replace(/\\/g, '/')
  const index = norm.lastIndexOf('/')
  if (index < 0) return { dir: '', base: filePath }
  return { dir: filePath.slice(0, index), base: filePath.slice(index + 1) }
}

function joinPath(dir: string, base: string): string {
  if (!dir) return base
  const sep = dir.includes('\\') && !dir.includes('/') ? '\\' : '/'
  if (dir.endsWith('/') || dir.endsWith('\\')) return dir + base
  return dir + sep + base
}

function isMixCopy(filePath: string): boolean {
  return filePath.split(/[\\/]+/).some((segment) => segment.toLowerCase() === 'mixes')
}

/** New basename with the channel prefix removed, or null when it does not apply. */
export function stripChannelPrefix(fileName: string, channelNames: string[]): string | null {
  const names = [...new Set(channelNames.map((name) => name.trim()).filter(Boolean))]
    .filter((name) => name.toLowerCase() !== 'unknown')
    .sort((a, b) => b.length - a.length)

  for (const name of names) {
    const prefixes = [`${name} - `, `${sanitizeYtDlpFilePart(name)} - `]
    for (const prefix of prefixes) {
      if (prefix === ' - ' || prefix.trim() === '-') continue
      if (!fileName.startsWith(prefix)) continue
      const rest = fileName.slice(prefix.length).trim()
      if (!rest || rest.startsWith('.')) continue
      if (rest === fileName) continue
      return rest
    }
  }
  return null
}

function uniqueName(desired: string, taken: Set<string>): string {
  if (!taken.has(desired.toLowerCase())) return desired
  const dot = desired.lastIndexOf('.')
  const stem = dot > 0 ? desired.slice(0, dot) : desired
  const ext = dot > 0 ? desired.slice(dot) : ''
  let n = 2
  let candidate = `${stem} (${n})${ext}`
  while (taken.has(candidate.toLowerCase())) {
    n += 1
    candidate = `${stem} (${n})${ext}`
  }
  return candidate
}

/**
 * Decide which YouTube files lose their channel prefix.
 * Does not touch the disk. Callers apply `renames` when the user confirms.
 */
export function planYouTubeRenames(candidates: CleanupCandidate[], fs: CleanupFs): CleanupPlan {
  const renames: PlannedRename[] = []
  let missing = 0
  let skipped = 0
  const seen = new Set<string>()
  const takenByDir = new Map<string, Set<string>>()

  function takenFor(dir: string): Set<string> {
    const key = dir.toLowerCase()
    const existing = takenByDir.get(key)
    if (existing) return existing
    const names = new Set(fs.names(dir).map((name) => name.toLowerCase()))
    takenByDir.set(key, names)
    return names
  }

  for (const candidate of candidates) {
    if (!candidate.youtube) {
      skipped += 1
      continue
    }
    const pathKey = candidate.filePath.replace(/[\\/]+/g, '/').toLowerCase()
    if (seen.has(pathKey)) continue
    seen.add(pathKey)

    if (!candidate.filePath.trim() || isMixCopy(candidate.filePath)) {
      skipped += 1
      continue
    }
    if (!fs.exists(candidate.filePath)) {
      missing += 1
      continue
    }

    const { dir, base } = splitPath(candidate.filePath)
    const stripped = stripChannelPrefix(base, candidate.channelNames)
    if (!stripped || stripped === base) {
      skipped += 1
      continue
    }

    const taken = takenFor(dir)
    taken.delete(base.toLowerCase())
    const nextBase = uniqueName(stripped, taken)
    taken.add(nextBase.toLowerCase())
    if (nextBase === base) {
      skipped += 1
      continue
    }
    renames.push({ from: candidate.filePath, to: joinPath(dir, nextBase) })
  }

  return { renames, missing, skipped }
}

/** Replace stored paths after a rename. Match is case-insensitive and slash-agnostic. */
export function rewriteFilePath(filePath: string, renames: PlannedRename[]): string {
  const key = filePath.replace(/[\\/]+/g, '/').toLowerCase()
  for (const rename of renames) {
    if (rename.from.replace(/[\\/]+/g, '/').toLowerCase() === key) return rename.to
  }
  return filePath
}
