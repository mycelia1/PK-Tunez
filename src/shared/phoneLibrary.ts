export interface PhoneFileRef {
  trackId: string
  filePath: string
}

/**
 * Apply a file check to the latest list.
 * A track added or replaced while the check ran stays.
 * A track deleted on the phone drops out.
 */
export function mergeRefreshedTracks<T extends PhoneFileRef>(before: T[], refreshed: T[], latest: T[]): T[] {
  const beforeById = new Map(before.map((track) => [track.trackId, track]))
  const refreshedById = new Map(refreshed.map((track) => [track.trackId, track]))
  return latest.flatMap((track) => {
    const original = beforeById.get(track.trackId)
    if (!original || track.filePath !== original.filePath) return [track]
    const moved = refreshedById.get(track.trackId)
    if (!moved) return []
    if (moved.filePath === track.filePath) return [track]
    return [{ ...track, filePath: moved.filePath }]
  })
}
