import { NextResponse } from 'next/server'
import { listKnowledgeBases, createKnowledgeBase } from '@/lib/knowledge'

export async function GET() {
  try {
    const records = await listKnowledgeBases()
    return NextResponse.json(records)
  } catch (error: unknown) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const record = await createKnowledgeBase(body)
    return NextResponse.json(record)
  } catch (error: unknown) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 })
  }
}
