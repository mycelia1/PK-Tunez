import { spawn, type ChildProcess } from 'child_process'
import { randomUUID } from 'crypto'
import { readdirSync, statSync } from 'fs'
import { join } from 'path'
import type { DownloadMode } from '../../shared/types'
import type { ServerJobView } from '../../shared/serverProtocol'
import { detectSource } from '../../shared/sources'
import { getSpawnEnv } from '../binPaths'
import { reconcileHistoryEntries } from '../reconcileHistory'
import { commandForDownload, isDownloadActive } from '../scdl'
import { loadHistory, saveHistory } from '../settings'
import { setServerJobRunning } from './busy'

const jobs: ServerJobView[] = []
let active: ChildProcess | null = null

function collectFiles(dir: string, out: Set<string>, depth = 0): void {
  if (!dir || depth > 6) return
  let names: string[]
  try {
    names = readdirSync(dir)
  } catch {
    return
  }
  for (const name of names) {
    const full = join(dir, name)
    let info
    try {
      info = statSync(full)
    } catch {
      continue
    }
    if (info.isDirectory()) collectFiles(full, out, depth + 1)
    else out.add(full.replace(/[\\/]+/g, '/').toLowerCase())
  }
}

/** SoundCloud needs a mode. YouTube picks video, playlist, or channel from the URL. */
function soundCloudMode(url: string): DownloadMode {
  try {
    const path = new URL(url).pathname.toLowerCase()
    if (path.includes('/sets/')) return 'playlists'
    if (path.endsWith('/likes')) return 'likes'
    const parts = path.split('/').filter(Boolean)
    if (parts.length >= 2) return 'single'
  } catch {
    // A bad URL still reaches the downloader, which reports the failure.
  }
  return 'all'
}

export function getServerJob(id: string): ServerJobView | null {
  return jobs.find((job) => job.id === id) ?? null
}

export function startServerJob(
  url: string
): { ok: true; job: ServerJobView } | { ok: false; status: number; error: string } {
  const target = url.trim()
  if (!target) return { ok: false, status: 400, error: 'A url is required.' }
  if (active || isDownloadActive()) {
    return { ok: false, status: 409, error: 'A download is already running on the home server.' }
  }

  let command: ReturnType<typeof commandForDownload>
  try {
    const mode = detectSource(target) === 'youtube' ? 'single' : soundCloudMode(target)
    command = commandForDownload({ url: target, mode })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not start the download.'
    return { ok: false, status: 500, error: message }
  }

  const job: ServerJobView = {
    id: randomUUID(),
    url: target,
    status: 'running',
    message: 'Downloading on the home server.',
    startedAt: Date.now()
  }
  jobs.unshift(job)
  if (jobs.length > 50) jobs.length = 50

  let settled = false
  const finish = (status: ServerJobView['status'], message: string): void => {
    if (settled) return
    settled = true
    active = null
    setServerJobRunning(false)
    job.status = status
    job.message = message
    job.endedAt = Date.now()
  }

  const before = new Set<string>()
  collectFiles(command.outputPath, before)

  setServerJobRunning(true)
  let child: ChildProcess
  try {
    child = spawn(command.command, command.args, {
      windowsHide: true,
      env: getSpawnEnv()
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Could not start the download.'
    finish('error', message)
    return { ok: false, status: 500, error: message }
  }
  active = child

  child.once('error', (error) => {
    finish('error', error.message)
  })

  child.once('close', (code) => {
    void (async () => {
      try {
        const { merged, changed } = await reconcileHistoryEntries(loadHistory(), command.outputPath)
        if (changed) saveHistory(merged)
        const after = new Set<string>()
        collectFiles(command.outputPath, after)
        const history = loadHistory()
        job.trackIds = history
          .filter((entry) => {
            const key = entry.filePath.replace(/[\\/]+/g, '/').toLowerCase()
            return after.has(key) && !before.has(key)
          })
          .map((entry) => entry.trackId)
      } catch {
        // A later library scan can still pick the files up.
      }
      finish(
        code === 0 ? 'done' : 'error',
        code === 0 ? 'Download finished.' : `Download ended with code ${code ?? 'unknown'}.`
      )
    })()
  })

  return { ok: true, job }
}

export function stopServerJobs(): void {
  const child = active
  active = null
  setServerJobRunning(false)
  if (!child) return
  try {
    child.kill()
  } catch {
    // The process is already gone.
  }
}
