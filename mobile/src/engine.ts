import { Platform } from 'react-native'
import { downloadLink, type PhoneDownloadDeps } from '../../src/shared/phoneDownload'
import type { LibraryTrack, ResolveResponse, ServerJobView } from '../../src/shared/serverProtocol'
import { classifyYouTubeUrl, detectSource } from '../../src/shared/sources'
import { uploadHeaders, type UploadMeta } from '../../src/shared/uploadHeaders'
import type { PhoneTrack } from '../../src/shared/syncQueue'
import { pkNative } from './native'

export interface PhoneSession {
  serverUrl: string
  token: string
  autoSync: boolean
}

function authHeaders(token: string): Record<string, string> {
  return { authorization: `Bearer ${token}`, 'content-type': 'application/json' }
}

async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text()
  if (!response.ok) {
    throw new Error(text || `Request failed (${response.status}).`)
  }
  return JSON.parse(text) as T
}

export async function pairWithServer(serverUrl: string, code: string, name: string): Promise<string> {
  const response = await fetch(`${serverUrl.replace(/\/$/, '')}/api/v1/pair`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code, name })
  })
  const body = await readJson<{ token: string }>(response)
  return body.token
}

export async function searchServer(session: PhoneSession, query: string): Promise<LibraryTrack[]> {
  const url = `${session.serverUrl.replace(/\/$/, '')}/api/v1/library?q=${encodeURIComponent(query)}`
  const response = await fetch(url, { headers: { authorization: `Bearer ${session.token}` } })
  const body = await readJson<{ tracks: LibraryTrack[] }>(response)
  return body.tracks
}

function wantsPlaylist(url: string): boolean {
  if (detectSource(url) === 'youtube') return classifyYouTubeUrl(url) !== 'video'
  return /\/sets\//i.test(url)
}

export async function downloadToPhone(url: string, session: PhoneSession): Promise<PhoneTrack[]> {
  const native = pkNative()
  if (!native) throw new Error('The download module is not installed.')
  const musicDir = await native.musicDir()
  const base = session.serverUrl.replace(/\/$/, '')
  const paired = Boolean(session.token && base)

  const deps: PhoneDownloadDeps = {
    platform: Platform.OS === 'ios' ? 'ios' : 'android',
    autoSync: session.autoSync,
    paired,
    musicDir,
    downloadAudio: native.downloadAudio
      ? (target, dir) => native.downloadAudio!(target, dir, wantsPlaylist(target))
      : undefined,
    downloadToFile: (target, headers, dest) => native.downloadToFile(target, headers, dest).then(() => undefined),
    uploadFile: async (filePath, meta: UploadMeta) => {
      const result = await native.uploadFile(`${base}/api/v1/tracks`, uploadHeaders(session.token, meta), filePath)
      if (result.status !== 200) throw new Error(result.body || 'Upload failed.')
      const parsed = JSON.parse(result.body) as { duplicate?: boolean }
      return { duplicate: parsed.duplicate === true }
    },
    resolve: async (target) => {
      const response = await fetch(`${base}/api/v1/resolve`, {
        method: 'POST',
        headers: authHeaders(session.token),
        body: JSON.stringify({ url: target })
      })
      return readJson<ResolveResponse>(response)
    },
    startJob: async (target) => {
      const response = await fetch(`${base}/api/v1/downloads`, {
        method: 'POST',
        headers: authHeaders(session.token),
        body: JSON.stringify({ url: target })
      })
      return readJson<ServerJobView>(response)
    },
    waitJob: async (id) => {
      const deadline = Date.now() + 30 * 60 * 1000
      while (Date.now() < deadline) {
        const response = await fetch(`${base}/api/v1/downloads/${encodeURIComponent(id)}`, {
          headers: { authorization: `Bearer ${session.token}` }
        })
        const job = await readJson<ServerJobView>(response)
        if (job.status !== 'running') return job
        await new Promise<void>((resolve) => {
          setTimeout(() => resolve(), 2000)
        })
      }
      throw new Error('The home server took too long.')
    },
    pullTrackFile: async (trackId, dest) => {
      await native.downloadToFile(
        `${base}/api/v1/tracks/${encodeURIComponent(trackId)}/file`,
        { authorization: `Bearer ${session.token}` },
        dest
      )
    }
  }

  return downloadLink(url, deps)
}

export async function pullFromServer(track: LibraryTrack, session: PhoneSession): Promise<PhoneTrack> {
  const native = pkNative()
  if (!native) throw new Error('The download module is not installed.')
  const musicDir = await native.musicDir()
  const safe = (track.title || track.trackId).replace(/[<>:"/\\|?*]/g, '').trim() || track.trackId
  const dest = `${musicDir}/${safe}.m4a`
  await native.downloadToFile(
    `${session.serverUrl.replace(/\/$/, '')}/api/v1/tracks/${encodeURIComponent(track.trackId)}/file`,
    { authorization: `Bearer ${session.token}` },
    dest
  )
  return {
    trackId: track.trackId,
    title: track.title,
    artist: track.artist,
    url: track.url,
    source: track.source === 'local' ? 'local' : track.source,
    fileName: `${safe}.m4a`,
    filePath: dest,
    sizeBytes: track.sizeBytes,
    syncState: 'synced',
    addedAt: Date.now()
  }
}
