import { useEffect, useMemo, useRef, useState } from 'react'
import type { HistoryEntry, MixMembershipSummary, MixState } from '../../../shared/types'
import { useTheme } from '../theme/ThemeContext'
import { EbButton } from './EbButton'
import './Backpack.css'

interface BackpackProps {
  items: HistoryEntry[]
  mixes: MixMembershipSummary[]
  onMixUpdated: () => void
}

const PAGE_SIZE = 100

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString()
}

function formatSize(bytes: number): string {
  if (bytes <= 0) return 'Moved / unknown'
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

export function Backpack({ items, mixes, onMixUpdated }: BackpackProps): JSX.Element {
  const { copy, sprites } = useTheme()
  const [resolvedPaths, setResolvedPaths] = useState<Record<string, { exists: boolean; path: string }>>({})
  const resolvedKeys = useRef<Set<string>>(new Set())
  const [query, setQuery] = useState('')
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [menuKey, setMenuKey] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)

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
  // item, so we never fire thousands of filesystem checks for the full history.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const missing = displayed.filter((item) => !resolvedKeys.current.has(itemKey(item)))
      if (missing.length === 0) return

      const checks = await Promise.all(
        missing.map(async (item) => {
          const key = itemKey(item)
          if (!item.filePath) {
            return [key, { exists: false, path: '' }] as const
          }
          const resolved = await window.scdl.resolveAudioPath(item.filePath, item.trackId)
          return [key, { exists: resolved.exists, path: resolved.resolvedPath }] as const
        })
      )

      if (cancelled) return
      for (const [key] of checks) resolvedKeys.current.add(key)
      setResolvedPaths((prev) => ({ ...prev, ...Object.fromEntries(checks) }))
    })()

    return () => {
      cancelled = true
    }
  }, [displayed])

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
              const inCount = membershipCount(item.trackId)
              const menuOpen = menuKey === key

              return (
                <li key={key} className="backpack__item">
                  <div className="backpack__icon" aria-hidden="true">
                    ♪
                  </div>
                  <div className="backpack__body">
                    <div className="backpack__name">{item.title}</div>
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
