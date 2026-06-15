import { copyFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const outResources = join(root, 'out', 'resources')

mkdirSync(outResources, { recursive: true })
copyFileSync(join(root, 'resources', 'icon.png'), join(outResources, 'icon.png'))
console.log('Copied resources/icon.png to out/resources/')
