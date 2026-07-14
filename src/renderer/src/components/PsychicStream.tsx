import type { QueueItem } from '../../../shared/types'

import nessWalkingUrl from '@assets/images/sprites/nesswalking.gif'

import nessPeaceUrl from '@assets/images/sprites/nesspeacesign.webp'

import evilMushroomUrl from '@assets/images/sprites/struttinevilmushroom1.webp'

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

      <span className="psychic-stream__sprite-badge" aria-label="Downloading">

        <img src={nessWalkingUrl} alt="" className="psychic-stream__sprite psychic-stream__sprite--animated" />

      </span>

    )

  }



  if (item.status === 'completed' || (item.status === 'skipped' && item.message === 'Already in archive')) {

    return (

      <span className="psychic-stream__sprite-badge" aria-label="Completed">

        <img src={nessPeaceUrl} alt="" className="psychic-stream__sprite" />

      </span>

    )

  }



  if (item.status === 'error') {

    return (

      <span className="psychic-stream__sprite-badge" aria-label="Error">

        <img src={evilMushroomUrl} alt="" className="psychic-stream__sprite" />

      </span>

    )

  }



  return <span className="psychic-stream__status">{statusLabel[item.status]}</span>

}



export function PsychicStream({

  items,

  isBusy,

  onCancel,

  readOnly = false,

  emptyMessage = 'No tracks in queue. Enter a psychic signal to begin.'

}: PsychicStreamProps): JSX.Element {

  return (

    <section className="psychic-stream eb-panel" aria-label="Download queue psychic stream">

      <div className="psychic-stream__header">

        <h2 className="eb-title psychic-stream__title">Psychic Stream</h2>

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

        <p className="psychic-stream__empty">{emptyMessage}</p>

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


