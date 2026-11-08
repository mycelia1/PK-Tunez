import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { appendArchiveId, readArchiveIds } from '../src/main/archiveMutate.ts'
import { fingerprintFile } from '../src/main/fingerprint.ts'
import { startSyncServer } from '../src/main/server/createSyncServer.ts'
import { findDuplicate } from '../src/main/server/dedupe.ts'
import { DeviceStore } from '../src/main/server/deviceStore.ts'
import { parseByteRange } from '../src/main/server/range.ts'
import { historyEntryFromSidecar } from '../src/main/infoSidecar.ts'
import type { HistoryEntry } from '../src/shared/types.ts'
import {
  markSynced,
  nextQueued,
  requeueAfterReconnect,
  syncIcon,
  trackAfterDownload,
  type PhoneTrack
} from '../src/shared/syncQueue.ts'

test('parseByteRange serves a slice and rejects a range past the end', () => {
  assert.equal(parseByteRange(undefined, 10), null)
  assert.deepEqual(parseByteRange('bytes=0-3', 10), { start: 0, end: 3 })
  assert.deepEqual(parseByteRange('bytes=4-', 10), { start: 4, end: 9 })
  assert.deepEqual(parseByteRange('bytes=-4', 10), { start: 6, end: 9 })
  assert.equal(parseByteRange('bytes=20-25', 10), 'unsatisfiable')
})

test('findDuplicate skips a file the server already has', () => {
  const entry: HistoryEntry = {
    trackId: 'abc',
    title: 'Song',
    artist: 'Ness',
    url: 'https://www.youtube.com/watch?v=abc',
    filePath: 'C:/music/Song.m4a',
    sizeBytes: 10,
    ts: 1,
    source: 'youtube',
    fingerprint: '10-dead'
  }
  const hit = findDuplicate({
    trackId: 'other',
    source: 'youtube',
    fingerprint: '10-dead',
    history: [entry],
    archiveIds: new Set(),
    fileExists: () => true
  })
  assert.equal(hit?.reason, 'fingerprint')

  const missing = findDuplicate({
    trackId: 'abc',
    source: 'youtube',
    history: [{ ...entry, missing: true }],
    archiveIds: new Set(['youtube abc']),
    fileExists: () => false
  })
  assert.equal(missing, null)
})

test('a YouTube sidecar supplies the artist when the file name is the title only', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pk-tunez-side-'))
  const media = join(dir, 'Snowman.m4a')
  const sidecar = join(dir, 'Snowman.m4a.info.json')
  writeFileSync(media, 'audio', 'utf8')
  writeFileSync(
    sidecar,
    JSON.stringify({
      id: 'abc123',
      title: 'Snowman',
      uploader: 'Ness Channel',
      webpage_url: 'https://www.youtube.com/watch?v=abc123'
    }),
    'utf8'
  )
  const entry = historyEntryFromSidecar(sidecar, media)
  assert.equal(entry?.artist, 'Ness Channel')
  assert.equal(entry?.title, 'Snowman')
  assert.equal(entry?.trackId, 'abc123')
  rmSync(dir, { recursive: true, force: true })
})

test('sync icons and auto-sync queue', () => {
  const track: PhoneTrack = {
    trackId: '1',
    title: 'Song',
    artist: 'Ness',
    url: 'https://youtu.be/1',
    source: 'youtube',
    fileName: 'Song.m4a',
    filePath: '/music/Song.m4a',
    sizeBytes: 4,
    syncState: 'local',
    addedAt: 1
  }
  assert.equal(syncIcon('local'), 'grey')
  assert.equal(syncIcon('synced'), 'green')
  assert.equal(trackAfterDownload(track, true).syncState, 'queued')
  assert.equal(trackAfterDownload(track, false).syncState, 'local')
  const queued = [trackAfterDownload(track, true)]
  assert.equal(nextQueued(queued)?.trackId, '1')
  assert.equal(markSynced(queued, '1')[0].syncState, 'synced')
  const failed = [{ ...track, syncState: 'failed' as const, error: 'offline' }]
  assert.equal(requeueAfterReconnect(failed, true)[0].syncState, 'queued')
  assert.equal(requeueAfterReconnect(failed, false)[0].syncState, 'failed')
})

