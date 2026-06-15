/// <reference types="vite/client" />

import type { JSX as ReactJSX } from 'react'

declare module '*.wav' {
  const src: string
  export default src
}

declare module '*.png' {
  const src: string
  export default src
}

declare module '*.gif' {
  const src: string
  export default src
}

declare module '*.webp' {
  const src: string
  export default src
}

declare module '*.mp3' {
  const src: string
  export default src
}

declare global {
  namespace JSX {
    type Element = ReactJSX.Element
  }
}

export {}
