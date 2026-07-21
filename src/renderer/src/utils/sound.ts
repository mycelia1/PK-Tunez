import type { UiTheme } from '../../../shared/types'

import clickUrl from '../assets/sfx/ui-click.wav'
import completeUrl from '../assets/sfx/complete.wav'
import completeSkipUrl from '../assets/sfx/complete-skip.wav'
import confirmUrl from '../assets/sfx/confirm.wav'
import errorUrl from '../assets/sfx/error.wav'
import hoverUrl from '../assets/sfx/ui-hover.wav'
import startUrl from '../assets/sfx/start.wav'
import successUrl from '../assets/sfx/success.wav'

export type SoundName =
  | 'hover'
  | 'click'
  | 'completeSkip'
  | 'confirm'
  | 'start'
  | 'complete'
  | 'success'
  | 'error'

const SESSION_COMPLETE_QUEUE_KEY = 'pk-tunez-session-complete-queue'

const earthboundSessionModules = import.meta.glob('../assets/sfx/session-complete/*.{wav,mp3}', {
  eager: true,
  import: 'default'
}) as Record<string, string>

const dk64SessionModules = import.meta.glob('../assets/sfx/dk64/session-complete/*.{wav,mp3}', {
  eager: true,
  import: 'default'
}) as Record<string, string>

const dk64SfxModules = import.meta.glob('../assets/sfx/dk64/*.{wav,mp3}', {
  eager: true,
  import: 'default'
}) as Record<string, string>

function sortedTrackUrls(modules: Record<string, string>): string[] {
  return Object.entries(modules)
    .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
    .map(([, url]) => url)
}

const SESSION_COMPLETE_BY_THEME: Record<UiTheme, string[]> = {
  earthbound: sortedTrackUrls(earthboundSessionModules),
  // Empty until you drop tracks in — falls back to synth (not EarthBound OST).
  dk64: sortedTrackUrls(dk64SessionModules)
}

const EARTHBOUND_WAV: Record<SoundName, string> = {
  hover: hoverUrl,
  click: clickUrl,
  // Shared chime for track skip + track finish (complete-skip.wav).
  completeSkip: completeSkipUrl,
  confirm: confirmUrl,
  start: startUrl,
  // Distinct "task done" chime — only Export mix + Save settings (complete.wav).
  complete: completeUrl,
  success: successUrl,
  error: errorUrl
}

/** Map SoundName → expected filename stem under assets/sfx/dk64/ */
const DK64_SFX_STEMS: Record<SoundName, string[]> = {
  hover: ['ui-hover', 'hover'],
  click: ['ui-click', 'click'],
  completeSkip: ['complete-skip', 'blip'],
  confirm: ['confirm'],
  start: ['start'],
  complete: ['complete'],
  success: ['success'],
  error: ['error']
}

function resolveDk64Sfx(name: SoundName): string {
  const stems = DK64_SFX_STEMS[name]
  const match = Object.entries(dk64SfxModules).find(([path]) => {
    const file = (path.split(/[/\\]/).pop() ?? '').replace(/\.(wav|mp3)$/i, '')
    return stems.some((stem) => file.toLowerCase() === stem.toLowerCase())
  })
  return match?.[1] ?? EARTHBOUND_WAV[name]
}

function wavSourcesForTheme(theme: UiTheme): Record<SoundName, string> {
  if (theme === 'dk64') {
    return {
      hover: resolveDk64Sfx('hover'),
      click: resolveDk64Sfx('click'),
      completeSkip: resolveDk64Sfx('completeSkip'),
      confirm: resolveDk64Sfx('confirm'),
      start: resolveDk64Sfx('start'),
      complete: resolveDk64Sfx('complete'),
      success: resolveDk64Sfx('success'),
      error: resolveDk64Sfx('error')
    }
  }
  return EARTHBOUND_WAV
}

const HOVER_DEBOUNCE_MS = 60
const SESSION_COMPLETE_VOLUME = 0.75

const VOLUME: Record<SoundName, number> = {
  hover: 0.35,
  click: 0.45,
  completeSkip: 0.6,
  confirm: 0.65,
  start: 0.6,
  complete: 0.7,
  success: 0.7,
  error: 0.7
}

let soundEnabled = true
let activeTheme: UiTheme = 'earthbound'
let wavSources = EARTHBOUND_WAV
let lastHoverAt = 0
let audioContext: AudioContext | null = null
let loopingAudio: HTMLAudioElement | null = null

export function initSound(options: { enabled: boolean; theme?: UiTheme }): void {
  soundEnabled = options.enabled
  if (options.theme) {
    activeTheme = options.theme
    wavSources = wavSourcesForTheme(options.theme)
  }
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
  completeSkip: () => playTone(880, 60),
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

function queueKeyForTheme(theme: UiTheme): string {
  return `${SESSION_COMPLETE_QUEUE_KEY}:${theme}`
}

function loadSessionCompleteQueue(theme: UiTheme): number[] {
  const raw = localStorage.getItem(queueKeyForTheme(theme))
  if (!raw) return []

  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((value): value is number => Number.isInteger(value))
  } catch {
    return []
  }
}

function saveSessionCompleteQueue(theme: UiTheme, queue: number[]): void {
  localStorage.setItem(queueKeyForTheme(theme), JSON.stringify(queue))
}

function nextSessionCompleteTrackUrl(): string | null {
  const tracks = SESSION_COMPLETE_BY_THEME[activeTheme]
  if (tracks.length === 0) return null

  let queue = loadSessionCompleteQueue(activeTheme).filter((index) => index >= 0 && index < tracks.length)
  if (queue.length === 0) {
    queue = shuffleIndices(tracks.length)
  }

  const trackIndex = queue.shift()
  if (trackIndex === undefined) return null

  saveSessionCompleteQueue(activeTheme, queue)
  return tracks[trackIndex] ?? null
}

function playWav(name: SoundName): void {
  const audio = new Audio(wavSources[name])
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

export function getSessionCompleteTrackCount(theme: UiTheme = activeTheme): number {
  return SESSION_COMPLETE_BY_THEME[theme].length
}
