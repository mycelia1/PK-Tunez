import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

function read(relativePath: string): string {
  return readFileSync(join(root, relativePath), 'utf8')
}

function stepOrder(source: string): Array<{ id: string; target: string }> {
  const blocks = source.split(/\n  \{/).slice(1)
  return blocks.map((block) => {
    const id = block.match(/id: '([^']+)'/)?.[1]
    const target = block.match(/target: '([^']+)'/)?.[1]
    assert.ok(id, 'tutorial step is missing an id')
    assert.ok(target, `tutorial step ${id} is missing a target`)
    return { id, target }
  })
}

test('tutorial spotlights import and scan after the backpack overview', () => {
  const source = read('src/renderer/src/tutorial/steps.ts')
  const steps = stepOrder(source)
  const ids = steps.map((step) => step.id)
  const backpack = ids.indexOf('backpack')
  const importStep = ids.indexOf('import')
  const scan = ids.indexOf('scan')
  const mix = ids.indexOf('mix')

  assert.ok(backpack >= 0)
  assert.equal(importStep, backpack + 1)
  assert.equal(scan, importStep + 1)
  assert.equal(mix, scan + 1)
  assert.equal(steps[importStep].target, 'import')
  assert.equal(steps[scan].target, 'scan')
  assert.match(source, /copies the files into your download folder/)
  assert.match(source, /recognized by their contents and relinked/)
})

test('every tutorial step has a unique id and a target', () => {
  const steps = stepOrder(read('src/renderer/src/tutorial/steps.ts'))
  const ids = steps.map((step) => step.id)
  assert.equal(new Set(ids).size, ids.length)
  assert.ok(steps.length >= 11)
})

test('backpack toolbar exposes the import and scan tour targets', () => {
  const source = read('src/renderer/src/components/Backpack.tsx')
  assert.match(source, /data-tour="import"/)
  assert.match(source, /data-tour="scan"/)
})
