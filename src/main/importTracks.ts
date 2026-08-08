import { dialog } from 'electron'
import { existsSync } from 'fs'
import { copyFile, mkdir, stat } from 'fs/promises'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'path'
import type {
  HistoryEntry,
  ImportMode,
  ImportResult,
  LibraryScanProgress
} from '../shared/types'
import {
  AUDIO_EXTENSIONS,
  collectAudioFiles,
  hasAudioExtension,
  isUnderMixesFolder,
  localTrackId,
  parseTrackFileName
} from './reconcileHistory'
import { fingerprintFile, readStamp, type FileStamp } from './fingerprint'
import { normalizePathKey, withLibraryLock } from './libraryIndex'
import { loadHistory, loadSettings, saveHistory } from './settings'

/**
 * Bringing outside tracks in.
 *
 * The download folder is the library, so importing means copying the chosen
 * files into it and recording them. Anything the user picks that already lives
 * inside the folder is indexed where it is rather than duplicated.
 */

const PROGRESS_STRIDE = 5

function emptyResult(): ImportResult {
  return { ok: true, added: 0, duplicates: 0, skippedMixes: 0, failed: 0 }
}

function isInside(parent: string, child: string): boolean {
  const rel = relative(resolve(parent), resolve(child))
  if (rel === '') return true
  return !rel.startsWith('..') && !isAbsolute(rel)
}

function splitExtension(filePath: string): { stem: string; ext: string } {
  const name = basename(filePath)
  const dot = name.lastIndexOf('.')
  if (dot <= 0) return { stem: filePath, ext: '' }
  return { stem: filePath.slice(0, filePath.length - (name.length - dot)), ext: name.slice(dot) }
}

/**
 * Pick where a source file should land.
 *
 * An existing file with identical content means the track is already there and
 * no copy is needed. A name clash with different content keeps both, suffixing
 * the newcomer, so an import never overwrites something the user already has.
 */
async function resolveDestination(
  desired: string,
  fingerprint: string
): Promise<{ path: string; needsCopy: boolean } | null> {
  if (!existsSync(desired)) {
    return { path: desired, needsCopy: true }
  }

  const existing = await fingerprintFile(desired)
  if (existing?.fingerprint === fingerprint) {
    return { path: desired, needsCopy: false }
  }

  const { stem, ext } = splitExtension(desired)
  for (let suffix = 2; suffix <= 999; suffix += 1) {
    const candidate = `${stem} (${suffix})${ext}`
    if (!existsSync(candidate)) {
      return { path: candidate, needsCopy: true }
    }
    const candidatePrint = await fingerprintFile(candidate)
    if (candidatePrint?.fingerprint === fingerprint) {
      return { path: candidate, needsCopy: false }
    }
  }

  return null
}

function buildLocalEntry(
  filePath: string,
  stamp: FileStamp,
  fingerprint: string
): HistoryEntry {
  const { artist, title } = parseTrackFileName(basename(filePath))
  return {
    trackId: localTrackId(fingerprint),
    title,
    artist,
    url: '',
    filePath,
    sizeBytes: stamp.sizeBytes,
    // Import time, not file mtime — so freshly imported tracks float to the
    // top of Backpack the same way newly downloaded ones do. mtimeMs still
    // carries the on-disk stamp for fingerprint skip/relink.
    ts: Date.now(),
    mtimeMs: stamp.mtimeMs,
    fingerprint,
    source: 'local'
  }
}

interface PlannedImport {
  source: string
  /** Where it goes if it needs copying. Equal to `source` when already inside. */
  destination: string
}

async function planSelections(
  selections: string[],
  downloadDir: string
): Promise<{ planned: PlannedImport[]; skippedMixes: number }> {
  const planned: PlannedImport[] = []
  let skippedMixes = 0

  for (const selection of selections) {
    if (isUnderMixesFolder(selection)) {
      skippedMixes += 1
      continue
    }

    const info = await stat(selection).catch(() => null)
    if (!info) continue

    if (info.isDirectory()) {
      // The folder's own name is preserved inside the download folder, so
      // D:\Music\Album X lands as <downloadDir>\Album X\...
      const base = dirname(selection)
      for (const filePath of await collectAudioFiles(selection)) {
        if (isUnderMixesFolder(filePath)) {
          skippedMixes += 1
          continue
        }
        planned.push({ source: filePath, destination: join(downloadDir, relative(base, filePath)) })
      }
      continue
    }

    if (info.isFile() && hasAudioExtension(selection)) {
      planned.push({ source: selection, destination: join(downloadDir, basename(selection)) })
    }
  }

  return { planned, skippedMixes }
}

