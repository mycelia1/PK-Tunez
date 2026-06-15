import type { ButtonHTMLAttributes, MouseEvent } from 'react'
import { playSound, unlockAudio } from '../utils/sound'

type EbButtonProps = ButtonHTMLAttributes<HTMLButtonElement>

export function EbButton({
  onClick,
  onMouseEnter,
  disabled,
  children,
  ...rest
}: EbButtonProps): JSX.Element {
  const handleMouseEnter = (event: MouseEvent<HTMLButtonElement>): void => {
    if (!disabled) {
      playSound('hover')
    }
    onMouseEnter?.(event)
  }

  const handleClick = (event: MouseEvent<HTMLButtonElement>): void => {
    if (!disabled) {
      unlockAudio()
      playSound('click')
    }
    onClick?.(event)
  }

  return (
    <button {...rest} disabled={disabled} onMouseEnter={handleMouseEnter} onClick={handleClick}>
      {children}
    </button>
  )
}
