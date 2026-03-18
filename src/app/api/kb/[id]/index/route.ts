import { NextResponse } from 'next/server'
import { indexKnowledgeBase } from '@/lib/knowledge'

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const stats = await indexKnowledgeBase(id)
    return NextResponse.json({ success: true, stats })
  } catch (error) {
    console.error('KB INDEX Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to rebuild knowledge base index' },
      { status: 400 }
    )
  }
}
