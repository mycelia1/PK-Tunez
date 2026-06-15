import type { ScdlApi } from '../shared/types'

export {}

declare global {
  interface Window {
    scdl: ScdlApi
  }
}
