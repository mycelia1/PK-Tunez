import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { appendArchiveId, readArchiveIds } from '../../src/main/archiveMutate.ts'
import { fingerprintFile } from '../../src/main/fingerprint.ts'
import { startSyncServer } from '../../src/main/server/createSyncServer.ts'
import { DeviceStore } from '../../src/main/server/deviceStore.ts'
import { uploadHeaders } from '../../src/shared/uploadHeaders.ts'

/**
 * A scripted phone against a real home server.
 * The MCP server and the unit test both use this.
 */
export async function startVirtualHome() {
  const dir = mkdtempSync(join(tmpdir(), 'pk-tunez-phone-'))
  const downloadDir = join(dir, 'music')
  const archivePath = join(dir, 'download-archive.txt')
  writeFileSync(archivePath, '', 'utf8')
  const history = []
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
  let token = ''

  return {
    base,
    history,
    async pair(name = 'Pixel') {
      const code = devices.issueCode().code
      const response = await fetch(`${base}/api/v1/pair`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code, name })
      })
      const body = await response.json()
      token = body.token
      return body
    },
    async upload(meta, bytes) {
      const response = await fetch(`${base}/api/v1/tracks`, {
        method: 'POST',
        headers: uploadHeaders(token, meta),
        body: bytes
      })
      return response.json()
    },
    async search(q) {
      const response = await fetch(`${base}/api/v1/library?q=${encodeURIComponent(q)}`, {
        headers: { authorization: `Bearer ${token}` }
      })
      return response.json()
    },
    async close() {
      await server.close()
      rmSync(dir, { recursive: true, force: true })
    }
  }
}
