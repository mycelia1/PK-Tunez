import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { app } from 'electron'
import { sanitizeFolderName } from '../shared/sources'
import type { MixLibrary, MixState, MixTrackRef } from '../shared/types'

function mixesPath(): string {
  return join(app.getPath('userData'), 'mixes.json')
}

function legacyMixPath(): string {
  return join(app.getPath('userData'), 'mix.json')
}

function newMixId(): string {
  return randomUUID()
}

function normalizeTracks(tracks: unknown): MixTrackRef[] {
  if (!Array.isArray(tracks)) return []
  return tracks.filter(
    (t): t is MixTrackRef =>
      !!t &&
      typeof t === 'object' &&
      typeof (t as MixTrackRef).trackId === 'string' &&
      typeof (t as MixTrackRef).title === 'string' &&
      typeof (t as MixTrackRef).artist === 'string' &&
      typeof (t as MixTrackRef).filePath === 'string'
  )
}

/** Ensure folderSlug is unique among other mixes (case-insensitive). */
export function uniqueFolderSlug(
  desired: string,
  mixes: MixState[],
  excludeId?: string
): string {
  const base = sanitizeFolderName(desired.trim() || 'My Mix') || 'My Mix'
  const taken = new Set(
    mixes
      .filter((m) => m.id !== excludeId)
      .map((m) => m.folderSlug.toLowerCase())
  )
  if (!taken.has(base.toLowerCase())) return base
  let n = 2
  while (taken.has(`${base} (${n})`.toLowerCase())) {
    n += 1
  }
  return `${base} (${n})`
}

function createEmptyMix(name = 'My Mix', existing: MixState[] = []): MixState {
  const displayName = name.trim() || 'My Mix'
  const id = newMixId()
  return {
    id,
    name: displayName,
    folderSlug: uniqueFolderSlug(displayName, existing, id),
    tracks: []
  }
}

function defaultLibrary(): MixLibrary {
  const mix = createEmptyMix()
  return { mixes: [mix], activeMixId: mix.id }
}

function normalizeMix(raw: Partial<MixState> & { tracks?: unknown }, existing: MixState[]): MixState | null {
  if (!raw || typeof raw !== 'object') return null
  const name = typeof raw.name === 'string' ? raw.name.trim() : ''
  if (!name) return null
  const id = typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim() : newMixId()
  const folderSlug =
    typeof raw.folderSlug === 'string' && raw.folderSlug.trim()
      ? uniqueFolderSlug(raw.folderSlug, existing, id)
      : uniqueFolderSlug(name, existing, id)
  return {
    id,
    name,
    folderSlug,
    tracks: normalizeTracks(raw.tracks)
  }
}

function readJsonFile(path: string): unknown | null {
  if (!existsSync(path)) return null
  try {
    let raw = readFileSync(path, 'utf8')
    if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1)
    return JSON.parse(raw) as unknown
  } catch {
    return null
  }
}

/** One-time migrate legacy single-mix mix.json into mixes.json (leave mix.json as backup). */
function migrateLegacyMix(): MixLibrary | null {
  const parsed = readJsonFile(legacyMixPath())
  if (!parsed || typeof parsed !== 'object' || parsed === null) return null
  // Legacy clear wrote the literal `null`.
  if ((parsed as MixState).name == null && !Array.isArray((parsed as MixState).tracks)) {
    return null
  }
  const mix = normalizeMix(parsed as Partial<MixState>, [])
  if (!mix) return null
  return { mixes: [mix], activeMixId: mix.id }
}

