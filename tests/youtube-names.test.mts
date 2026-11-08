import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { parseTrackFileName, parseYouTubeFileName } from '../src/shared/trackFileName.ts'
import {
  YOUTUBE_OUTPUT_BASENAME,
  planYouTubeRenames,
  rewriteFilePath,
  sanitizeYtDlpFilePart,
  stripChannelPrefix,
  type CleanupFs
} from '../src/shared/youtubeNames.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

function memoryFs(files: string[]): CleanupFs {
  const set = new Set(files)
  return {
    exists: (filePath) => set.has(filePath),
    names: (dir) =>
      files
        .filter((filePath) => filePath.startsWith(`${dir}/`) || filePath.startsWith(`${dir}\\`))
        .map((filePath) => filePath.slice(dir.length + 1))
        .filter((name) => !name.includes('/') && !name.includes('\\'))
  }
}

test('new YouTube downloads use the title only', () => {
  assert.equal(YOUTUBE_OUTPUT_BASENAME, '%(title)s.%(ext)s')
  const source = readFileSync(join(root, 'src/main/scdl.ts'), 'utf8')
  assert.match(source, /YOUTUBE_OUTPUT_BASENAME/)
  assert.doesNotMatch(source, /%\(uploader\)s - %\(title\)s\.%\(ext\)s/)
})

test('a YouTube file name is the title, even when the title contains a dash', () => {
  const parsed = parseYouTubeFileName('Song Title - Live.m4a')
  assert.equal(parsed.artist, 'Unknown')
  assert.equal(parsed.title, 'Song Title - Live')
})

test('a SoundCloud file name still splits artist and title', () => {
  const parsed = parseTrackFileName('Artist - Song Title.mp3')
  assert.equal(parsed.artist, 'Artist')
  assert.equal(parsed.title, 'Song Title')
})

test('a bare file name uses the stem as the title', () => {
  const parsed = parseTrackFileName('Snowman.m4a')
  assert.equal(parsed.artist, 'Unknown')
  assert.equal(parsed.title, 'Snowman')
})

test('stripChannelPrefix removes the channel and keeps dashes inside the title', () => {
  assert.equal(stripChannelPrefix('Ness - Song - Live.m4a', ['Ness']), 'Song - Live.m4a')
  assert.equal(stripChannelPrefix('Snowman.m4a', ['Ness']), null)
  assert.equal(stripChannelPrefix('Ness - Snowman.m4a', ['Unknown']), null)
})

test('sanitizeYtDlpFilePart matches the characters yt-dlp rewrites', () => {
  assert.equal(sanitizeYtDlpFilePart('Foo: Bar'), 'Foo - Bar')
  assert.equal(sanitizeYtDlpFilePart('A/B'), 'AB')
  assert.equal(sanitizeYtDlpFilePart('Say "hi"'), "Say 'hi'")
  assert.equal(stripChannelPrefix('Foo - Bar - Title.m4a', ['Foo: Bar']), 'Title.m4a')
})

test('planYouTubeRenames ignores SoundCloud and missing files', () => {
  const files = ['C:/music/Ness - Snowman.m4a', 'C:/music/Artist - Tune.mp3']
  const plan = planYouTubeRenames(
    [
      { filePath: 'C:/music/Ness - Snowman.m4a', youtube: true, channelNames: ['Ness'] },
      { filePath: 'C:/music/Artist - Tune.mp3', youtube: false, channelNames: ['Artist'] },
      { filePath: 'C:/music/Gone.m4a', youtube: true, channelNames: ['Ness'] },
      { filePath: 'C:/music/mixes/Ness - Copy.m4a', youtube: true, channelNames: ['Ness'] }
    ],
    memoryFs(files)
  )
  assert.deepEqual(plan.renames, [
    { from: 'C:/music/Ness - Snowman.m4a', to: 'C:/music/Snowman.m4a' }
  ])
  assert.equal(plan.missing, 1)
})

test('planYouTubeRenames adds a number when the title is already taken', () => {
  const files = ['C:/music/Ness - Snowman.m4a', 'C:/music/Snowman.m4a']
  const plan = planYouTubeRenames(
    [{ filePath: 'C:/music/Ness - Snowman.m4a', youtube: true, channelNames: ['Ness'] }],
    memoryFs(files)
  )
  assert.equal(plan.renames[0].to, 'C:/music/Snowman (2).m4a')
})

test('rewriteFilePath updates history and mix paths', () => {
  const renames = [{ from: 'C:/music/Ness - Snowman.m4a', to: 'C:/music/Snowman.m4a' }]
  assert.equal(rewriteFilePath('C:\\music\\Ness - Snowman.m4a', renames), 'C:/music/Snowman.m4a')
  assert.equal(rewriteFilePath('C:/music/Other.m4a', renames), 'C:/music/Other.m4a')
})
