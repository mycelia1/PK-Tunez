import blipUrl from '../assets/sfx/blip.wav'
import clickUrl from '../assets/sfx/ui-click.wav'
import completeUrl from '../assets/sfx/complete.wav'
import confirmUrl from '../assets/sfx/confirm.wav'
import errorUrl from '../assets/sfx/error.wav'
import hoverUrl from '../assets/sfx/ui-hover.wav'
import startUrl from '../assets/sfx/start.wav'
import successUrl from '../assets/sfx/success.wav'

export type SoundName = 'hover' | 'click' | 'blip' | 'confirm' | 'start' | 'complete' | 'success' | 'error'

const SESSION_COMPLETE_QUEUE_KEY = 'pk-tunez-session-complete-queue'

const sessionCompleteModules = import.meta.glob('../assets/sfx/session-complete/*.{wav,mp3}', {
  eager: true,
  import: 'default'
}) as Record<string, string>

const SESSION_COMPLETE_TRACKS = Object.entries(sessionCompleteModules)
  .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
  .map(([, url]) => url)

const HOVER_DEBOUNCE_MS = 60
const SESSION_COMPLETE_VOLUME = 0.75

const VOLUME: Record<SoundName, number> = {
  hover: 0.35,
  click: 0.45,
  blip: 0.5,
  confirm: 0.65,
  start: 0.6,
  complete: 0.65,
  success: 0.7,
  error: 0.7
}

const WAV_SOURCES: Record<SoundName, string> = {
  hover: hoverUrl,
  click: clickUrl,
  blip: blipUrl,
  confirm: confirmUrl,
  start: startUrl,
  complete: completeUrl,
  success: successUrl,
  error: errorUrl
}

let soundEnabled = true
let lastHoverAt = 0
let audioContext: AudioContext | null = null
let loopingAudio: HTMLAudioElement | null = null

export function initSound(options: { enabled: boolean }): void {
  soundEnabled = options.enabled
  if (!soundEnabled) {
    stopLoopingSound()
  }
}

function getContext(): AudioContext {
  if (!audioContext) {
    audioContext = new AudioContext()
  }
  return audioContext
}

async function ensureAudioReady(): Promise<void> {
  const ctx = getContext()
  if (ctx.state === 'suspended') {
    await ctx.resume()
  }
}

function playTone(frequency: number, durationMs: number, type: OscillatorType = 'square', gain = 0.08): void {
  const ctx = getContext()
  const oscillator = ctx.createOscillator()
  const gainNode = ctx.createGain()

  oscillator.type = type
  oscillator.frequency.value = frequency
  gainNode.gain.value = gain

  oscillator.connect(gainNode)
  gainNode.connect(ctx.destination)

  const now = ctx.currentTime
  oscillator.start(now)
  gainNode.gain.exponentialRampToValueAtTime(0.0001, now + durationMs / 1000)
  oscillator.stop(now + durationMs / 1000)
}

function playSequence(notes: Array<{ freq: number; ms: number; type?: OscillatorType }>): void {
  let offset = 0
  for (const note of notes) {
    window.setTimeout(() => playTone(note.freq, note.ms, note.type ?? 'square'), offset)
    offset += note.ms
  }
}

const synthesizedFallback: Record<SoundName, () => void> = {
  hover: () => playTone(920, 40),
  click: () => playTone(740, 55),
  blip: () => playTone(880, 60),
  confirm: () =>
    playSequence([
      { freq: 660, ms: 70 },
      { freq: 990, ms: 90 }
    ]),
  start: () =>
    playSequence([
      { freq: 440, ms: 80 },
      { freq: 554, ms: 80 },
      { freq: 659, ms: 100 }
    ]),
  complete: () => playTone(784, 120, 'triangle', 0.1),
  success: () =>
    playSequence([
      { freq: 523, ms: 90 },
      { freq: 659, ms: 90 },
      { freq: 784, ms: 140, type: 'triangle' }
    ]),
  error: () =>
    playSequence([
      { freq: 220, ms: 120, type: 'sawtooth' },
      { freq: 185, ms: 160, type: 'sawtooth' }
    ])
}

function playSynth(name: SoundName): void {
  try {
    synthesizedFallback[name]()
  } catch {
    // Ignore audio failures in restricted environments.
  }
}

function playSessionCompleteSynthFallback(): void {
  void ensureAudioReady().then(() => {
    playSequence([
      { freq: 523, ms: 120 },
      { freq: 659, ms: 120 },
      { freq: 784, ms: 180, type: 'triangle' },
      { freq: 988, ms: 220, type: 'triangle' }
    ])
  })
}

async function startLoopingAudio(audio: HTMLAudioElement): Promise<void> {
  await ensureAudioReady()
  try {
    await audio.play()
  } catch {
    playSessionCompleteSynthFallback()
  }
}

function shuffleIndices(length: number): number[] {
  const indices = Array.from({ length }, (_, index) => index)
  for (let i = indices.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[indices[i], indices[j]] = [indices[j], indices[i]]
  }
  return indices
}

function loadSessionCompleteQueue(): number[] {
  const raw = localStorage.getItem(SESSION_COMPLETE_QUEUE_KEY)
  if (!raw) return []

  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((value): value is number => Number.isInteger(value))
  } catch {
    return []
  }
}

function saveSessionCompleteQueue(queue: number[]): void {
  localStorage.setItem(SESSION_COMPLETE_QUEUE_KEY, JSON.stringify(queue))
}

function nextSessionCompleteTrackUrl(): string | null {
  if (SESSION_COMPLETE_TRACKS.length === 0) return null

  let queue = loadSessionCompleteQueue().filter((index) => index >= 0 && index < SESSION_COMPLETE_TRACKS.length)
  if (queue.length === 0) {
    queue = shuffleIndices(SESSION_COMPLETE_TRACKS.length)
  }

  const trackIndex = queue.shift()
  if (trackIndex === undefined) return null

  saveSessionCompleteQueue(queue)
  return SESSION_COMPLETE_TRACKS[trackIndex] ?? null
}

function playWav(name: SoundName): void {
  const audio = new Audio(WAV_SOURCES[name])
  audio.volume = VOLUME[name]
  void audio.play().catch(() => playSynth(name))
}

export function playSound(name: SoundName): void {
  if (!soundEnabled) return

  if (name === 'hover') {
    const now = Date.now()
    if (now - lastHoverAt < HOVER_DEBOUNCE_MS) return
    lastHoverAt = now
  }

  try {
    playWav(name)
  } catch {
    playSynth(name)
  }
}

export function playLoopingSessionComplete(): void {
  if (!soundEnabled) return

  stopLoopingSound()

  const trackUrl = nextSessionCompleteTrackUrl()
  if (!trackUrl) {
    playSessionCompleteSynthFallback()
    return
  }

  const audio = new Audio(trackUrl)
  audio.volume = SESSION_COMPLETE_VOLUME
  audio.loop = true
  loopingAudio = audio
  void startLoopingAudio(audio)
}

/** Call once from a user click so async sounds (session complete) can play later. */
export function unlockAudio(): void {
  void ensureAudioReady()
}

export function stopLoopingSound(): void {
  if (!loopingAudio) return
  loopingAudio.pause()
  loopingAudio.currentTime = 0
  loopingAudio = null
}

export function getSessionCompleteTrackCount(): number {
  return SESSION_COMPLETE_TRACKS.length
}
