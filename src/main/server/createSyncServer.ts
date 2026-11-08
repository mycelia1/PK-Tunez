import { randomUUID } from 'crypto'
import { createReadStream, createWriteStream, existsSync, mkdirSync, statSync, unlinkSync } from 'fs'
import { copyFile, rename } from 'fs/promises'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'http'
import { tmpdir } from 'os'
import { dirname, extname, join } from 'path'
import type { HistoryEntry, TrackSource } from '../../shared/types'
import type {
  HealthResponse,
  LibraryTrack,
  ResolveResponse,
  ServerJobView,
  UploadResult
} from '../../shared/serverProtocol'
import { DeviceStore } from './deviceStore'
import { findDuplicate } from './dedupe'
import { queryLibrary, toLibraryTrack } from './libraryQuery'
import { parseByteRange } from './range'

const MAX_JSON_BYTES = 1024 * 1024
const MAX_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024

const AUDIO_MIME: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.flac': 'audio/flac',
  '.wav': 'audio/wav',
  '.opus': 'audio/opus',
  '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg'
}

export interface SyncServerContext {
  /** Use 0 in tests so the OS picks a free port. */
  port: number
  /** Bind address. The desktop host uses 0.0.0.0 so phones on the LAN can connect. */
  host: string
  version: string
  devices: DeviceStore
  downloadDir: string
  getHistory: () => HistoryEntry[]
  addTrack: (entry: HistoryEntry) => void
  readArchiveIds: () => Set<string>
  appendArchiveId: (source: 'youtube' | 'soundcloud', trackId: string) => void
  fingerprintFile: (
    filePath: string
  ) => Promise<{ fingerprint: string; sizeBytes: number; mtimeMs: number } | null>
  resolveUrl?: (url: string) => Promise<ResolveResponse>
  startJob?: (url: string) => { ok: true; job: ServerJobView } | { ok: false; status: number; error: string }
  getJob?: (id: string) => ServerJobView | null
}

export interface RunningSyncServer {
  port: number
  close: () => Promise<void>
}

class HttpError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const data = Buffer.from(JSON.stringify(body), 'utf8')
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': data.length,
    'cache-control': 'no-store'
  })
  res.end(data)
}

function headerText(req: IncomingMessage, name: string): string {
  const raw = req.headers[name]
  const value = Array.isArray(raw) ? raw[0] : raw
  if (!value) return ''
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function readJson(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_JSON_BYTES) {
        reject(new HttpError(413, 'Body is too large.'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      const text = Buffer.concat(chunks).toString('utf8').trim()
      if (!text) {
        resolve({})
        return
      }
      try {
        resolve(JSON.parse(text) as unknown)
      } catch {
        reject(new HttpError(400, 'Body is not JSON.'))
      }
    })
    req.on('error', reject)
  })
}

function safeBaseName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? ''
  const cleaned = base.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '').trim()
  if (!cleaned || cleaned === '.' || cleaned === '..') return 'track.m4a'
  return cleaned.slice(0, 180)
}

function allocateDest(dir: string, fileName: string): string {
  mkdirSync(dir, { recursive: true })
  const safe = safeBaseName(fileName)
  const first = join(dir, safe)
  if (!existsSync(first)) return first
  const ext = extname(safe)
  const stem = ext ? safe.slice(0, -ext.length) : safe
  let n = 2
  let candidate = join(dir, `${stem} (${n})${ext}`)
  while (existsSync(candidate)) {
    n += 1
    candidate = join(dir, `${stem} (${n})${ext}`)
  }
  return candidate
}

async function moveFile(from: string, to: string): Promise<void> {
  mkdirSync(dirname(to), { recursive: true })
  try {
    await rename(from, to)
  } catch {
    await copyFile(from, to)
    unlinkSync(from)
  }
}

