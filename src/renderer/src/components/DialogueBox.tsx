import './DialogueBox.css'

interface DialogueBoxProps {
  message: string
  variant?: 'info' | 'error' | 'success'
}

export function DialogueBox({ message, variant = 'info' }: DialogueBoxProps): JSX.Element | null {
  if (!message) return null

  return (
    <div className={`dialogue-box eb-panel dialogue-box--${variant}`} role="status" aria-live="polite">
      <div className="dialogue-box__icon" aria-hidden="true">
        *
      </div>
      <p className="dialogue-box__text">{message}</p>
    </div>
  )
}
