import { ChildProcessWithoutNullStreams, spawn, spawnSync } from 'child_process'
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from 'fs'
import { join } from 'path'
import { BrowserWindow } from 'electron'
import { appendHistory, createHistoryEntry } from './archive'
import { ensureArchiveFile, extractArtistSlug, loadHistory, loadSettings, saveHistory } from './settings'
import { getScdlPath, getSpawnEnv, getYtDlpInvocation } from './binPaths'
import { decodeScdlOutput } from './scdlEncoding'
import { resolveCompletedTrackPath } from './resolveAudioPath'
import { parseTrackFileName, reconcileHistoryEntries, collectAudioFiles } from './reconcileHistory'
import { collectSidecars, findSidecarForMedia, historyEntryFromSidecar } from './infoSidecar'
import { removeArchiveEntry } from './archiveMutate'
import { deleteMediaAndSidecar, validateCompletedMedia } from './validateMedia'
import { appendSession } from './sessionLog'
import {
  classifyYouTubeUrl,
  detectSource,
  sanitizeFolderName,
  youtubeFolderSlug
} from '../shared/sources'
import type { DownloadSource, YouTubeKind } from '../shared/sources'
import { IPC } from '../shared/ipc'
import type { DownloadMode, DownloadRequest, QueueItem, ScdlEvent, AppSettings, SessionOutcome, SessionSnapshot } from '../shared/types'

let activeProcess: ChildProcessWithoutNullStreams | null = null
let activeWindow: BrowserWindow | null = null

const queue = new Map<string, QueueItem>()
let currentTrackId: string | null = null
let trackCounter = 0

/**
 * Tracks a multi-run download "session". A session may spawn scdl several times:
 * once per chunk (with a cooldown pause in between) and again after a throttle
 * (403/429) backoff. Re-runs rely on `--download-archive` + `-c` so already
 * downloaded tracks are skipped, making each run an effective resume.
 */
interface DownloadSession {
  /** Executable to spawn (bundled scdl for SoundCloud, scdl/yt-dlp for YouTube). */
  command: string
  args: string[]
  /** Folder downloads land in; scanned for leftover .part files when done. */
  outputPath: string
  request: DownloadRequest
  source: DownloadSource
  startedAt: number
  chunkSize: number
  cooldownSeconds: number
  maxThrottleRetries: number
  throttleAttempts: number
  chunkDownloads: number
  runDownloads: number
  totalDownloads: number
  sawThrottle: boolean
  killedForCooldown: boolean
  cancelled: boolean
  cooldownTimer: ReturnType<typeof setTimeout> | null
}

let session: DownloadSession | null = null

function emit(event: ScdlEvent): void {
  if (activeWindow && !activeWindow.isDestroyed()) {
    activeWindow.webContents.send(IPC.EVENT, event)
  }
}

function emitQueue(): void {
  emit({ type: 'queue', items: Array.from(queue.values()) })
}

function makeTrackId(): string {
  trackCounter += 1
  return `track-${trackCounter}`
}

function upsertQueue(item: QueueItem): void {
  queue.set(item.id, item)
  emitQueue()
}

function isSyntheticTrackId(id: string): boolean {
  return id.startsWith('track-')
}

function normalizeTrackLabel(value: string): string {
  return value.trim().toLowerCase()
}

function tracksMatch(
  a: { title: string; artist: string },
  b: { title: string; artist: string }
): boolean {
  return (
    normalizeTrackLabel(a.title) === normalizeTrackLabel(b.title) &&
    (normalizeTrackLabel(a.artist) === normalizeTrackLabel(b.artist) ||
      a.artist === 'Unknown' ||
      b.artist === 'Unknown')
  )
}

function dedupeQueueForIncoming(incoming: QueueItem): QueueItem {
  let title = incoming.title
  let artist = incoming.artist

  for (const [id, item] of Array.from(queue.entries())) {
    if (id === incoming.id) continue

    const sameTrack = tracksMatch(item, incoming)
    if (!sameTrack) continue

    if (title === 'Archived track' || title === 'Unknown track') {
      title = item.title
    }
    if (artist === 'Unknown' && item.artist !== 'Unknown') {
      artist = item.artist
    }
    queue.delete(id)
  }

  if (!isSyntheticTrackId(incoming.id) && incoming.status !== 'downloading') {
    const synthetics = Array.from(queue.entries()).filter(
      ([id, item]) => isSyntheticTrackId(id) && item.status === 'downloading'
    )
    if (synthetics.length === 1) {
      const [synId, synItem] = synthetics[0]
      const looselySame =
        tracksMatch(synItem, { title, artist }) ||
        title === 'Archived track' ||
        queue.size <= 2
      if (looselySame) {
        if (title === 'Archived track') title = synItem.title
        if (artist === 'Unknown') artist = synItem.artist
        queue.delete(synId)
      }
    }
  }

  return { ...incoming, title, artist }
}

