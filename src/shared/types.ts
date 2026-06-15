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
  resolveAudioPath: (filePath: string) => Promise<{ exists: boolean; resolvedPath: string }>
  fileExists: (filePath: string) => Promise<boolean>
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
