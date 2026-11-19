import assert from 'node:assert/strict'
import { test } from 'node:test'
import { nextTunnelStep, TUNNEL_MISSING_CODE } from '../src/main/server/tunnelRetry.ts'

test('a missing cloudflared program does not retry', () => {
  assert.equal(nextTunnelStep({ code: TUNNEL_MISSING_CODE, attempts: 0, missing: false }), 'missing')
  assert.equal(nextTunnelStep({ code: 1, attempts: 0, missing: true }), 'missing')
})

test('a stopped tunnel retries until the limit, then stops', () => {
  assert.equal(nextTunnelStep({ code: 1, attempts: 0, missing: false }), 'retry')
  assert.equal(nextTunnelStep({ code: 1, attempts: 4, missing: false }), 'retry')
  assert.equal(nextTunnelStep({ code: 1, attempts: 5, missing: false }), 'stop')
})
