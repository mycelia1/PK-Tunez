import { startVirtualHome } from './virtualPhone.mjs'

/**
 * MCP server that pretends to be a phone talking to a PK-Tunez home server.
 * Speak JSON-RPC over stdin. One home server stays up for the process.
 */

let home = null

async function getHome() {
  if (!home) home = await startVirtualHome()
  return home
}

const tools = [
  {
    name: 'pair_phone',
    description: 'Pair a virtual phone with the home server and return the token.',
    inputSchema: {
      type: 'object',
      properties: { name: { type: 'string' } }
    }
  },
  {
    name: 'upload_track',
    description: 'Upload one audio file from the virtual phone. The server stores the history row.',
    inputSchema: {
      type: 'object',
      properties: {
        trackId: { type: 'string' },
        title: { type: 'string' },
        artist: { type: 'string' },
        url: { type: 'string' },
        fileName: { type: 'string' }
      },
      required: ['trackId', 'title']
    }
  },
  {
    name: 'search_library',
    description: 'Search the home server library.',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string' } }
    }
  }
]

async function callTool(name, args) {
  const phone = await getHome()
  if (name === 'pair_phone') return phone.pair(args.name || 'Pixel')
  if (name === 'upload_track') {
    return phone.upload(
      {
        trackId: args.trackId,
        title: args.title,
        artist: args.artist || 'Unknown',
        url: args.url || '',
        source: 'youtube',
        fileName: args.fileName || `${args.title}.m4a`
      },
      Buffer.from(`audio-${args.trackId}`, 'utf8')
    )
  }
  if (name === 'search_library') return phone.search(args.query || '')
  throw new Error(`Unknown tool ${name}`)
}

function send(message) {
  const body = Buffer.from(JSON.stringify(message), 'utf8')
  process.stdout.write(`Content-Length: ${body.length}\r\n\r\n`)
  process.stdout.write(body)
}

let buffer = Buffer.alloc(0)
process.stdin.on('data', (chunk) => {
  buffer = Buffer.concat([buffer, chunk])
  while (true) {
    const headerEnd = buffer.indexOf('\r\n\r\n')
    if (headerEnd < 0) return
    const header = buffer.slice(0, headerEnd).toString('utf8')
    const match = header.match(/Content-Length:\s*(\d+)/i)
    if (!match) return
    const length = Number(match[1])
    const start = headerEnd + 4
    if (buffer.length < start + length) return
    const raw = buffer.slice(start, start + length).toString('utf8')
    buffer = buffer.slice(start + length)
    void handle(JSON.parse(raw))
  }
})

async function handle(message) {
  if (message.method === 'initialize') {
    send({
      jsonrpc: '2.0',
      id: message.id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'pk-tunez-phone', version: '1.0.0' }
      }
    })
    return
  }
  if (message.method === 'notifications/initialized') return
  if (message.method === 'tools/list') {
    send({ jsonrpc: '2.0', id: message.id, result: { tools } })
    return
  }
  if (message.method === 'tools/call') {
    try {
      const result = await callTool(message.params.name, message.params.arguments || {})
      send({
        jsonrpc: '2.0',
        id: message.id,
        result: { content: [{ type: 'text', text: JSON.stringify(result) }] }
      })
    } catch (error) {
      send({
        jsonrpc: '2.0',
        id: message.id,
        result: {
          isError: true,
          content: [{ type: 'text', text: error instanceof Error ? error.message : 'Tool failed.' }]
        }
      })
    }
    return
  }
  if (message.id !== undefined) {
    send({ jsonrpc: '2.0', id: message.id, result: {} })
  }
}
