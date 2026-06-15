import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { AppSettings, HistoryEntry } from '../shared/types'

const DEFAULT_SETTINGS: AppSettings = {
  clientId: '',
  authToken: '',
  downloadDir: join(app.getPath('music'), 'pk-tunez'),
  archivePath: join(app.getPath('userData'), 'download-archive.txt'),
  soundEnabled: true,
  limitTrackLength: true,
  maxTrackLengthMinutes: 60,
  impersonationTipShown: false
}

function settingsPath(): string {
  return join(app.getPath('userData'), 'settings.json')
}

function historyPath(): string {
  return join(app.getPath('userData'), 'history.json')
}

function ensureDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
}

export function loadSettings(): AppSettings {
  const path = settingsPath()
  if (!existsSync(path)) {
    ensureDir(DEFAULT_SETTINGS.downloadDir)
    writeFileSync(path, JSON.stringify(DEFAULT_SETTINGS, null, 2), 'utf8')
    return { ...DEFAULT_SETTINGS }
  }

  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Partial<AppSettings>
    return { ...DEFAULT_SETTINGS, ...parsed }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

export function saveSettings(partial: Partial<AppSettings>): AppSettings {
  const current = loadSettings()
  const next = { ...current, ...partial }
  ensureDir(next.downloadDir)
  ensureDir(join(next.archivePath, '..'))
  writeFileSync(settingsPath(), JSON.stringify(next, null, 2), 'utf8')
  return next
}

export function loadHistory(): HistoryEntry[] {
  const path = historyPath()
  if (!existsSync(path)) {
    return []
  }

  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as HistoryEntry[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function appendHistory(entry: HistoryEntry): HistoryEntry[] {
  const history = loadHistory()
  const existingIndex = history.findIndex((item) => item.trackId === entry.trackId)
  if (existingIndex >= 0) {
    history[existingIndex] = entry
  } else {
    history.unshift(entry)
  }
  writeFileSync(historyPath(), JSON.stringify(history.slice(0, 5000), null, 2), 'utf8')
  return history
}

export function ensureArchiveFile(archivePath: string): void {
  ensureDir(join(archivePath, '..'))
  if (!existsSync(archivePath)) {
    writeFileSync(archivePath, '', 'utf8')
  }
}

export function extractArtistSlug(url: string): string {
  try {
    const parsed = new URL(url)
    const parts = parsed.pathname.split('/').filter(Boolean)
    if (parts.length >= 1 && parts[0] !== 'tracks' && parts[0] !== 'sets') {
      return parts[0]
    }
  } catch {
    // ignore
  }
  return 'downloads'
}
