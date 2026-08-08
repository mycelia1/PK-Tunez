import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  HistoryEntry,
  ImportMode,
  LibraryScanProgress,
  MixMembershipSummary,
  MixState
} from '../../../shared/types'
import { useTheme } from '../theme/ThemeContext'
import { EbButton } from './EbButton'
import './Backpack.css'

interface BackpackProps {
  items: HistoryEntry[]
  mixes: MixMembershipSummary[]
  onMixUpdated: () => void
  /** Reload history after an import or scan has changed the library. */
  onLibraryChanged: () => void
}

const PAGE_SIZE = 100

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString()
}

function formatSize(bytes: number): string {
  if (bytes <= 0) return 'Unknown size'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function fileNameOf(filePath: string): string {
  if (!filePath) return ''
  return filePath.split(/[\\/]/).pop() ?? ''
}

function itemKey(item: HistoryEntry): string {
  return `${item.trackId}-${item.ts}-${item.filePath}`
}

function describeProgress(progress: LibraryScanProgress): string {
  if (progress.phase === 'walking') {
    return `Looking for audio files… ${progress.processed} found`
  }
  if (progress.phase === 'copying') {
    return `Copying tracks… ${progress.processed} of ${progress.total}`
  }
  if (progress.phase === 'saving') {
    return 'Updating your backpack…'
  }
  return progress.total > 0
    ? `Checking tracks… ${progress.processed} of ${progress.total}`
    : 'Checking tracks…'
}

function pluralTracks(count: number): string {
  return `${count} track${count === 1 ? '' : 's'}`
}

export function Backpack({
  items,
  mixes,
  onMixUpdated,
  onLibraryChanged
}: BackpackProps): JSX.Element {
  const { copy, sprites } = useTheme()
  const [resolvedPaths, setResolvedPaths] = useState<Record<string, { exists: boolean; path: string }>>({})
  const resolvedKeys = useRef<Set<string>>(new Set())
  const [query, setQuery] = useState('')
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [menuKey, setMenuKey] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const [busy, setBusy] = useState<'import' | 'scan' | null>(null)
  const [progress, setProgress] = useState<LibraryScanProgress | null>(null)
  const [summary, setSummary] = useState<string | null>(null)
  const [importMenuOpen, setImportMenuOpen] = useState(false)
  const importMenuRef = useRef<HTMLDivElement | null>(null)

  // Precompute a lowercase haystack (title + artist + filename) per item so
  // typing any partial substring — e.g. "bem" inside "Passo Bem Solto" — matches.
  const haystacks = useMemo(
    () =>
      items.map((item) =>
        `${item.title} ${item.artist} ${fileNameOf(item.filePath)}`.toLowerCase()
      ),
    [items]
  )

  const filtered = useMemo(() => {
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
    if (terms.length === 0) return items
    return items.filter((_, index) => {
      const haystack = haystacks[index]
      return terms.every((term) => haystack.includes(term))
    })
  }, [items, haystacks, query])

  // Reset pagination whenever the search changes so results start from the top.
  useEffect(() => {
    setVisibleCount(PAGE_SIZE)
  }, [query])

  const displayed = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount])

  // Resolve on-disk paths only for the rows currently visible, and only once per
  // item, in a single round trip so a page never fans out into hundreds of calls.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const pending = displayed.filter((item) => !resolvedKeys.current.has(itemKey(item)))
      if (pending.length === 0) return

      const resolved = await window.scdl.resolveAudioPaths(
        pending.map((item) => ({ filePath: item.filePath, trackId: item.trackId }))
      )
      if (cancelled) return

      const checks = pending.map((item, index) => {
        const result = resolved[index]
        return [
          itemKey(item),
          { exists: result?.exists === true, path: result?.resolvedPath ?? '' }
        ] as const
      })

      for (const [key] of checks) resolvedKeys.current.add(key)
      setResolvedPaths((prev) => ({ ...prev, ...Object.fromEntries(checks) }))
    })()

    return () => {
      cancelled = true
    }
  }, [displayed])

  useEffect(() => {
    return window.scdl.onLibraryProgress((next) => setProgress(next))
  }, [])

  useEffect(() => {
    if (!importMenuOpen) return

    const onPointerDown = (event: MouseEvent): void => {
      if (importMenuRef.current && !importMenuRef.current.contains(event.target as Node)) {
        setImportMenuOpen(false)
      }
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setImportMenuOpen(false)
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [importMenuOpen])

  useEffect(() => {
    if (!menuKey) return

    const onPointerDown = (event: MouseEvent): void => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuKey(null)
      }
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setMenuKey(null)
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [menuKey])

  // Paths and existence may both have changed, so drop the memo and let the
  // visible rows resolve again.
  const forgetResolvedPaths = (): void => {
    resolvedKeys.current.clear()
    setResolvedPaths({})
  }

  const handleImport = async (mode: ImportMode): Promise<void> => {
    setImportMenuOpen(false)
    setBusy('import')
    setSummary(null)
    setProgress(null)

    try {
      const result = await window.scdl.importTracks(mode)
      if (result.cancelled) return

      if (!result.ok) {
        setSummary(result.error ?? 'Import failed.')
        return
      }

      const notes = [`Imported ${pluralTracks(result.added)}`]
      if (result.duplicates > 0) notes.push(`${result.duplicates} already in your backpack`)
      if (result.skippedMixes > 0) notes.push(`${result.skippedMixes} skipped from a mixes folder`)
      if (result.failed > 0) notes.push(`${result.failed} could not be read`)
      setSummary(`${notes.join(' • ')}.`)

      if (result.added > 0) {
        forgetResolvedPaths()
        onLibraryChanged()
      }
    } finally {
      setBusy(null)
      setProgress(null)
    }
  }

  const handleScan = async (): Promise<void> => {
    setBusy('scan')
    setSummary(null)
    setProgress(null)

    try {
      const result = await window.scdl.scanLibrary()
      if (!result.ok) {
        setSummary(result.error ?? 'Scan failed.')
        return
      }

      const notes: string[] = []
      if (result.added > 0) notes.push(`added ${pluralTracks(result.added)}`)
      if (result.relinked > 0) notes.push(`relinked ${pluralTracks(result.relinked)} that had moved`)
      if (result.missing > 0) notes.push(`${pluralTracks(result.missing)} still missing`)
      setSummary(
        notes.length > 0 ? `Scan complete — ${notes.join(', ')}.` : 'Scan complete — nothing new.'
      )

      forgetResolvedPaths()
      onLibraryChanged()
    } finally {
      setBusy(null)
      setProgress(null)
    }
  }

  const handlePlay = async (key: string, filePath: string): Promise<void> => {
    const result = await window.scdl.openInDefaultPlayer(filePath)
    if (!result.ok) {
      setResolvedPaths((prev) => ({ ...prev, [key]: { exists: false, path: filePath } }))
    }
  }

  const membershipCount = (trackId: string): number =>
    mixes.filter((mix) => mix.trackIds.includes(trackId)).length

  const toggleMixMembership = async (
    item: HistoryEntry,
    mixId: string,
    resolvedPath: string,
    shouldInclude: boolean
  ): Promise<void> => {
    const mix = await window.scdl.getMix(mixId)
    if (!mix) return

    const alreadyIn = mix.tracks.some((t) => t.trackId === item.trackId)
    let next: MixState
    if (shouldInclude) {
      if (alreadyIn) return
      next = {
        ...mix,
        tracks: [
          ...mix.tracks,
          {
            trackId: item.trackId,
            title: item.title,
            artist: item.artist,
            filePath: resolvedPath
          }
        ]
      }
    } else {
      if (!alreadyIn) return
      next = {
        ...mix,
        tracks: mix.tracks.filter((t) => t.trackId !== item.trackId)
      }
    }

    await window.scdl.saveMix(next)
    onMixUpdated()
  }

  const isSearching = query.trim().length > 0
  const hasMore = filtered.length > displayed.length

  return (
    <section className="backpack eb-panel" aria-label="Download history" data-tour="backpack">
      {sprites.backpack ? (
        <img className="backpack__title-art" src={sprites.backpack} alt={copy.backpackTitle} />
      ) : (
        <h2 className="eb-title backpack__title">{copy.backpackTitle}</h2>
      )}
      <p className="backpack__hint">{copy.backpackHint}</p>

      <div className="backpack__toolbar">
        <div className="backpack__import-wrap" ref={importMenuRef}>
          <EbButton
            type="button"
            className="eb-button backpack__toolbar-button"
            disabled={busy !== null}
            aria-expanded={importMenuOpen}
            aria-haspopup="menu"
            onClick={() => setImportMenuOpen((open) => !open)}
          >
            {busy === 'import' ? 'Importing…' : 'Import tracks'}
          </EbButton>
          {importMenuOpen && (
            <div className="backpack__import-menu" role="menu">
              <button
                type="button"
                role="menuitem"
                className="backpack__import-option"
                onClick={() => void handleImport('files')}
              >
                Audio files…
              </button>
              <button
                type="button"
                role="menuitem"
                className="backpack__import-option"
                onClick={() => void handleImport('folder')}
              >
                Folder…
              </button>
            </div>
          )}
        </div>
        <EbButton
          type="button"
          className="eb-button eb-button--secondary backpack__toolbar-button"
          disabled={busy !== null}
          onClick={() => void handleScan()}
        >
          {busy === 'scan' ? 'Scanning…' : 'Scan library'}
        </EbButton>
      </div>

      {busy !== null && progress && (
        <p className="backpack__progress" role="status">
          {describeProgress(progress)}
        </p>
      )}

      {busy === null && summary && (
        <p className="backpack__summary" role="status">
          {summary}
        </p>
      )}

      {items.length > 0 && (
        <div className="backpack__search">
          <input
            className="eb-input backpack__search-input"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={copy.backpackSearchPlaceholder}
            aria-label={copy.backpackSearchAria}
          />
          <span className="backpack__count">
            {isSearching
              ? `${filtered.length} of ${items.length} tracks`
              : `${items.length} tracks`}
          </span>
        </div>
      )}

      {items.length === 0 ? (
        <p className="backpack__empty">{copy.backpackEmpty}</p>
      ) : filtered.length === 0 ? (
        <p className="backpack__empty">No tracks match “{query.trim()}”.</p>
      ) : (
        <>
          <ul className="backpack__list">
            {displayed.map((item) => {
              const key = itemKey(item)
              const resolved = resolvedPaths[key]
              const canPlay = resolved?.exists === true
              // Before a row resolves, the flag recorded by the last scan is the
              // best answer available and avoids the badge flickering in.
              const isMissing = resolved ? !resolved.exists : item.missing === true
              const inCount = membershipCount(item.trackId)
              const menuOpen = menuKey === key

              return (
                <li key={key} className="backpack__item">
                  <div className="backpack__icon" aria-hidden="true">
                    ♪
                  </div>
                  <div className="backpack__body">
                    <div className="backpack__name">
                      {item.title}
                      {isMissing && (
                        <span
                          className="backpack__badge"
                          title="This file is not in your download folder. Move it back, or press Scan library if you have reorganized your folders."
                        >
                          Missing
                        </span>
                      )}
                    </div>
                    <div className="backpack__meta">
                      {item.artist} • {formatSize(item.sizeBytes)} • {formatDate(item.ts)}
                    </div>
                  </div>
                  <div className="backpack__actions">
                    {canPlay && (
                      <EbButton
                        type="button"
                        className="eb-button eb-button--secondary backpack__play"
                        onClick={() => void handlePlay(key, resolved.path)}
                      >
                        Play
                      </EbButton>
                    )}
                    {canPlay && (
                      <div className="backpack__mix-wrap" ref={menuOpen ? menuRef : undefined}>
                        <EbButton
                          type="button"
                          className={`eb-button backpack__add-mix${inCount > 0 ? ' eb-button--secondary' : ''}`}
                          aria-expanded={menuOpen}
                          aria-haspopup="dialog"
                          onClick={() => setMenuKey(menuOpen ? null : key)}
                        >
                          {inCount > 0
                            ? `In ${inCount} mix${inCount === 1 ? '' : 'es'}`
                            : 'Add to mix'}
                        </EbButton>
                        {menuOpen && (
                          <div
                            className="backpack__mix-menu"
                            role="dialog"
                            aria-label={`Add ${item.title} to mixes`}
                          >
                            {mixes.length === 0 ? (
                              <p className="backpack__mix-menu-empty">No mixes yet.</p>
                            ) : (
                              <ul className="backpack__mix-menu-list">
                                {mixes.map((mix) => {
                                  const checked = mix.trackIds.includes(item.trackId)
                                  return (
                                    <li key={mix.id} className="backpack__mix-menu-item">
                                      <label className="backpack__mix-menu-label">
                                        <input
                                          type="checkbox"
                                          checked={checked}
                                          onChange={(event) =>
                                            void toggleMixMembership(
                                              item,
                                              mix.id,
                                              resolved.path,
                                              event.target.checked
                                            )
                                          }
                                        />
                                        <span className="backpack__mix-menu-name">{mix.name}</span>
                                      </label>
                                    </li>
                                  )
                                })}
                              </ul>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>

          {hasMore && (
            <div className="backpack__more">
              <EbButton
                type="button"
                className="eb-button eb-button--secondary"
                onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}
              >
                Load more ({filtered.length - displayed.length} remaining)
              </EbButton>
            </div>
          )}
        </>
      )}
    </section>
  )
}
