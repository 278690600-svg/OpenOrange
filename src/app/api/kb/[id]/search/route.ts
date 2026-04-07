import { NextRequest, NextResponse } from 'next/server'
import { buildKnowledgeContext, getKnowledgeBase } from '@/lib/knowledge'

/**
 * POST /api/kb/[id]/search
 * Search within a specific knowledge base and return ranked results with highlights.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await req.json()
  const query = body.query as string
  const limit = Number(body.limit) || 10

  if (!query || !query.trim()) {
    return NextResponse.json({ error: 'Query is required' }, { status: 400 })
  }

  const kb = await getKnowledgeBase(id)
  if (!kb) {
    return NextResponse.json({ error: 'Knowledge base not found' }, { status: 404 })
  }

  if (kb.status !== 'ready') {
    return NextResponse.json({ error: 'Knowledge base is not indexed yet', status: kb.status }, { status: 409 })
  }

  try {
    const result = await buildKnowledgeContext(id, query)
    if (!result) {
      return NextResponse.json({ results: [], total: 0 })
    }

    // Return structured results for the search UI panel
    const results = result.chunks.slice(0, limit).map((chunk: any, idx: number) => ({
      rank: idx + 1,
      title: chunk.title,
      content: chunk.content,
      sourceUri: chunk.sourceUri,
      score: Math.round((chunk.score || 0) * 100) / 100,
      snippet: generateSnippet(chunk.content, query, 200),
    }))

    return NextResponse.json({ 
      results,
      total: result.chunks.length,
      query,
      kbName: kb.name,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

/**
 * Generate a centered snippet around the first match with ellipsis.
 */
function generateSnippet(content: string, query: string, maxLen: number): string {
  const lower = content.toLowerCase()
  const queryLower = query.toLowerCase().split(/\s+/)[0] // Use first word
  const matchIdx = lower.indexOf(queryLower)
  
  if (matchIdx === -1) {
    return content.slice(0, maxLen) + (content.length > maxLen ? '...' : '')
  }
  
  const start = Math.max(0, matchIdx - 80)
  const end = Math.min(content.length, matchIdx + maxLen - 80)
  const snippet = content.slice(start, end)
  
  return (start > 0 ? '...' : '') + snippet + (end < content.length ? '...' : '')
}
