import { useState } from 'react'
import type { SessionSnapshot } from '../../../shared/types'
import { PartyRoster } from './PartyRoster'
import './SessionLogPanel.css'

interface SessionLogPanelProps {
  sessions: SessionSnapshot[]
  compact?: boolean
}

function truncateUrl(url: string, max = 48): string {
  if (url.length <= max) return url
  return `${url.slice(0, max - 1)}…`
}

function formatWhen(ts: number): string {
  return new Date(ts).toLocaleString()
}

function outcomeLabel(outcome: SessionSnapshot['outcome']): string {
  switch (outcome) {
    case 'cancelled':
      return 'Cancelled'
    case 'failed':
      return 'Failed'
    default:
      return 'Completed'
  }
}

function sessionSummary(session: SessionSnapshot): string {
  const { completed, skipped, error } = session.counts
  const parts: string[] = []
  if (completed > 0) parts.push(`${completed} done`)
  if (skipped > 0) parts.push(`${skipped} skipped`)
  if (error > 0) parts.push(`${error} error`)
  return parts.join(' · ') || 'No tracks'
}

export function SessionLogPanel({ sessions, compact = false }: SessionLogPanelProps): JSX.Element | null {
  const [selectedId, setSelectedId] = useState<string>('')
  const [expanded, setExpanded] = useState(false)

  if (sessions.length === 0) return null

  const selected = sessions.find((s) => s.id === selectedId) ?? sessions[0]

  return (
    <section className={`session-log ${compact ? 'session-log--compact' : ''}`} aria-label="Session log">
      <div className="session-log__row">
        <label className="session-log__label" htmlFor="session-log-select">
          Session Log
        </label>
        <select
          id="session-log-select"
          className="eb-input session-log__select"
          value={selected?.id ?? ''}
          onChange={(e) => {
            setSelectedId(e.target.value)
            setExpanded(false)
          }}
        >
          {sessions.map((session) => (
            <option key={session.id} value={session.id}>
              {truncateUrl(session.request.url)} — {formatWhen(session.endedAt)} — {outcomeLabel(session.outcome)}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="eb-button eb-button--secondary session-log__expand"
          aria-expanded={expanded}
          onClick={() => setExpanded((open) => !open)}
        >
          {expanded ? 'Hide snapshot' : 'View snapshot'}
        </button>
      </div>

      {selected && expanded && (
        <div className="session-log__snapshot eb-panel">
          <div className="session-log__meta">
            <span className={`session-log__badge session-log__badge--${selected.outcome}`}>
              {outcomeLabel(selected.outcome)}
            </span>
            <span className="session-log__meta-line">{sessionSummary(selected)}</span>
            <span className="session-log__meta-line session-log__meta-line--muted">
              {selected.source === 'youtube' ? 'YouTube' : 'SoundCloud'} · {selected.request.mode} ·{' '}
              {formatWhen(selected.startedAt)}
            </span>
            <p className={`session-log__status session-log__status--${selected.statusVariant}`}>
              {selected.statusMessage}
            </p>
          </div>
          <PartyRoster items={selected.queue} isBusy={false} readOnly emptyMessage="No tracks in this session." />
        </div>
      )}
    </section>
  )
}