function coerceLibrary(rawMixes: unknown[], activeMixId: string | undefined): {
  library: MixLibrary
  needsSave: boolean
} {
  const mixes: MixState[] = []
  let needsSave = false
  for (const raw of rawMixes) {
    const partial = raw as Partial<MixState>
    const hadId = typeof partial?.id === 'string' && partial.id.trim().length > 0
    const prevSlug = typeof partial?.folderSlug === 'string' ? partial.folderSlug.trim() : ''
    const normalized = normalizeMix(partial, mixes)
    if (!normalized) {
      needsSave = true
      continue
    }
    if (!hadId) needsSave = true
    if (prevSlug && normalized.folderSlug !== prevSlug) needsSave = true
    mixes.push(normalized)
  }

  if (mixes.length === 0) {
    return { library: defaultLibrary(), needsSave: true }
  }

  const resolvedActive =
    typeof activeMixId === 'string' && mixes.some((m) => m.id === activeMixId)
      ? activeMixId
      : mixes[0].id
  if (resolvedActive !== activeMixId) needsSave = true

  return { library: { mixes, activeMixId: resolvedActive }, needsSave }
}

export function saveLibrary(library: MixLibrary): MixLibrary {
  const { library: normalized } = coerceLibrary(library.mixes, library.activeMixId)
  writeFileSync(mixesPath(), JSON.stringify(normalized, null, 2), 'utf8')
  return normalized
}

export function loadLibrary(): MixLibrary {
  const existing = readJsonFile(mixesPath())
  if (existing && typeof existing === 'object' && existing !== null) {
    const raw = existing as Partial<MixLibrary>
    if (Array.isArray(raw.mixes)) {
      const { library, needsSave } = coerceLibrary(
        raw.mixes,
        typeof raw.activeMixId === 'string' ? raw.activeMixId : undefined
      )
      return needsSave ? saveLibrary(library) : library
    }
  }

  const migrated = migrateLegacyMix()
  if (migrated) {
    return saveLibrary(migrated)
  }

  return saveLibrary(defaultLibrary())
}

export function getMix(mixId?: string): MixState | null {
  const library = loadLibrary()
  const id = mixId?.trim() || library.activeMixId
  return library.mixes.find((m) => m.id === id) ?? null
}

export function getActiveMix(): MixState {
  const library = loadLibrary()
  return library.mixes.find((m) => m.id === library.activeMixId) ?? library.mixes[0]
}

/** Upsert a mix by id; creates a new entry if id is missing/unknown. */
export function upsertMix(mix: MixState): MixState {
  const library = loadLibrary()
  const others = library.mixes.filter((m) => m.id !== mix.id)
  const displayName = mix.name.trim() || 'My Mix'
  const id = mix.id?.trim() || newMixId()
  const normalized: MixState = {
    id,
    name: displayName,
    folderSlug: uniqueFolderSlug(mix.folderSlug?.trim() || displayName, others, id),
    tracks: normalizeTracks(mix.tracks)
  }

  const index = library.mixes.findIndex((m) => m.id === id)
  const mixes =
    index >= 0
      ? library.mixes.map((m, i) => (i === index ? normalized : m))
      : [...library.mixes, normalized]

  saveLibrary({ mixes, activeMixId: library.activeMixId })
  return normalized
}

export function createMix(name?: string): MixLibrary {
  const library = loadLibrary()
  const mix = createEmptyMix(name ?? `Mix ${library.mixes.length + 1}`, library.mixes)
  return saveLibrary({
    mixes: [...library.mixes, mix],
    activeMixId: mix.id
  })
}

export function deleteMix(mixId: string): MixLibrary {
  const library = loadLibrary()
  const remaining = library.mixes.filter((m) => m.id !== mixId)

  if (remaining.length === 0) {
    return saveLibrary(defaultLibrary())
  }

  const activeMixId =
    library.activeMixId === mixId ? remaining[0].id : library.activeMixId
  return saveLibrary({ mixes: remaining, activeMixId })
}

export function setActiveMix(mixId: string): MixLibrary {
  const library = loadLibrary()
  if (!library.mixes.some((m) => m.id === mixId)) {
    return library
  }
  return saveLibrary({ ...library, activeMixId: mixId })
}

export function mixExportDir(downloadDir: string, folderSlug: string): string {
  return join(downloadDir, 'mixes', folderSlug)
}
