import { forwardRef, type ButtonHTMLAttributes, type MouseEvent } from 'react'
import { playSound, unlockAudio } from '../utils/sound'

type EbButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** When false, skips the default UI click SFX (e.g. download already plays confirm). */
  playClickSound?: boolean
}

export const EbButton = forwardRef<HTMLButtonElement, EbButtonProps>(function EbButton(
  { onClick, onMouseEnter, disabled, playClickSound = true, children, ...rest },
  ref
) {
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
    <button
      ref={ref}
      {...rest}
      disabled={disabled}
      onMouseEnter={handleMouseEnter}
      onClick={handleClick}
    >
      {children}
    </button>
  )
})
