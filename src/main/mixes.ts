import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import { sanitizeFolderName } from '../shared/sources'
import type { MixState } from '../shared/types'

function mixPath(): string {
  return join(app.getPath('userData'), 'mix.json')
}

export function loadMix(): MixState | null {
  const path = mixPath()
  if (!existsSync(path)) return null
  try {
    let raw = readFileSync(path, 'utf8')
    if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1)
    const parsed = JSON.parse(raw) as MixState | null
    if (!parsed || typeof parsed !== 'object') return null
    if (!parsed.name?.trim() || !Array.isArray(parsed.tracks)) return null
    return {
      name: parsed.name.trim(),
      folderSlug: parsed.folderSlug?.trim() || sanitizeFolderName(parsed.name),
      tracks: parsed.tracks
    }
  } catch {
    return null
  }
}

export function saveMix(mix: MixState): MixState {
  const normalized: MixState = {
    name: mix.name.trim(),
    folderSlug: mix.folderSlug?.trim() || sanitizeFolderName(mix.name),
    tracks: mix.tracks
  }
  writeFileSync(mixPath(), JSON.stringify(normalized, null, 2), 'utf8')
  return normalized
}

export function clearMix(): void {
  if (existsSync(mixPath())) {
    writeFileSync(mixPath(), 'null', 'utf8')
  }
}

export function mixExportDir(downloadDir: string, folderSlug: string): string {
  return join(downloadDir, 'mixes', folderSlug)
}
