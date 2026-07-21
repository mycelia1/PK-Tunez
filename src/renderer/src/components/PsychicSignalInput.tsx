import type { FormEvent } from 'react'
import type { DownloadMode } from '../../../shared/types'
import { classifyYouTubeUrl, detectSource } from '../../../shared/sources'
import { DOWNLOAD_MODE_OPTIONS } from '../constants/downloadModes'
import { useTheme } from '../theme/ThemeContext'
import { EbButton } from './EbButton'
import './PsychicSignalInput.css'

interface PsychicSignalInputProps {
  url: string
  mode: DownloadMode
  /** Empty string or digits; parsed to scdl `-o` when starting a SoundCloud download. */
  offset: string
  isBusy: boolean
  onUrlChange: (value: string) => void
  onModeChange: (mode: DownloadMode) => void
  onOffsetChange: (value: string) => void
  onDownload: () => void
}

const YT_KIND_LABEL: Record<string, string> = {
  video: 'Single video',
  playlist: 'Playlist',
  channel: 'Channel'
}

export function PsychicSignalInput({
  url,
  mode,
  offset,
  isBusy,
  onUrlChange,
  onModeChange,
  onOffsetChange,
  onDownload
}: PsychicSignalInputProps): JSX.Element {
  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    if (!isBusy && url.trim()) {
      onDownload()
    }
  }

  const { copy } = useTheme()
  const hasUrl = url.trim().length > 0
  const isYouTube = hasUrl && detectSource(url) === 'youtube'
  const youtubeKind = isYouTube ? classifyYouTubeUrl(url) : null
  const showOffset = hasUrl && !isYouTube

  return (
    <form className="psychic-signal eb-panel" aria-label="Download input" data-tour="signal" onSubmit={handleSubmit}>
      <label className="eb-label psychic-signal__label" htmlFor="psychic-signal-url">
        {copy.signalLabel}
      </label>
      <input
        id="psychic-signal-url"
        className="eb-input psychic-signal__input"
        type="url"
        placeholder="SoundCloud or YouTube link (e.g. https://soundcloud.com/... or https://youtu.be/...)"
        value={url}
        onChange={(event) => onUrlChange(event.target.value)}
        disabled={isBusy}
      />

      {hasUrl && (
        <div
          className={`psychic-signal__source-badge psychic-signal__source-badge--${
            isYouTube ? 'youtube' : 'soundcloud'
          }`}
          aria-live="polite"
        >
          {isYouTube
            ? `YouTube · audio-only · ${YT_KIND_LABEL[youtubeKind ?? 'video']}`
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
      ) : (
        <div className="psychic-signal__modes" role="radiogroup" aria-label="Download mode" data-tour="modes">
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

      {showOffset && (
        <label className="psychic-signal__offset" htmlFor="psychic-signal-offset">
          <span className="eb-label">Start at track # (optional)</span>
          <input
            id="psychic-signal-offset"
            className="eb-input psychic-signal__offset-input"
            type="number"
            min={1}
            step={1}
            inputMode="numeric"
            placeholder="Leave blank to start from 1"
            value={offset}
            onChange={(event) => onOffsetChange(event.target.value)}
            disabled={isBusy}
          />
          <small className="psychic-signal__offset-hint">
            For resume: set slightly below how many you already have (e.g. 2300 if ~2500 are done). Skips
            re-scanning earlier tracks; the archive still protects against re-downloads.
          </small>
        </label>
      )}

      <EbButton
        type="submit"
        className="eb-button psychic-signal__download"
        disabled={isBusy || !url.trim()}
        playClickSound={false}
      >
        {copy.downloadButton}
      </EbButton>
    </form>
  )
}