import './HPMeter.css'

interface HPMeterProps {
  value: number
  indeterminate?: boolean
  label?: string
}

export function HPMeter({ value, indeterminate = false, label = 'HP' }: HPMeterProps): JSX.Element {
  const clamped = Math.max(0, Math.min(100, value))
  const tone = clamped >= 66 ? 'high' : clamped >= 33 ? 'mid' : 'low'

  return (
    <div className="hp-meter" aria-label={`${label} ${indeterminate ? 'charging' : `${clamped} percent`}`}>
      <div className="hp-meter__label">{label}</div>
      <div className={`hp-meter__track hp-meter__track--${tone}`}>
        <div
          className={`hp-meter__fill ${indeterminate ? 'hp-meter__fill--indeterminate' : ''}`}
          style={indeterminate ? undefined : { width: `${clamped}%` }}
        />
      </div>
      <div className="hp-meter__value">{indeterminate ? '...' : `${clamped}%`}</div>
    </div>
  )
}
