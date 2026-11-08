import { NativeModules } from 'react-native'

export interface PkNative {
  musicDir(): Promise<string>
  consumeShare(): Promise<string | null>
  readText(name: string): Promise<string>
  writeText(name: string, text: string): Promise<boolean>
  downloadAudio?(url: string, outputDir: string, playlist: boolean): Promise<string[]>
  downloadToFile(url: string, headers: Record<string, string>, dest: string): Promise<string>
  uploadFile(
    url: string,
    headers: Record<string, string>,
    filePath: string
  ): Promise<{ status: number; body: string }>
}

export function pkNative(): PkNative | null {
  const native = NativeModules.PkDownload as PkNative | undefined
  return native ?? null
}