test('the sync server pairs, stores an upload, skips a duplicate, and serves a byte range', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'pk-tunez-srv-'))
  const downloadDir = join(dir, 'music')
  const archivePath = join(dir, 'download-archive.txt')
  writeFileSync(archivePath, '', 'utf8')
  const history: HistoryEntry[] = []
  const devices = new DeviceStore(join(dir, 'devices.json'))
  const server = await startSyncServer({
    port: 0,
    host: '127.0.0.1',
    version: 'test',
    devices,
    downloadDir,
    getHistory: () => history,
    addTrack: (entry) => {
      history.unshift(entry)
    },
    readArchiveIds: () => readArchiveIds(archivePath),
    appendArchiveId: (source, trackId) => {
      appendArchiveId(archivePath, source, trackId)
    },
    fingerprintFile: async (filePath) => {
      const stamped = await fingerprintFile(filePath)
      if (!stamped) return null
      return {
        fingerprint: stamped.fingerprint,
        sizeBytes: stamped.stamp.sizeBytes,
        mtimeMs: stamped.stamp.mtimeMs
      }
    }
  })

  const base = `http://127.0.0.1:${server.port}`
  const auth = (token: string): Record<string, string> => ({ authorization: `Bearer ${token}` })

  try {
    assert.equal((await fetch(`${base}/api/v1/health`)).status, 401)

    const code = devices.issueCode().code
    const paired = await fetch(`${base}/api/v1/pair`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code, name: 'Pixel' })
    })
    assert.equal(paired.status, 200)
    const token = ((await paired.json()) as { token: string }).token

    assert.equal(
      (await fetch(`${base}/api/v1/health`, { headers: { authorization: 'Bearer nope' } })).status,
      401
    )

    const bytes = Buffer.from('cafe-audio-bytes-0123456789', 'utf8')
    const upload = async (trackId: string): Promise<{ duplicate: boolean; track: { title: string } }> => {
      const response = await fetch(`${base}/api/v1/tracks`, {
        method: 'POST',
        headers: {
          ...auth(token),
          'content-type': 'application/octet-stream',
          'x-pk-track-id': trackId,
          'x-pk-title': encodeURIComponent('Café Song'),
          'x-pk-artist': encodeURIComponent('Ness'),
          'x-pk-url': encodeURIComponent('https://www.youtube.com/watch?v=yt1'),
          'x-pk-source': 'youtube',
          'x-pk-filename': encodeURIComponent('Café Song.m4a')
        },
        body: bytes
      })
      assert.equal(response.status, 200)
      return (await response.json()) as { duplicate: boolean; track: { title: string } }
    }

    const first = await upload('yt1')
    assert.equal(first.duplicate, false)
    assert.equal(first.track.title, 'Café Song')
    assert.equal(history.length, 1)
    assert.match(readFileSync(archivePath, 'utf8'), /youtube yt1/)

    const second = await upload('yt1')
    assert.equal(second.duplicate, true)
    assert.equal(history.length, 1)

    const sameBytes = await upload('yt2')
    assert.equal(sameBytes.duplicate, true)
    assert.equal(history.length, 1)

    const page = await fetch(`${base}/api/v1/library?q=${encodeURIComponent('café')}`, {
      headers: auth(token)
    })
    const library = (await page.json()) as { tracks: Array<{ title: string }> }
    assert.equal(library.tracks.length, 1)
    assert.equal(library.tracks[0].title, 'Café Song')

    const file = await fetch(`${base}/api/v1/tracks/${encodeURIComponent('yt1')}/file`, {
      headers: { ...auth(token), range: 'bytes=0-3' }
    })
    assert.equal(file.status, 206)
    const slice = Buffer.from(await file.arrayBuffer())
    assert.equal(slice.toString('utf8'), bytes.subarray(0, 4).toString('utf8'))
  } finally {
    await server.close()
    rmSync(dir, { recursive: true, force: true })
  }
})
