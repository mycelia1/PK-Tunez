import type { FormEvent } from 'react'
import type { DownloadMode } from '../../../shared/types'
import { classifySpotifyUrl, classifyYouTubeUrl, detectSource } from '../../../shared/sources'
import { DOWNLOAD_MODE_OPTIONS } from '../constants/downloadModes'
import { EbButton } from './EbButton'
import './PsychicSignalInput.css'

interface PsychicSignalInputProps {
  url: string
  mode: DownloadMode
  isBusy: boolean
  onUrlChange: (value: string) => void
  onModeChange: (mode: DownloadMode) => void
  onDownload: () => void
}

const YT_KIND_LABEL: Record<string, string> = {
  video: 'Single video',
  playlist: 'Playlist',
  channel: 'Channel'
}

const SPOTIFY_KIND_LABEL: Record<string, string> = {
  track: 'Track',
  playlist: 'Playlist',
  album: 'Album',
  artist: 'Artist'
}

export function PsychicSignalInput({
  url,
  mode,
  isBusy,
  onUrlChange,
  onModeChange,
  onDownload
}: PsychicSignalInputProps): JSX.Element {
  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    if (!isBusy && url.trim()) {
      onDownload()
    }
  }

  const hasUrl = url.trim().length > 0
  const source = hasUrl ? detectSource(url) : null
  const isYouTube = source === 'youtube'
  const isSpotify = source === 'spotify'
  const youtubeKind = isYouTube ? classifyYouTubeUrl(url) : null
  const spotifyKind = isSpotify ? classifySpotifyUrl(url) : null

  return (
    <form className="psychic-signal eb-panel" aria-label="Download input" onSubmit={handleSubmit}>
      <label className="eb-label psychic-signal__label" htmlFor="psychic-signal-url">
        Enter Psychic Signal
      </label>
      <input
        id="psychic-signal-url"
        className="eb-input psychic-signal__input"
        type="url"
        placeholder="SoundCloud, YouTube, or Spotify link"
        value={url}
        onChange={(event) => onUrlChange(event.target.value)}
        disabled={isBusy}
      />

      {hasUrl && source && (
        <div
          className={`psychic-signal__source-badge psychic-signal__source-badge--${source}`}
          aria-live="polite"
        >
          {isYouTube
            ? `YouTube · audio-only · ${YT_KIND_LABEL[youtubeKind ?? 'video']}`
            : isSpotify
              ? `Spotify · matched via YouTube · ${SPOTIFY_KIND_LABEL[spotifyKind ?? 'track']}`
              : 'SoundCloud'}
        </div>
      )}

      {isYouTube ? (
        <p className="psychic-signal__yt-note">
          Audio is extracted as M4A (best available) with title, artist, and cover art embedded.
          {youtubeKind === 'video'
            ? ' Just this video will be grabbed.'
            : ` Every item in this ${youtubeKind} will be grabbed.`}
        </p>
      ) : isSpotify ? (
        <p className="psychic-signal__yt-note">
          Spotify metadata is matched to YouTube (and similar sources) and downloaded as M4A. Matching is
          best-effort — the wrong version or remix can occasionally be picked.
          {spotifyKind === 'track'
            ? ' Just this track will be grabbed.'
            : ` Every item in this ${spotifyKind} will be grabbed.`}
        </p>
      ) : (
        <div className="psychic-signal__modes" role="radiogroup" aria-label="Download mode">
          {DOWNLOAD_MODE_OPTIONS.map((option) => (
            <EbButton
              key={option.value}
              type="button"
              className={`psychic-signal__mode ${mode === option.value ? 'psychic-signal__mode--active' : ''}`}
              onClick={() => onModeChange(option.value)}
              disabled={isBusy}
              aria-pressed={mode === option.value}
            >
              <span className="psychic-signal__mode-label">{option.label}</span>
              <span className="psychic-signal__mode-hint">{option.hint}</span>
            </EbButton>
          ))}
        </div>
      )}
      <EbButton
        type="submit"
        className="eb-button psychic-signal__download"
        disabled={isBusy || !url.trim()}
      >
        PK DOWNLOAD!
      </EbButton>
    </form>
  )
}
