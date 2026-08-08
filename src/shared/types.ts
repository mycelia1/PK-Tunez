export type DownloadMode = 'uploads' | 'all' | 'likes' | 'playlists' | 'single'

/** Visual / audio skin for the renderer UI. */
export type UiTheme = 'earthbound' | 'dk64'

/** Browser profile yt-dlp reads cookies from for YouTube auth (age-gated, private, etc.). */
export type YouTubeCookiesBrowser = 'chrome' | 'edge' | 'firefox'

export interface AppSettings {
  clientId: string
  authToken: string
  downloadDir: string
  archivePath: string
  /** UI theme id — earthbound (default) or dk64. */
  theme: UiTheme
  soundEnabled: boolean
  limitTrackLength: boolean
  maxTrackLengthMinutes: number
  impersonationTipShown: boolean
  /** When true, the first-run spotlight tutorial will not auto-open. */
  tutorialCompleted: boolean
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
  /** Pass --cookies-from-browser to yt-dlp for YouTube downloads. */
  youtubeCookiesFromBrowser: boolean
  /** Which browser profile to read YouTube cookies from. */
  youtubeCookiesBrowser: YouTubeCookiesBrowser
  /** Write full download output to a log file under app data (logs/). */
  logsEnabled: boolean
}

/** Where a library track came from. Absent on entries written before this field existed. */
export type TrackSource = 'soundcloud' | 'youtube' | 'local'

export interface HistoryEntry {
  trackId: string
  title: string
  artist: string
  url: string
  filePath: string
  sizeBytes: number
  ts: number
  /**
   * Content fingerprint (`<size>-<sha256 of first 64KB>`) used to recognize a
   * track after it has been moved or renamed inside the download folder.
   */
  fingerprint?: string
  /** File mtime in ms, cached so an unchanged file is never re-hashed. */
  mtimeMs?: number
  source?: TrackSource
  /** True when the file could not be found anywhere under the download folder. */
  missing?: boolean
}

/**
 * Windows and Linux cannot offer file and directory selection in a single
 * native dialog, so import is split into two entry points.
 */
export type ImportMode = 'files' | 'folder'

export interface ImportResult {
  ok: boolean
  cancelled?: boolean
  /** Tracks newly added to the library. */
  added: number
  /** Sources whose content already existed in the library. */
  duplicates: number
  /** Sources refused because they live under a folder named `mixes`. */
  skippedMixes: number
  failed: number
  error?: string
}

export interface LibraryScanResult {
  ok: boolean
  /** Audio files on disk that were not in the library yet. */
  added: number
  /** Existing entries whose stored path was stale and has been corrected. */
  relinked: number
  /** Entries whose file could not be found anywhere under the download folder. */
  missing: number
  error?: string
}

export interface LibraryScanProgress {
  phase: 'walking' | 'fingerprinting' | 'copying' | 'saving'
  processed: number
  total: number
}

export interface ResolvedAudioPath {
  exists: boolean
  resolvedPath: string
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
  /**
   * 1-based playlist/list index to start from (scdl `-o` → yt-dlp `--playlist-items N:`).
   * SoundCloud only. Omit or leave unset to start from the beginning.
   */
  offset?: number
}

export type SessionOutcome = 'completed' | 'cancelled' | 'failed'

export interface SessionSnapshot {
  id: string
  startedAt: number
  endedAt: number
  request: DownloadRequest
  source: 'soundcloud' | 'youtube'
  outcome: SessionOutcome
  statusMessage: string
  statusVariant: 'info' | 'success' | 'error'
  queue: QueueItem[]
  counts: {
    completed: number
    skipped: number
    error: number
    downloading: number
  }
}

export interface MixTrackRef {
  trackId: string
  title: string
  artist: string
  filePath: string
}

export interface MixState {
  /** Stable id for multi-mix library membership and IPC targeting. */
  id: string
  name: string
  folderSlug: string
  tracks: MixTrackRef[]
}

/** Persisted multi-mix library (mixes.json). Always has at least one mix. */
export interface MixLibrary {
  mixes: MixState[]
  activeMixId: string
}

/** Lightweight mix membership info for Backpack checklists. */
export interface MixMembershipSummary {
  id: string
  name: string
  trackIds: string[]
}

export interface MixExportResult {
  ok: boolean
  copied: number
  skipped: number
  exportDir: string
  skippedTitles: string[]
  error?: string
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
  | {
      type: 'cooldown'
      message: string
      seconds: number
      reason: 'chunk' | 'throttle'
      attempt?: number
      maxAttempts?: number
      downloaded?: number
    }
  | { type: 'impersonation-warning' }
  | { type: 'youtube-cookies-hint' }

/** Host OS as reported by Node's `process.platform`, forwarded to the renderer. */
export type HostPlatform =
  | 'aix'
  | 'android'
  | 'darwin'
  | 'freebsd'
  | 'haiku'
  | 'linux'
  | 'openbsd'
  | 'sunos'
  | 'win32'
  | 'cygwin'
  | 'netbsd'

export interface ScdlApi {
  /** Host OS, forwarded from the main process (e.g. 'win32', 'darwin', 'linux'). */
  platform: HostPlatform
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
  resolveAudioPath: (filePath: string, trackId?: string) => Promise<ResolvedAudioPath>
  /** Resolve a whole page of Backpack rows in one round trip. */
  resolveAudioPaths: (
    items: Array<{ filePath: string; trackId?: string }>
  ) => Promise<ResolvedAudioPath[]>
  fileExists: (filePath: string, trackId?: string) => Promise<boolean>
  openInDefaultPlayer: (filePath: string) => Promise<{ ok: boolean; error?: string }>
  openFolder: (folderPath: string) => Promise<{ ok: boolean; error?: string }>
  getSessions: () => Promise<SessionSnapshot[]>
  getMixes: () => Promise<MixLibrary>
  getMix: (mixId?: string) => Promise<MixState | null>
  saveMix: (mix: MixState) => Promise<MixState>
  createMix: (name?: string) => Promise<MixLibrary>
  deleteMix: (mixId: string) => Promise<MixLibrary>
  setActiveMix: (mixId: string) => Promise<MixLibrary>
  openMixPlaylist: (mixId?: string) => Promise<{ ok: boolean; error?: string }>
  exportMix: (mixId?: string) => Promise<MixExportResult>
  importTracks: (mode: ImportMode) => Promise<ImportResult>
  scanLibrary: () => Promise<LibraryScanResult>
  onEvent: (callback: (event: ScdlEvent) => void) => () => void
  onLibraryProgress: (callback: (progress: LibraryScanProgress) => void) => () => void
}

declare global {
  interface Window {
    scdl: ScdlApi
  }
}

export {}
