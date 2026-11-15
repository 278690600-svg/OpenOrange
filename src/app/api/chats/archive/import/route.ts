import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json({ error: 'No archive file provided' }, { status: 400 })
    }

    const archiveJson = await file.text()
    
    let archiveData;
    try {
      archiveData = JSON.parse(archiveJson)
    } catch (e) {
      return NextResponse.json({ error: 'Invalid archive JSON format' }, { status: 400 })
    }

    function sanitizeHtml(html: string): string {
      if (!html) return '';
      return html
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
        .replace(/on\w+\s*=\s*(['"])(.*?)\1/gi, '');
    }

    if (archiveData.version !== '1.0') {
      return NextResponse.json({ error: 'Unsupported archive version' }, { status: 400 })
    }

    const restoredChats = []
    const errors = []

    for (const chatData of archiveData.chats) {
      try {
        const existingChat = await prisma.chat.findUnique({
          where: { id: chatData.id }
        })

        if (existingChat) {
          const restoredChat = await prisma.chat.update({
            where: { id: chatData.id },
            data: {
              title: chatData.title,
              messages: {
                deleteMany: {},
                create: chatData.messages.map((msg: any) => ({
                  role: msg.role,
                  content: sanitizeHtml(msg.content),
                  citations: msg.citations || '[]',
                  searchSteps: msg.searchSteps || '[]'
                }))
              }
            },
            include: { messages: true }
          })
          restoredChats.push(restoredChat)
        } else {
          const restoredChat = await prisma.chat.create({
            data: {
              id: chatData.id,
              title: chatData.title,
              createdAt: new Date(chatData.createdAt),
              updatedAt: new Date(chatData.updatedAt),
              messages: {
                create: chatData.messages.map((msg: any) => ({
                  id: msg.id,
                  role: msg.role,
                  content: sanitizeHtml(msg.content),
                  citations: msg.citations || '[]',
                  searchSteps: msg.searchSteps || '[]',
                  createdAt: new Date(msg.createdAt)
                }))
              }
            },
            include: { messages: true }
          })
          restoredChats.push(restoredChat)
        }
      } catch (chatError) {
        errors.push({
          chatId: chatData.id,
          chatTitle: chatData.title,
          error: (chatError as Error).message
        })
      }
    }

    return NextResponse.json({
      success: true,
      restoredCount: restoredChats.length,
      totalChats: archiveData.chats.length,
      errors: errors.length > 0 ? errors : undefined,
      restoredChats: restoredChats.map(chat => ({
        id: chat.id,
        title: chat.title,
        messageCount: chat.messages.length
      }))
    })
  } catch (error) {
    console.error('Chat archive import error:', error)
    return NextResponse.json(
      { error: 'Failed to import chat archive' },
      { status: 500 }
    )
  }
}
