/**
 * Phone sync state. Grey means the file is only on the phone.
 * Green means the home server has a copy and a normal history row.
 */

export type SyncState = 'local' | 'queued' | 'syncing' | 'synced' | 'failed'

export type SyncIcon = 'grey' | 'green'

export interface PhoneTrack {
  trackId: string
  title: string
  artist: string
  url: string
  source: 'youtube' | 'soundcloud' | 'local'
  fileName: string
  filePath: string
  sizeBytes: number
  syncState: SyncState
  error?: string
  addedAt: number
}

export function syncIcon(state: SyncState): SyncIcon {
  return state === 'synced' ? 'green' : 'grey'
}

/** A finished download. Auto-sync queues the upload. Otherwise the track stays local. */
export function trackAfterDownload(track: PhoneTrack, autoSync: boolean): PhoneTrack {
  return {
    ...track,
    syncState: autoSync ? 'queued' : 'local',
    error: undefined
  }
}

export function queueTrack(tracks: PhoneTrack[], trackId: string): PhoneTrack[] {
  return tracks.map((track) =>
    track.trackId === trackId && track.syncState !== 'synced'
      ? { ...track, syncState: 'queued', error: undefined }
      : track
  )
}

export function nextQueued(tracks: PhoneTrack[]): PhoneTrack | null {
  return tracks.find((track) => track.syncState === 'queued') ?? null
}

export function markSyncing(tracks: PhoneTrack[], trackId: string): PhoneTrack[] {
  return tracks.map((track) =>
    track.trackId === trackId ? { ...track, syncState: 'syncing', error: undefined } : track
  )
}

export function markSynced(tracks: PhoneTrack[], trackId: string): PhoneTrack[] {
  return tracks.map((track) =>
    track.trackId === trackId ? { ...track, syncState: 'synced', error: undefined } : track
  )
}

export function markFailed(tracks: PhoneTrack[], trackId: string, error: string): PhoneTrack[] {
  return tracks.map((track) =>
    track.trackId === trackId ? { ...track, syncState: 'failed', error } : track
  )
}

/**
 * Network came back. Failed and still-queued tracks upload again.
 * A track the user left as local stays local.
 */
export function requeueAfterReconnect(tracks: PhoneTrack[], autoSync: boolean): PhoneTrack[] {
  if (!autoSync) return tracks
  return tracks.map((track) =>
    track.syncState === 'failed' || track.syncState === 'syncing'
      ? { ...track, syncState: 'queued', error: undefined }
      : track
  )
}
