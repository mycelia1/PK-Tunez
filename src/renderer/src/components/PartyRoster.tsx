import type { QueueItem } from '../../../shared/types'
import nessWalkingUrl from '@assets/images/sprites/nesswalking.gif'
import nessPeaceUrl from '@assets/images/sprites/nesspeacesign.webp'
import evilMushroomUrl from '@assets/images/sprites/struttinevilmushroom1.webp'
import { EbButton } from './EbButton'
import { HPMeter } from './HPMeter'
import './PartyRoster.css'

interface PartyRosterProps {
  items: QueueItem[]
  isBusy: boolean
  onCancel?: () => void
  readOnly?: boolean
  emptyMessage?: string
}

const statusLabel: Record<QueueItem['status'], string> = {
  queued: 'WAIT',
  downloading: '',
  completed: '',
  skipped: 'OWNED',
  error: ''
}

function StatusBadge({ item }: { item: QueueItem }): JSX.Element {
  if (item.status === 'downloading') {
    return (
      <span className="party-roster__sprite-badge" aria-label="Downloading">
        <img src={nessWalkingUrl} alt="" className="party-roster__sprite party-roster__sprite--animated" />
      </span>
    )
  }

  if (item.status === 'completed' || (item.status === 'skipped' && item.message === 'Already in archive')) {
    return (
      <span className="party-roster__sprite-badge" aria-label="Completed">
        <img src={nessPeaceUrl} alt="" className="party-roster__sprite" />
      </span>
    )
  }

  if (item.status === 'error') {
    return (
      <span className="party-roster__sprite-badge" aria-label="Error">
        <img src={evilMushroomUrl} alt="" className="party-roster__sprite" />
      </span>
    )
  }

  return <span className="party-roster__status">{statusLabel[item.status]}</span>
}

export function PartyRoster({
  items,
  isBusy,
  onCancel,
  readOnly = false,
  emptyMessage = 'No tracks in queue. Enter a psychic signal to begin.'
}: PartyRosterProps): JSX.Element {
  return (
    <section className="party-roster eb-panel" aria-label="Download queue party roster">
      <div className="party-roster__header">
        <h2 className="eb-title party-roster__title">Party Roster</h2>
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
        <p className="party-roster__empty">{emptyMessage}</p>
      ) : (
        <ul className="party-roster__list">
          {items.map((item) => (
            <li key={item.id} className={`party-roster__member party-roster__member--${item.status}`}>
              <div className="party-roster__avatar" aria-hidden="true">
                {item.artist.slice(0, 1).toUpperCase()}
              </div>
              <div className="party-roster__info">
                <div className="party-roster__row">
                  <strong>{item.title}</strong>
                  <StatusBadge item={item} />
                </div>
                <div className="party-roster__artist">{item.artist}</div>
                {item.message && <div className="party-roster__message">{item.message}</div>}
                <HPMeter
                  value={item.progress}
                  indeterminate={item.indeterminate && item.status === 'downloading'}
                  label="ACT"
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
