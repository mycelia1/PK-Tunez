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
