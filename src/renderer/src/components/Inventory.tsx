import { useEffect, useMemo, useRef, useState } from 'react'
import type { HistoryEntry } from '../../../shared/types'
import { EbButton } from './EbButton'
import './Inventory.css'

interface InventoryProps {
  items: HistoryEntry[]
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
  return `${item.trackId}-${item.ts}`
}

export function Inventory({ items }: InventoryProps): JSX.Element {
  const [resolvedPaths, setResolvedPaths] = useState<Record<string, { exists: boolean; path: string }>>({})
  const resolvedKeys = useRef<Set<string>>(new Set())
  const [query, setQuery] = useState('')
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

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

  const handlePlay = async (key: string, filePath: string): Promise<void> => {
    const result = await window.scdl.openInDefaultPlayer(filePath)
    if (!result.ok) {
      setResolvedPaths((prev) => ({ ...prev, [key]: { exists: false, path: filePath } }))
    }
  }

  const isSearching = query.trim().length > 0
  const hasMore = filtered.length > displayed.length

  return (
    <section className="inventory eb-panel" aria-label="Download history inventory">
      <h2 className="eb-title inventory__title">Inventory</h2>
      <p className="inventory__hint">Tracks stay listed here even after you move files to a thumb drive.</p>

      {items.length > 0 && (
        <div className="inventory__search">
          <input
            className="eb-input inventory__search-input"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by title, artist, or file name…"
            aria-label="Search inventory"
          />
          <span className="inventory__count">
            {isSearching
              ? `${filtered.length} of ${items.length} tracks`
              : `${items.length} tracks`}
          </span>
        </div>
      )}

      {items.length === 0 ? (
        <p className="inventory__empty">Your inventory is empty. Completed downloads appear here.</p>
      ) : filtered.length === 0 ? (
        <p className="inventory__empty">No tracks match “{query.trim()}”.</p>
      ) : (
        <>
          <ul className="inventory__list">
            {displayed.map((item) => {
              const key = itemKey(item)
              const resolved = resolvedPaths[key]
              const canPlay = resolved?.exists === true

              return (
                <li key={key} className="inventory__item">
                  <div className="inventory__icon" aria-hidden="true">
                    ♪
                  </div>
                  <div className="inventory__body">
                    <div className="inventory__name">{item.title}</div>
                    <div className="inventory__meta">
                      {item.artist} • {formatSize(item.sizeBytes)} • {formatDate(item.ts)}
                    </div>
                  </div>
                  {canPlay && (
                    <EbButton
                      type="button"
                      className="eb-button eb-button--secondary inventory__play"
                      onClick={() => void handlePlay(key, resolved.path)}
                    >
                      Play
                    </EbButton>
                  )}
                </li>
              )
            })}
          </ul>

          {hasMore && (
            <div className="inventory__more">
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
