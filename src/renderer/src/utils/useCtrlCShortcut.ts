import { useEffect, useRef } from 'react'

/**
 * Calls `onTrigger` when Ctrl+C (or Cmd+C on macOS) is pressed while `active`.
 */
export function useCtrlCShortcut(active: boolean, onTrigger: () => void): void {
  const onTriggerRef = useRef(onTrigger)
  onTriggerRef.current = onTrigger

  useEffect(() => {
    if (!active) return

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key.toLowerCase() !== 'c') return
      if (!event.ctrlKey && !event.metaKey) return
      if (event.altKey) return

      event.preventDefault()
      onTriggerRef.current()
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [active])
}
