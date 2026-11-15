import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const action = searchParams.get('action')

  if (!action || action === 'list') {
    const templates = await prisma.conversationTemplate.findMany({
      orderBy: { usageCount: 'desc' }
    })
    return NextResponse.json({ templates })
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const action = searchParams.get('action')
  const body = await req.json()

  if (action === 'create') {
    const template = await prisma.conversationTemplate.create({
      data: {
        name: body.name,
        description: body.description,
        systemPrompt: body.systemPrompt,
        category: body.category || 'general',
        variables: JSON.stringify(body.variables || []),
        icon: body.icon || 'MessageSquare',
        usageCount: 0
      }
    })
    return NextResponse.json({ template })
  }

  if (action === 'create-from-template') {
    const template = await prisma.conversationTemplate.findUnique({
      where: { id: body.templateId }
    })
    
    if (!template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    }

    await prisma.conversationTemplate.update({
      where: { id: template.id },
      data: { usageCount: { increment: 1 } }
    })

    return NextResponse.json({
      redirect: `/?template=${template.id}&title=${encodeURIComponent(template.name)}`,
      template
    })
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')

  if (!id) {
    return NextResponse.json({ error: 'Template ID required' }, { status: 400 })
  }

  await prisma.conversationTemplate.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
