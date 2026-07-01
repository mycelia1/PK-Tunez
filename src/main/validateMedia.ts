import { existsSync, readFileSync, statSync, unlinkSync } from 'fs'
import { findSidecarForMedia } from './infoSidecar'

/** Reject obviously truncated downloads (e.g. interrupted HLS). */
export const MIN_MEDIA_BYTES = 256 * 1024

/** On-disk size must be at least this fraction of sidecar-reported filesize. */
export const MIN_SIZE_RATIO = 0.5

interface SidecarSizeFields {
  filesize?: number
  filesize_approx?: number
}

export interface MediaValidationResult {
  ok: boolean
  reason?: string
  expectedBytes?: number
  actualBytes: number
}

function expectedBytesFromSidecar(sidecarPath: string): number | null {
  try {
    const data = JSON.parse(readFileSync(sidecarPath, 'utf8')) as SidecarSizeFields
    const expected = data.filesize ?? data.filesize_approx
    if (typeof expected === 'number' && Number.isFinite(expected) && expected > 0) {
      return expected
    }
  } catch {
    // Sidecar unreadable; fall back to minimum-size check only.
  }
  return null
}

export function validateCompletedMedia(mediaPath: string, sidecarPath?: string | null): MediaValidationResult {
  if (!mediaPath?.trim() || !existsSync(mediaPath)) {
    return { ok: false, reason: 'File missing', actualBytes: 0 }
  }

  let actualBytes = 0
  try {
    actualBytes = statSync(mediaPath).size
  } catch {
    return { ok: false, reason: 'Cannot stat file', actualBytes: 0 }
  }

  if (actualBytes < MIN_MEDIA_BYTES) {
    return {
      ok: false,
      reason: `File too small (${actualBytes} bytes)`,
      actualBytes
    }
  }

  const resolvedSidecar = sidecarPath ?? findSidecarForMedia(mediaPath)
  if (resolvedSidecar) {
    const expected = expectedBytesFromSidecar(resolvedSidecar)
    if (expected !== null && actualBytes < expected * MIN_SIZE_RATIO) {
      return {
        ok: false,
        reason: `File size ${actualBytes} is below ${Math.round(MIN_SIZE_RATIO * 100)}% of expected ${expected}`,
        expectedBytes: expected,
        actualBytes
      }
    }
  }

  return { ok: true, actualBytes }
}

/** Delete a corrupt media file and its sidecar if present. */
export function deleteMediaAndSidecar(mediaPath: string): void {
  if (mediaPath && existsSync(mediaPath)) {
    try {
      unlinkSync(mediaPath)
    } catch {
      // Best-effort cleanup.
    }
  }
  const sidecar = findSidecarForMedia(mediaPath)
  if (sidecar && existsSync(sidecar)) {
    try {
      unlinkSync(sidecar)
    } catch {
      // Best-effort cleanup.
    }
  }
}
