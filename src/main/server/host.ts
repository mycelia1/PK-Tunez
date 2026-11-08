import { app } from 'electron'
import { networkInterfaces } from 'os'
import { join } from 'path'
import QRCode from 'qrcode'
import type { PairingPayload, PairingTicket, ServerStatus } from '../../shared/serverProtocol'
import { appendArchiveId, readArchiveIds } from '../archiveMutate'
import { fingerprintFile } from '../fingerprint'
import { appendHistory, ensureArchiveFile, loadHistory, loadSettings } from '../settings'
import { startSyncServer, type RunningSyncServer } from './createSyncServer'
import { DeviceStore } from './deviceStore'
import { advertise, stopAdvertise } from './discovery'
import { getServerJob, startServerJob, stopServerJobs } from './jobs'
import { resolveMediaUrl } from './resolveUrl'
import { getTunnelState, startTunnel, stopTunnel } from './tunnel'

let running: RunningSyncServer | null = null
let devices: DeviceStore | null = null
let lastError: string | null = null

function deviceStore(): DeviceStore {
  if (!devices) {
    devices = new DeviceStore(join(app.getPath('userData'), 'server-devices.json'))
  }
  return devices
}

export function lanUrls(port: number): string[] {
  const urls: string[] = []
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      const family = entry.family as string | number
      if (entry.internal) continue
      if (family !== 'IPv4' && family !== 4) continue
      urls.push(`http://${entry.address}:${port}`)
    }
  }
  return urls
}

export async function startSyncHost(): Promise<void> {
  await stopSyncHost()
  const settings = loadSettings()
  if (!settings.serverEnabled) return

  const store = deviceStore()
  ensureArchiveFile(settings.archivePath)
  try {
    running = await startSyncServer({
      port: settings.serverPort,
      host: '0.0.0.0',
      version: app.getVersion(),
      devices: store,
      downloadDir: settings.downloadDir,
      getHistory: () => loadHistory(),
      addTrack: (entry) => {
        appendHistory(entry)
      },
      readArchiveIds: () => readArchiveIds(settings.archivePath),
      appendArchiveId: (source, trackId) => {
        appendArchiveId(settings.archivePath, source, trackId)
      },
      fingerprintFile: async (filePath) => {
        const stamped = await fingerprintFile(filePath)
        if (!stamped) return null
        return {
          fingerprint: stamped.fingerprint,
          sizeBytes: stamped.stamp.sizeBytes,
          mtimeMs: stamped.stamp.mtimeMs
        }
      },
      resolveUrl: (url) => resolveMediaUrl(url),
      startJob: (url) => startServerJob(url),
      getJob: (id) => getServerJob(id)
    })
    lastError = null
    advertise(running.port)
    if (settings.tunnelEnabled) {
      startTunnel(running.port, settings.tunnelToken, settings.tunnelHostname)
    }
  } catch (error) {
    lastError = error instanceof Error ? error.message : 'The server did not start.'
    running = null
  }
}

export async function stopSyncHost(): Promise<void> {
  stopServerJobs()
  stopTunnel()
  stopAdvertise()
  const current = running
  running = null
  if (!current) return
  await current.close()
}

export function getServerStatus(): ServerStatus {
  const settings = loadSettings()
  const tunnel = getTunnelState()
  const port = running?.port ?? settings.serverPort
  return {
    running: running !== null,
    port,
    lanUrls: running ? lanUrls(port) : [],
    tunnelUrl: settings.tunnelEnabled ? tunnel.url : null,
    tunnelError: settings.tunnelEnabled ? tunnel.error : null,
    error: lastError,
    devices: deviceStore().list()
  }
}

export async function issuePairing(): Promise<PairingTicket | { error: string }> {
  if (!running) return { error: 'The server is not running.' }
  const settings = loadSettings()
  const issued = deviceStore().issueCode()
  const lan = lanUrls(running.port)
  const tunnel = settings.tunnelEnabled ? getTunnelState().url : null
  const payload: PairingPayload = {
    v: 1,
    lan: lan[0] ?? null,
    tunnel,
    port: running.port,
    code: issued.code
  }
  const qrDataUrl = await QRCode.toDataURL(JSON.stringify(payload), { margin: 1, width: 280 })
  return { code: issued.code, expiresAt: issued.expiresAt, payload, qrDataUrl }
}

export function revokePairedDevice(id: string): ServerStatus {
  deviceStore().revoke(id)
  return getServerStatus()
}
