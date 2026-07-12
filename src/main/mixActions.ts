import { copyFileSync, existsSync, mkdirSync, readdirSync, unlinkSync, writeFileSync } from 'fs'
import { basename, extname, join } from 'path'
import { tmpdir } from 'os'
import { shell } from 'electron'
import { loadSettings } from './settings'
import { resolveAudioPath } from './resolveAudioPath'
import { clearMix, loadMix, mixExportDir, saveMix } from './mixes'
import type { MixExportResult, MixState } from '../shared/types'

let lastM3uPath: string | null = null

function resolveMixTrackPath(filePath: string, trackId: string): string | null {
  const settings = loadSettings()
  const resolved = resolveAudioPath(filePath, settings.downloadDir, trackId)
  return resolved.exists ? resolved.resolvedPath : null
}

function buildM3uContent(paths: string[]): string {
  const lines = [
    '#EXTM3U',
    '#EXTVLCOPT:playlist-autostart=0',
    '#EXTVLCOPT:play-and-pause=0',
    ...paths.map((p) => p.replace(/\//g, '\\'))
  ]
  return `${lines.join('\n')}\n`
}

function exportPadWidth(trackCount: number): number {
  return Math.max(2, String(trackCount).length)
}

function exportFileName(index: number, padWidth: number, originalBasename: string): string {
  const prefix = String(index).padStart(padWidth, '0')
  return `${prefix} - ${originalBasename}`
}

function uniqueExportDest(exportDir: string, baseName: string): string {
  let candidate = baseName
  let duplicate = 2
  while (existsSync(join(exportDir, candidate))) {
    const ext = extname(baseName)
    const stem = ext ? baseName.slice(0, -ext.length) : baseName
    candidate = `${stem} (${duplicate})${ext}`
    duplicate += 1
  }
  return candidate
}

function clearExportDir(exportDir: string): void {
  if (!existsSync(exportDir)) return
  for (const entry of readdirSync(exportDir)) {
    try {
      unlinkSync(join(exportDir, entry))
    } catch {
      // Ignore stale file cleanup failures.
    }
  }
}

export function getMixState(): MixState | null {
  return loadMix()
}

export function saveMixState(mix: MixState): MixState {
  return saveMix(mix)
}

export function clearMixState(): void {
  clearMix()
}

export async function openMixPlaylist(): Promise<{ ok: boolean; error?: string }> {
  const mix = loadMix()
  if (!mix || mix.tracks.length === 0) {
    return { ok: false, error: 'No tracks in the current mix.' }
  }

  const paths: string[] = []
  for (const track of mix.tracks) {
    const resolved = resolveMixTrackPath(track.filePath, track.trackId)
    if (resolved) paths.push(resolved)
  }

  if (paths.length === 0) {
    return { ok: false, error: 'No mix tracks found on disk.' }
  }

  if (lastM3uPath && existsSync(lastM3uPath)) {
    try {
      unlinkSync(lastM3uPath)
    } catch {
      // Ignore stale temp file cleanup failures.
    }
  }

  const slug = mix.folderSlug || 'pk-tunez-mix'
  const m3uPath = join(tmpdir(), `pk-tunez-${slug}.m3u`)
  writeFileSync(m3uPath, buildM3uContent(paths), 'utf8')
  lastM3uPath = m3uPath

  const result = await shell.openPath(m3uPath)
  if (result) {
    return { ok: false, error: result }
  }
  return { ok: true }
}

export function exportMixCopy(): MixExportResult {
  const mix = loadMix()
  if (!mix || mix.tracks.length === 0) {
    return { ok: false, copied: 0, skipped: 0, exportDir: '', skippedTitles: [], error: 'No tracks in mix.' }
  }

  const settings = loadSettings()
  if (!settings.downloadDir?.trim()) {
    return {
      ok: false,
      copied: 0,
      skipped: 0,
      exportDir: '',
      skippedTitles: [],
      error: 'Download folder not set.'
    }
  }

  const exportDir = mixExportDir(settings.downloadDir, mix.folderSlug)
  mkdirSync(exportDir, { recursive: true })
  clearExportDir(exportDir)

  const padWidth = exportPadWidth(mix.tracks.length)
  let copied = 0
  let skipped = 0
  let exportIndex = 0
  const skippedTitles: string[] = []

  for (const track of mix.tracks) {
    const resolved = resolveMixTrackPath(track.filePath, track.trackId)
    if (!resolved) {
      skipped += 1
      skippedTitles.push(track.title)
      continue
    }

    exportIndex += 1
    const destName = uniqueExportDest(
      exportDir,
      exportFileName(exportIndex, padWidth, basename(resolved))
    )
    const dest = join(exportDir, destName)
    try {
      copyFileSync(resolved, dest)
      copied += 1
    } catch {
      exportIndex -= 1
      skipped += 1
      skippedTitles.push(track.title)
    }
  }

  return { ok: true, copied, skipped, exportDir, skippedTitles }
}
