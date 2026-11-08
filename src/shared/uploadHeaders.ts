/** Headers for POST /api/v1/tracks. Values are percent-encoded so they stay ASCII. */

export interface UploadMeta {
  trackId: string
  title: string
  artist: string
  url: string
  source: 'youtube' | 'soundcloud' | 'local'
  fileName: string
}

export function uploadHeaders(token: string, meta: UploadMeta): Record<string, string> {
  return {
    authorization: `Bearer ${token}`,
    'content-type': 'application/octet-stream',
    'x-pk-track-id': encodeURIComponent(meta.trackId),
    'x-pk-title': encodeURIComponent(meta.title),
    'x-pk-artist': encodeURIComponent(meta.artist),
    'x-pk-url': encodeURIComponent(meta.url),
    'x-pk-source': meta.source,
    'x-pk-filename': encodeURIComponent(meta.fileName)
  }
}
