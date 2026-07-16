import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react'
import type { MixState, MixTrackRef } from '../../../shared/types'
import {
  INVALID_WINDOWS_FILENAME_CHARS_LABEL,
  isInvalidWindowsFilenameChar,
  stripInvalidWindowsFilenameChars
} from '../../../shared/sources'
import { useTheme } from '../theme/ThemeContext'
import { EbButton } from './EbButton'
import { useEnterKey } from '../utils/useEnterKey'
import './MixBuilder.css'

const INVALID_NAME_HINT = `These characters aren't allowed in mix names: ${INVALID_WINDOWS_FILENAME_CHARS_LABEL}`
const NAME_HINT_MS = 2500

interface MixBuilderProps {
  mixVersion: number
  onStatus: (message: string, variant: 'info' | 'success' | 'error') => void
  onMixUpdated: () => void
}

function defaultMix(): MixState {
  return { name: 'My Mix', folderSlug: 'My Mix', tracks: [] }
}

export function MixBuilder({ mixVersion, onStatus, onMixUpdated }: MixBuilderProps): JSX.Element {
  const { copy } = useTheme()
  const [mix, setMix] = useState<MixState>(defaultMix())
  const [draftName, setDraftName] = useState('My Mix')
  const [expanded, setExpanded] = useState(true)
  const [newMixConfirmOpen, setNewMixConfirmOpen] = useState(false)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [nameHint, setNameHint] = useState<string | null>(null)
  const nameInputFocused = useRef(false)
  const nameHintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showInvalidNameHint = useCallback((): void => {
    setNameHint(INVALID_NAME_HINT)
    if (nameHintTimerRef.current) {
      clearTimeout(nameHintTimerRef.current)
    }
    nameHintTimerRef.current = setTimeout(() => {
      setNameHint(null)
      nameHintTimerRef.current = null
    }, NAME_HINT_MS)
  }, [])

  useEffect(() => {
    return () => {
      if (nameHintTimerRef.current) {
        clearTimeout(nameHintTimerRef.current)
      }
    }
  }, [])

  const refreshMix = useCallback(async () => {
    const loaded = await window.scdl.getMix()
    const next = loaded ?? defaultMix()
    setMix(next)
    if (!nameInputFocused.current) {
      setDraftName(next.name)
    }
  }, [])

  useEffect(() => {
    void refreshMix()
  }, [refreshMix, mixVersion])

  const persist = async (next: MixState): Promise<void> => {
    const saved = await window.scdl.saveMix(next)
    setMix(saved)
    setDraftName(saved.name)
    onMixUpdated()
  }

  const handleDraftNameChange = (raw: string): void => {
    const cleaned = stripInvalidWindowsFilenameChars(raw)
    if (cleaned !== raw) {
      showInvalidNameHint()
    }
    setDraftName(cleaned)
  }

  const commitDraftName = (): void => {
    const trimmed = draftName.trim() || 'My Mix'
    setDraftName(trimmed)
    if (trimmed !== mix.name) {
      void persist({ ...mix, name: trimmed, folderSlug: trimmed })
    }
  }

  const executeNewMix = (): void => {
    void (async () => {
      await window.scdl.clearMix()
      const next = defaultMix()
      setMix(next)
      setDraftName(next.name)
      onMixUpdated()
      onStatus('Started a new mix.', 'info')
    })()
  }

  const handleNewMixRequest = (): void => {
    if (mix.tracks.length > 0) {
      setNewMixConfirmOpen(true)
      return
    }
    executeNewMix()
  }

  const confirmNewMix = (): void => {
    setNewMixConfirmOpen(false)
    executeNewMix()
  }

  useEnterKey(newMixConfirmOpen, confirmNewMix)

  const handleRemove = (trackId: string): void => {
    void persist({ ...mix, tracks: mix.tracks.filter((t) => t.trackId !== trackId) })
  }

  const handleLaunch = async (): Promise<void> => {
    const result = await window.scdl.openMixPlaylist()
    if (!result.ok) {
      onStatus(result.error ?? 'Could not open playlist.', 'error')
      return
    }
    onStatus('Playlist file opened — playback will not start automatically.', 'info')
  }

  const handleExport = async (): Promise<void> => {
    const result = await window.scdl.exportMix()
    if (!result.ok) {
      onStatus(result.error ?? 'Export failed.', 'error')
      return
    }
    if (result.copied === 0) {
      onStatus('No tracks were copied — files may be missing on disk.', 'error')
      return
    }
    let message = `Mix exported! ${result.copied} track(s) copied in mix order (01, 02, …) to: ${result.exportDir}`
    if (result.skipped > 0) {
      message += ` (${result.skipped} skipped — missing on disk)`
    }
    onStatus(message, 'success')
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
    <section
      className={`mix-builder eb-panel ${expanded ? '' : 'mix-builder--collapsed'}`}
      aria-label="Mix builder"
    >
      <div className="mix-builder__header">
        <h2 className="eb-title mix-builder__title">{copy.mixLabTitle}</h2>
        <div className="mix-builder__header-actions">
          <EbButton
            type="button"
            className={`eb-button mix-builder__toggle${expanded ? '' : ' eb-button--secondary'}`}
            aria-expanded={expanded}
            onClick={() => setExpanded((open) => !open)}
          >
            {expanded ? 'Hide' : 'Show'}
          </EbButton>
          {expanded ? (
            <EbButton type="button" className="eb-button eb-button--secondary" onClick={handleNewMixRequest}>
              New mix
            </EbButton>
          ) : null}
        </div>
      </div>

      {!expanded ? (
        <p className="mix-builder__summary">
          {mix.tracks.length === 0
            ? `No tracks yet · ${mix.name}`
            : `${mix.tracks.length} track${mix.tracks.length === 1 ? '' : 's'} · ${mix.name}`}
        </p>
      ) : (
        <>
          <div className="mix-builder__name-row">
        <label className="mix-builder__label" htmlFor="mix-name">
          Mix name
        </label>
        <input
          id="mix-name"
          className="eb-input mix-builder__name"
          value={draftName}
          onChange={(e) => handleDraftNameChange(e.target.value)}
          onFocus={() => {
            nameInputFocused.current = true
          }}
          onBlur={() => {
            nameInputFocused.current = false
            commitDraftName()
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.currentTarget.blur()
              return
            }
            if (isInvalidWindowsFilenameChar(e.key)) {
              e.preventDefault()
              showInvalidNameHint()
            }
          }}
        />
        {nameHint ? (
          <div className="mix-builder__name-hint" role="alert" aria-live="assertive">
            {nameHint}
          </div>
        ) : null}
      </div>

      {mix.tracks.length === 0 ? (
        <p className="mix-builder__empty">Add tracks from Backpack with “Add to mix”.</p>
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
        </>
      )}

      {newMixConfirmOpen ? (
        <div
          className="mix-builder-confirm__backdrop"
          role="presentation"
          onClick={() => setNewMixConfirmOpen(false)}
        >
          <div
            className="mix-builder-confirm eb-panel"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="mix-builder-confirm-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 id="mix-builder-confirm-title" className="eb-title mix-builder-confirm__title">
              Start a new mix?
            </h3>
            <p className="mix-builder-confirm__text">
              This will clear {mix.tracks.length} track{mix.tracks.length === 1 ? '' : 's'} from “{mix.name}”.
              Your current mix is not saved anywhere else — this can’t be undone.
            </p>
            <div className="mix-builder-confirm__actions">
              <EbButton
                type="button"
                className="eb-button eb-button--secondary"
                onClick={() => setNewMixConfirmOpen(false)}
              >
                Keep current mix
              </EbButton>
              <EbButton type="button" className="eb-button eb-button--danger" onClick={confirmNewMix}>
                Start new mix
              </EbButton>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
