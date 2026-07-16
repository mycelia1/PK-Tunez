import type { FormEvent } from 'react'
import { useTheme } from '../theme/ThemeContext'
import { EbButton } from './EbButton'
import { useEnterKey } from '../utils/useEnterKey'
import './YouTubeCookiesHintModal.css'

interface YouTubeCookiesHintModalProps {
  open: boolean
  onDismiss: () => void
  onOpenPsiMenu: () => void
}

export function YouTubeCookiesHintModal({
  open,
  onDismiss,
  onOpenPsiMenu
}: YouTubeCookiesHintModalProps): JSX.Element | null {
  const { copy } = useTheme()
  useEnterKey(open, onDismiss)

  if (!open) return null

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    onDismiss()
  }

  return (
    <div className="youtube-cookies-hint__backdrop" role="presentation" onClick={onDismiss}>
      <form
        className="youtube-cookies-hint eb-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="youtube-cookies-hint-title"
        onClick={(event) => event.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <h2 id="youtube-cookies-hint-title" className="eb-title youtube-cookies-hint__title">
          {copy.tipPrefix}: YouTube Sign-In Required
        </h2>
        <p className="youtube-cookies-hint__text">
          This video needs a logged-in YouTube session (age-restricted, private, or similar). PK-Tunez can borrow
          cookies from your browser, but you must be signed in there first.
        </p>
        <ol className="youtube-cookies-hint__steps">
          <li>
            Use <strong>Firefox</strong> — on Windows, Chrome and Edge usually fail with a &ldquo;Could not copy cookie
            database&rdquo; error, even when closed.
          </li>
          <li>Sign in to YouTube in Firefox and confirm the video plays there.</li>
          <li>
            Open <strong>{copy.psiMenuTitle}</strong> → <strong>YouTube settings</strong> → enable{' '}
            <strong>Use cookies from browser</strong> and select <strong>Firefox</strong>.
          </li>
          <li>Save settings, then retry the download.</li>
        </ol>
        <p className="youtube-cookies-hint__text">
          Cookies stay on your machine and are only passed to yt-dlp for the download.
        </p>
        <div className="youtube-cookies-hint__actions">
          <EbButton type="button" className="eb-button eb-button--secondary" onClick={onOpenPsiMenu}>
            {copy.psiMenuOpen}
          </EbButton>
          <EbButton type="submit" className="eb-button">
            Got it
          </EbButton>
        </div>
      </form>
    </div>
  )
}
