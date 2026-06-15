import type { FormEvent } from 'react'
import { useEffect } from 'react'
import type { AppSettings } from '../../../shared/types'
import { EbButton } from './EbButton'
import { useEnterKey } from '../utils/useEnterKey'
import './PsiMenu.css'
interface PsiMenuProps {
  open: boolean
  settings: AppSettings
  onClose: () => void
  onChange: (partial: Partial<AppSettings>) => void
  onSave: () => void
  onSetDownloadFolder: () => void
  onSetArchiveFile: () => void
  onDownloadArchiveFile: () => void
}

export function PsiMenu({
  open,
  settings,
  onClose,
  onChange,
  onSave,
  onSetDownloadFolder,
  onSetArchiveFile,
  onDownloadArchiveFile
}: PsiMenuProps): JSX.Element | null {
  useEnterKey(open, onSave)

  useEffect(() => {    if (!open) return

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [open])

  if (!open) return null

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    onSave()
  }

  return (
    <div
      className="psi-menu__backdrop"
      role="presentation"
      onClick={onClose}
      onWheel={(event) => event.stopPropagation()}
    >
      <form
        className="psi-menu eb-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="psi-menu-title"
        onClick={(event) => event.stopPropagation()}
        onSubmit={handleSubmit}
      >        <header className="psi-menu__header">
          <h2 id="psi-menu-title" className="eb-title psi-menu__title">
            PSI Menu
          </h2>
          <EbButton type="button" className="eb-button eb-button--secondary" onClick={onClose}>
            Close
          </EbButton>
        </header>

        <div className="psi-menu__body">
          <div className="psi-menu__grid">
          <label className="psi-menu__field">
            <span className="eb-label">Client ID</span>
            <input
              className="eb-input"
              value={settings.clientId}
              onChange={(event) => onChange({ clientId: event.target.value })}
              placeholder="SoundCloud client_id"
            />
          </label>

          <label className="psi-menu__field">
            <span className="eb-label">Auth Token</span>
            <input
              className="eb-input"
              value={settings.authToken}
              onChange={(event) => onChange({ authToken: event.target.value })}
              placeholder="Optional, for likes/private"
              type="password"
            />
          </label>

          <label className="psi-menu__field">
            <span className="eb-label">Download Folder</span>
            <div className="psi-menu__path-row">
              <input className="eb-input" value={settings.downloadDir} readOnly />
              <EbButton type="button" className="eb-button eb-button--secondary" onClick={onSetDownloadFolder}>
                Set
              </EbButton>
            </div>
            <small className="psi-menu__help">Set picks a new download location.</small>
          </label>

          <label className="psi-menu__field">
            <span className="eb-label">Global Archive File</span>
            <div className="psi-menu__path-row">
              <input className="eb-input" value={settings.archivePath} readOnly />
              <EbButton type="button" className="eb-button eb-button--secondary" onClick={onSetArchiveFile}>
                Set
              </EbButton>
              <EbButton type="button" className="eb-button eb-button--secondary" onClick={onDownloadArchiveFile}>
                Download
              </EbButton>
            </div>
            <small className="psi-menu__help">
              Text-based track ID archive. Set changes the file location. Download saves a copy (e.g. for a thumb
              drive).
            </small>
          </label>

          <label className="psi-menu__toggle">
            <input
              type="checkbox"
              checked={settings.limitTrackLength}
              onChange={(event) => onChange({ limitTrackLength: event.target.checked })}
            />
            <span>Limit track length (skip long mixes)</span>
            <small className="psi-menu__help">
              When on, skips tracks longer than {settings.maxTrackLengthMinutes} minutes. Turn off to allow full mixes.
            </small>
          </label>

          <label className="psi-menu__field">
            <span className="eb-label">Max Track Length (minutes)</span>
            <input
              className="eb-input"
              type="number"
              min={1}
              max={600}
              value={settings.maxTrackLengthMinutes}
              disabled={!settings.limitTrackLength}
              onChange={(event) =>
                onChange({ maxTrackLengthMinutes: Math.max(1, Number(event.target.value) || 60) })
              }
            />
          </label>

          <label className="psi-menu__toggle">
            <input
              type="checkbox"
              checked={settings.soundEnabled}
              onChange={(event) => onChange({ soundEnabled: event.target.checked })}
            />
            <span>Enable retro sound effects</span>
            <small className="psi-menu__help">
              Session-complete jingles: add .wav or .mp3 files to src/renderer/src/assets/sfx/session-complete/
            </small>
          </label>

          <div className="psi-menu__help-block">
            <strong className="eb-label">Troubleshooting</strong>
            <p className="psi-menu__help">
              HTTP 429 (Too Many Requests): SoundCloud is rate-limiting. Wait a few minutes or download smaller batches.
              PK-Tunez adds a 2-second delay between tracks automatically.
            </p>
            <p className="psi-menu__help">
              Browser impersonation warning: optional. Install with{' '}
              <code className="psi-menu__inline-code">pip install curl_cffi</code>. See{' '}
              <a href="https://github.com/yt-dlp/yt-dlp#impersonation" target="_blank" rel="noreferrer">
                yt-dlp impersonation docs
              </a>
              .
            </p>
          </div>
          </div>
        </div>

        <footer className="psi-menu__footer">
          <EbButton type="submit" className="eb-button">
            Save PSI Settings
          </EbButton>
        </footer>
      </form>
    </div>  )
}
