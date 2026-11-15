import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const category = searchParams.get('category')
  const key = searchParams.get('key')
  const limit = parseInt(searchParams.get('limit') || '50')

  try {
    if (key && category) {
      const memory = await prisma.agentMemory.findUnique({
        where: { category_key: { category, key } }
      })
      return NextResponse.json(memory)
    }

    if (category) {
      const memories = await prisma.agentMemory.findMany({
        where: { category },
        orderBy: { updatedAt: 'desc' },
        take: limit
      })
      return NextResponse.json(memories)
    }

    const memories = await prisma.agentMemory.findMany({
      orderBy: { updatedAt: 'desc' },
      take: limit
    })
    return NextResponse.json(memories)
  } catch (error) {
    console.error('Memory GET error:', error)
    return NextResponse.json({ error: 'Failed to fetch memories' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { category, key, value, confidence = 1.0, source = 'inference', chatId, expiresAt } = body

    if (!category || !key || value === undefined) {
      return NextResponse.json({ error: 'Category, key, and value are required' }, { status: 400 })
    }

    const existing = await prisma.agentMemory.findUnique({
      where: { category_key: { category, key } }
    })

    if (existing) {
      const updated = await prisma.agentMemory.update({
        where: { category_key: { category, key } },
        data: {
          value: JSON.stringify(value),
          confidence,
          updatedAt: new Date(),
          expiresAt: expiresAt ? new Date(expiresAt) : undefined
        }
      })
      return NextResponse.json(updated)
    }

    const created = await prisma.agentMemory.create({
      data: {
        category,
        key,
        value: JSON.stringify(value),
        confidence,
        source,
        chatId: chatId || null,
        expiresAt: expiresAt ? new Date(expiresAt) : undefined
      }
    })
    return NextResponse.json(created)
  } catch (error) {
    console.error('Memory POST error:', error)
    return NextResponse.json({ error: 'Failed to create memory' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const category = searchParams.get('category')
    const key = searchParams.get('key')

    if (category && key) {
      await prisma.agentMemory.delete({
        where: { category_key: { category, key } }
      })
      return NextResponse.json({ success: true })
    }

    await prisma.agentMemory.deleteMany({})
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Memory DELETE error:', error)
    return NextResponse.json({ error: 'Failed to delete memory' }, { status: 500 })
  }
}
