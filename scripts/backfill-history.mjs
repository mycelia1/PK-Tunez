// One-off: backfill history.json from audio files on disk that were downloaded
// but never recorded (e.g. their "Download completed" log line was dropped when
// scdl was killed for a throttle backoff). Mirrors src/main/reconcileHistory.ts.
//
// Usage: node scripts/backfill-history.mjs

import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const AUDIO_EXTENSIONS = new Set([
  '.mp3', '.m4a', '.aac', '.flac', '.wav', '.opus', '.ogg', '.oga', '.wma', '.alac', '.mka'
])
const MAX_DEPTH = 6
const MAX_FILES = 100000

function appData() {
  return process.env.APPDATA ?? join(process.env.USERPROFILE ?? '', 'AppData', 'Roaming')
}

const historyPath = join(appData(), 'pk-tunez', 'history.json')
const settingsPath = join(appData(), 'pk-tunez', 'settings.json')

function readJson(path, fallback) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch {
    return fallback
  }
}

function hasAudioExtension(name) {
  const dot = name.lastIndexOf('.')
  return dot >= 0 && AUDIO_EXTENSIONS.has(name.slice(dot).toLowerCase())
}

function parseTrackFileName(fileName) {
  const bracket = fileName.match(/^\[(\d+)\]\s+(.+)\.[^.]+$/)
  if (bracket) {
    const trackId = bracket[1]
    const full = bracket[2]
    const split = full.split(' - ')
    if (split.length >= 2) {
      return { trackId, artist: split[0].trim(), title: split.slice(1).join(' - ').trim() }
    }
    return { trackId, artist: 'Unknown', title: full }
  }
  const withoutExt = fileName.replace(/\.[^.]+$/, '')
  const ytIdMatch = withoutExt.match(/^(.+)\s+\[([^\]]+)\]$/)
  if (ytIdMatch) {
    const core = ytIdMatch[1]
    const trackId = ytIdMatch[2].trim()
    const split = core.split(' - ')
    if (split.length >= 2) {
      return { trackId, artist: split[0].trim(), title: split.slice(1).join(' - ').trim() }
    }
    return { trackId, artist: 'Unknown', title: core.trim() }
  }
  const split = withoutExt.split(' - ')
  if (split.length >= 2) {
    return { trackId: withoutExt, artist: split[0].trim(), title: split.slice(1).join(' - ').trim() }
  }
  return { trackId: fileName, artist: 'Unknown', title: fileName }
}

function collectAudioFiles(rootDir) {
  if (!rootDir || !existsSync(rootDir)) return []
  const found = []
  const queue = [{ dir: rootDir, depth: 0 }]
  let scanned = 0
  while (queue.length > 0) {
    const current = queue.shift()
    let entries
    try {
      entries = readdirSync(current.dir)
    } catch {
      continue
    }
    for (const entry of entries) {
      if (scanned >= MAX_FILES) return found
      const fullPath = join(current.dir, entry)
      scanned += 1
      let stat
      try {
        stat = statSync(fullPath)
      } catch {
        continue
      }
      if (stat.isFile()) {
        if (hasAudioExtension(entry)) found.push(fullPath)
      } else if (stat.isDirectory() && current.depth < MAX_DEPTH) {
        queue.push({ dir: fullPath, depth: current.depth + 1 })
      }
    }
  }
  return found
}

const normalizeKey = (p) => p.replace(/[\\/]+/g, '/').toLowerCase()

function buildEntry(filePath) {
  const fileName = filePath.split(/[\\/]/).pop() ?? filePath
  const { trackId, artist, title } = parseTrackFileName(fileName)
  let sizeBytes = 0
  let ts = Date.now()
  try {
    const stat = statSync(filePath)
    sizeBytes = stat.size
    ts = Math.round(stat.mtimeMs)
  } catch {
    /* keep defaults */
  }
  return { trackId, title, artist, url: '', filePath, sizeBytes, ts }
}

function main() {
  const settings = readJson(settingsPath, {})
  const downloadDir = settings.downloadDir
  if (!downloadDir || !existsSync(downloadDir)) {
    console.error(`Download dir not found: ${downloadDir}`)
    process.exit(1)
  }

  const history = readJson(historyPath, [])
  if (!Array.isArray(history)) {
    console.error('history.json is not an array; aborting.')
    process.exit(1)
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupPath = `${historyPath}.${stamp}.bak`
  writeFileSync(backupPath, JSON.stringify(history, null, 2), 'utf8')

  const known = new Set(history.filter((e) => e?.filePath).map((e) => normalizeKey(e.filePath)))

  const added = []
  for (const filePath of collectAudioFiles(downloadDir)) {
    const key = normalizeKey(filePath)
    if (known.has(key)) continue
    added.push(buildEntry(filePath))
    known.add(key)
  }

  console.log(`Download dir : ${downloadDir}`)
  console.log(`Backup       : ${backupPath}`)
  console.log(`History before: ${history.length}`)
  console.log(`Recovered     : ${added.length}`)

  if (added.length === 0) {
    console.log('Nothing to backfill. history.json left unchanged.')
    return
  }

  const byFolder = {}
  for (const e of added) {
    const folder = e.filePath.split(/[\\/]/).slice(-2, -1)[0] ?? '(root)'
    byFolder[folder] = (byFolder[folder] ?? 0) + 1
  }
  console.log('Recovered by folder:')
  for (const [folder, count] of Object.entries(byFolder).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(count).padStart(4)}  ${folder}`)
  }

  const merged = [...history, ...added].sort((a, b) => b.ts - a.ts)
  writeFileSync(historyPath, JSON.stringify(merged, null, 2), 'utf8')
  console.log(`History after : ${merged.length}`)
  console.log('Done.')
}

main()
