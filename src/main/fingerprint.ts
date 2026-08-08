import { createHash } from 'crypto'
import { open, stat } from 'fs/promises'
import type { HistoryEntry } from '../shared/types'

/**
 * Content fingerprints let the library recognize a track after it has been
 * moved or renamed, so reorganizing the download folder does not orphan rows.
 *
 * A fingerprint is `<sizeBytes>-<sha256 of the first 64KB>`. Hashing only the
 * head keeps a full-library pass to a few hundred megabytes of reads instead of
 * tens of gigabytes, and combining it with the exact size makes accidental
 * collisions between different tracks vanishingly unlikely.
 */

const FINGERPRINT_BYTES = 64 * 1024

export interface FileStamp {
  sizeBytes: number
  mtimeMs: number
}

/** Cheap identity for "this file has not changed": exact size plus mtime. */
function stampKey(stamp: FileStamp): string {
  return `${stamp.sizeBytes}:${Math.round(stamp.mtimeMs)}`
}

export async function readStamp(filePath: string): Promise<FileStamp | null> {
  try {
    const info = await stat(filePath)
    if (!info.isFile()) return null
    return { sizeBytes: info.size, mtimeMs: info.mtimeMs }
  } catch {
    return null
  }
}

async function hashHead(filePath: string): Promise<string | null> {
  const handle = await open(filePath, 'r').catch(() => null)
  if (!handle) return null

  try {
    const buffer = Buffer.alloc(FINGERPRINT_BYTES)
    const { bytesRead } = await handle.read(buffer, 0, FINGERPRINT_BYTES, 0)
    return createHash('sha256').update(buffer.subarray(0, bytesRead)).digest('hex')
  } catch {
    return null
  } finally {
    await handle.close().catch(() => {
      // Best effort; a failed close should not fail the scan.
    })
  }
}

/**
 * Fingerprints files while avoiding re-reads.
 *
 * Seeded from the existing library so a file that turns up at a brand new path
 * but still carries the same size and mtime is matched without opening it. That
 * is the common case when a user reorganizes thousands of tracks into new
 * subfolders. When two known entries share a size and mtime but have different
 * content, the stamp is ambiguous and the file is hashed to be certain.
 */
export class FingerprintCache {
  private byStamp = new Map<string, Set<string>>()

  static fromHistory(entries: HistoryEntry[]): FingerprintCache {
    const cache = new FingerprintCache()
    for (const entry of entries) {
      if (!entry.fingerprint || entry.mtimeMs === undefined) continue
      cache.remember({ sizeBytes: entry.sizeBytes, mtimeMs: entry.mtimeMs }, entry.fingerprint)
    }
    return cache
  }

  remember(stamp: FileStamp, fingerprint: string): void {
    const key = stampKey(stamp)
    const known = this.byStamp.get(key)
    if (known) {
      known.add(fingerprint)
    } else {
      this.byStamp.set(key, new Set([fingerprint]))
    }
  }

  async fingerprintFor(filePath: string, stamp: FileStamp): Promise<string | null> {
    const known = this.byStamp.get(stampKey(stamp))
    if (known?.size === 1) {
      return [...known][0]
    }

    const hash = await hashHead(filePath)
    if (!hash) return null

    const fingerprint = `${stamp.sizeBytes}-${hash}`
    this.remember(stamp, fingerprint)
    return fingerprint
  }
}

/** One-off fingerprint for a single file, used by the import flow. */
export async function fingerprintFile(
  filePath: string
): Promise<{ fingerprint: string; stamp: FileStamp } | null> {
  const stamp = await readStamp(filePath)
  if (!stamp) return null

  const hash = await hashHead(filePath)
  if (!hash) return null

  return { fingerprint: `${stamp.sizeBytes}-${hash}`, stamp }
}
