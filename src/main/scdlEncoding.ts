/** Decode bytes from scdl / yt-dlp stdio (UTF-8 when PYTHONIOENCODING is set; cp1252 fallback on Windows). */
export function decodeScdlOutput(chunk: Buffer): string {
  const utf8 = chunk.toString('utf8')
  if (process.platform !== 'win32' || !utf8.includes('\uFFFD')) {
    return utf8
  }

  try {
    return new TextDecoder('windows-1252').decode(chunk)
  } catch {
    return utf8
  }
}