function upsertTrackItem(item: QueueItem): QueueItem {
  const merged = dedupeQueueForIncoming(item)
  queue.set(merged.id, merged)
  emitQueue()
  return merged
}

function modeFlag(mode: DownloadMode): string[] {
  switch (mode) {
    case 'all':
      return ['-a']
    case 'likes':
      return ['-f']
    case 'playlists':
      return ['-p']
    case 'uploads':
      return ['-t']
    case 'single':
    default:
      return []
  }
}

function buildYtDlpArgs(settings: AppSettings): string {
  // Randomized (jittered) sleep between tracks looks less bot-like than a fixed
  // delay and is the main lever against SoundCloud throttling.
  const minSleep = Math.max(0, settings.sleepIntervalSeconds)
  const maxSleep = Math.max(minSleep, settings.maxSleepIntervalSeconds)
  const parts: string[] = ['--sleep-interval', String(minSleep), '--max-sleep-interval', String(maxSleep)]

  // Write a per-track .info.json sidecar so history is built from exact metadata
  // (id, title, uploader, webpage_url, filesize) instead of scraped stdout. The
  // sidecars are ingested and swept when the session finalizes.
  parts.push('--write-info-json')

  if (settings.sleepRequestsSeconds > 0) {
    // Spaces out metadata/API requests, which is what actually trips 403/429.
    parts.push('--sleep-requests', String(settings.sleepRequestsSeconds))
  }

  // Let yt-dlp absorb transient errors before our session-level resume kicks in.
  parts.push(
    '--retries',
    '10',
    '--extractor-retries',
    '3',
    '--fragment-retries',
    '10',
    '--retry-sleep',
    '5'
  )

  if (settings.limitRate.trim()) {
    parts.push('--limit-rate', settings.limitRate.trim())
  }

  if (settings.impersonateTarget.trim()) {
    // Requires curl_cffi to be available to yt-dlp; bundled in packaged builds.
    parts.push('--impersonate', settings.impersonateTarget.trim())
  }

  if (settings.limitTrackLength) {
    const seconds = Math.max(1, settings.maxTrackLengthMinutes) * 60
    // Quoted so scdl's yt-dlp-args parser keeps "duration < N" as one filter value.
    parts.push('--match-filter', `"duration < ${seconds}"`)
  }

  return parts.join(' ')
}

/** Folder downloads for this request land in (root for single, artist subfolder otherwise). */
function resolveOutputPath(request: DownloadRequest, settings: AppSettings): string {
  if (request.mode === 'single') return settings.downloadDir
  return join(settings.downloadDir, extractArtistSlug(request.url))
}

/**
 * Remove yt-dlp partial-download artifacts (`*.part`, `*.part-Frag*`, `*.ytdl`)
 * left in a folder. Called only when a session truly ends so that resume between
 * chunks/throttle retries (which relies on .part files) is never disrupted.
 */
function cleanupPartials(dir: string): number {
  if (!dir || !existsSync(dir)) return 0
  let removed = 0
  try {
    for (const name of readdirSync(dir)) {
      if (/\.part$|\.part-Frag\d+$|\.ytdl$/i.test(name)) {
        try {
          unlinkSync(join(dir, name))
          removed += 1
        } catch {
          // File may be locked or already gone; skip it.
        }
      }
    }
  } catch {
    // Folder unreadable; nothing to clean.
  }
  return removed
}

/** Remove truncated audio files and their archive entries after a session. */
function sweepCorruptMedia(outputPath: string): number {
  if (!outputPath?.trim()) return 0
  const settings = loadSettings()
  let removed = 0

  for (const filePath of collectAudioFiles(outputPath)) {
    const sidecarPath = findSidecarForMedia(filePath)
    const validation = validateCompletedMedia(filePath, sidecarPath)
    if (validation.ok) continue

    let archiveId: string | null = null
    if (sidecarPath) {
      const entry = historyEntryFromSidecar(sidecarPath, filePath)
      if (entry?.trackId && /^\d+$/.test(entry.trackId)) {
        archiveId = entry.trackId
      }
    }

    deleteMediaAndSidecar(filePath)
    if (archiveId) {
      removeArchiveEntry(settings.archivePath, archiveId)
    }
    removed += 1
  }

  return removed
}

function sessionCounts(items: QueueItem[]): SessionSnapshot['counts'] {
  return {
    completed: items.filter((item) => item.status === 'completed').length,
    skipped: items.filter((item) => item.status === 'skipped').length,
    error: items.filter((item) => item.status === 'error').length,
    downloading: items.filter((item) => item.status === 'downloading').length
  }
}

