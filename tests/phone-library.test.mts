import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mergeRefreshedTracks } from '../src/shared/phoneLibrary.ts'

test('a deleted phone file drops its list entry', () => {
  const before = [
    { trackId: 'a', filePath: '/music/A.m4a' },
    { trackId: 'b', filePath: '/music/B.m4a' }
  ]
  const refreshed = [{ trackId: 'b', filePath: '/music/B.m4a' }]
  const merged = mergeRefreshedTracks(before, refreshed, before)
  assert.deepEqual(merged, [{ trackId: 'b', filePath: '/music/B.m4a' }])
})

test('a relocated file keeps the new location', () => {
  const before = [{ trackId: 'a', filePath: '/private/A.m4a' }]
  const refreshed = [{ trackId: 'a', filePath: 'content://media/1' }]
  const merged = mergeRefreshedTracks(before, refreshed, before)
  assert.deepEqual(merged, [{ trackId: 'a', filePath: 'content://media/1' }])
})

test('a track saved during the file check stays in the list', () => {
  const before = [{ trackId: 'a', filePath: '/music/A.m4a' }]
  const latest = [
    { trackId: 'c', filePath: 'content://media/3' },
    { trackId: 'a', filePath: '/music/A.m4a' }
  ]
  const merged = mergeRefreshedTracks(before, before, latest)
  assert.deepEqual(
    merged.map((track) => track.trackId),
    ['c', 'a']
  )
})
