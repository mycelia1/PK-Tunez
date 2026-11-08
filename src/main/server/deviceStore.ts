import { createHash, randomBytes, randomInt, timingSafeEqual } from 'crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname } from 'path'

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const CODE_TTL_MS = 10 * 60 * 1000
const MAX_FAILS = 8
const FAIL_WINDOW_MS = 60 * 1000

export interface StoredDevice {
  id: string
  name: string
  tokenHash: string
  createdAt: number
}

export interface PairSuccess {
  ok: true
  token: string
  deviceId: string
  name: string
}

export interface PairFailure {
  ok: false
  status: number
  error: string
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function hashesMatch(stored: string, incoming: string): boolean {
  const left = Buffer.from(stored)
  const right = Buffer.from(incoming)
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}

function cleanName(name: string): string {
  const trimmed = name.trim().slice(0, 40)
  return trimmed || 'Phone'
}

/**
 * Pairing codes live in memory and expire. Device tokens are stored as
 * SHA-256 hashes, never as the raw token.
 */
export class DeviceStore {
  private codes: Array<{ code: string; expiresAt: number }> = []
  private fails: number[] = []
  private filePath: string
  private now: () => number

  constructor(filePath: string, now: () => number = Date.now) {
    this.filePath = filePath
    this.now = now
  }

  issueCode(): { code: string; expiresAt: number } {
    let code = ''
    for (let i = 0; i < 8; i += 1) {
      code += ALPHABET[randomInt(ALPHABET.length)]
    }
    const expiresAt = this.now() + CODE_TTL_MS
    this.codes = this.codes.filter((item) => item.expiresAt > this.now())
    this.codes.push({ code, expiresAt })
    return { code, expiresAt }
  }

  pair(code: string, deviceName: string): PairSuccess | PairFailure {
    this.fails = this.fails.filter((at) => this.now() - at < FAIL_WINDOW_MS)
    if (this.fails.length >= MAX_FAILS) {
      return { ok: false, status: 429, error: 'Too many attempts. Wait a minute.' }
    }

    const normalized = code.trim().toUpperCase()
    const match = this.codes.find((item) => item.code === normalized && item.expiresAt > this.now())
    if (!match) {
      this.fails.push(this.now())
      return { ok: false, status: 401, error: 'Pairing code is not valid.' }
    }
    this.codes = this.codes.filter((item) => item !== match)

    const token = randomBytes(32).toString('base64url')
    const device: StoredDevice = {
      id: randomBytes(8).toString('hex'),
      name: cleanName(deviceName),
      tokenHash: hashToken(token),
      createdAt: this.now()
    }
    const devices = this.load()
    devices.push(device)
    this.save(devices)
    return { ok: true, token, deviceId: device.id, name: device.name }
  }

  authorize(header: string | undefined): boolean {
    if (!header) return false
    const match = header.match(/^Bearer\s+(\S+)$/i)
    if (!match) return false
    const hash = hashToken(match[1])
    return this.load().some((device) => hashesMatch(device.tokenHash, hash))
  }

  list(): Array<{ id: string; name: string; createdAt: number }> {
    return this.load().map(({ id, name, createdAt }) => ({ id, name, createdAt }))
  }

  revoke(id: string): boolean {
    const devices = this.load()
    const next = devices.filter((device) => device.id !== id)
    if (next.length === devices.length) return false
    this.save(next)
    return true
  }

  private load(): StoredDevice[] {
    if (!existsSync(this.filePath)) return []
    try {
      const parsed = JSON.parse(readFileSync(this.filePath, 'utf8')) as { devices?: StoredDevice[] }
      if (!Array.isArray(parsed.devices)) return []
      return parsed.devices.filter(
        (device) =>
          !!device &&
          typeof device.id === 'string' &&
          typeof device.name === 'string' &&
          typeof device.tokenHash === 'string'
      )
    } catch {
      return []
    }
  }

  private save(devices: StoredDevice[]): void {
    mkdirSync(dirname(this.filePath), { recursive: true })
    writeFileSync(this.filePath, JSON.stringify({ devices }, null, 2), 'utf8')
  }
}
