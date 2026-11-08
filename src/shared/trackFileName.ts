/**
 * File-name parsing shared by live download logs and library scans.
 *
 * SoundCloud files are still `Artist - Title.ext`. YouTube files are `Title.ext`
 * (the channel name is not part of the file name).
 */

export interface ParsedTrackFileName {
  trackId: string
  artist: string
  title: string
}

function stemOf(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '')
}

/** SoundCloud and older downloads: `Artist - Title`, or a bare name. */
export function parseTrackFileName(fileName: string): ParsedTrackFileName {
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

  const withoutExt = stemOf(fileName)
  const split = withoutExt.split(' - ')
  if (split.length >= 2) {
    return {
      trackId: withoutExt,
      artist: split[0].trim(),
      title: split.slice(1).join(' - ').trim()
    }
  }

  return { trackId: fileName, artist: 'Unknown', title: withoutExt }
}

/**
 * YouTube audio is saved as the title only. A title may itself contain ` - `,
 * so the channel must not be inferred from the file name. The artist comes
 * from the `.info.json` sidecar.
 */
export function parseYouTubeFileName(fileName: string): ParsedTrackFileName {
  const title = stemOf(fileName)
  return { trackId: title, artist: 'Unknown', title }
}
