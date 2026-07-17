import type { ButtonHTMLAttributes, MouseEvent } from 'react'
import { playSound, unlockAudio } from '../utils/sound'

type EbButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** When false, skips the default UI click SFX (e.g. download already plays confirm). */
  playClickSound?: boolean
}

export function EbButton({
  onClick,
  onMouseEnter,
  disabled,
  playClickSound = true,
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
      if (playClickSound) {
        playSound('click')
      }
    }
    onClick?.(event)
  }

  return (
    <button {...rest} disabled={disabled} onMouseEnter={handleMouseEnter} onClick={handleClick}>
      {children}
    </button>
  )
}