function writeUpload(req: IncomingMessage, dest: string): Promise<void> {
  const declared = Number(req.headers['content-length'] ?? 0)
  if (Number.isFinite(declared) && declared > MAX_UPLOAD_BYTES) {
    return Promise.reject(new HttpError(413, 'File is too large.'))
  }

  return new Promise((resolve, reject) => {
    const out = createWriteStream(dest)
    let size = 0
    let failed = false
    const fail = (error: Error): void => {
      if (failed) return
      failed = true
      out.destroy()
      req.destroy()
      unlinkSync(dest)
      reject(error)
    }
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_UPLOAD_BYTES) {
        fail(new HttpError(413, 'File is too large.'))
        return
      }
      if (!out.write(chunk)) req.pause()
    })
    out.on('drain', () => req.resume())
    req.on('end', () => {
      if (failed) return
      if (size === 0) {
        fail(new HttpError(400, 'Upload is empty.'))
        return
      }
      out.end(() => resolve())
    })
    req.on('error', fail)
    out.on('error', fail)
  })
}

function sourceOf(value: string): TrackSource {
  if (value === 'youtube' || value === 'soundcloud' || value === 'local') return value
  return 'local'
}

let uploadChain: Promise<unknown> = Promise.resolve()

function withUploadLock<T>(operation: () => Promise<T>): Promise<T> {
  const run = uploadChain.then(operation, operation)
  uploadChain = run.then(
    () => undefined,
    () => undefined
  )
  return run
}

function sendFile(req: IncomingMessage, res: ServerResponse, filePath: string): void {
  let size = 0
  try {
    size = statSync(filePath).size
  } catch {
    sendJson(res, 404, { error: 'File not found.' })
    return
  }
  const range = parseByteRange(req.headers.range, size)
  if (range === 'unsatisfiable') {
    res.writeHead(416, { 'content-range': `bytes */${size}` })
    res.end()
    return
  }
  const start = range?.start ?? 0
  const end = range?.end ?? size - 1
  const mime = AUDIO_MIME[extname(filePath).toLowerCase()] ?? 'application/octet-stream'
  res.writeHead(range ? 206 : 200, {
    'content-type': mime,
    'accept-ranges': 'bytes',
    'content-length': end - start + 1,
    ...(range ? { 'content-range': `bytes ${start}-${end}/${size}` } : {})
  })
  if (req.method === 'HEAD') {
    res.end()
    return
  }
  createReadStream(filePath, { start, end }).pipe(res)
}

async function handleUpload(req: IncomingMessage, ctx: SyncServerContext): Promise<UploadResult> {
  const trackId = headerText(req, 'x-pk-track-id').trim()
  const title = headerText(req, 'x-pk-title').trim()
  if (!trackId || !title) throw new HttpError(400, 'Track id and title are required.')

  const artist = headerText(req, 'x-pk-artist').trim() || 'Unknown'
  const url = headerText(req, 'x-pk-url').trim()
  const source = sourceOf(headerText(req, 'x-pk-source').trim())
  const fileName = headerText(req, 'x-pk-filename').trim() || `${title}.m4a`
  const tempPath = join(tmpdir(), `pk-tunez-upload-${randomUUID()}`)

  try {
    await writeUpload(req, tempPath)
    const stamped = await ctx.fingerprintFile(tempPath)
    return await withUploadLock(async () => {
      const hit = findDuplicate({
        trackId,
        source,
        fingerprint: stamped?.fingerprint,
        history: ctx.getHistory(),
        archiveIds: ctx.readArchiveIds(),
        fileExists: existsSync
      })
      if (hit) {
        unlinkSync(tempPath)
        return { synced: true, duplicate: true, track: toLibraryTrack(hit.entry) }
      }

      const dest = allocateDest(ctx.downloadDir, fileName)
      await moveFile(tempPath, dest)
      const info = statSync(dest)
      const entry: HistoryEntry = {
        trackId,
        title,
        artist,
        url,
        filePath: dest,
        sizeBytes: info.size,
        ts: Date.now(),
        source,
        fingerprint: stamped?.fingerprint,
        mtimeMs: info.mtimeMs
      }
      ctx.addTrack(entry)
      if ((source === 'youtube' || source === 'soundcloud') && trackId) {
        ctx.appendArchiveId(source, trackId)
      }
      return { synced: true, duplicate: false, track: toLibraryTrack(entry) }
    })
  } catch (error) {
    if (existsSync(tempPath)) {
      try {
        unlinkSync(tempPath)
      } catch {
        // The temp file may already have moved.
      }
    }
    throw error
  }
}

