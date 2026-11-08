export interface ByteRange {
  start: number
  end: number
}

/**
 * Parse one `Range: bytes=` header.
 * Returns null when the header is absent (send the whole file).
 * Returns `unsatisfiable` when the range cannot be served.
 */
export function parseByteRange(
  header: string | undefined,
  size: number
): ByteRange | 'unsatisfiable' | null {
  if (!header?.trim()) return null
  const match = header.trim().match(/^bytes=(\d*)-(\d*)$/i)
  if (!match || size <= 0) return 'unsatisfiable'

  const startText = match[1]
  const endText = match[2]
  if (startText === '' && endText === '') return 'unsatisfiable'

  if (startText === '') {
    const suffix = Number(endText)
    if (!Number.isInteger(suffix) || suffix <= 0) return 'unsatisfiable'
    const start = Math.max(0, size - suffix)
    return { start, end: size - 1 }
  }

  const start = Number(startText)
  const end = endText === '' ? size - 1 : Number(endText)
  if (!Number.isInteger(start) || !Number.isInteger(end)) return 'unsatisfiable'
  if (start < 0 || start >= size || start > end) return 'unsatisfiable'
  return { start, end: Math.min(end, size - 1) }
}