async function showImportDialog(mode: ImportMode): Promise<string[]> {
  if (mode === 'folder') {
    const result = await dialog.showOpenDialog({
      title: 'Import a folder of tracks',
      properties: ['openDirectory', 'multiSelections']
    })
    return result.canceled ? [] : result.filePaths
  }

  const result = await dialog.showOpenDialog({
    title: 'Import audio files',
    properties: ['openFile', 'multiSelections'],
    filters: [
      {
        name: 'Audio',
        extensions: [...AUDIO_EXTENSIONS].map((ext) => ext.slice(1))
      }
    ]
  })
  return result.canceled ? [] : result.filePaths
}

/** Copy or index every planned file and record what happened. */
async function ingestPlanned(
  planned: PlannedImport[],
  downloadDir: string,
  onProgress?: (progress: LibraryScanProgress) => void
): Promise<{ added: number; duplicates: number; failed: number }> {
  const history = loadHistory()
  const byFingerprint = new Map<string, HistoryEntry>()
  const byPath = new Map<string, HistoryEntry>()
  for (const entry of history) {
    if (entry.fingerprint && !byFingerprint.has(entry.fingerprint)) {
      byFingerprint.set(entry.fingerprint, entry)
    }
    if (entry.filePath) byPath.set(normalizePathKey(entry.filePath), entry)
  }

  const added: HistoryEntry[] = []
  let duplicates = 0
  let failed = 0
  let processed = 0

  for (const item of planned) {
    processed += 1
    if (processed % PROGRESS_STRIDE === 0 || processed === planned.length) {
      onProgress?.({ phase: 'copying', processed, total: planned.length })
    }

    const printed = await fingerprintFile(item.source)
    if (!printed) {
      failed += 1
      continue
    }

    if (byFingerprint.has(printed.fingerprint)) {
      duplicates += 1
      continue
    }

    let finalPath = item.source
    if (!isInside(downloadDir, item.source)) {
      const target = await resolveDestination(item.destination, printed.fingerprint)
      if (!target) {
        failed += 1
        continue
      }
      if (target.needsCopy) {
        try {
          await mkdir(dirname(target.path), { recursive: true })
          await copyFile(item.source, target.path)
        } catch {
          failed += 1
          continue
        }
      }
      finalPath = target.path
    }

    if (byPath.has(normalizePathKey(finalPath))) {
      duplicates += 1
      continue
    }

    // Stamp comes from the file that landed in the library (a copy has its
    // own mtime). Used for fingerprint skip/relink; display order uses Date.now().
    const stamp = await readStamp(finalPath)
    if (!stamp) {
      failed += 1
      continue
    }

    const entry = buildLocalEntry(finalPath, stamp, printed.fingerprint)
    added.push(entry)
    byFingerprint.set(printed.fingerprint, entry)
    byPath.set(normalizePathKey(finalPath), entry)
  }

  if (added.length > 0) {
    onProgress?.({ phase: 'saving', processed: planned.length, total: planned.length })
    saveHistory([...history, ...added].sort((a, b) => b.ts - a.ts))
  }

  return { added: added.length, duplicates, failed }
}

export async function importTracks(
  mode: ImportMode,
  onProgress?: (progress: LibraryScanProgress) => void
): Promise<ImportResult> {
  const downloadDir = loadSettings().downloadDir
  if (!downloadDir?.trim()) {
    return { ...emptyResult(), ok: false, error: 'No download folder is set.' }
  }

  const selections = await showImportDialog(mode)
  if (selections.length === 0) {
    return { ...emptyResult(), cancelled: true }
  }

  try {
    await mkdir(downloadDir, { recursive: true })

    onProgress?.({ phase: 'walking', processed: 0, total: 0 })
    const { planned, skippedMixes } = await planSelections(selections, downloadDir)

    if (planned.length === 0) {
      return { ...emptyResult(), skippedMixes }
    }

    // Locked because history is read at the start and written at the end.
    const counts = await withLibraryLock(() => ingestPlanned(planned, downloadDir, onProgress))
    return { ok: true, skippedMixes, ...counts }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Import failed.'
    return { ...emptyResult(), ok: false, error: message }
  }
}
