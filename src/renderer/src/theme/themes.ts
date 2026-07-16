import type { UiTheme } from '../../../shared/types'

import earthboundLogo from '@assets/images/pktunez.png'
import earthboundDownloading from '@assets/images/sprites/nesswalking.gif'
import earthboundComplete from '@assets/images/sprites/nesspeacesign.webp'
import earthboundError from '@assets/images/sprites/struttinevilmushroom1.webp'

export const UI_THEMES: UiTheme[] = ['earthbound', 'dk64']

export const THEME_LABELS: Record<UiTheme, string> = {
  earthbound: 'EarthBound (SNES)',
  dk64: 'Donkey Kong 64 (N64)'
}

/** Window / splash background colors keyed by theme (main process). */
export const THEME_WINDOW_BG: Record<UiTheme, string> = {
  earthbound: '#4d8cff',
  dk64: '#2d6b3a'
}

export interface ThemeCopy {
  titleEyebrow: string
  titleSubtitle: string
  signalLabel: string
  downloadButton: string
  downloadEngaged: string
  welcomeMessage: string
  streamTitle: string
  streamEmpty: string
  backpackTitle: string
  backpackHint: string
  backpackEmpty: string
  backpackSearchAria: string
  backpackSearchPlaceholder: string
  mixLabTitle: string
  psiMenuTitle: string
  psiMenuSave: string
  psiMenuOpen: string
  settingsSaved: string
  sessionCompleteText: string
  progressLabel: string
  tipPrefix: string
  statusWait: string
  statusOwned: string
}

export interface ThemeSprites {
  logo: string
  downloading: string
  complete: string
  error: string
}

/** Prefer project `assets/themes/dk64/`; also scan renderer-local copy if present. */
const dk64ImageModules = {
  ...import.meta.glob('../../../../assets/themes/dk64/**/*.{png,webp,gif,jpg,jpeg}', {
    eager: true,
    import: 'default'
  }),
  ...import.meta.glob('../assets/themes/dk64/**/*.{png,webp,gif,jpg,jpeg}', {
    eager: true,
    import: 'default'
  })
} as Record<string, string>

function resolveThemeImage(themeFolder: string, basename: string, fallback: string): string {
  const needle = `themes/${themeFolder}/`
  const match = Object.entries(dk64ImageModules).find(([path]) => {
    const normalized = path.replace(/\\/g, '/')
    if (!normalized.includes(needle)) return false
    const file = normalized.split('/').pop() ?? ''
    return file.toLowerCase().startsWith(basename.toLowerCase())
  })
  return match?.[1] ?? fallback
}

const EARTHBOUND_SPRITES: ThemeSprites = {
  logo: earthboundLogo,
  downloading: earthboundDownloading,
  complete: earthboundComplete,
  error: earthboundError
}

/** DK64 images live under assets/themes/dk64/ — falls back to EarthBound until you drop files in. */
const DK64_SPRITES: ThemeSprites = {
  logo: resolveThemeImage('dk64', 'logo', earthboundLogo),
  downloading: resolveThemeImage('dk64', 'downloading', earthboundDownloading),
  complete: resolveThemeImage('dk64', 'complete', earthboundComplete),
  error: resolveThemeImage('dk64', 'error', earthboundError)
}

export const THEME_SPRITES: Record<UiTheme, ThemeSprites> = {
  earthbound: EARTHBOUND_SPRITES,
  dk64: DK64_SPRITES
}

export const THEME_COPY: Record<UiTheme, ThemeCopy> = {
  earthbound: {
    titleEyebrow: 'SoundCloud Downloader Utility',
    titleSubtitle: 'Companion PC Program v1.0 • Onett Data Recovery Dept.',
    signalLabel: 'Enter Psychic Signal',
    downloadButton: 'PK DOWNLOAD!',
    downloadEngaged: 'PK DOWNLOAD engaged! Scanning psychic signal...',
    welcomeMessage: 'Welcome! Enter a SoundCloud psychic signal to begin.',
    streamTitle: 'Psychic Stream',
    streamEmpty: 'No tracks in queue. Enter a psychic signal to begin.',
    backpackTitle: 'Backpack',
    backpackHint: 'Tracks stay listed here even after you move files to a thumb drive.',
    backpackEmpty: 'Your backpack is empty. Completed downloads appear here.',
    backpackSearchAria: 'Search backpack',
    backpackSearchPlaceholder: 'Search by title, artist, or file name…',
    mixLabTitle: 'Mix Lab',
    psiMenuTitle: 'PSI Menu',
    psiMenuSave: 'Save PSI Settings',
    psiMenuOpen: 'Open PSI Menu',
    settingsSaved: 'PSI settings saved.',
    sessionCompleteText: 'Your psychic signal has been fully processed. Nice work!',
    progressLabel: 'ACT',
    tipPrefix: 'PSI Tip',
    statusWait: 'WAIT',
    statusOwned: 'OWNED'
  },
  dk64: {
    titleEyebrow: 'SoundCloud Downloader Utility',
    titleSubtitle: 'N64 Cart Companion v1.0 • DK Isles Sound Archive',
    signalLabel: 'Enter Banana Signal',
    downloadButton: 'GO GO GO!',
    downloadEngaged: 'GO GO GO! Scanning banana signal...',
    welcomeMessage: 'Welcome! Drop a SoundCloud banana signal to begin.',
    streamTitle: 'Banana Barrel',
    streamEmpty: 'Barrel empty. Enter a banana signal to begin.',
    backpackTitle: 'Banana Hoard',
    backpackHint: 'Tracks stay listed here even after you move files to a thumb drive.',
    backpackEmpty: 'The hoard is empty. Completed downloads appear here.',
    backpackSearchAria: 'Search banana hoard',
    backpackSearchPlaceholder: 'Search by title, artist, or file name…',
    mixLabTitle: 'Cranky Lab',
    psiMenuTitle: "Cranky's Menu",
    psiMenuSave: 'Save Settings',
    psiMenuOpen: "Open Cranky's Menu",
    settingsSaved: 'Settings saved. Nice work!',
    sessionCompleteText: 'Banana signal fully processed. Buncha bananas!',
    progressLabel: 'DK',
    tipPrefix: "Cranky's Tip",
    statusWait: 'WAIT',
    statusOwned: 'OWNED'
  }
}

export function isUiTheme(value: unknown): value is UiTheme {
  return value === 'earthbound' || value === 'dk64'
}

export function applyDocumentTheme(theme: UiTheme): void {
  document.documentElement.dataset.theme = theme
}
