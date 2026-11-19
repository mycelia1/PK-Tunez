import assert from 'node:assert/strict'
import { test } from 'node:test'
import { downloadLink } from '../src/shared/phoneDownload.ts'
import { linkFromShare } from '../src/shared/shareLink.ts'
import { uploadHeaders } from '../src/shared/uploadHeaders.ts'

test('linkFromShare reads a share sheet and a pktunez handoff', () => {
  assert.equal(
    linkFromShare('Check this https://youtu.be/abc123)'),
    'https://youtu.be/abc123'
  )
  assert.equal(
    linkFromShare('pktunez://add?url=https%3A%2F%2Fsoundcloud.com%2Fartist%2Ftrack'),
    'https://soundcloud.com/artist/track'
  )
  assert.equal(linkFromShare('no link here'), null)
})

test('upload headers stay ASCII and round-trip the title', () => {
  const headers = uploadHeaders('tok', {
    trackId: 'yt1',
    title: 'Café Song',
    artist: 'Ness',
    url: 'https://youtu.be/yt1',
    source: 'youtube',
    fileName: 'Café Song.m4a'
  })
  assert.equal(decodeURIComponent(headers['x-pk-title']), 'Café Song')
  assert.equal(headers.authorization, 'Bearer tok')
  assert.match(headers['x-pk-title'], /^[\x00-\x7F]+$/)
})

test('android auto-sync uploads and turns the track green', async () => {
  const uploaded: string[] = []
  const tracks = await downloadLink('https://youtu.be/abc', {
    platform: 'android',
    autoSync: true,
    paired: true,
    musicDir: '/music',
    now: () => 10,
    downloadAudio: async () => [{ path: 'content://media/1', fileName: 'Snowman.m4a' }],
    downloadToFile: async (_url, _headers, dest) => dest,
    uploadFile: async (filePath) => {
      uploaded.push(filePath)
      return { duplicate: false }
    }
  })
  assert.deepEqual(uploaded, ['content://media/1'])
  assert.equal(tracks[0].syncState, 'synced')
  assert.equal(tracks[0].title, 'Snowman')
})

test('android without auto-sync stays grey and does not upload', async () => {
  let uploads = 0
  const tracks = await downloadLink('https://youtu.be/abc', {
    platform: 'android',
    autoSync: false,
    paired: true,
    musicDir: '/music',
    now: () => 10,
    downloadAudio: async () => [{ path: '/music/Snowman.m4a', fileName: 'Snowman.m4a' }],
    downloadToFile: async (_url, _headers, dest) => dest,
    uploadFile: async () => {
      uploads += 1
      return { duplicate: false }
    }
  })
  assert.equal(uploads, 0)
  assert.equal(tracks[0].syncState, 'local')
})

test('an unpaired iPhone cannot download', async () => {
  await assert.rejects(
    () =>
      downloadLink('https://youtu.be/abc', {
        platform: 'ios',
        autoSync: true,
        paired: false,
        musicDir: '/music',
        downloadToFile: async (_url, _headers, dest) => dest,
        uploadFile: async () => ({ duplicate: false })
      }),
    /home server/
  )
})

test('iPhone falls back to a server download and marks the file green', async () => {
  const pulled: string[] = []
  const tracks = await downloadLink('https://youtu.be/abc', {
    platform: 'ios',
    autoSync: true,
    paired: true,
    musicDir: '/music',
    now: () => 10,
    downloadToFile: async () => {
      throw new Error('stream blocked')
    },
    uploadFile: async () => ({ duplicate: false }),
    resolve: async () => {
      throw new Error('no stream')
    },
    startJob: async () => ({
      id: 'job1',
      url: 'https://youtu.be/abc',
      status: 'running',
      message: 'Downloading',
      startedAt: 1
    }),
    waitJob: async () => ({
      id: 'job1',
      url: 'https://youtu.be/abc',
      status: 'done',
      message: 'Download finished.',
      startedAt: 1,
      trackIds: ['abc']
    }),
    pullTrackFile: async (trackId, dest) => {
      pulled.push(trackId)
      return dest
    }
  })
  assert.deepEqual(pulled, ['abc'])
  assert.equal(tracks[0].syncState, 'synced')
  assert.equal(tracks[0].trackId, 'abc')
})
