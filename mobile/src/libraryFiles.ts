import { NativeEventEmitter, NativeModules } from 'react-native'
import type { PhoneFileRef } from '../../src/shared/phoneLibrary'
import { pkNative } from './native'

/** Move old private copies into Music/PK-Tunez and drop files the phone deleted. */
export async function refreshPhoneTracks<T extends PhoneFileRef>(tracks: T[]): Promise<T[]> {
  const native = pkNative()
  if (!native?.relocateTracks || tracks.length === 0) return tracks
  const stored = await native.relocateTracks(tracks.map((track) => track.filePath))
  return tracks.flatMap((track, index) => {
    const path = stored[index]
    if (!path) return []
    if (path === track.filePath) return [track]
    return [{ ...track, filePath: path }]
  })
}

/** Fires after Music/PK-Tunez changes, including a delete in Files or a music app. */
export function watchPhoneLibrary(onChange: () => void): () => void {
  const native = NativeModules.PkDownload as { addListener?: unknown } | undefined
  if (!native?.addListener) return () => undefined
  const emitter = new NativeEventEmitter(NativeModules.PkDownload)
  const subscription = emitter.addListener('pkLibraryChanged', onChange)
  return () => subscription.remove()
}
