import { mkdirSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const outDir = join(__dirname, '../src/renderer/src/assets/sfx')

const files = [
  'ui-hover.wav',
  'ui-click.wav',
  'blip.wav',
  'confirm.wav',
  'start.wav',
  'complete.wav',
  'success.wav',
  'session-complete.wav'
]

function createSilentWav(durationMs = 80) {
  const sampleRate = 22050
  const numSamples = Math.max(1, Math.floor((sampleRate * durationMs) / 1000))
  const dataSize = numSamples * 2
  const buffer = Buffer.alloc(44 + dataSize)

  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + dataSize, 4)
  buffer.write('WAVE', 8)
  buffer.write('fmt ', 12)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(1, 22)
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(sampleRate * 2, 28)
  buffer.writeUInt16LE(2, 32)
  buffer.writeUInt16LE(16, 34)
  buffer.write('data', 36)
  buffer.writeUInt32LE(dataSize, 40)

  return buffer
}

mkdirSync(outDir, { recursive: true })

for (const file of files) {
  const duration = file.startsWith('ui-') ? 50 : 120
  writeFileSync(join(outDir, file), createSilentWav(duration))
}

console.log(`Created ${files.length} placeholder WAV files in ${outDir}`)
