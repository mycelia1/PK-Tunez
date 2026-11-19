/** Windows libuv reports a missing program as exit code -4058. */
export const TUNNEL_MISSING_CODE = -4058

export const TUNNEL_RETRY_LIMIT = 5

export function nextTunnelStep(input: {
  code: number | null
  attempts: number
  missing: boolean
}): 'missing' | 'retry' | 'stop' {
  if (input.missing || input.code === TUNNEL_MISSING_CODE) return 'missing'
  if (input.attempts >= TUNNEL_RETRY_LIMIT) return 'stop'
  return 'retry'
}
