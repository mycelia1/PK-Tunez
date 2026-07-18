import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { TUTORIAL_STEPS, type TutorialStep } from '../tutorial/steps'
import { useEnterKey } from '../utils/useEnterKey'
import { EbButton } from './EbButton'
import './TutorialTour.css'

interface Rect {
  top: number
  left: number
  width: number
  height: number
}

interface TutorialTourProps {
  open: boolean
  /** Remeasure when Psi Menu mounts/unmounts for openPsi steps. */
  psiOpen?: boolean
  onFinish: () => void
  onSkip: () => void
  /** Called when the active step wants Psi Menu open/closed. */
  onPsiNeeded: (open: boolean) => void
}

const SPOTLIGHT_PAD = 8
const CARD_GAP = 12
const CARD_WIDTH = 420

function resolveTargetEl(step: TutorialStep): HTMLElement | null {
  const primary = document.querySelector(`[data-tour="${step.target}"]`) as HTMLElement | null
  if (primary) return primary
  if (step.target === 'modes') {
    return document.querySelector('[data-tour="signal"]') as HTMLElement | null
  }
  return null
}

function measureTarget(step: TutorialStep): Rect | null {
  const el = resolveTargetEl(step)
  if (!el) return null
  const r = el.getBoundingClientRect()
  return {
    top: r.top - SPOTLIGHT_PAD,
    left: r.left - SPOTLIGHT_PAD,
    width: r.width + SPOTLIGHT_PAD * 2,
    height: r.height + SPOTLIGHT_PAD * 2
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function positionCard(hole: Rect | null, cardHeight: number): { top: number; left: number } {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const maxLeft = Math.max(12, vw - CARD_WIDTH - 12)
  const maxTop = Math.max(12, vh - cardHeight - 12)

  if (!hole) {
    return {
      top: clamp(vh / 2 - cardHeight / 2, 12, maxTop),
      left: clamp(vw / 2 - CARD_WIDTH / 2, 12, maxLeft)
    }
  }

  const preferBelow = hole.top + hole.height + CARD_GAP
  const preferAbove = hole.top - cardHeight - CARD_GAP
  let top: number
  if (preferBelow + cardHeight <= vh - 12) {
    top = preferBelow
  } else if (preferAbove >= 12) {
    top = preferAbove
  } else {
    top = clamp(preferBelow, 12, maxTop)
  }

  const left = clamp(hole.left + hole.width / 2 - CARD_WIDTH / 2, 12, maxLeft)
  return { top, left }
}

export function TutorialTour({
  open,
  psiOpen = false,
  onFinish,
  onSkip,
  onPsiNeeded
}: TutorialTourProps): JSX.Element | null {
  const [stepIndex, setStepIndex] = useState(0)
  const [hole, setHole] = useState<Rect | null>(null)
  const [cardPos, setCardPos] = useState({ top: 80, left: 24 })
  const cardRef = useRef<HTMLDivElement>(null)
  const nextBtnRef = useRef<HTMLButtonElement>(null)

  const step = TUTORIAL_STEPS[stepIndex]
  const isLast = stepIndex >= TUTORIAL_STEPS.length - 1
  const total = TUTORIAL_STEPS.length

  const remeasure = useCallback((): void => {
    if (!open || !step) return
    const nextHole = measureTarget(step)
    setHole(nextHole)
    const cardHeight = cardRef.current?.offsetHeight ?? 220
    setCardPos(positionCard(nextHole, cardHeight))
  }, [open, step])

  const scrollTargetIntoView = useCallback((): void => {
    if (!open || !step) return
    const el = resolveTargetEl(step)
    if (!el) return
    el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
  }, [open, step])

  useEffect(() => {
    if (!open) {
      setStepIndex(0)
      return
    }
    setStepIndex(0)
  }, [open])

  useEffect(() => {
    if (!open || !step) return
    onPsiNeeded(Boolean(step.openPsi))
  }, [open, step, onPsiNeeded])

  useLayoutEffect(() => {
    if (!open) return
    scrollTargetIntoView()
    remeasure()
    // Remeasure after scroll / Psi menu open/close layout settles.
    const t = window.setTimeout(() => {
      scrollTargetIntoView()
      remeasure()
    }, 80)
    const t2 = window.setTimeout(remeasure, 220)
    return () => {
      window.clearTimeout(t)
      window.clearTimeout(t2)
    }
  }, [open, stepIndex, psiOpen, remeasure, scrollTargetIntoView])

  useEffect(() => {
    if (!open) return

    const onResize = (): void => remeasure()
    window.addEventListener('resize', onResize)
    window.addEventListener('scroll', onResize, true)

    let observer: ResizeObserver | null = null
    const target = resolveTargetEl(step)
    if (target && typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => remeasure())
      observer.observe(target)
    }

    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('scroll', onResize, true)
      observer?.disconnect()
    }
  }, [open, step, remeasure])

  useEffect(() => {
    if (!open) return
    nextBtnRef.current?.focus()
  }, [open, stepIndex])

  const goNext = useCallback((): void => {
    if (isLast) {
      onFinish()
      return
    }
    setStepIndex((i) => Math.min(TUTORIAL_STEPS.length - 1, i + 1))
  }, [isLast, onFinish])

  const goBack = (): void => {
    setStepIndex((i) => Math.max(0, i - 1))
  }

  useEnterKey(open, goNext)

  if (!open || !step) return null

  const holeStyle = hole
    ? {
        top: `${hole.top}px`,
        left: `${hole.left}px`,
        width: `${hole.width}px`,
        height: `${hole.height}px`
      }
    : undefined

  return (
    <div className="tutorial-tour" role="presentation">
      {/* Scrim only when no hole — otherwise the hole's box-shadow dims the rest. */}
      {!hole ? <div className="tutorial-tour__scrim" aria-hidden="true" /> : null}
      {hole ? (
        <>
          {/* Invisible click-catcher so the dimmed area is not interactive. */}
          <div className="tutorial-tour__scrim" style={{ background: 'transparent' }} aria-hidden="true" />
          <div className="tutorial-tour__hole" style={holeStyle} aria-hidden="true" />
        </>
      ) : null}

      <div
        ref={cardRef}
        className="tutorial-tour__card eb-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="tutorial-tour-title"
        style={{ top: cardPos.top, left: cardPos.left }}
      >
        <div className="tutorial-tour__meta">
          Step {stepIndex + 1} / {total}
        </div>
        <h2 id="tutorial-tour-title" className="eb-title tutorial-tour__title">
          {step.title}
        </h2>
        {step.body.map((paragraph, index) => (
          <p key={index} className="tutorial-tour__text">
            {paragraph}
          </p>
        ))}
        <div className="tutorial-tour__actions">
          <EbButton type="button" className="eb-button eb-button--secondary" onClick={onSkip}>
            Skip tour
          </EbButton>
          <div className="tutorial-tour__nav">
            {stepIndex > 0 ? (
              <EbButton type="button" className="eb-button eb-button--secondary" onClick={goBack}>
                Back
              </EbButton>
            ) : null}
            <EbButton ref={nextBtnRef} type="button" className="eb-button" onClick={goNext}>
              {isLast ? 'Finish' : 'Next'}
            </EbButton>
          </div>
        </div>
      </div>
    </div>
  )
}
