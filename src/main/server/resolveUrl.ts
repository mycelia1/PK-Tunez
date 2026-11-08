import { spawn } from 'child_process'
import { getSpawnEnv, getYtDlpInvocation } from '../binPaths'
import type { ResolveResponse, ResolvedStream } from '../../shared/serverProtocol'
import { decodeScdlOutput } from '../scdlEncoding'

const MAX_STDOUT = 20 * 1024 * 1024
const TIMEOUT_MS = 90_000

interface YtFormat {
  url?: string
  ext?: string
  acodec?: string
  vcodec?: string
  http_headers?: Record<string, string>
}

interface YtNode {
  id?: string | number
  title?: string
  uploader?: string
  artist?: string
  channel?: string
  webpage_url?: string
  duration?: number
  ext?: string
  url?: string
  formats?: YtFormat[]
  entries?: Array<YtNode | null>
  http_headers?: Record<string, string>
}

function headerMap(value: Record<string, string> | undefined): Record<string, string> {
  if (!value) return {}
  const out: Record<string, string> = {}
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === 'string') out[key] = entry
  }
  return out
}

function pickStream(node: YtNode): { url: string; ext: string; headers: Record<string, string> } | null {
  const formats = node.formats ?? []
  const audio = formats.filter(
    (format) => format.url && format.acodec && format.acodec !== 'none' && format.vcodec === 'none'
  )
  const chosen = audio.find((format) => format.ext === 'm4a') ?? audio[audio.length - 1]
  if (chosen?.url) {
    return {
      url: chosen.url,
      ext: chosen.ext || 'm4a',
      headers: headerMap(chosen.http_headers ?? node.http_headers)
    }
  }
  if (node.url) {
    return { url: node.url, ext: node.ext || 'm4a', headers: headerMap(node.http_headers) }
  }
  return null
}

function flatten(node: YtNode, out: ResolvedStream[]): void {
  if (Array.isArray(node.entries)) {
    for (const child of node.entries) {
      if (child) flatten(child, out)
    }
    return
  }
  const stream = pickStream(node)
  if (!stream || node.id === undefined || node.id === null) return
  out.push({
    id: String(node.id),
    title: node.title?.trim() || 'Unknown',
    artist: node.uploader?.trim() || node.artist?.trim() || node.channel?.trim() || 'Unknown',
    webpageUrl: node.webpage_url?.trim() || '',
    ext: stream.ext,
    duration: typeof node.duration === 'number' ? node.duration : null,
    streamUrl: stream.url,
    httpHeaders: stream.headers
  })
}

/**
 * Ask yt-dlp for one video's audio URL. The phone downloads the bytes itself.
 * Playlists and channels should use the server download job instead.
 */
export function resolveMediaUrl(pageUrl: string): Promise<ResolveResponse> {
  const invocation = getYtDlpInvocation()
  return new Promise((resolve, reject) => {
    const child = spawn(
      invocation.command,
      [...invocation.prelude, '-J', '--no-download', '--no-playlist', pageUrl],
      { windowsHide: true, env: getSpawnEnv() }
    )
    const stdout: Buffer[] = []
    const stderr: Buffer[] = []
    let stdoutBytes = 0
    const timer = setTimeout(() => {
      child.kill()
      reject(new Error('Resolving the link took too long.'))
    }, TIMEOUT_MS)

    child.stdout?.on('data', (chunk: Buffer) => {
      stdoutBytes += chunk.length
      if (stdoutBytes > MAX_STDOUT) {
        child.kill()
        return
      }
      stdout.push(chunk)
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr.push(chunk)
    })
    child.once('error', (error) => {
      clearTimeout(timer)
      reject(error)
    })
    child.once('close', (code) => {
      clearTimeout(timer)
      const text = decodeScdlOutput(Buffer.concat(stdout))
      if (code !== 0 || !text.trim()) {
        const detail = decodeScdlOutput(Buffer.concat(stderr)).trim().split(/\r?\n/).slice(-3).join(' ')
        reject(new Error(detail || `Could not resolve the link (code ${code ?? 'unknown'}).`))
        return
      }
      try {
        const parsed = JSON.parse(text) as YtNode
        const items: ResolvedStream[] = []
        flatten(parsed, items)
        if (items.length === 0) {
          reject(new Error('The link has no audio stream.'))
          return
        }
        resolve({ items })
      } catch {
        reject(new Error('The downloader returned data that is not JSON.'))
      }
    })
  })
}
