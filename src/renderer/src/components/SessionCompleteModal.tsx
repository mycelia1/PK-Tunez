import type { FormEvent } from 'react'
import type { SessionSnapshot } from '../../../shared/types'
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
  useEnterKey(open, onClose)

  if (!open) return null

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    onClose()
  }

  return (
    <div className="session-complete__backdrop" role="presentation" onClick={onClose}>
      <form
        className="session-complete eb-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="session-complete-title"
        onClick={(event) => event.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <h2 id="session-complete-title" className="eb-title session-complete__title">
          Download session complete!
        </h2>
        <p className="session-complete__text">Your psychic signal has been fully processed. Nice work!</p>
        <SessionLogPanel sessions={sessions} compact />
        <EbButton type="submit" className="eb-button session-complete__close">
          Close
        </EbButton>
      </form>
    </div>
  )
}
