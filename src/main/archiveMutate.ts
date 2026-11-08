import { existsSync, readFileSync, writeFileSync } from 'fs'

function readArchiveText(archivePath: string): string {
  if (!archivePath?.trim() || !existsSync(archivePath)) return ''
  let raw = readFileSync(archivePath, 'utf8')
  if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1)
  return raw
}

function writeArchiveLines(archivePath: string, lines: string[]): void {
  const body = lines.length > 0 ? `${lines.join('\n')}\n` : ''
  writeFileSync(archivePath, body, 'utf8')
}

/**
 * Remove archive entries for a SoundCloud or YouTube track id.
 * yt-dlp archive lines look like `soundcloud 12345` or `youtube abc123`.
 */
export function removeArchiveEntry(archivePath: string, trackId: string): boolean {
  if (!archivePath?.trim() || !trackId?.trim() || !existsSync(archivePath)) return false

  const lines = readArchiveText(archivePath)
    .split(/\r?\n/)
    .filter(Boolean)

  const id = trackId.trim()
  const filtered = lines.filter((line) => {
    const match = line.match(/^(soundcloud|youtube)\s+(\S+)/i)
    if (!match) return true
    return match[2] !== id
  })

  if (filtered.length === lines.length) return false
  writeArchiveLines(archivePath, filtered)
  return true
}

function archiveKey(source: string, trackId: string): string {
  return `${source.trim().toLowerCase()} ${trackId.trim()}`
}

/** Ids already recorded, as `source id` in lower case. */
export function readArchiveIds(archivePath: string): Set<string> {
  const ids = new Set<string>()
  if (!archivePath?.trim() || !existsSync(archivePath)) return ids
  for (const line of readArchiveText(archivePath).split(/\r?\n/)) {
    const match = line.match(/^(soundcloud|youtube)\s+(\S+)/i)
    if (match) ids.add(archiveKey(match[1], match[2]))
  }
  return ids
}

/** Append `youtube <id>` or `soundcloud <id>` when that id is not already present. */
export function appendArchiveId(
  archivePath: string,
  source: 'youtube' | 'soundcloud',
  trackId: string
): boolean {
  if (!archivePath?.trim() || !trackId?.trim()) return false
  const key = archiveKey(source, trackId)
  const lines = readArchiveText(archivePath)
    .split(/\r?\n/)
    .filter(Boolean)
  if (lines.some((line) => {
    const match = line.match(/^(soundcloud|youtube)\s+(\S+)/i)
    return match ? archiveKey(match[1], match[2]) === key : false
  })) {
    return false
  }
  lines.push(`${source} ${trackId.trim()}`)
  writeArchiveLines(archivePath, lines)
  return true
}
