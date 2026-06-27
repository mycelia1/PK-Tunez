/**
 * Download source detection. PK-Tunez routes SoundCloud URLs through scdl and
 * YouTube URLs through the embedded yt-dlp (audio-only). Detection is by URL so
 * the user can paste either kind of link without choosing a source manually.
 */

export type DownloadSource = 'soundcloud' | 'youtube'

/** YouTube URL shape, which determines playlist/channel vs single-video behavior. */
export type YouTubeKind = 'video' | 'playlist' | 'channel'

function hostnameOf(rawUrl: string): string {
  const trimmed = (rawUrl ?? '').trim()
  try {
    return new URL(trimmed).hostname.toLowerCase()
  } catch {
    const match = trimmed.toLowerCase().match(/^(?:https?:\/\/)?([^/?#]+)/)
    return match ? match[1] : ''
  }
}

/** Detect whether a URL targets YouTube; everything else defaults to SoundCloud. */
export function detectSource(rawUrl: string): DownloadSource {
  const host = hostnameOf(rawUrl)
  if (host === 'youtu.be' || host.endsWith('.youtu.be')) return 'youtube'
  // Covers youtube.com, www.youtube.com, m.youtube.com, music.youtube.com.
  if (host === 'youtube.com' || host.endsWith('.youtube.com')) return 'youtube'
  return 'soundcloud'
}

export function isYouTubeUrl(rawUrl: string): boolean {
  return detectSource(rawUrl) === 'youtube'
}

/**
 * Classify a YouTube URL as a single video, a playlist, or a channel. A watch
 * URL that also carries a `list=` param is treated as a single video (download
 * just that video, not the whole playlist).
 */
export function classifyYouTubeUrl(rawUrl: string): YouTubeKind {
  const trimmed = (rawUrl ?? '').trim()
  let pathname = ''
  let search = ''
  try {
    const parsed = new URL(trimmed)
    pathname = parsed.pathname.toLowerCase()
    search = parsed.search.toLowerCase()
  } catch {
    const lower = trimmed.toLowerCase()
    pathname = lower
    search = lower
  }

  if (
    /\/@[^/]+/.test(pathname) ||
    pathname.startsWith('/channel/') ||
    pathname.startsWith('/c/') ||
    pathname.startsWith('/user/')
  ) {
    return 'channel'
  }

  const hasVideo = search.includes('v=') || /\/watch|\/shorts\/|youtu\.be\//.test(pathname + trimmed.toLowerCase())
  if (pathname.startsWith('/playlist') || (search.includes('list=') && !hasVideo)) {
    return 'playlist'
  }

  return 'video'
}

/**
 * Deterministic subfolder name (under the download dir) for bulk YouTube grabs,
 * so reconciliation/sweep can target a known folder. Single videos return null
 * (they land flat in the download dir, like SoundCloud single mode).
 */
export function youtubeFolderSlug(rawUrl: string): string | null {
  const kind = classifyYouTubeUrl(rawUrl)
  if (kind === 'video') return null

  const trimmed = (rawUrl ?? '').trim()
  let pathname = ''
  let params: URLSearchParams | null = null
  try {
    const parsed = new URL(trimmed)
    pathname = parsed.pathname
    params = parsed.searchParams
  } catch {
    // Fall through to generic slug below.
  }

  if (kind === 'channel') {
    const handle = pathname.match(/\/@([^/]+)/)
    if (handle) return sanitizeSlug(`youtube-${handle[1]}`)
    const channelId = pathname.match(/\/channel\/([^/]+)/)
    if (channelId) return sanitizeSlug(`youtube-${channelId[1]}`)
    const named = pathname.match(/\/(?:c|user)\/([^/]+)/)
    if (named) return sanitizeSlug(`youtube-${named[1]}`)
    return 'youtube-channel'
  }

  const listId = params?.get('list')
  return listId ? sanitizeSlug(`youtube-playlist-${listId}`) : 'youtube-playlist'
}

function sanitizeSlug(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'youtube'
}

/** Safe folder name for a human-readable YouTube playlist or channel title. */
export function sanitizeFolderName(value: string): string {
  const trimmed = value
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.\s]+$/g, '')
  const capped = trimmed.slice(0, 120).replace(/[.\s]+$/g, '')
  return capped || 'youtube'
}
