import { NextResponse } from 'next/server'
import prisma from '@/lib/db'

export async function GET() {
  try {
    const chats = await prisma.chat.findMany({
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        title: true,
        updatedAt: true,
      }
    })
    return NextResponse.json(chats)
  } catch (error) {
    console.error("Chats GET Error:", error)
    return NextResponse.json({ error: "Failed to fetch chats" }, { status: 500 })
  }
}
