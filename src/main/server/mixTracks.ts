import type { HistoryEntry, MixTrackRef } from '../../shared/types'
import type { PhoneMix, PhoneMixLibrary } from '../../shared/serverProtocol'

/** Build desktop mix rows from track ids. The file path always comes from history. */
export function mixTracksFromIds(history: HistoryEntry[], trackIds: string[]): MixTrackRef[] {
  const tracks: MixTrackRef[] = []
  for (const trackId of trackIds) {
    const entry = history.find((item) => item.trackId === trackId && item.filePath && !item.missing)
    if (!entry) continue
    tracks.push({
      trackId: entry.trackId,
      title: entry.title,
      artist: entry.artist,
      filePath: entry.filePath
    })
  }
  return tracks
}

export function phoneMixLibrary(
  activeMixId: string,
  mixes: Array<{ id: string; name: string; tracks: MixTrackRef[] }>
): PhoneMixLibrary {
  return {
    activeMixId,
    mixes: mixes.map((mix) => ({
      id: mix.id,
      name: mix.name,
      tracks: mix.tracks.map((track) => ({
        trackId: track.trackId,
        title: track.title,
        artist: track.artist
      }))
    }))
  }
}

export function phoneMixFrom(mix: { id: string; name: string; tracks: MixTrackRef[] }): PhoneMix {
  return phoneMixLibrary(mix.id, [mix]).mixes[0]
}
