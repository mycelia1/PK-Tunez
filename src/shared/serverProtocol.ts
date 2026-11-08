import type { TrackSource } from './types'

/** JSON the phone and the home server share. Keep this file free of Node APIs. */

export const SYNC_API_PREFIX = '/api/v1'

export interface PairRequest {
  code: string
  name: string
}

export interface PairResponse {
  token: string
  deviceId: string
  name: string
}

export interface HealthResponse {
  ok: true
  name: 'pk-tunez'
  version: string
  tracks: number
}

export interface LibraryTrack {
  trackId: string
  title: string
  artist: string
  url: string
  source: TrackSource
  sizeBytes: number
  ts: number
}

export interface LibraryPage {
  tracks: LibraryTrack[]
  nextCursor: number | null
}

export interface UploadResult {
  synced: true
  duplicate: boolean
  track: LibraryTrack
}

export interface ResolvedStream {
  id: string
  title: string
  artist: string
  webpageUrl: string
  ext: string
  duration: number | null
  streamUrl: string
  httpHeaders: Record<string, string>
}

export interface ResolveResponse {
  items: ResolvedStream[]
}

export type ServerJobStatus = 'running' | 'done' | 'error'

export interface ServerJobView {
  id: string
  url: string
  status: ServerJobStatus
  message: string
  startedAt: number
  endedAt?: number
  /** Library ids written by this job. The phone uses them to pull the audio. */
  trackIds?: string[]
}

export interface ApiError {
  error: string
}

/** What a pairing QR code contains. The phone tries `lan` first, then `tunnel`. */
export interface PairingPayload {
  v: 1
  lan: string | null
  tunnel: string | null
  port: number
  code: string
}

export interface ServerStatus {
  running: boolean
  port: number
  lanUrls: string[]
  tunnelUrl: string | null
  tunnelError: string | null
  error: string | null
  devices: Array<{ id: string; name: string; createdAt: number }>
}

export interface PairingTicket {
  code: string
  expiresAt: number
  payload: PairingPayload
  qrDataUrl: string
}
