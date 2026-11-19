import { NativeModules } from 'react-native'

export interface PkNative {
  deviceName(): Promise<string>
  musicDir(): Promise<string>
  consumeShare(): Promise<string | null>
  readText(name: string): Promise<string>
  writeText(name: string, text: string): Promise<boolean>
  downloadAudio?(
    url: string,
    outputDir: string,
    playlist: boolean
  ): Promise<Array<{ path: string; fileName: string }>>
  /** Keep a track that still exists. A deleted or trashed file returns null. */
  relocateTracks(paths: string[]): Promise<Array<string | null>>
  downloadToFile(url: string, headers: Record<string, string>, dest: string): Promise<string>
  uploadFile(
    url: string,
    headers: Record<string, string>,
    filePath: string
  ): Promise<{ status: number; body: string }>
  openFile(filePath: string): Promise<boolean>
}

export function pkNative(): PkNative | null {
  const native = NativeModules.PkDownload as PkNative | undefined
  return native ?? null
}
