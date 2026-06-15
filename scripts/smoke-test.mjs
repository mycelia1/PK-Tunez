/**
 * Lightweight smoke test for SCDL archive dedup behavior.
 * Run: node scripts/smoke-test.mjs
 */
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const testDir = mkdtempSync(join(tmpdir(), 'pk-tunez-smoke-'))
const archive = join(testDir, 'archive.txt')
const url = 'https://soundcloud.com/forss/flickermood'

function runScdl(label) {
  const result = spawnSync(
    'scdl',
    ['-l', url, '--path', testDir, '--download-archive', archive, '-c', '--hide-progress'],
    { encoding: 'utf8', shell: process.platform === 'win32' }
  )
  const output = `${result.stdout}\n${result.stderr}`
  console.log(`\n=== ${label} ===`)
  console.log(output.split('\n').slice(-8).join('\n'))
  return output
}

console.log(`Smoke test dir: ${testDir}`)

const first = runScdl('First download')
if (!existsSync(archive)) {
  console.error('FAIL: archive file was not created')
  process.exit(1)
}

const archiveContents = readFileSync(archive, 'utf8').trim()
console.log(`Archive: ${archiveContents}`)
if (!archiveContents.includes('293')) {
  console.error('FAIL: archive missing track id 293')
  process.exit(1)
}

const second = runScdl('Second download (dedup)')
if (!/already been recorded in the archive/i.test(second)) {
  console.error('FAIL: dedup message not found on second run')
  process.exit(1)
}

console.log('\nPASS: download + archive dedup smoke test succeeded')
