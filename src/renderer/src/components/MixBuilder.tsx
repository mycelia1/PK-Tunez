import { useCallback, useEffect, useState, type DragEvent } from 'react'
import type { MixState, MixTrackRef } from '../../../shared/types'
import { EbButton } from './EbButton'
import './MixBuilder.css'

interface MixBuilderProps {
  onStatus: (message: string, variant: 'info' | 'success' | 'error') => void
}

function defaultMix(): MixState {
  return { name: 'My Mix', folderSlug: 'My Mix', tracks: [] }
}

export function MixBuilder({ onStatus }: MixBuilderProps): JSX.Element {
  const [mix, setMix] = useState<MixState>(defaultMix())
  const [dragIndex, setDragIndex] = useState<number | null>(null)

  const refreshMix = useCallback(async () => {
    const loaded = await window.scdl.getMix()
    setMix(loaded ?? defaultMix())
  }, [])

  useEffect(() => {
    void refreshMix()
  }, [refreshMix])

  const persist = async (next: MixState): Promise<void> => {
    const saved = await window.scdl.saveMix(next)
    setMix(saved)
  }

  const handleNameChange = (name: string): void => {
    void persist({ ...mix, name, folderSlug: name })
  }

  const handleNewMix = (): void => {
    void (async () => {
      await window.scdl.clearMix()
      setMix(defaultMix())
      onStatus('Started a new mix.', 'info')
    })()
  }

  const handleRemove = (trackId: string): void => {
    void persist({ ...mix, tracks: mix.tracks.filter((t) => t.trackId !== trackId) })
  }

  const handleLaunch = async (): Promise<void> => {
    const result = await window.scdl.openMixPlaylist()
    if (!result.ok) {
      onStatus(result.error ?? 'Could not open playlist.', 'error')
      return
    }
    onStatus('Opened mix playlist in your default player.', 'success')
  }

  const handleExport = async (): Promise<void> => {
    const result = await window.scdl.exportMix()
    if (!result.ok) {
      onStatus(result.error ?? 'Export failed.', 'error')
      return
    }
    let message = `Exported ${result.copied} track(s) to ${result.exportDir}.`
    if (result.skipped > 0) {
      message += ` Skipped ${result.skipped} missing file(s).`
    }
    onStatus(message, result.skipped > 0 ? 'info' : 'success')
  }

  const onDragStart = (index: number): void => {
    setDragIndex(index)
  }

  const onDragOver = (event: DragEvent, index: number): void => {
    event.preventDefault()
    if (dragIndex === null || dragIndex === index) return
    const tracks = [...mix.tracks]
    const [moved] = tracks.splice(dragIndex, 1)
    tracks.splice(index, 0, moved)
    setDragIndex(index)
    void persist({ ...mix, tracks })
  }

  const onDragEnd = (): void => {
    setDragIndex(null)
  }

  return (
    <section className="mix-builder eb-panel" aria-label="Mix builder">
      <div className="mix-builder__header">
        <h2 className="eb-title mix-builder__title">Mix Lab</h2>
        <EbButton type="button" className="eb-button eb-button--secondary" onClick={handleNewMix}>
          New mix
        </EbButton>
      </div>

      <div className="mix-builder__name-row">
        <label className="mix-builder__label" htmlFor="mix-name">
          Mix name
        </label>
        <input
          id="mix-name"
          className="eb-input mix-builder__name"
          value={mix.name}
          onChange={(e) => handleNameChange(e.target.value)}
          onBlur={(e) => handleNameChange(e.target.value.trim() || 'My Mix')}
        />
      </div>

      {mix.tracks.length === 0 ? (
        <p className="mix-builder__empty">Add tracks from Inventory with “Add to mix”.</p>
      ) : (
        <ol className="mix-builder__list">
          {mix.tracks.map((track: MixTrackRef, index) => (
            <li
              key={track.trackId}
              className="mix-builder__item"
              draggable
              onDragStart={() => onDragStart(index)}
              onDragOver={(e) => onDragOver(e, index)}
              onDragEnd={onDragEnd}
            >
              <span className="mix-builder__drag" aria-hidden="true">
                ⋮⋮
              </span>
              <div className="mix-builder__track">
                <div className="mix-builder__track-title">{track.title}</div>
                <div className="mix-builder__track-artist">{track.artist}</div>
              </div>
              <EbButton
                type="button"
                className="eb-button eb-button--secondary mix-builder__remove"
                onClick={() => handleRemove(track.trackId)}
              >
                Remove
              </EbButton>
            </li>
          ))}
        </ol>
      )}

      <div className="mix-builder__actions">
        <EbButton
          type="button"
          className="eb-button eb-button--secondary"
          disabled={mix.tracks.length === 0}
          onClick={() => void handleLaunch()}
        >
          Launch playlist
        </EbButton>
        <EbButton
          type="button"
          className="eb-button"
          disabled={mix.tracks.length === 0}
          onClick={() => void handleExport()}
        >
          Export mix
        </EbButton>
      </div>
    </section>
  )
}
