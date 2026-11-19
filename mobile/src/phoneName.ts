import { pkNative } from './native'

/** Name sent at pairing. A blocked settings read must not stop pairing. */
export async function readPhoneName(): Promise<string> {
  try {
    const name = (await pkNative()?.deviceName())?.trim() ?? ''
    return name || 'Phone'
  } catch {
    return 'Phone'
  }
}