function persistSessionSnapshot(s: DownloadSession, success: boolean, message: string): void {
  const cancelled = s.cancelled
  let outcome: SessionOutcome = 'failed'
  if (cancelled) outcome = 'cancelled'
  else if (success) outcome = 'completed'

  let statusVariant: SessionSnapshot['statusVariant'] = 'error'
  if (cancelled) statusVariant = 'info'
  else if (success) statusVariant = 'success'

  const queueItems = Array.from(queue.values())

  appendSession({
    startedAt: s.startedAt,
    endedAt: Date.now(),
    request: s.request,
    source: s.source,
    outcome,
    statusMessage: message,
    statusVariant,
    queue: queueItems.map((item) => ({ ...item })),
    counts: sessionCounts(queueItems)
  })
}

function buildArgs(request: DownloadRequest): string[] {
  const settings = loadSettings()
  ensureArchiveFile(settings.archivePath)

  const outputPath = resolveOutputPath(request, settings)

  const args = [
    '-l',
    request.url,
    ...modeFlag(request.mode),
    '--path',
    outputPath,
    '--download-archive',
    settings.archivePath,
    '-c',
    '--name-format',
    '%(uploader)s - %(title)s',
    '--hide-progress',
    '--yt-dlp-args',
    buildYtDlpArgs(settings)
  ]

  if (settings.clientId.trim()) {
    args.push('--client-id', settings.clientId.trim())
  }
  if (settings.authToken.trim()) {
    args.push('--auth-token', settings.authToken.trim())
  }

  return args
}

/**
 * yt-dlp status lines that must not become fake Party Roster rows (they never
 * get a matching destination/completion event).
 */
function isYtDlpNoiseLine(line: string): boolean {
  const lower = line.toLowerCase()
  if (/because of --no-playlist/i.test(line)) return true
  if (/downloading just the video/i.test(lower)) return true
  if (/^downloading playlist:/i.test(lower.trim())) return true
  return false
}

/** Resolve a human-readable folder name for a playlist/channel before downloading. */
function fetchYouTubeBulkFolderName(url: string, kind: YouTubeKind): string {
  const fallback = youtubeFolderSlug(url) ?? (kind === 'channel' ? 'youtube-channel' : 'youtube-playlist')
  const { command, prelude } = getYtDlpInvocation()
  const fields = kind === 'playlist' ? ['playlist_title', 'title'] : ['channel', 'uploader']

  for (const field of fields) {
    const result = spawnSync(
      command,
      [...prelude, '--flat-playlist', '--print', field, '--playlist-end', '1', '--skip-download', url],
      { encoding: 'utf8', windowsHide: true, timeout: 45_000, env: getSpawnEnv() }
    )
    const line = (result.stdout ?? '')
      .split(/\r?\n/)
      .map((entry) => entry.trim())
      .find(Boolean)
    if (line && !/^NA$/i.test(line)) {
      return sanitizeFolderName(line)
    }
  }

  return fallback
}

/**
 * Build the yt-dlp argument list for an audio-only YouTube download (single
 * video, playlist, or channel - auto-detected from the URL). These are passed
 * to yt-dlp directly as argv (no shell), so values with spaces (the output
 * template, the match filter) are single elements and need no quoting.
 */
function buildYouTubeArgs(request: DownloadRequest): {
  args: string[]
  outputPath: string
} {
  const settings = loadSettings()
  ensureArchiveFile(settings.archivePath)

  const kind = classifyYouTubeUrl(request.url)
  const outputPath =
    kind === 'video'
      ? settings.downloadDir
      : join(settings.downloadDir, fetchYouTubeBulkFolderName(request.url, kind))

  if (kind !== 'video') {
    mkdirSync(outputPath, { recursive: true })
  }

  const outputTemplate = join(outputPath, '%(uploader)s - %(title)s.%(ext)s')

  const args: string[] = [
    request.url,
    // Prefer a ready-made m4a/AAC stream so extraction is a remux (no re-encode);
    // only fall back to other audio when m4a is unavailable.
    '-f',
    'bestaudio[ext=m4a]/bestaudio/best',
    '-x',
    '--audio-format',
    'm4a',
    '--audio-quality',
    '0',
    '--embed-thumbnail',
    '--embed-metadata',
    '--write-info-json',
    '--no-overwrites',
    // One progress update per line so live percent parsing works (yt-dlp uses
    // carriage returns by default, which our line splitter would buffer).
    '--newline',
    '--download-archive',
    settings.archivePath,
    '-o',
    outputTemplate
  ]

  if (kind === 'video') {
    args.push('--no-playlist')
  } else {
    // Playlist/channel: grab every entry and keep going past individual failures.
    args.push('--yes-playlist', '--ignore-errors')
  }

  const minSleep = Math.max(0, settings.sleepIntervalSeconds)
  const maxSleep = Math.max(minSleep, settings.maxSleepIntervalSeconds)
  args.push('--sleep-interval', String(minSleep), '--max-sleep-interval', String(maxSleep))
  if (settings.sleepRequestsSeconds > 0) {
    args.push('--sleep-requests', String(settings.sleepRequestsSeconds))
  }
  args.push('--retries', '10', '--fragment-retries', '10', '--retry-sleep', '5')
  if (settings.limitRate.trim()) {
    args.push('--limit-rate', settings.limitRate.trim())
  }
  if (settings.limitTrackLength) {
    const seconds = Math.max(1, settings.maxTrackLengthMinutes) * 60
    args.push('--match-filter', `duration < ${seconds}`)
  }

  return { args, outputPath }
}

