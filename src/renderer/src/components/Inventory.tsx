import { useEffect, useState } from 'react'
import type { HistoryEntry } from '../../../shared/types'
import { EbButton } from './EbButton'
import './Inventory.css'

interface InventoryProps {
  items: HistoryEntry[]
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString()
}

function formatSize(bytes: number): string {
  if (bytes <= 0) return 'Moved / unknown'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function Inventory({ items }: InventoryProps): JSX.Element {
  const [resolvedPaths, setResolvedPaths] = useState<Record<string, { exists: boolean; path: string }>>({})

  useEffect(() => {
    void (async () => {
      const checks = await Promise.all(
        items.map(async (item) => {
          const key = `${item.trackId}-${item.ts}`
          if (!item.filePath) {
            return [key, { exists: false, path: '' }] as const
          }
          const resolved = await window.scdl.resolveAudioPath(item.filePath, item.trackId)
          return [key, { exists: resolved.exists, path: resolved.resolvedPath }] as const
        })
      )
      setResolvedPaths(Object.fromEntries(checks))
    })()
  }, [items])

  const handlePlay = async (key: string, filePath: string): Promise<void> => {
    const result = await window.scdl.openInDefaultPlayer(filePath)
    if (!result.ok) {
      setResolvedPaths((prev) => ({ ...prev, [key]: { exists: false, path: filePath } }))
    }
  }

  return (
    <section className="inventory eb-panel" aria-label="Download history inventory">
      <h2 className="eb-title inventory__title">Inventory</h2>
      <p className="inventory__hint">Tracks stay listed here even after you move files to a thumb drive.</p>

      {items.length === 0 ? (
        <p className="inventory__empty">Your inventory is empty. Completed downloads appear here.</p>
      ) : (
        <ul className="inventory__list">
          {items.slice(0, 100).map((item) => {
            const key = `${item.trackId}-${item.ts}`
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
      )}
    </section>
  )
}
