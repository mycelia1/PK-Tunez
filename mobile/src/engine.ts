import { Platform } from 'react-native'
import { downloadLink, type PhoneDownloadDeps } from '../../src/shared/phoneDownload'
import type {
  LibraryPage,
  LibraryTrack,
  PhoneMix,
  PhoneMixLibrary,
  ResolveResponse,
  ServerJobView
} from '../../src/shared/serverProtocol'
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

export async function fetchLibrary(
  session: PhoneSession,
  options: { q?: string; dir?: string; cursor?: number; deep?: boolean; limit?: number }
): Promise<LibraryPage> {
  const base = session.serverUrl.replace(/\/$/, '')
  const params = new URLSearchParams()
  if (options.q) params.set('q', options.q)
  if (options.dir) params.set('dir', options.dir)
  if (options.deep) params.set('deep', '1')
  params.set('cursor', String(options.cursor ?? 0))
  params.set('limit', String(options.limit ?? 20))
  const response = await fetch(`${base}/api/v1/library?${params}`, {
    headers: { authorization: `Bearer ${session.token}` }
  })
  return readJson<LibraryPage>(response)
}

export async function randomServerTrack(session: PhoneSession): Promise<LibraryTrack> {
  const response = await fetch(`${session.serverUrl.replace(/\/$/, '')}/api/v1/library/random`, {
    headers: { authorization: `Bearer ${session.token}` }
  })
  const body = await readJson<{ track: LibraryTrack }>(response)
  return body.track
}

export async function fetchMixes(session: PhoneSession): Promise<PhoneMixLibrary> {
  const response = await fetch(`${session.serverUrl.replace(/\/$/, '')}/api/v1/mixes`, {
    headers: { authorization: `Bearer ${session.token}` }
  })
  return readJson<PhoneMixLibrary>(response)
}

export async function createServerMix(session: PhoneSession, name: string): Promise<PhoneMixLibrary> {
  const response = await fetch(`${session.serverUrl.replace(/\/$/, '')}/api/v1/mixes`, {
    method: 'POST',
    headers: authHeaders(session.token),
    body: JSON.stringify({ name })
  })
  return readJson<PhoneMixLibrary>(response)
}

export async function saveServerMix(
  session: PhoneSession,
  mixId: string,
  trackIds: string[]
): Promise<PhoneMix> {
  const response = await fetch(
    `${session.serverUrl.replace(/\/$/, '')}/api/v1/mixes/${encodeURIComponent(mixId)}`,
    {
      method: 'PUT',
      headers: authHeaders(session.token),
      body: JSON.stringify({ trackIds })
    }
  )
  return readJson<PhoneMix>(response)
}

export async function deleteServerMix(session: PhoneSession, mixId: string): Promise<PhoneMixLibrary> {
  const response = await fetch(
    `${session.serverUrl.replace(/\/$/, '')}/api/v1/mixes/${encodeURIComponent(mixId)}`,
    { method: 'DELETE', headers: { authorization: `Bearer ${session.token}` } }
  )
  return readJson<PhoneMixLibrary>(response)
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
    downloadToFile: (target, headers, dest) => native.downloadToFile(target, headers, dest),
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
    pullTrackFile: (trackId, dest) =>
      native.downloadToFile(
        `${base}/api/v1/tracks/${encodeURIComponent(trackId)}/file`,
        { authorization: `Bearer ${session.token}` },
        dest
      )
  }

  return downloadLink(url, deps)
}

export async function pullFromServer(track: LibraryTrack, session: PhoneSession): Promise<PhoneTrack> {
  const native = pkNative()
  if (!native) throw new Error('The download module is not installed.')
  const musicDir = await native.musicDir()
  const safe = (track.title || track.trackId).replace(/[<>:"/\\|?*]/g, '').trim() || track.trackId
  const dest = `${musicDir}/${safe}.m4a`
  const stored = await native.downloadToFile(
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
    filePath: stored,
    sizeBytes: track.sizeBytes,
    syncState: 'synced',
    addedAt: Date.now()
  }
}
