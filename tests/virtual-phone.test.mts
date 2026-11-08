import assert from 'node:assert/strict'
import { test } from 'node:test'
import { startVirtualHome } from './harness/virtualPhone.mjs'

test('a virtual phone pairs, uploads, and finds the track on the home server', async () => {
  const phone = await startVirtualHome()
  try {
    const paired = await phone.pair('Pixel')
    assert.equal(typeof paired.token, 'string')
    const uploaded = await phone.upload(
      {
        trackId: 'abc',
        title: 'Snowman',
        artist: 'Ness',
        url: 'https://youtu.be/abc',
        source: 'youtube',
        fileName: 'Snowman.m4a'
      },
      Buffer.from('snowman-audio', 'utf8')
    )
    assert.equal(uploaded.duplicate, false)
    assert.equal(uploaded.synced, true)
    const page = await phone.search('snow')
    assert.equal(page.tracks.length, 1)
    assert.equal(page.tracks[0].title, 'Snowman')
    assert.equal(phone.history.length, 1)
  } finally {
    await phone.close()
  }
})
