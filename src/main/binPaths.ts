import { app } from 'electron'
import { existsSync } from 'fs'
import { join } from 'path'

const isWindows = process.platform === 'win32'
const SCDL_BINARY = isWindows ? 'scdl.exe' : 'scdl'

/**
 * Directory that holds the bundled sidecar binaries (scdl, ffmpeg, yt-dlp).
 *
 * - Packaged app: `<resourcesPath>/bin` (set via electron-builder extraResources).
 * - Development:  `<projectRoot>/resources/bin/<platform>`.
 */
export function getBinDir(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'bin')
  }
  return join(app.getAppPath(), 'resources', 'bin', process.platform)
}

/**
 * Absolute path to the bundled scdl binary, or the bare command name `scdl`
 * as a fallback so a developer with scdl on their PATH can still run the app.
 */
export function getScdlPath(): string {
  const bundled = join(getBinDir(), SCDL_BINARY)
  return existsSync(bundled) ? bundled : 'scdl'
}

/** True when a bundled scdl binary is present (packaged, self-contained build). */
export function hasBundledScdl(): boolean {
  return existsSync(join(getBinDir(), SCDL_BINARY))
}

/**
 * Spawn environment with the bundled bin directory prepended to PATH so that
 * scdl/yt-dlp can locate the bundled ffmpeg without a system install.
 */
export function getSpawnEnv(): NodeJS.ProcessEnv {
  const binDir = getBinDir()
  if (!existsSync(binDir)) {
    return process.env
  }
  const pathKey = isWindows ? 'Path' : 'PATH'
  const existing = process.env[pathKey] ?? process.env.PATH ?? ''
  return {
    ...process.env,
    [pathKey]: existing ? `${binDir}${isWindows ? ';' : ':'}${existing}` : binDir
  }
}
