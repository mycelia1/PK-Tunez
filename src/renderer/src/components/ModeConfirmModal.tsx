import type { FormEvent } from 'react'
import type { DownloadMode } from '../../../shared/types'
import { getDownloadModeOption } from '../constants/downloadModes'
import { useEnterKey } from '../utils/useEnterKey'
import { EbButton } from './EbButton'
import './ModeConfirmModal.css'

interface ModeConfirmModalProps {
  open: boolean
  pendingMode: DownloadMode | null
  currentMode: DownloadMode
  onConfirm: () => void
  onCancel: () => void
}

export function ModeConfirmModal({
  open,
  pendingMode,
  currentMode,
  onConfirm,
  onCancel
}: ModeConfirmModalProps): JSX.Element | null {
  useEnterKey(open, onConfirm)

  if (!open || !pendingMode) return null

  const pending = getDownloadModeOption(pendingMode)
  const current = getDownloadModeOption(currentMode)

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    onConfirm()
  }

  return (
    <div className="mode-confirm__backdrop" role="presentation" onClick={onCancel}>
      <form
        className="mode-confirm eb-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mode-confirm-title"
        onClick={(event) => event.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <h2 id="mode-confirm-title" className="eb-title mode-confirm__title">
          {pending.confirmTitle}
        </h2>
        <p className="mode-confirm__text">{pending.confirmMessage}</p>
        <div className="mode-confirm__actions">
          <EbButton type="button" className="eb-button eb-button--secondary" onClick={onCancel}>
            Stay on {current.label}
          </EbButton>
          <EbButton type="submit" className="eb-button">
            Yes, use {pending.label}
          </EbButton>
        </div>
      </form>
    </div>
  )
}
