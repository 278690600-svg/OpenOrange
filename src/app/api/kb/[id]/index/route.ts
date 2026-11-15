import { indexKnowledgeBaseStream, indexDatabaseSourceStream, getKnowledgeBase } from '@/lib/knowledge'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  const encoder = new TextEncoder()
  const stream = new TransformStream()
  const writer = stream.writable.getWriter()

  const write = async (data: object) => {
    try {
      await writer.write(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
    } catch { /* stream closed */ }
  }

  // Start indexing in background, stream progress events
  ;(async () => {
    try {
      // Dispatch to appropriate indexer based on sourceType
      const kb = await getKnowledgeBase(id)
      const generator = kb?.sourceType === 'database'
        ? indexDatabaseSourceStream(id)
        : indexKnowledgeBaseStream(id)
      for await (const event of generator) {
        await write(event)
      }
    } catch (err: unknown) {
      await write({ stage: 'error', error: (err as Error).message || 'Unknown error' })
    } finally {
      try { await writer.close() } catch { /* already closed */ }
    }
  })()

  return new Response(stream.readable, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
