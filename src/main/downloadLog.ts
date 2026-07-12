import { app } from 'electron'
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { DownloadRequest } from '../shared/types'

export function logsDir(): string {
  return join(app.getPath('userData'), 'logs')
}

export function createSessionLogFile(
  startedAt: number,
  request: DownloadRequest,
  command: string,
  args: string[]
): string {
  const dir = logsDir()
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  const path = join(dir, `session-${startedAt}.log`)
  const header = [
    'PK-Tunez download log',
    `Started: ${new Date(startedAt).toISOString()}`,
    `URL: ${request.url}`,
    `Mode: ${request.mode}`,
    `Command: ${command} ${args.join(' ')}`,
    '',
    '--- output ---',
    ''
  ].join('\n')
  writeFileSync(path, header, 'utf8')
  return path
}

export function appendSessionLogLine(logFilePath: string | null, message: string): void {
  if (!logFilePath) return
  const trimmed = message.trim()
  if (!trimmed) return
  const line = `[${new Date().toISOString()}] ${trimmed}\n`
  appendFileSync(logFilePath, line, 'utf8')
}
