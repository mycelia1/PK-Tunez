import type { QueueItem } from '../../../shared/types'
import { useTheme } from '../theme/ThemeContext'
import { EbButton } from './EbButton'
import { HPMeter } from './HPMeter'
import './PsychicStream.css'

interface PsychicStreamProps {
  items: QueueItem[]
  isBusy: boolean
  onCancel?: () => void
  readOnly?: boolean
  emptyMessage?: string
}

function StatusBadge({ item }: { item: QueueItem }): JSX.Element {
  const { copy, sprites } = useTheme()

  if (item.status === 'downloading') {
    return (
      <span className="psychic-stream__sprite-badge" aria-label="Downloading">
        <img src={sprites.downloading} alt="" className="psychic-stream__sprite psychic-stream__sprite--animated" />
      </span>
    )
  }

  if (item.status === 'completed' || (item.status === 'skipped' && item.message === 'Already in archive')) {
    return (
      <span className="psychic-stream__sprite-badge" aria-label="Completed">
        <img src={sprites.complete} alt="" className="psychic-stream__sprite" />
      </span>
    )
  }

  if (item.status === 'error') {
    return (
      <span className="psychic-stream__sprite-badge" aria-label="Error">
        <img src={sprites.error} alt="" className="psychic-stream__sprite" />
      </span>
    )
  }

  const statusLabel: Record<QueueItem['status'], string> = {
    queued: copy.statusWait,
    downloading: '',
    completed: '',
    skipped: copy.statusOwned,
    error: ''
  }

  return <span className="psychic-stream__status">{statusLabel[item.status]}</span>
}

export function PsychicStream({
  items,
  isBusy,
  onCancel,
  readOnly = false,
  emptyMessage
}: PsychicStreamProps): JSX.Element {
  const { copy, sprites } = useTheme()
  const resolvedEmpty = emptyMessage ?? copy.streamEmpty

  return (
    <section className="psychic-stream eb-panel" aria-label="Download queue">
      <div className="psychic-stream__header">
        {sprites.stream ? (
          <img className="psychic-stream__title-art" src={sprites.stream} alt={copy.streamTitle} />
        ) : (
          <h2 className="eb-title psychic-stream__title">{copy.streamTitle}</h2>
        )}
        {!readOnly && isBusy && onCancel && (
          <EbButton
            type="button"
            className="eb-button eb-button--cancel"
            onClick={onCancel}
            title="Cancel download (Ctrl+C)"
          >
            Cancel
          </EbButton>
        )}
      </div>

      {items.length === 0 ? (
        <p className="psychic-stream__empty">{resolvedEmpty}</p>
      ) : (
        <ul className="psychic-stream__list">
          {items.map((item) => (
            <li key={item.id} className={`psychic-stream__member psychic-stream__member--${item.status}`}>
              <div className="psychic-stream__avatar" aria-hidden="true">
                {item.artist.slice(0, 1).toUpperCase()}
              </div>
              <div className="psychic-stream__info">
                <div className="psychic-stream__row">
                  <strong>{item.title}</strong>
                  <StatusBadge item={item} />
                </div>
                <div className="psychic-stream__artist">{item.artist}</div>
                {item.message && <div className="psychic-stream__message">{item.message}</div>}
                <HPMeter
                  value={item.progress}
                  indeterminate={item.indeterminate && item.status === 'downloading'}
                  label={copy.progressLabel}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
