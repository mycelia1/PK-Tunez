/** Pull an http(s) link out of share-sheet text or a pktunez://add?url= handoff. */
export function linkFromShare(raw: string | null | undefined): string | null {
  const text = (raw ?? '').trim()
  if (!text) return null

  if (text.toLowerCase().startsWith('pktunez://')) {
    try {
      const parsed = new URL(text)
      const value = parsed.searchParams.get('url')
      if (value && /^https?:\/\//i.test(value)) return value
    } catch {
      return null
    }
    return null
  }

  const match = text.match(/https?:\/\/[^\s<>"']+/i)
  if (!match) return null
  return match[0].replace(/[).,]+$/g, '')
}
