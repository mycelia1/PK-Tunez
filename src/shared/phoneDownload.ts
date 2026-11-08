import { detectSource, isYouTubeUrl } from './sources'
import type { ResolveResponse, ServerJobView } from './serverProtocol'
import {
  markFailed,
  markSynced,
  trackAfterDownload,
  type PhoneTrack
} from './syncQueue'
import type { UploadMeta } from './uploadHeaders'

export interface PhoneDownloadDeps {
  platform: 'android' | 'ios'
  autoSync: boolean
  /** True when the phone has a paired home server. */
  paired: boolean
  musicDir: string
  now?: () => number
  /** Android yt-dlp. Returns the new audio file paths. */
  downloadAudio?: (url: string, outputDir: string) => Promise<string[]>
  /** Save a remote URL to a file. Used for stream URLs and for pulls from the server. */
  downloadToFile: (url: string, headers: Record<string, string>, dest: string) => Promise<void>
  uploadFile: (filePath: string, meta: UploadMeta) => Promise<{ duplicate: boolean }>
  resolve?: (url: string) => Promise<ResolveResponse>
  startJob?: (url: string) => Promise<ServerJobView>
  waitJob?: (id: string) => Promise<ServerJobView>
  /** Download one library track from the home server into dest. */
  pullTrackFile?: (trackId: string, dest: string) => Promise<void>
  fileNameOf?: (filePath: string) => string
}

function fileName(filePath: string): string {
  const parts = filePath.split(/[\\/]/)
  return parts[parts.length - 1] || 'track.m4a'
}

function stem(name: string): string {
  return name.replace(/\.[^.]+$/, '') || name
}

function sourceOf(url: string): 'youtube' | 'soundcloud' {
  return isYouTubeUrl(url) ? 'youtube' : detectSource(url) === 'youtube' ? 'youtube' : 'soundcloud'
}

function makeTrack(filePath: string, url: string, now: number, autoSync: boolean): PhoneTrack {
  const name = fileName(filePath)
  return trackAfterDownload(
    {
      trackId: `${sourceOf(url)}:${name}:${now}`,
      title: stem(name),
      artist: 'Unknown',
      url,
      source: sourceOf(url),
      fileName: name,
      filePath,
      sizeBytes: 0,
      syncState: 'local',
      addedAt: now
    },
    autoSync
  )
}

async function syncOne(
  track: PhoneTrack,
  deps: PhoneDownloadDeps
): Promise<PhoneTrack> {
  if (track.syncState !== 'queued') return track
  try {
    await deps.uploadFile(track.filePath, {
      trackId: track.trackId,
      title: track.title,
      artist: track.artist,
      url: track.url,
      source: track.source,
      fileName: track.fileName
    })
    return markSynced([track], track.trackId)[0]
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Upload failed.'
    return markFailed([track], track.trackId, message)[0]
  }
}

async function downloadOnServer(url: string, deps: PhoneDownloadDeps, now: number): Promise<PhoneTrack[]> {
  if (!deps.startJob || !deps.waitJob || !deps.pullTrackFile) {
    throw new Error('The home server cannot download this link.')
  }
  const job = await deps.startJob(url)
  const done = await deps.waitJob(job.id)
  if (done.status === 'error') {
    throw new Error(done.message || 'The home server could not download this link.')
  }
  const ids = done.trackIds ?? []
  if (ids.length === 0) {
    throw new Error('The home server finished, but it did not report any new tracks.')
  }
  const tracks: PhoneTrack[] = []
  for (const trackId of ids) {
    const dest = `${deps.musicDir}/${trackId.replace(/[^\w.-]+/g, '_')}.m4a`
    await deps.pullTrackFile(trackId, dest)
    const track = makeTrack(dest, url, now, false)
    track.trackId = trackId
    track.syncState = 'synced'
    tracks.push(track)
  }
  return tracks
}

/**
 * Download one shared or pasted link onto the phone.
 * Android runs yt-dlp on the phone. iOS asks the home server, then saves the file.
 */
export async function downloadLink(url: string, deps: PhoneDownloadDeps): Promise<PhoneTrack[]> {
  const target = url.trim()
  if (!/^https?:\/\//i.test(target)) {
    throw new Error('Paste a YouTube or SoundCloud link.')
  }
  const now = deps.now?.() ?? Date.now()
  const nameOf = deps.fileNameOf ?? fileName

  if (deps.platform === 'android') {
    if (!deps.downloadAudio) throw new Error('The download engine is not ready.')
    const files = await deps.downloadAudio(target, deps.musicDir)
    if (files.length === 0) throw new Error('No audio file was saved.')
    const tracks = files.map((filePath) => {
      const track = makeTrack(filePath, target, now, deps.autoSync && deps.paired)
      track.fileName = nameOf(filePath)
      track.title = stem(track.fileName)
      return track
    })
    if (!deps.autoSync || !deps.paired) return tracks
    const synced: PhoneTrack[] = []
    for (const track of tracks) synced.push(await syncOne(track, deps))
    return synced
  }

  if (!deps.paired) {
    throw new Error('This iPhone needs a paired home server to download.')
  }

  if (deps.resolve) {
    try {
      const resolved = await deps.resolve(target)
      const items = resolved.items.filter((item) => item.streamUrl)
      if (items.length > 0) {
        const tracks: PhoneTrack[] = []
        for (const item of items) {
          const safe = (item.title || item.id).replace(/[<>:"/\\|?*\u0000-\u001f]/g, '').trim() || item.id
          const dest = `${deps.musicDir}/${safe}.${item.ext || 'm4a'}`
          await deps.downloadToFile(item.streamUrl, item.httpHeaders, dest)
          let track = makeTrack(dest, item.webpageUrl || target, now, deps.autoSync)
          track.trackId = item.id
          track.title = item.title
          track.artist = item.artist
          track.fileName = nameOf(dest)
          track.source = sourceOf(item.webpageUrl || target)
          if (deps.autoSync) track = await syncOne(track, deps)
          tracks.push(track)
        }
        return tracks
      }
    } catch {
      // Fall through to a full download on the home server.
    }
  }

  return downloadOnServer(target, deps, now)
}
