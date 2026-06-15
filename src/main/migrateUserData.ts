import { app } from 'electron'
import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'fs'
import { join } from 'path'

const LEGACY_FOLDER_NAME = 'scdl-earthbound-ui'
const MIGRATED_FILES = ['settings.json', 'history.json', 'download-archive.txt']

function isEmptyOrMissing(dir: string): boolean {
  if (!existsSync(dir)) return true
  try {
    return readdirSync(dir).length === 0
  } catch {
    return true
  }
}

/**
 * One-time migration from the alpha-era `scdl-earthbound-ui` user data folder
 * to the canonical `pk-tunez` folder. Copies config/history/archive without
 * deleting the legacy folder, so a rollback is always possible.
 *
 * Returns true if any files were migrated.
 */
export function migrateLegacyUserData(): boolean {
  const legacyDir = join(app.getPath('appData'), LEGACY_FOLDER_NAME)
  const currentDir = app.getPath('userData')

  if (legacyDir === currentDir) return false
  if (!existsSync(legacyDir)) return false
  if (!isEmptyOrMissing(currentDir)) return false

  if (!existsSync(currentDir)) {
    mkdirSync(currentDir, { recursive: true })
  }

  let migrated = false
  for (const fileName of MIGRATED_FILES) {
    const source = join(legacyDir, fileName)
    const destination = join(currentDir, fileName)
    if (existsSync(source) && !existsSync(destination)) {
      try {
        copyFileSync(source, destination)
        migrated = true
      } catch {
        // Skip files that cannot be copied; app will fall back to defaults.
      }
    }
  }

  return migrated
}
