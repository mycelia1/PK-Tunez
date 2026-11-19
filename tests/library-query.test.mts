import assert from 'node:assert/strict'
import { test } from 'node:test'
import { pickRandomTrack, queryLibrary, relativeFolder } from '../src/main/server/libraryQuery.ts'
import { mixTracksFromIds } from '../src/main/server/mixTracks.ts'
import type { HistoryEntry } from '../src/shared/types.ts'

const root = 'C:/music/pk-tunez'

function track(partial: Partial<HistoryEntry> & { filePath: string; title: string }): HistoryEntry {
  return {
    trackId: partial.trackId ?? partial.title,
    title: partial.title,
    artist: partial.artist ?? 'Ness',
    url: partial.url ?? '',
    filePath: partial.filePath,
    sizeBytes: 10,
    ts: partial.ts ?? 1,
    source: 'youtube'
  }
}

const history: HistoryEntry[] = [
  track({
    title: 'Snowman',
    filePath: `${root}/Lunatik Nation/Snowman.m4a`,
    ts: 3
  }),
  track({
    title: 'Other tune',
    filePath: `${root}/Lunatik Nation/Vol 1/Other tune.m4a`,
    ts: 2
  }),
  track({
    title: 'Root song',
    filePath: `${root}/Root song.m4a`,
    ts: 1
  })
]

test('relativeFolder keeps the directory under the download root', () => {
  assert.equal(relativeFolder(`${root}/Lunatik Nation/Snowman.m4a`, root), 'Lunatik Nation')
  assert.equal(relativeFolder(`${root}/Root song.m4a`, root), '')
})

test('a search finds a folder even when the song title does not contain the words', () => {
  const page = queryLibrary(history, {
    q: 'lunatik',
    downloadDir: root,
    fileExists: () => true
  })
  assert.equal(page.folders.length, 1)
  assert.equal(page.folders[0].path, 'Lunatik Nation')
  assert.equal(page.folders[0].trackCount, 2)
  assert.equal(page.tracks.length, 2)
})

test('tracks are newest download first, even when the file lists an older one first', () => {
  const oldestFirst = [...history].sort((a, b) => a.ts - b.ts)
  const page = queryLibrary(oldestFirst, { downloadDir: root, fileExists: () => true, limit: 3 })
  assert.deepEqual(
    page.tracks.map((item) => item.title),
    ['Snowman', 'Other tune', 'Root song']
  )
})

test('opening a folder lists its tracks and the folders inside it', () => {
  const page = queryLibrary(history, {
    dir: 'Lunatik Nation',
    downloadDir: root,
    fileExists: () => true
  })
  assert.deepEqual(
    page.tracks.map((item) => item.title),
    ['Snowman']
  )
  assert.equal(page.folders[0].path, 'Lunatik Nation/Vol 1')
  assert.equal(page.folders[0].trackCount, 1)
})

test('a deep folder query includes every track inside it', () => {
  const page = queryLibrary(history, {
    dir: 'Lunatik Nation',
    deep: true,
    downloadDir: root,
    limit: 1,
    fileExists: () => true
  })
  assert.equal(page.total, 2)
  assert.equal(page.tracks.length, 1)
  assert.equal(page.nextCursor, 1)
  assert.deepEqual(page.folders, [])
})

test('a mix row keeps the desktop file path from history', () => {
  const tracks = mixTracksFromIds(history, ['Snowman', 'missing'])
  assert.equal(tracks.length, 1)
  assert.equal(tracks[0].filePath, `${root}/Lunatik Nation/Snowman.m4a`)
  assert.equal(tracks[0].title, 'Snowman')
})

test('pickRandomTrack stays inside the library', () => {
  const chosen = pickRandomTrack(history, root, () => true, () => 0)
  assert.equal(chosen?.trackId, 'Snowman')
  assert.equal(pickRandomTrack([], root, () => true), null)
})
