import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const kb = await prisma.knowledgeBase.findUnique({
      where: { id },
      include: { chunks: { select: { content: true, keywords: true, sourceUri: true, title: true, chunkIndex: true, metadata: true } } }
    })
    if (!kb) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const exportData = {
      name: kb.name,
      sourceType: kb.sourceType,
      sourceUri: kb.sourceType,
      tags: kb.tags,
      exportedAt: new Date().toISOString(),
      chunkCount: kb.chunks.length,
      chunks: kb.chunks
    }

    return new NextResponse(JSON.stringify(exportData, null, 2), {
      headers: { 'Content-Type': 'application/json', 'Content-Disposition': `attachment; filename="${kb.name}-export.json"` }
    })
  } catch (error: unknown) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}
