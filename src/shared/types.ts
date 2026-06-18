export type DownloadMode = 'uploads' | 'all' | 'likes' | 'playlists' | 'single'

export interface AppSettings {
  clientId: string
  authToken: string
  downloadDir: string
  archivePath: string
  soundEnabled: boolean
  limitTrackLength: boolean
  maxTrackLengthMinutes: number
  impersonationTipShown: boolean
  /** Tracks to download per batch before a cooldown pause. 0 disables chunking. */
  chunkSize: number
  /** Seconds to wait between chunks to let SoundCloud's rate limiter cool off. */
  chunkCooldownSeconds: number
  /** Max automatic resume attempts after a throttle (403/429) is detected. */
  maxThrottleRetries: number
  /** Minimum yt-dlp sleep between tracks (seconds). */
  sleepIntervalSeconds: number
  /** Maximum yt-dlp sleep between tracks (seconds); jitter range with the min. */
  maxSleepIntervalSeconds: number
  /** yt-dlp --sleep-requests: seconds between metadata/API requests. 0 disables. */
  sleepRequestsSeconds: number
  /** yt-dlp --limit-rate value (e.g. "2M", "500K"). Empty disables. */
  limitRate: string
  /** yt-dlp --impersonate target (e.g. "chrome"). Empty disables (needs curl_cffi). */
  impersonateTarget: string
}

export interface HistoryEntry {
  trackId: string
  title: string
  artist: string
  url: string
  filePath: string
  sizeBytes: number
  ts: number
}

export type QueueItemStatus = 'queued' | 'downloading' | 'completed' | 'skipped' | 'error'

export interface QueueItem {
  id: string
  title: string
  artist: string
  status: QueueItemStatus
  progress: number
  indeterminate: boolean
  message?: string
}

export interface DownloadRequest {
  url: string
  mode: DownloadMode
}

export type ScdlEvent =
  | { type: 'status'; message: string }
  | { type: 'queue'; items: QueueItem[] }
  | { type: 'progress'; id: string; progress: number; indeterminate?: boolean }
  | { type: 'track-start'; id: string; title: string; artist: string }
  | { type: 'track-complete'; id: string; title: string; artist: string; url: string; filePath: string; sizeBytes: number }
  | { type: 'track-skipped'; id: string; title: string; artist: string; reason: string }
  | { type: 'track-error'; id: string; title: string; message: string }
  | { type: 'done'; success: boolean; message: string }
  | { type: 'error'; message: string }
  | { type: 'rate-limit'; message: string }
  | { type: 'cooldown'; message: string; seconds: number; reason: 'chunk' | 'throttle' }
  | { type: 'impersonation-warning' }

export interface ScdlApi {
  startDownload: (request: DownloadRequest) => Promise<{ ok: boolean; error?: string }>
  cancelDownload: () => Promise<void>
  getSettings: () => Promise<AppSettings>
  saveSettings: (settings: Partial<AppSettings>) => Promise<AppSettings>
  getHistory: () => Promise<HistoryEntry[]>
  pickFolder: () => Promise<string | null>
  pickArchiveFile: () => Promise<string | null>
  downloadArchiveFile: (
    sourcePath: string
  ) => Promise<{ ok: boolean; error?: string; savedPath?: string; cancelled?: boolean }>
  resolveAudioPath: (
    filePath: string,
    trackId?: string
  ) => Promise<{ exists: boolean; resolvedPath: string }>
  fileExists: (filePath: string, trackId?: string) => Promise<boolean>
  openInDefaultPlayer: (filePath: string) => Promise<{ ok: boolean; error?: string }>
  openFolder: (folderPath: string) => Promise<{ ok: boolean; error?: string }>
  onEvent: (callback: (event: ScdlEvent) => void) => () => void
}

declare global {
  interface Window {
    scdl: ScdlApi
  }
}

export {}
