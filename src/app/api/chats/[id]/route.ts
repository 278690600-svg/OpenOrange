import { NextResponse } from 'next/server'
import prisma from '@/lib/db'

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const p = await params;
    const chat = await prisma.chat.findUnique({
      where: { id: p.id },
      include: {
        messages: {
          orderBy: { createdAt: 'asc' }
        }
      }
    })
    if (!chat) {
      return NextResponse.json({ error: "Chat not found" }, { status: 404 })
    }
    const enrichedChat = {
      ...chat,
      messages: chat.messages.map(m => ({
        ...m,
        citations: (() => { try { return JSON.parse(m.citations || '[]') } catch { return [] } })(),
        searchSteps: (() => { try { return JSON.parse(m.searchSteps || '[]') } catch { return [] } })(),
      })),
    }
    return NextResponse.json(enrichedChat)
  } catch (error) {
    console.error("Chat GET Error:", error)
    return NextResponse.json({ error: "Failed to fetch chat" }, { status: 500 })
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const p = await params;
    await prisma.chat.delete({ where: { id: p.id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Chat DELETE Error:", error)
    return NextResponse.json({ error: "Failed to delete chat" }, { status: 500 })
  }
}