async function route(
  req: IncomingMessage,
  res: ServerResponse,
  ctx: SyncServerContext
): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1')
  const path = url.pathname
  const method = req.method ?? 'GET'

  if (method === 'POST' && path === '/api/v1/pair') {
    const body = (await readJson(req)) as { code?: unknown; name?: unknown }
    const code = typeof body.code === 'string' ? body.code : ''
    const name = typeof body.name === 'string' ? body.name : ''
    const result = ctx.devices.pair(code, name)
    if (!result.ok) {
      sendJson(res, result.status, { error: result.error })
      return
    }
    sendJson(res, 200, { token: result.token, deviceId: result.deviceId, name: result.name })
    return
  }

  if (!ctx.devices.authorize(req.headers.authorization)) {
    sendJson(res, 401, { error: 'Sign in with a pairing code first.' })
    return
  }

  if (method === 'GET' && path === '/api/v1/health') {
    const tracks = ctx.getHistory().filter((entry) => entry.filePath && !entry.missing).length
    const body: HealthResponse = { ok: true, name: 'pk-tunez', version: ctx.version, tracks }
    sendJson(res, 200, body)
    return
  }

  if (method === 'GET' && path === '/api/v1/library') {
    const page = queryLibrary(ctx.getHistory(), {
      q: url.searchParams.get('q') ?? '',
      cursor: Number(url.searchParams.get('cursor') ?? 0),
      limit: Number(url.searchParams.get('limit') ?? 50),
      fileExists: existsSync
    })
    sendJson(res, 200, page)
    return
  }

  const fileMatch = path.match(/^\/api\/v1\/tracks\/([^/]+)\/file$/)
  if (fileMatch && (method === 'GET' || method === 'HEAD')) {
    const trackId = decodeURIComponent(fileMatch[1])
    const entry = ctx.getHistory().find((item) => item.trackId === trackId && !item.missing)
    if (!entry?.filePath || !existsSync(entry.filePath)) {
      sendJson(res, 404, { error: 'Track not found.' })
      return
    }
    sendFile(req, res, entry.filePath)
    return
  }

  if (method === 'POST' && path === '/api/v1/tracks') {
    const result = await handleUpload(req, ctx)
    sendJson(res, 200, result)
    return
  }

  if (method === 'POST' && path === '/api/v1/resolve') {
    if (!ctx.resolveUrl) throw new HttpError(501, 'This server cannot resolve links.')
    const body = (await readJson(req)) as { url?: unknown }
    const target = typeof body.url === 'string' ? body.url.trim() : ''
    if (!target) throw new HttpError(400, 'A url is required.')
    sendJson(res, 200, await ctx.resolveUrl(target))
    return
  }

  if (method === 'POST' && path === '/api/v1/downloads') {
    if (!ctx.startJob) throw new HttpError(501, 'This server cannot download links.')
    const body = (await readJson(req)) as { url?: unknown }
    const target = typeof body.url === 'string' ? body.url.trim() : ''
    if (!target) throw new HttpError(400, 'A url is required.')
    const job = ctx.startJob(target)
    if (!job.ok) {
      sendJson(res, job.status, { error: job.error })
      return
    }
    sendJson(res, 202, job.job)
    return
  }

  const jobMatch = path.match(/^\/api\/v1\/downloads\/([^/]+)$/)
  if (jobMatch && method === 'GET') {
    const job = ctx.getJob?.(decodeURIComponent(jobMatch[1])) ?? null
    if (!job) {
      sendJson(res, 404, { error: 'Download not found.' })
      return
    }
    sendJson(res, 200, job)
    return
  }

  sendJson(res, 404, { error: 'Not found.' })
}

export function startSyncServer(ctx: SyncServerContext): Promise<RunningSyncServer> {
  const server: Server = createServer((req, res) => {
    route(req, res, ctx).catch((error: unknown) => {
      if (res.headersSent) {
        res.destroy()
        return
      }
      const status = error instanceof HttpError ? error.status : 500
      const message = error instanceof Error ? error.message : 'Server error.'
      sendJson(res, status, { error: message })
    })
  })

  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(ctx.port, ctx.host, () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : ctx.port
      resolve({
        port,
        close: () =>
          new Promise((done, fail) => {
            server.close((error) => (error ? fail(error) : done()))
          })
      })
    })
  })
}

export type { LibraryTrack }
