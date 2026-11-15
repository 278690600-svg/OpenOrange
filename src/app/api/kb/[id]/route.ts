import { NextRequest, NextResponse } from 'next/server'
import { deleteKnowledgeBase, getKnowledgeBase, updateKnowledgeBase } from '@/lib/knowledge'

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const kb = await getKnowledgeBase(id)
    if (!kb) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json(kb)
  } catch (error: unknown) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
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
  } catch (error: unknown) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 })
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await req.json()
    const kb = await updateKnowledgeBase(id, { name: body.name, tags: body.tags })
    return NextResponse.json(kb)
  } catch (error: unknown) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 })
  }
}
