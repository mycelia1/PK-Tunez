import { spawn, type ChildProcess } from 'child_process'
import { getCloudflaredPath, getSpawnEnv } from '../binPaths'

export interface TunnelState {
  url: string | null
  error: string | null
}

let child: ChildProcess | null = null
let state: TunnelState = { url: null, error: null }
let generation = 0

export function getTunnelState(): TunnelState {
  return state
}

export function stopTunnel(): void {
  generation += 1
  const current = child
  child = null
  state = { url: null, error: null }
  if (!current) return
  try {
    current.kill()
  } catch {
    // The process is already gone.
  }
}

/**
 * Open a Cloudflare tunnel to the local sync server.
 * A token uses a named tunnel and `hostname`. Without a token, cloudflared
 * prints a temporary trycloudflare.com address.
 */
export function startTunnel(port: number, token: string, hostname: string): void {
  stopTunnel()
  const command = getCloudflaredPath()
  if (!command) {
    state = {
      url: null,
      error: 'cloudflared is not installed. Run the binary bundle script, or install cloudflared.'
    }
    return
  }

  const named = token.trim()
  if (named && !hostname.trim()) {
    state = { url: null, error: 'Set the tunnel host name for this Cloudflare token.' }
    return
  }

  const args = named
    ? ['tunnel', '--no-autoupdate', 'run', '--token', named]
    : ['tunnel', '--no-autoupdate', '--url', `http://127.0.0.1:${port}`]

  const mine = generation
  try {
    child = spawn(command, args, {
      windowsHide: true,
      env: getSpawnEnv(),
      stdio: ['ignore', 'pipe', 'pipe']
    })
  } catch (error) {
    state = {
      url: null,
      error: error instanceof Error ? error.message : 'cloudflared did not start.'
    }
    child = null
    return
  }

  if (named) {
    state = { url: `https://${hostname.trim()}`, error: null }
  }

  const onText = (chunk: Buffer): void => {
    if (mine !== generation) return
    const text = chunk.toString('utf8')
    const match = text.match(/https:\/\/[-a-z0-9]+\.trycloudflare\.com/i)
    if (match) state = { url: match[0], error: null }
  }
  child.stdout?.on('data', onText)
  child.stderr?.on('data', onText)
  child.once('error', (error) => {
    if (mine !== generation) return
    const missing = (error as NodeJS.ErrnoException).code === 'ENOENT'
    state = {
      url: state.url,
      error: missing
        ? 'cloudflared is not installed. Run the binary bundle script, or install cloudflared.'
        : error.message
    }
  })
  child.once('close', (code) => {
    if (mine !== generation) return
    child = null
    if (!state.url) {
      state = { url: null, error: `cloudflared stopped (code ${code ?? 'unknown'}).` }
    }
  })
}
