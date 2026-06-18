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
            <strong className="eb-label">Throttle Protection</strong>
            <p className="psi-menu__help">
              Tuning to avoid SoundCloud throttling (HTTP 403/429). PK-Tunez downloads in chunks, pauses between
              them, and automatically backs off and resumes (via the archive) when throttled.
            </p>
          </div>

          <label className="psi-menu__field">
            <span className="eb-label">Chunk Size (tracks per batch)</span>
            <input
              className="eb-input"
              type="number"
              min={0}
              max={500}
              value={settings.chunkSize}
              onChange={(event) => onChange({ chunkSize: Math.max(0, Math.floor(Number(event.target.value) || 0)) })}
            />
            <small className="psi-menu__help">Pause after this many downloads. 0 disables chunking.</small>
          </label>

          <label className="psi-menu__field">
            <span className="eb-label">Chunk Cooldown (seconds)</span>
            <input
              className="eb-input"
              type="number"
              min={5}
              max={3600}
              value={settings.chunkCooldownSeconds}
              onChange={(event) =>
                onChange({ chunkCooldownSeconds: Math.max(5, Math.floor(Number(event.target.value) || 5)) })
              }
            />
            <small className="psi-menu__help">How long to wait between chunks.</small>
          </label>

          <label className="psi-menu__field">
            <span className="eb-label">Max Throttle Retries</span>
            <input
              className="eb-input"
              type="number"
              min={0}
              max={20}
              value={settings.maxThrottleRetries}
              onChange={(event) =>
                onChange({ maxThrottleRetries: Math.max(0, Math.floor(Number(event.target.value) || 0)) })
              }
            />
            <small className="psi-menu__help">
              Auto resume attempts after a 403/429, with exponential backoff (30s, 60s, 120s...).
            </small>
          </label>

          <label className="psi-menu__field">
            <span className="eb-label">Sleep Between Tracks (min / max sec)</span>
            <div className="psi-menu__path-row">
              <input
                className="eb-input"
                type="number"
                min={0}
                max={120}
                value={settings.sleepIntervalSeconds}
                onChange={(event) =>
                  onChange({ sleepIntervalSeconds: Math.max(0, Number(event.target.value) || 0) })
                }
              />
              <input
                className="eb-input"
                type="number"
                min={0}
                max={120}
                value={settings.maxSleepIntervalSeconds}
                onChange={(event) =>
                  onChange({ maxSleepIntervalSeconds: Math.max(0, Number(event.target.value) || 0) })
                }
              />
            </div>
            <small className="psi-menu__help">Randomized delay range — jitter looks less bot-like than a fixed wait.</small>
          </label>

          <label className="psi-menu__field">
            <span className="eb-label">Sleep Between Requests (seconds)</span>
            <input
              className="eb-input"
              type="number"
              min={0}
              max={60}
              step={0.5}
              value={settings.sleepRequestsSeconds}
              onChange={(event) =>
                onChange({ sleepRequestsSeconds: Math.max(0, Number(event.target.value) || 0) })
              }
            />
            <small className="psi-menu__help">Spaces out API/metadata requests (what usually trips throttling). 0 disables.</small>
          </label>

          <label className="psi-menu__field">
            <span className="eb-label">Limit Download Rate</span>
            <input
              className="eb-input"
              value={settings.limitRate}
              onChange={(event) => onChange({ limitRate: event.target.value })}
              placeholder="e.g. 2M or 500K (blank = unlimited)"
            />
            <small className="psi-menu__help">
              Caps bandwidth per download (yt-dlp --limit-rate). Helps blend in; not a direct throttle fix.
            </small>
          </label>

          <label className="psi-menu__toggle">
            <input
              type="checkbox"
              checked={settings.impersonateTarget.trim().length > 0}
              onChange={(event) => onChange({ impersonateTarget: event.target.checked ? 'chrome' : '' })}
            />
            <span>Browser impersonation (Chrome)</span>
            <small className="psi-menu__help">
              Mimics a real browser fingerprint (yt-dlp --impersonate). Requires curl_cffi — bundled in the
              installed app; for dev runs <code className="psi-menu__inline-code">pip install curl_cffi</code>.
            </small>
          </label>

          <div className="psi-menu__help-block">
            <strong className="eb-label">Troubleshooting</strong>
            <p className="psi-menu__help">
              HTTP 403/429: SoundCloud is throttling. PK-Tunez now backs off and resumes automatically; you can also
              lower the chunk size, raise the cooldown, or drop the auth token for public batches.
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
