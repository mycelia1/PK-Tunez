import { randomUUID } from 'crypto'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import type { SessionSnapshot } from '../shared/types'

const MAX_SESSIONS = 50

function sessionsPath(): string {
  return join(app.getPath('userData'), 'sessions.json')
}

function readSessionsFile(): SessionSnapshot[] {
  const path = sessionsPath()
  if (!existsSync(path)) return []
  try {
    let raw = readFileSync(path, 'utf8')
    if (raw.charCodeAt(0) === 0xfeff) raw = raw.slice(1)
    const parsed = JSON.parse(raw) as SessionSnapshot[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeSessions(sessions: SessionSnapshot[]): void {
  writeFileSync(sessionsPath(), JSON.stringify(sessions.slice(0, MAX_SESSIONS), null, 2), 'utf8')
}

export function loadSessions(): SessionSnapshot[] {
  return readSessionsFile()
}

export function appendSession(snapshot: Omit<SessionSnapshot, 'id'> & { id?: string }): SessionSnapshot {
  const entry: SessionSnapshot = {
    ...snapshot,
    id: snapshot.id ?? randomUUID()
  }
  const sessions = readSessionsFile()
  sessions.unshift(entry)
  writeSessions(sessions)
  return entry
}
