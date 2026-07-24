/** Stable `data-tour` attribute values used by the spotlight tour. */
export type TutorialTargetId =
  | 'title'
  | 'signal'
  | 'modes'
  | 'psi-open'
  | 'psi-menu'
  | 'stream'
  | 'backpack'
  | 'mix'

export interface TutorialStep {
  id: string
  /** Short heading shown on the tip card. */
  title: string
  /** Body paragraphs. */
  body: string[]
  target: TutorialTargetId
  /** When true, App opens Psi Menu while this step is active. */
  openPsi?: boolean
}

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to PK-Tunez',
    body: [
      'PK-Tunez downloads SoundCloud and YouTube audio to your machine, keeps a global archive so you do not re-download the same track, and gives you a backpack plus mix lab for organizing what you grab.',
      'This short tour highlights the main controls. You can restart it anytime from the Psi Menu.'
    ],
    target: 'title'
  },
  {
    id: 'signal',
    title: 'Paste a link',
    body: [
      'Drop a SoundCloud or YouTube URL into the signal field. A badge appears under the field showing which source was detected.',
      'YouTube downloads are audio-only (M4A) with title, artist, and cover art embedded when available.'
    ],
    target: 'signal'
  },
  {
    id: 'modes',
    title: 'Download modes (SoundCloud only)',
    body: [
      'For SoundCloud, pick Single, Uploads, Likes, Playlists, or All. Bulk modes ask for confirmation before switching.',
      'Likes (and other account-scoped modes) need a SoundCloud auth token under Psi Menu → SoundCloud settings. Without it, those modes will fail.',
      'YouTube ignores SoundCloud modes — the URL itself decides whether you get a single video, a playlist, or a channel.'
    ],
    target: 'modes'
  },
  {
    id: 'psi-button',
    title: 'Psi Menu (settings)',
    body: [
      'Settings live in the Psi Menu. The button is down here in the footer — easy to miss the first time.',
      'Open it anytime to change download location, archive path, SoundCloud credentials, YouTube cookies, and throttle defaults.'
    ],
    target: 'psi-open'
  },
  {
    id: 'folder-archive',
    title: 'Download folder & archive',
    body: [
      'Here you set where files land and where the global download-archive.txt lives. The archive is used for dedup so already-downloaded tracks are skipped. Keeping the default archive path is fine for most people.',
      'Try not to change the download folder often. Backpack looks up tracks under your current download path — if you switch folders, older downloads may not show up there even though the files are still on disk.'
    ],
    target: 'psi-menu',
    openPsi: true
  },
  {
    id: 'stream',
    title: 'Psychic Stream (download queue)',
    body: [
      'While a session runs, the Psychic Stream shows live queue progress for each track.',
      'Use Cancel (or Ctrl+C / Cmd+C) to stop the current download. Partial files are cleaned up when the session ends.'
    ],
    target: 'stream'
  },
  {
    id: 'backpack',
    title: 'Backpack (downloaded tracks)',
    body: [
      'Completed tracks land in the Backpack history. You can open files in your default player and add them to one or more mixes.',
      'Entries stay listed even after you move files (for example to a thumb drive) — handy for tracking what you already grabbed.'
    ],
    target: 'backpack'
  },
  {
    id: 'mix',
    title: 'Mix Lab (playlist / mix builder)',
    body: [
      'Build mixes from Backpack tracks — a track can belong to several mixes. Drag to reorder, then launch an .m3u playlist or export a numbered folder copy.',
      'Export writes copies into a subfolder called mixes under your download directory so the original files stay put.'
    ],
    target: 'mix'
  },
  {
    id: 'tips',
    title: 'Tips & defaults (Psi Menu settings)',
    body: [
      'Chunk size, cooldown, and sleep settings are tuned to reduce SoundCloud rate limits. Keep the defaults unless you know you need to change them — then nudge carefully.',
      'For age-gated or private YouTube videos, enable cookies-from-browser in Psi Menu (Firefox is recommended). Optional SoundCloud client ID, auth token, and browser impersonation also live there.'
    ],
    target: 'psi-menu',
    openPsi: true
  }
]
