import { NextResponse } from 'next/server'
import { deleteKnowledgeBase, getKnowledgeBase } from '@/lib/knowledge'

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const kb = await getKnowledgeBase(id)
    if (!kb) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(kb)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    await deleteKnowledgeBase(id)
    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }
}
