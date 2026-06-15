import { useEffect, useRef } from 'react'

/**
 * Fires `onEnter` when Enter is pressed while `active`.
 * Skips inputs, textareas, links, and buttons so native behavior still works.
 */
export function useEnterKey(active: boolean, onEnter: () => void): void {
  const onEnterRef = useRef(onEnter)
  onEnterRef.current = onEnter

  useEffect(() => {
    if (!active) return

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Enter' || event.repeat) return
      if (event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return

      const target = event.target
      if (!(target instanceof HTMLElement)) return

      const tag = target.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'BUTTON' || tag === 'A') {
        return
      }

      event.preventDefault()
      onEnterRef.current()
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [active])
}