function parsePercent(line: string): number | null {
  const percentMatch = line.match(/(\d{1,3}(?:\.\d+)?)%/)
  if (percentMatch) {
    return Math.min(100, Math.round(Number(percentMatch[1])))
  }

  const fragmentMatch = line.match(/fragment\s+(\d+)\/(\d+)/i)
  if (fragmentMatch) {
    const current = Number(fragmentMatch[1])
    const total = Number(fragmentMatch[2])
    if (total > 0) {
      return Math.min(100, Math.round((current / total) * 100))
    }
  }

  const fractionMatch = line.match(/(\d+)\/(\d+)/)
  if (fractionMatch) {
    const current = Number(fractionMatch[1])
    const total = Number(fractionMatch[2])
    if (total > 0) {
      return Math.min(100, Math.round((current / total) * 100))
    }
  }

  return null
}

function parseDestination(line: string): { title: string; artist: string; filePath: string; trackId: string } | null {
  // yt-dlp emits `[ExtractAudio] Destination:` for the final m4a after `-x`; prefer
  // that over the intermediate `[download] Destination:` (often a webm/opus temp).
  const destinationMatch =
    line.match(/\[ExtractAudio\]\s+Destination:\s+(.+)$/i) ??
    line.match(/\[download\]\s+Destination:\s+(.+)$/i)
  if (!destinationMatch) return null

  const filePath = destinationMatch[1].trim()
  const fileName = filePath.split(/[\\/]/).pop() ?? filePath
  const { trackId, artist, title } = parseTrackFileName(fileName)
  return { trackId, artist, title, filePath }
}

function parseArchiveSkip(line: string): { trackId: string; title: string } | null {
  const skipMatch = line.match(/\[download\]\s+(\d+):\s+(.+?)\s+has already been recorded in the archive/i)
  if (skipMatch) {
    return { trackId: skipMatch[1], title: skipMatch[2].trim() }
  }
  return null
}

