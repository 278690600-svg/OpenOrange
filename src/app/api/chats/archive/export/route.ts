import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { chatIds } = body as { chatIds?: string[] }

    const where = chatIds && chatIds.length > 0
      ? { id: { in: chatIds } }
      : {}

    const chats = await prisma.chat.findMany({
      where,
      include: {
        messages: {
          orderBy: { createdAt: 'asc' }
        }
      },
      orderBy: { updatedAt: 'desc' }
    })

    const archiveData = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      chatCount: chats.length,
      chats: chats.map(chat => ({
        id: chat.id,
        title: chat.title,
        createdAt: chat.createdAt,
        updatedAt: chat.updatedAt,
        messageCount: chat.messages.length,
        messages: chat.messages.map(msg => ({
          id: msg.id,
          role: msg.role,
          content: msg.content,
          createdAt: msg.createdAt,
          citations: msg.citations,
          searchSteps: msg.searchSteps
        }))
      }))
    }

    const archiveJson = JSON.stringify(archiveData, null, 2)
    const archiveBuffer = Buffer.from(archiveJson, 'utf-8')

    return new NextResponse(archiveBuffer, {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="closedui-chats-archive-${Date.now()}.json"`
      }
    })
  } catch (error) {
    console.error('Chat archive export error:', error)
    return NextResponse.json(
      { error: 'Failed to export chat archives' },
      { status: 500 }
    )
  }
}
