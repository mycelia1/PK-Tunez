import type { FormEvent } from 'react'
import { EbButton } from './EbButton'
import { useEnterKey } from '../utils/useEnterKey'
import './ImpersonationTipModal.css'
interface ImpersonationTipModalProps {
  open: boolean
  onDismiss: () => void
}

export function ImpersonationTipModal({ open, onDismiss }: ImpersonationTipModalProps): JSX.Element | null {
  useEnterKey(open, onDismiss)

  if (!open) return null

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    onDismiss()
  }

  return (
    <div className="impersonation-tip__backdrop" role="presentation" onClick={onDismiss}>
      <form
        className="impersonation-tip eb-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="impersonation-tip-title"
        onClick={(event) => event.stopPropagation()}
        onSubmit={handleSubmit}
      >        <h2 id="impersonation-tip-title" className="eb-title impersonation-tip__title">
          PSI Tip: Browser Impersonation
        </h2>
        <p className="impersonation-tip__text">
          yt-dlp tried to impersonate a browser for SoundCloud but optional dependencies are missing. Downloads
          usually still work. To install support, run in a terminal:
        </p>
        <code className="impersonation-tip__code">pip install curl_cffi</code>
        <p className="impersonation-tip__text">
          See the{' '}
          <a
            href="https://github.com/yt-dlp/yt-dlp#impersonation"
            target="_blank"
            rel="noreferrer"
            className="impersonation-tip__link"
          >
            yt-dlp impersonation docs
          </a>{' '}
          for details.
        </p>
        <EbButton type="submit" className="eb-button">
          Got it
        </EbButton>
      </form>    </div>
  )
}
