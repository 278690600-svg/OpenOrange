import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { chatId, action } = body
    
    if (!chatId) {
      return NextResponse.json(
        { error: 'chatId is required' },
        { status: 400 }
      )
    }
    
    const chat = await prisma.chat.findUnique({
      where: { id: chatId },
      include: { messages: true }
    })
    
    if (!chat) {
      return NextResponse.json(
        { error: 'Chat not found' },
        { status: 404 }
      )
    }
    
    if (!['archive', 'restore'].includes(action)) {
      return NextResponse.json(
        { error: 'Invalid action. Use: archive or restore' },
        { status: 400 }
      )
    }
    
    const updatedChat = await prisma.chat.update({
      where: { id: chatId },
      data: { isArchived: action === 'archive' }
    })
    return NextResponse.json({ success: true, chat: updatedChat })
  } catch (error: unknown) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const archived = searchParams.get('archived')
    
    if (archived === 'true') {
      const archivedChats = await prisma.chat.findMany({
        where: { isArchived: true },
        orderBy: { updatedAt: 'desc' },
        take: 50
      })
      return NextResponse.json({ chats: archivedChats })
    }
    
    return NextResponse.json({ chats: [] })
  } catch (error: unknown) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    )
  }
}
