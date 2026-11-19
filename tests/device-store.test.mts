import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { DeviceStore } from '../src/main/server/deviceStore.ts'

test('a new pairing replaces the previous phone', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pk-tunez-devices-'))
  let now = 1_000
  const store = new DeviceStore(join(dir, 'devices.json'), () => now)
  const firstCode = store.issueCode().code
  const first = store.pair(firstCode, 'Pixel')
  assert.equal(first.ok, true)

  now += 60_000
  const secondCode = store.issueCode().code
  const second = store.pair(secondCode, 'Ness Phone')
  assert.equal(second.ok, true)

  const devices = store.list()
  assert.equal(devices.length, 1)
  assert.equal(devices[0].name, 'Ness Phone')
  rmSync(dir, { recursive: true, force: true })
})

test('startup keeps the newest phone when older pairings are still stored', () => {
  const dir = mkdtempSync(join(tmpdir(), 'pk-tunez-devices-'))
  const file = join(dir, 'devices.json')
  writeFileSync(
    file,
    JSON.stringify({
      devices: [
        { id: 'old', name: 'Old', tokenHash: 'a'.repeat(64), createdAt: 1 },
        { id: 'new', name: 'New', tokenHash: 'b'.repeat(64), createdAt: 2 }
      ]
    }),
    'utf8'
  )
  const store = new DeviceStore(file)
  store.keepNewestPhone()
  const devices = store.list()
  assert.equal(devices.length, 1)
  assert.equal(devices[0].name, 'New')
  rmSync(dir, { recursive: true, force: true })
})
