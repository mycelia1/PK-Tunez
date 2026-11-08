import { existsSync, readFileSync, readdirSync, renameSync } from 'fs'
import type { FilenameCleanupResult, HistoryEntry } from '../shared/types'
import { trackSourceForUrl } from '../shared/sources'
import {
  planYouTubeRenames,
  rewriteFilePath,
  type CleanupCandidate,
  type PlannedRename
} from '../shared/youtubeNames'
import { findSidecarForMedia } from './infoSidecar'
import { loadLibrary, saveLibrary } from './mixes'
import { isDownloadActive } from './scdl'
import { loadHistory, saveHistory } from './settings'

function isYouTubeEntry(entry: HistoryEntry): boolean {
  if (entry.source === 'youtube') return true
  if (entry.source === 'soundcloud' || entry.source === 'local') return false
  return trackSourceForUrl(entry.url) === 'youtube'
}

function channelNamesFor(entry: HistoryEntry): string[] {
  const names = [entry.artist]
  const sidecarPath = findSidecarForMedia(entry.filePath)
  if (!sidecarPath) return names
  try {
    const data = JSON.parse(readFileSync(sidecarPath, 'utf8')) as {
      uploader?: string
      channel?: string
      artist?: string
    }
    if (data.uploader) names.push(data.uploader)
    if (data.channel) names.push(data.channel)
    if (data.artist) names.push(data.artist)
  } catch {
    // A broken sidecar must not block the rename of other files.
  }
  return names
}

function renameSidecars(fromMedia: string, toMedia: string): void {
  const candidates = [findSidecarForMedia(fromMedia), `${fromMedia}.info.json`]
  const seen = new Set<string>()
  for (const sidecar of candidates) {
    if (!sidecar || seen.has(sidecar) || !existsSync(sidecar)) continue
    seen.add(sidecar)
    const next = sidecar.startsWith(fromMedia)
      ? `${toMedia}${sidecar.slice(fromMedia.length)}`
      : `${toMedia.replace(/\.[^.]+$/, '')}.info.json`
    if (next !== sidecar && !existsSync(next)) {
      renameSync(sidecar, next)
    }
  }
}

function applyRenames(renames: PlannedRename[]): PlannedRename[] {
  const done: PlannedRename[] = []
  for (const rename of renames) {
    if (!existsSync(rename.from) || existsSync(rename.to)) continue
    renameSync(rename.from, rename.to)
    renameSidecars(rename.from, rename.to)
    done.push(rename)
  }
  return done
}

/**
 * Remove the YouTube channel name from existing download file names.
 * Pass `apply: false` to preview. Pass `apply: true` to rename files,
 * history rows, and mix entries.
 */
export function cleanupYouTubeFilenames(apply: boolean): FilenameCleanupResult {
  if (isDownloadActive()) {
    return {
      ok: false,
      dryRun: !apply,
      renamed: 0,
      missing: 0,
      skipped: 0,
      changes: [],
      error: 'Wait for the current download to finish first.'
    }
  }

  const history = loadHistory()
  const candidates: CleanupCandidate[] = history.map((entry) => ({
    filePath: entry.filePath,
    youtube: isYouTubeEntry(entry),
    channelNames: isYouTubeEntry(entry) ? channelNamesFor(entry) : []
  }))

  const plan = planYouTubeRenames(candidates, {
    exists: existsSync,
    names: (dir) => {
      try {
        return readdirSync(dir || '.')
      } catch {
        return []
      }
    }
  })

  let applied: PlannedRename[] = []
  if (apply && plan.renames.length > 0) {
    try {
      applied = applyRenames(plan.renames)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not rename the files.'
      return {
        ok: false,
        dryRun: false,
        renamed: 0,
        missing: plan.missing,
        skipped: plan.skipped,
        changes: [],
        error: message
      }
    }
  }
  const renames = apply ? applied : plan.renames

  if (apply && applied.length > 0) {
    const nextHistory = history.map((entry) => ({
      ...entry,
      filePath: rewriteFilePath(entry.filePath, applied)
    }))
    saveHistory(nextHistory)

    const library = loadLibrary()
    let mixesChanged = false
    for (const mix of library.mixes) {
      for (const track of mix.tracks) {
        const next = rewriteFilePath(track.filePath, applied)
        if (next !== track.filePath) {
          track.filePath = next
          mixesChanged = true
        }
      }
    }
    if (mixesChanged) saveLibrary(library)
  }

  return {
    ok: true,
    dryRun: !apply,
    renamed: renames.length,
    missing: plan.missing,
    skipped: plan.skipped,
    changes: renames.slice(0, 30).map((rename) => ({
      from: rename.from,
      to: rename.to
    }))
  }
}
