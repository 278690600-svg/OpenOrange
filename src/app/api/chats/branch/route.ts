import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'

export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const action = searchParams.get('action')

    if (action === 'fork') {
      const body = await req.json()
      const { chatId, messageId, title } = body as { chatId: string; messageId?: string; title?: string }

      if (!chatId) {
        return NextResponse.json({ error: 'chatId is required' }, { status: 400 })
      }

      const sourceChat = await prisma.chat.findUnique({
        where: { id: chatId },
        include: { messages: { orderBy: { createdAt: 'asc' } } }
      })

      if (!sourceChat) {
        return NextResponse.json({ error: 'Source chat not found' }, { status: 404 })
      }

      let messagesToCopy = sourceChat.messages

      if (messageId) {
        const msgIndex = sourceChat.messages.findIndex(m => m.id === messageId)
        if (msgIndex === -1) {
          return NextResponse.json({ error: 'Message not found in this chat' }, { status: 404 })
        }
        messagesToCopy = sourceChat.messages.slice(0, msgIndex + 1)
      }

      const newTitle = title || `${sourceChat.title} (Branch)`

      const newChat = await prisma.chat.create({
        data: {
          title: newTitle,
          parentId: chatId,
          forkFromMessageId: messageId || null,
          messages: {
            create: messagesToCopy.map(m => ({
              role: m.role,
              content: m.content,
              citations: m.citations,
              searchSteps: m.searchSteps,
              createdAt: m.createdAt
            }))
          }
        },
        include: {
          messages: { orderBy: { createdAt: 'asc' } },
          parent: { select: { id: true, title: true } }
        }
      })

      return NextResponse.json({ success: true, chat: newChat })
    }

    if (action === 'merge') {
      const body = await req.json()
      const { sourceChatId, targetChatId, strategy } = body as { 
        sourceChatId: string
        targetChatId: string
        strategy?: 'append' | 'replace'
      }

      if (!sourceChatId || !targetChatId) {
        return NextResponse.json({ error: 'sourceChatId and targetChatId are required' }, { status: 400 })
      }

      const sourceChat = await prisma.chat.findUnique({
        where: { id: sourceChatId },
        include: { messages: { orderBy: { createdAt: 'asc' } } }
      })

      if (!sourceChat) {
        return NextResponse.json({ error: 'Source chat not found' }, { status: 404 })
      }

      const targetChat = await prisma.chat.findUnique({
        where: { id: targetChatId }
      })

      if (!targetChat) {
        return NextResponse.json({ error: 'Target chat not found' }, { status: 404 })
      }

      if (strategy === 'replace') {
        await prisma.message.deleteMany({ where: { chatId: targetChatId } })
        
        await prisma.message.createMany({
          data: sourceChat.messages.map(m => ({
            chatId: targetChatId,
            role: m.role,
            content: m.content,
            citations: m.citations,
            searchSteps: m.searchSteps
          }))
        })
      } else {
        await prisma.message.createMany({
          data: sourceChat.messages.map(m => ({
            chatId: targetChatId,
            role: m.role,
            content: m.content,
            citations: m.citations,
            searchSteps: m.searchSteps
          }))
        })
      }

      await prisma.chat.delete({ where: { id: sourceChatId } })

      return NextResponse.json({ 
        success: true, 
        mergedChatId: targetChatId,
        message: `Chat merged into "${targetChat.title}" and branch deleted` 
      })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (error) {
    console.error('Chat branch POST error:', error)
    return NextResponse.json({ error: 'Failed to process branch request' }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const chatId = searchParams.get('chatId')

    if (!chatId) {
      return NextResponse.json({ error: 'chatId is required' }, { status: 400 })
    }

    const chat = await prisma.chat.findUnique({
      where: { id: chatId },
      include: {
        branches: {
          include: {
            messages: {
              orderBy: { createdAt: 'asc' },
              take: 1
            },
            _count: { select: { messages: true } }
          }
        },
        parent: {
          select: { id: true, title: true }
        }
      }
    })

    if (!chat) {
      return NextResponse.json({ error: 'Chat not found' }, { status: 404 })
    }

    return NextResponse.json({
      chat: {
        id: chat.id,
        title: chat.title,
        parentId: chat.parentId,
        parent: chat.parent,
        forkFromMessageId: chat.forkFromMessageId
      },
      branches: chat.branches.map(b => ({
        id: b.id,
        title: b.title,
        messageCount: b._count.messages,
        createdAt: b.createdAt,
        firstMessagePreview: b.messages[0]?.content?.substring(0, 100) || ''
      }))
    })
  } catch (error) {
    console.error('Chat branch GET error:', error)
    return NextResponse.json({ error: 'Failed to fetch branches' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const branchId = searchParams.get('branchId')

    if (!branchId) {
      return NextResponse.json({ error: 'branchId is required' }, { status: 400 })
    }

    await prisma.chat.delete({ where: { id: branchId } })

    return NextResponse.json({ success: true, message: 'Branch deleted' })
  } catch (error) {
    console.error('Chat branch DELETE error:', error)
    return NextResponse.json({ error: 'Failed to delete branch' }, { status: 500 })
  }
}
