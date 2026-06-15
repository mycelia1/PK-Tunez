import type { DownloadMode } from '../../../shared/types'

export interface DownloadModeOption {
  value: DownloadMode
  label: string
  hint: string
  bulk: boolean
  confirmTitle: string
  confirmMessage: string
}

export const DOWNLOAD_MODE_OPTIONS: DownloadModeOption[] = [
  {
    value: 'single',
    label: 'Single URL',
    hint: 'One track or playlist link',
    bulk: false,
    confirmTitle: '',
    confirmMessage: ''
  },
  {
    value: 'uploads',
    label: 'All Uploads',
    hint: 'Artist/label own tracks',
    bulk: true,
    confirmTitle: 'Switch to All Uploads?',
    confirmMessage:
      'This downloads every track uploaded by the profile in your URL — not just the single link. Make sure that is what you want before continuing.'
  },
  {
    value: 'all',
    label: 'All + Reposts',
    hint: 'Everything on profile',
    bulk: true,
    confirmTitle: 'Switch to All + Reposts?',
    confirmMessage:
      'This downloads every upload and repost on the profile — a much larger batch than a single track. Make sure that is what you want before continuing.'
  },
  {
    value: 'likes',
    label: 'Likes',
    hint: 'Requires auth token',
    bulk: true,
    confirmTitle: 'Switch to Likes?',
    confirmMessage:
      'This downloads every track the account has liked, not just one URL. You will need a valid auth token in the PSI Menu. Make sure that is what you want before continuing.'
  },
  {
    value: 'playlists',
    label: 'Playlists',
    hint: 'All playlists',
    bulk: true,
    confirmTitle: 'Switch to Playlists?',
    confirmMessage:
      'This downloads every playlist on the profile — not just the playlist link you pasted. Make sure that is what you want before continuing.'
  }
]

export const DEFAULT_DOWNLOAD_MODE: DownloadMode = 'single'

export function getDownloadModeOption(mode: DownloadMode): DownloadModeOption {
  return DOWNLOAD_MODE_OPTIONS.find((option) => option.value === mode) ?? DOWNLOAD_MODE_OPTIONS[0]
}

export function isBulkDownloadMode(mode: DownloadMode): boolean {
  return getDownloadModeOption(mode).bulk
}
