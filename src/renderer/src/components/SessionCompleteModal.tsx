import type { FormEvent } from 'react'
import type { SessionSnapshot } from '../../../shared/types'
import { useTheme } from '../theme/ThemeContext'
import { EbButton } from './EbButton'
import { SessionLogPanel } from './SessionLogPanel'
import { useEnterKey } from '../utils/useEnterKey'
import './SessionCompleteModal.css'

interface SessionCompleteModalProps {
  open: boolean
  onClose: () => void
  sessions: SessionSnapshot[]
}

export function SessionCompleteModal({ open, onClose, sessions }: SessionCompleteModalProps): JSX.Element | null {
  const { copy } = useTheme()
  useEnterKey(open, onClose)

  if (!open) return null

  const latest = sessions[0]
  const isPartial =
    latest?.outcome === 'completed' && (latest.counts.error > 0 || /some issues/i.test(latest.statusMessage))

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    onClose()
  }

  return (
    <div className="session-complete__backdrop" role="presentation" onClick={onClose}>
      <form
        className={`session-complete eb-panel${isPartial ? ' session-complete--partial' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="session-complete-title"
        onClick={(event) => event.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <h2 id="session-complete-title" className="eb-title session-complete__title">
          {isPartial ? 'Download session complete (with issues)' : 'Download session complete!'}
        </h2>
        <p className="session-complete__text">{copy.sessionCompleteText}</p>
        {isPartial && (
          <p className="session-complete__warning">
            Some tracks failed or were unavailable. Check the session log below — successful downloads are still in
            your library.
          </p>
        )}
        <SessionLogPanel sessions={sessions} compact />
        <EbButton type="submit" className="eb-button session-complete__close">
          Close
        </EbButton>
      </form>
    </div>
  )
}
