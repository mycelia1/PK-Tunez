import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react'
import type { MixLibrary, MixState, MixTrackRef } from '../../../shared/types'
import {
  INVALID_FILENAME_CHARS_LABEL,
  isInvalidFilenameChar,
  stripInvalidFilenameChars
} from '../../../shared/sources'
import { useTheme } from '../theme/ThemeContext'
import { EbButton } from './EbButton'
import { useEnterKey } from '../utils/useEnterKey'
import './MixBuilder.css'

const INVALID_NAME_HINT = `These characters aren't allowed in mix names: ${INVALID_FILENAME_CHARS_LABEL}`
const NAME_HINT_MS = 2500

interface MixBuilderProps {
  mixVersion: number
  onStatus: (message: string, variant: 'info' | 'success' | 'error') => void
  onMixUpdated: () => void
}

function emptyPlaceholderMix(): MixState {
  return { id: '', name: 'My Mix', folderSlug: 'My Mix', tracks: [] }
}

function activeFromLibrary(library: MixLibrary): MixState {
  return library.mixes.find((m) => m.id === library.activeMixId) ?? library.mixes[0] ?? emptyPlaceholderMix()
}

export function MixBuilder({ mixVersion, onStatus, onMixUpdated }: MixBuilderProps): JSX.Element {
  const { copy, sprites } = useTheme()
  const [library, setLibrary] = useState<MixLibrary | null>(null)
  const [mix, setMix] = useState<MixState>(emptyPlaceholderMix())
  const [draftName, setDraftName] = useState('My Mix')
  const [expanded, setExpanded] = useState(true)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
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

  const applyLibrary = useCallback(
    (next: MixLibrary): void => {
      setLibrary(next)
      const active = activeFromLibrary(next)
      setMix(active)
      if (!nameInputFocused.current) {
        setDraftName(active.name)
      }
    },
    []
  )

  const refreshMix = useCallback(async () => {
    const loaded = await window.scdl.getMixes()
    applyLibrary(loaded)
  }, [applyLibrary])

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
    const cleaned = stripInvalidFilenameChars(raw)
    if (cleaned !== raw) {
      showInvalidNameHint()
    }
    setDraftName(cleaned)
  }

  const commitDraftName = (): void => {
    if (!mix.id) return
    const trimmed = draftName.trim() || 'My Mix'
    setDraftName(trimmed)
    if (trimmed !== mix.name) {
      void persist({ ...mix, name: trimmed, folderSlug: trimmed })
    }
  }

  const handleSelectMix = (mixId: string): void => {
    if (mixId === mix.id) return
    void (async () => {
      const next = await window.scdl.setActiveMix(mixId)
      applyLibrary(next)
      onMixUpdated()
    })()
  }

  const handleCreateMix = (): void => {
    void (async () => {
      const next = await window.scdl.createMix()
      applyLibrary(next)
      onMixUpdated()
      onStatus('Started a new mix.', 'info')
    })()
  }

  const confirmDeleteMix = (): void => {
    setDeleteConfirmOpen(false)
    if (!mix.id) return
    void (async () => {
      const deletedName = mix.name
      const next = await window.scdl.deleteMix(mix.id)
      applyLibrary(next)
      onMixUpdated()
      onStatus(`Deleted mix “${deletedName}”.`, 'info')
    })()
  }

  useEnterKey(deleteConfirmOpen, confirmDeleteMix)

  const handleRemove = (trackId: string): void => {
    void persist({ ...mix, tracks: mix.tracks.filter((t) => t.trackId !== trackId) })
  }

  const handleLaunch = async (): Promise<void> => {
    const result = await window.scdl.openMixPlaylist(mix.id || undefined)
    if (!result.ok) {
      onStatus(result.error ?? 'Could not open playlist.', 'error')
      return
    }
    onStatus('Playlist file opened — playback will not start automatically.', 'info')
  }

  const handleExport = async (): Promise<void> => {
    const result = await window.scdl.exportMix(mix.id || undefined)
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

  const mixes = library?.mixes ?? []
  const canDelete = mixes.length > 1

  return (
    <section
      className={`mix-builder eb-panel ${expanded ? '' : 'mix-builder--collapsed'}`}
      aria-label="Mix builder"
      data-tour="mix"
    >
      <div className="mix-builder__header">
        {sprites.mixLab ? (
          <img className="mix-builder__title-art" src={sprites.mixLab} alt={copy.mixLabTitle} />
        ) : (
          <h2 className="eb-title mix-builder__title">{copy.mixLabTitle}</h2>
        )}
        <div className="mix-builder__header-actions">
          <EbButton
            type="button"
            className={`eb-button mix-builder__toggle${expanded ? '' : ' eb-button--secondary'}`}
            aria-expanded={expanded}
            onClick={() => setExpanded((open) => !open)}
          >
            {expanded ? 'Hide' : 'Show'}
          </EbButton>
        </div>
      </div>

      {!expanded ? (
        <p className="mix-builder__summary">
          {mix.tracks.length === 0
            ? `No tracks yet · ${mix.name}`
            : `${mix.tracks.length} track${mix.tracks.length === 1 ? '' : 's'} · ${mix.name}`}
          {mixes.length > 1 ? ` · ${mixes.length} mixes` : ''}
        </p>
      ) : (
        <>
          <div className="mix-builder__tabs" role="tablist" aria-label="Mixes">
            {mixes.map((entry) => (
              <button
                key={entry.id}
                type="button"
                role="tab"
                aria-selected={entry.id === mix.id}
                className={`mix-builder__tab${entry.id === mix.id ? ' mix-builder__tab--active' : ''}`}
                onClick={() => handleSelectMix(entry.id)}
                title={entry.name}
              >
                <span className="mix-builder__tab-label">{entry.name}</span>
                <span className="mix-builder__tab-count">{entry.tracks.length}</span>
              </button>
            ))}
            <EbButton
              type="button"
              className="eb-button eb-button--secondary mix-builder__tab-add"
              onClick={handleCreateMix}
              aria-label="Create new mix"
              title="Create new mix"
            >
              +
            </EbButton>
          </div>

          <div className="mix-builder__name-row">
            <label className="mix-builder__label" htmlFor="mix-name">
              Mix name
            </label>
            <div className="mix-builder__name-controls">
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
                  if (isInvalidFilenameChar(e.key)) {
                    e.preventDefault()
                    showInvalidNameHint()
                  }
                }}
              />
              <EbButton
                type="button"
                className="eb-button eb-button--secondary mix-builder__delete"
                disabled={!canDelete}
                title={canDelete ? 'Delete this mix' : 'Keep at least one mix'}
                onClick={() => setDeleteConfirmOpen(true)}
              >
                Delete
              </EbButton>
            </div>
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

      {deleteConfirmOpen ? (
        <div
          className="mix-builder-confirm__backdrop"
          role="presentation"
          onClick={() => setDeleteConfirmOpen(false)}
        >
          <div
            className="mix-builder-confirm eb-panel"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="mix-builder-confirm-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 id="mix-builder-confirm-title" className="eb-title mix-builder-confirm__title">
              Delete this mix?
            </h3>
            <p className="mix-builder-confirm__text">
              This will permanently remove “{mix.name}”
              {mix.tracks.length > 0
                ? ` and its ${mix.tracks.length} track${mix.tracks.length === 1 ? '' : 's'}`
                : ''}
              . Other mixes are kept. This can’t be undone.
            </p>
            <div className="mix-builder-confirm__actions">
              <EbButton
                type="button"
                className="eb-button eb-button--secondary"
                onClick={() => setDeleteConfirmOpen(false)}
              >
                Keep mix
              </EbButton>
              <EbButton type="button" className="eb-button eb-button--danger" onClick={confirmDeleteMix}>
                Delete mix
              </EbButton>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  )
}