function parseTrackTitle(line: string): { title: string; artist: string } | null {
  const destination = parseDestination(line)
  if (destination) {
    return { title: destination.title, artist: destination.artist }
  }

  const soundcloudMatch = line.match(/\[soundcloud\]\s+([^/\s]+)\/([^:\s]+):/i)
  if (soundcloudMatch) {
    return {
      artist: soundcloudMatch[1].replace(/-/g, ' '),
      title: soundcloudMatch[2].replace(/-/g, ' ')
    }
  }

  const downloadingMatch = line.match(/Downloading\s+(.+?)(?:\s+\[|$)/i)
  if (downloadingMatch) {
    const full = downloadingMatch[1].trim()
    const split = full.split(' - ')
    if (split.length >= 2) {
      return { artist: split[0].trim(), title: split.slice(1).join(' - ').trim() }
    }
    return { artist: 'Unknown', title: full }
  }

  const trackMatch = line.match(/Track\s+\d+\s+of\s+\d+:\s*(.+)/i)
  if (trackMatch) {
    const full = trackMatch[1].trim()
    const split = full.split(' - ')
    if (split.length >= 2) {
      return { artist: split[0].trim(), title: split.slice(1).join(' - ').trim() }
    }
    return { artist: 'Unknown', title: full }
  }

  return null
}

function parseTrackIdFromLine(line: string): string | null {
  const destination = parseDestination(line)
  if (destination) return destination.trackId

  const skip = parseArchiveSkip(line)
  if (skip) return skip.trackId

  const numericMatch = line.match(/\[soundcloud\]\s+(\d+):/i)
  if (numericMatch) return numericMatch[1]

  const idMatch = line.match(/soundcloud\.com\/[^/\s]+\/([^/\s?]+)/i)
  return idMatch ? idMatch[1] : null
}

let lastRequestUrl = ''
let lastDestinationPath = ''
let currentSoundCloudTrackId: string | null = null
let currentSource: DownloadSource = 'soundcloud'

function isNumericSoundCloudTrackId(id: string | null | undefined): id is string {
  return typeof id === 'string' && /^\d+$/.test(id)
}

function activeSoundCloudTrackId(queueTrackId: string): string | null {
  if (isNumericSoundCloudTrackId(queueTrackId)) return queueTrackId
  if (isNumericSoundCloudTrackId(currentSoundCloudTrackId)) return currentSoundCloudTrackId
  return null
}

function parseFilterSkip(line: string): { title: string; reason: string } | null {
  if (!/does not pass filter/i.test(line)) return null

  const titleMatch = line.match(/Skipping\s+(?:.*?:\s*)?(.+?)\s+does not pass filter/i)
  const title = titleMatch?.[1]?.trim() ?? 'Filtered track'

  let reason = 'Filtered out'
  if (/duration/i.test(line)) reason = 'Too long for length limit'

  return { title, reason }
}

function handleLine(line: string): void {
  const trimmed = line.trim()
  if (!trimmed) return

  const lower = trimmed.toLowerCase()

  const is403 =
    lower.includes('forbidden') ||
    (/\b403\b/.test(lower) && (lower.includes('error') || lower.includes('http')))
  const is429 =
    lower.includes('too many requests') ||
    (/\b429\b/.test(lower) && (lower.includes('error') || lower.includes('http')))
  if (is403 || is429) {
    if (session) session.sawThrottle = true
    emit({
      type: 'rate-limit',
      message: is403
        ? 'SoundCloud refused a request (HTTP 403) — likely throttling this session. PK-Tunez will back off and retry automatically.'
        : 'SoundCloud is throttling requests (HTTP 429). PK-Tunez will slow down and resume automatically.'
    })
  }

  if (lower.includes('impersonation') && lower.includes('no impersonate target')) {
    emit({ type: 'impersonation-warning' })
  }

  emit({ type: 'status', message: trimmed })

  const soundcloudIdMatch = trimmed.match(/\[soundcloud\]\s+(\d+):/i)
  if (soundcloudIdMatch) {
    currentSoundCloudTrackId = soundcloudIdMatch[1]
  }

  const filterSkip = parseFilterSkip(trimmed)
  if (filterSkip) {
    const id = currentTrackId && isSyntheticTrackId(currentTrackId) ? currentTrackId : makeTrackId()
    const merged = upsertTrackItem({
      id,
      title: filterSkip.title,
      artist: 'Unknown',
      status: 'skipped',
      progress: 100,
      indeterminate: false,
      message: filterSkip.reason
    })
    currentTrackId = merged.id
    emit({
      type: 'track-skipped',
      id: merged.id,
      title: merged.title,
      artist: merged.artist,
      reason: filterSkip.reason
    })
    return
  }

  const archiveSkip = parseArchiveSkip(trimmed)
  if (
    archiveSkip ||
    lower.includes('already downloaded') ||
    lower.includes('has already been recorded in the archive')
  ) {
    const current = currentTrackId ? queue.get(currentTrackId) : undefined
    let title = archiveSkip?.title ?? current?.title ?? 'Archived track'
    let artist = current?.artist ?? 'Unknown'
    const id =
      archiveSkip?.trackId ??
      (currentTrackId && isSyntheticTrackId(currentTrackId) ? currentTrackId : currentTrackId ?? makeTrackId())

    const merged = upsertTrackItem({
      id,
      title,
      artist,
      status: 'skipped',
      progress: 100,
      indeterminate: false,
      message: 'Already in archive'
    })
    currentTrackId = merged.id
    emit({
      type: 'track-skipped',
      id: merged.id,
      title: merged.title,
      artist: merged.artist,
      reason: 'Already in archive'
    })
    return
  }

  const destination = parseDestination(trimmed)
  if (destination) {
    currentTrackId = destination.trackId
    if (isNumericSoundCloudTrackId(destination.trackId)) {
      currentSoundCloudTrackId = destination.trackId
    }
    lastDestinationPath = destination.filePath
    upsertTrackItem({
      id: currentTrackId,
      title: destination.title,
      artist: destination.artist,
      status: 'downloading',
      progress: 0,
      indeterminate: true
    })
    emit({
      type: 'track-start',
      id: currentTrackId,
      title: destination.title,
      artist: destination.artist
    })
  }

  const trackInfo = parseTrackTitle(trimmed)
  if (trackInfo && !destination && !(currentSource === 'youtube' && isYtDlpNoiseLine(trimmed))) {
    currentTrackId = currentTrackId ?? makeTrackId()
    if (!queue.has(currentTrackId)) {
      upsertQueue({
        id: currentTrackId,
        title: trackInfo.title,
        artist: trackInfo.artist,
        status: 'downloading',
        progress: 0,
        indeterminate: true
      })
      emit({
        type: 'track-start',
        id: currentTrackId,
        title: trackInfo.title,
        artist: trackInfo.artist
      })
    }
  }

  const percent = parsePercent(trimmed)
  if (percent !== null && currentTrackId) {
    const existing = queue.get(currentTrackId)
    if (existing) {
      const justCompleted = percent >= 100 && existing.status !== 'completed'
      upsertQueue({
        ...existing,
        progress: percent,
        indeterminate: false,
        status: percent >= 100 ? 'completed' : 'downloading'
      })
      emit({ type: 'progress', id: currentTrackId, progress: percent, indeterminate: false })

      // YouTube has no "[download] Download completed" line (that branch is
      // SoundCloud's), so count completions here for the session summary; the
      // history rows themselves are reconciled from .info.json at finalize().
      if (currentSource === 'youtube' && justCompleted && session) {
        session.totalDownloads += 1
      }
    }
  }

  if (
    currentSource === 'soundcloud' &&
    (lower.includes('[download] download completed') || lower === '[download] download completed')
  ) {
    const id = currentTrackId ?? makeTrackId()
    const existing = queue.get(id)
    const title = existing?.title ?? 'Unknown track'
    const artist = existing?.artist ?? 'Unknown'
    const soundCloudTrackId = activeSoundCloudTrackId(id)
    const settings = loadSettings()
    const filePath = resolveCompletedTrackPath(lastDestinationPath, soundCloudTrackId, settings.downloadDir)
    const sizeBytes = safeFileSize(filePath)
    const trackSlug = soundCloudTrackId ?? id

    // Prefer the .info.json sidecar (exact id/title/artist/url/size) over scraped
    // stdout values; fall back to the scraped values when no sidecar is present.
    const sidecarPath = findSidecarForMedia(filePath)
    const sidecar = sidecarPath ? historyEntryFromSidecar(sidecarPath, filePath) : null

    const finalTitle = sidecar?.title || title
    const finalArtist =
      sidecar && sidecar.artist && sidecar.artist !== 'Unknown' ? sidecar.artist : artist
    const finalUrl = sidecar?.url || requestUrlFromContext(trimmed)
    const finalTrackId = sidecar?.trackId || trackSlug
    const finalSize = sidecar?.sizeBytes || sizeBytes

    const validation = validateCompletedMedia(filePath, sidecarPath)
    if (!validation.ok) {
      deleteMediaAndSidecar(filePath)
      if (finalTrackId && /^\d+$/.test(finalTrackId)) {
        removeArchiveEntry(settings.archivePath, finalTrackId)
      }
      upsertTrackItem({
        id,
        title: finalTitle,
        artist: finalArtist,
        status: 'error',
        progress: existing?.progress ?? 0,
        indeterminate: false,
        message: validation.reason ?? 'Download incomplete or corrupt'
      })
      emit({
        type: 'track-error',
        id,
        title: finalTitle,
        message: validation.reason ?? 'Download incomplete or corrupt'
      })
      return
    }

    upsertTrackItem({
      id,
      title: finalTitle,
      artist: finalArtist,
      status: 'completed',
      progress: 100,
      indeterminate: false
    })

    appendHistory(
      createHistoryEntry({
        trackId: finalTrackId,
        title: finalTitle,
        artist: finalArtist,
        url: finalUrl,
        filePath,
        sizeBytes: finalSize
      })
    )

    emit({
      type: 'track-complete',
      id,
      title: finalTitle,
      artist: finalArtist,
      url: finalUrl,
      filePath,
      sizeBytes: finalSize
    })

    if (session) {
      session.chunkDownloads += 1
      session.runDownloads += 1
      session.totalDownloads += 1
      maybeStartCooldown()
    }
  }

  if (
    (lower.includes('error') || lower.includes('failed')) &&
    !lower.includes('could not interpret') &&
    !lower.includes('not remuxing') &&
    !lower.includes('429') &&
    !lower.includes('403') &&
    !lower.includes('forbidden')
  ) {
    const id = currentTrackId ?? makeTrackId()
    const existing = queue.get(id)
    upsertTrackItem({
      id,
      title: existing?.title ?? 'Unknown track',
      artist: existing?.artist ?? 'Unknown',
      status: 'error',
      progress: existing?.progress ?? 0,
      indeterminate: false,
      message: trimmed
    })
    emit({
      type: 'track-error',
      id,
      title: existing?.title ?? 'Unknown track',
      message: trimmed
    })
  }
}

function requestUrlFromContext(line: string): string {
  const urlMatch = line.match(/https?:\/\/[^\s]+/i)
  return urlMatch ? urlMatch[0] : lastRequestUrl
}

function safeFileSize(filePath: string): number {
  if (!existsSync(filePath)) return 0
  try {
    return statSync(filePath).size
  } catch {
    return 0
  }
}

function attachProcessHandlers(proc: ChildProcessWithoutNullStreams): void {
  let stdoutBuffer = ''
  let stderrBuffer = ''

  proc.stdout.on('data', (chunk: Buffer) => {
    stdoutBuffer += decodeScdlOutput(chunk)
    const lines = stdoutBuffer.split(/\r?\n/)
    stdoutBuffer = lines.pop() ?? ''
    lines.forEach(handleLine)
  })

  proc.stderr.on('data', (chunk: Buffer) => {
    stderrBuffer += decodeScdlOutput(chunk)
    const lines = stderrBuffer.split(/\r?\n/)
    stderrBuffer = lines.pop() ?? ''
    lines.forEach(handleLine)
  })

  proc.on('close', (code) => {
    // Flush any trailing line left in the buffers. Without this, a final
    // "[download] Download completed" with no trailing newline (common when the
    // process is killed for a cooldown) would be dropped, desyncing history.
    if (stdoutBuffer) {
      handleLine(stdoutBuffer)
      stdoutBuffer = ''
    }
    if (stderrBuffer) {
      handleLine(stderrBuffer)
      stderrBuffer = ''
    }
    if (activeProcess === proc) activeProcess = null
    currentTrackId = null
    onRunClose(code)
  })

  proc.on('error', (error) => {
    if (activeProcess === proc) activeProcess = null
    emit({ type: 'error', message: error.message })
    finalize(false, error.message)
  })
}

function backoffSeconds(attempt: number): number {
  // 30, 60, 120, 240, 480 ... capped at 10 minutes.
  return Math.min(600, 30 * 2 ** Math.max(0, attempt - 1))
}

/** Kill the current run early once a chunk is full so a cooldown can run. */
function maybeStartCooldown(): void {
  if (!session) return
  const s = session
  if (s.chunkSize <= 0) return
  if (s.killedForCooldown) return
  if (s.chunkDownloads < s.chunkSize) return

  s.killedForCooldown = true
  emit({
    type: 'status',
    message: `Chunk of ${s.chunkSize} done — pausing to avoid throttling...`
  })
  if (activeProcess) {
    activeProcess.kill()
  }
}

function startCooldown(seconds: number, reason: 'chunk' | 'throttle'): void {
  if (!session) return
  const s = session
  const message =
    reason === 'chunk'
      ? `Cooling down ${seconds}s before the next batch (${s.totalDownloads} downloaded so far)...`
      : `Throttled — backing off ${seconds}s before resuming (attempt ${s.throttleAttempts}/${s.maxThrottleRetries})...`

  // The renderer turns `seconds` + these fields into a live countdown, so we no
  // longer emit a separate static 'status' line (it would fight the ticking timer).
  emit({
    type: 'cooldown',
    reason,
    seconds,
    message,
    attempt: reason === 'throttle' ? s.throttleAttempts : undefined,
    maxAttempts: reason === 'throttle' ? s.maxThrottleRetries : undefined,
    downloaded: reason === 'chunk' ? s.totalDownloads : undefined
  })

  s.cooldownTimer = setTimeout(() => {
    if (!session || session.cancelled) return
    session.cooldownTimer = null
    spawnRun()
  }, seconds * 1000)
}

function onRunClose(code: number | null): void {
  if (!session) return
  const s = session

  if (s.cancelled) return

  // Re-runs that make progress earn a fresh throttle-retry budget.
  if (s.runDownloads > 0) {
    s.throttleAttempts = 0
  }

  if (s.killedForCooldown) {
    s.killedForCooldown = false
    s.chunkDownloads = 0
    startCooldown(s.cooldownSeconds, 'chunk')
    return
  }

  const success = code === 0

  if (s.sawThrottle && s.throttleAttempts < s.maxThrottleRetries) {
    s.throttleAttempts += 1
    startCooldown(backoffSeconds(s.throttleAttempts), 'throttle')
    return
  }

  if (success) {
    finalize(
      true,
      s.totalDownloads > 0
        ? `Download session complete! ${s.totalDownloads} track(s) downloaded.`
        : 'Download session complete!'
    )
    return
  }

  finalize(false, `Download ended with code ${code ?? 'unknown'}`)
}

function spawnRun(): void {
  if (!session) return
  const s = session
  s.sawThrottle = false
  s.runDownloads = 0
  s.chunkDownloads = 0
  s.killedForCooldown = false

  try {
    activeProcess = spawn(s.command, s.args, {
      windowsHide: true,
      env: getSpawnEnv()
    })
    attachProcessHandlers(activeProcess)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to start scdl'
    emit({ type: 'error', message })
    finalize(false, message)
  }
}

/** Sweep partials, reconcile history from disk/sidecars, and remove sidecars. */
function postSessionFolderCleanup(outputPath: string): void {
  const removed = cleanupPartials(outputPath)
  if (removed > 0) {
    emit({ type: 'status', message: `Removed ${removed} leftover partial file(s).` })
  }

  const corruptRemoved = sweepCorruptMedia(outputPath)
  if (corruptRemoved > 0) {
    emit({
      type: 'status',
      message: `Removed ${corruptRemoved} incomplete or corrupt track file(s).`
    })
  }

  try {
    const { merged, added } = reconcileHistoryEntries(loadHistory(), outputPath)
    if (added.length > 0) {
      saveHistory(merged)
      emit({
        type: 'status',
        message: `Reconciled inventory — recovered ${added.length} track(s) missing from history.`
      })
    }
  } catch {
    // Best-effort: never let a reconciliation hiccup block session completion.
  }

  for (const sidecar of collectSidecars(outputPath)) {
    try {
      unlinkSync(sidecar)
    } catch {
      // File may be locked or already gone; skip it.
    }
  }
}

function finalize(success: boolean, message: string): void {
  if (!session) return
  if (session.cooldownTimer) {
    clearTimeout(session.cooldownTimer)
  }
  const s = session
  persistSessionSnapshot(s, success, message)
  const outputPath = s.outputPath
  session = null
  activeProcess = null
  currentTrackId = null

  postSessionFolderCleanup(outputPath)
  emit({ type: 'done', success: success && !s.cancelled, message })
}

export function startDownload(window: BrowserWindow, request: DownloadRequest): { ok: boolean; error?: string } {
  if (activeProcess || session) {
    return { ok: false, error: 'A download is already running.' }
  }

  activeWindow = window
  queue.clear()
  trackCounter = 0
  currentTrackId = null
  currentSoundCloudTrackId = null
  lastRequestUrl = request.url
  lastDestinationPath = ''

  const settings = loadSettings()
  const source = detectSource(request.url)
  currentSource = source

  let command: string
  let args: string[]
  let outputPath: string
  // YouTube routes through the embedded yt-dlp (audio-only); SoundCloud through
  // scdl. Chunk cooldowns are SoundCloud-throttle-specific, so YouTube runs with
  // chunkSize 0 (single pass, history reconciled from sidecars at finalize).
  let chunkSize = Math.max(0, Math.floor(settings.chunkSize))

  if (source === 'youtube') {
    const yt = buildYouTubeArgs(request)
    const invocation = getYtDlpInvocation()
    command = invocation.command
    args = [...invocation.prelude, ...yt.args]
    outputPath = yt.outputPath
    chunkSize = 0
  } else {
    command = getScdlPath()
    args = buildArgs(request)
    outputPath = resolveOutputPath(request, settings)
  }

  session = {
    command,
    args,
    outputPath,
    request,
    source,
    startedAt: Date.now(),
    chunkSize,
    cooldownSeconds: Math.max(5, Math.floor(settings.chunkCooldownSeconds)),
    maxThrottleRetries: Math.max(0, Math.floor(settings.maxThrottleRetries)),
    throttleAttempts: 0,
    chunkDownloads: 0,
    runDownloads: 0,
    totalDownloads: 0,
    sawThrottle: false,
    killedForCooldown: false,
    cancelled: false,
    cooldownTimer: null
  }

  const label = source === 'youtube' ? 'YouTube (audio)' : 'SoundCloud'
  emit({ type: 'status', message: `Starting ${label} download: ${command} ${args.join(' ')}` })
  spawnRun()

  if (!session) {
    return { ok: false, error: 'Failed to start scdl.' }
  }
  return { ok: true }
}

export function cancelDownload(): void {
  if (!session && !activeProcess) return

  if (session) {
    session.cancelled = true
    if (session.cooldownTimer) {
      clearTimeout(session.cooldownTimer)
      session.cooldownTimer = null
    }
  }
  emit({ type: 'status', message: 'Cancelling download…' })

  const finishCancel = (): void => {
    finalize(false, 'Download cancelled.')
  }

  const proc = activeProcess
  activeProcess = null
  if (proc) {
    proc.once('close', finishCancel)
    try {
      proc.kill()
    } catch {
      finishCancel()
    }
  } else {
    finishCancel()
  }
}

/** True when a download session or scdl process is currently active. */
export function downloadsBusy(): boolean {
  return Boolean(session) || Boolean(activeProcess)
}

/**
 * Stop any active download and remove leftover partial files. Used on app quit
 * so closing the window never orphans the scdl process or leaves .part files.
 */
export function shutdownDownloads(): Promise<void> {
  return new Promise((resolve) => {
    if (!session && !activeProcess) {
      resolve()
      return
    }

    const outputPath = session?.outputPath ?? null
    if (session) {
      session.cancelled = true
      if (session.cooldownTimer) {
        clearTimeout(session.cooldownTimer)
        session.cooldownTimer = null
      }
    }
    session = null
    currentTrackId = null

    const proc = activeProcess
    activeProcess = null

    let settled = false
    const done = (): void => {
      if (settled) return
      settled = true
      if (outputPath) cleanupPartials(outputPath)
      resolve()
    }

    if (!proc) {
      done()
      return
    }
    proc.once('close', done)
    try {
      proc.kill()
    } catch {
      done()
    }
    // Safety net so quitting never hangs if the process is slow to exit.
    setTimeout(done, 3000)
  })
}
