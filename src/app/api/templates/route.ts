import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const action = searchParams.get('action')

  if (action === 'list-variables') {
    const variables = [
      { name: 'date', description: 'Current date', value: new Date().toISOString().split('T')[0] },
      { name: 'time', description: 'Current time', value: new Date().toLocaleTimeString() },
      { name: 'user', description: 'Current user name', value: 'User' },
      { name: 'language', description: 'UI language', value: 'en' },
      { name: 'model', description: 'Current AI model', value: 'minimax-m2.7' },
      { name: 'workspace', description: 'Current workspace name', value: 'default' }
    ]
    return NextResponse.json({ variables })
  }

  if (action === 'list-templates') {
    const templates = await prisma.conversationTemplate.findMany({
      orderBy: { createdAt: 'desc' }
    })
    return NextResponse.json({ templates })
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const action = searchParams.get('action')
  const body = await req.json()

  if (action === 'create-template') {
    const template = await prisma.conversationTemplate.create({
      data: {
        name: body.name,
        description: body.description,
        systemPrompt: body.systemPrompt,
        category: body.category || 'general',
        variables: JSON.stringify(body.variables || []),
        icon: body.icon || 'MessageSquare'
      }
    })
    return NextResponse.json({ template })
  }

  if (action === 'render-prompt') {
    const { template, variables } = body
    let rendered = template
    
    Object.entries(variables).forEach(([key, value]) => {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g')
      rendered = rendered.replace(regex, String(value))
    })
    
    return NextResponse.json({ rendered })
  }

  if (action === 'create-from-template') {
    const template = await prisma.conversationTemplate.findUnique({
      where: { id: body.templateId }
    })
    
    if (!template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    }

    const variables = JSON.parse(template.variables || '[]')
    const variableValues: Record<string, string> = {}
    
    variables.forEach((v: { name: string }) => {
      variableValues[v.name] = body.variables?.[v.name] || ''
    })

    let systemPrompt = template.systemPrompt
    Object.entries(variableValues).forEach(([key, value]) => {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g')
      systemPrompt = systemPrompt.replace(regex, value)
    })

    return NextResponse.json({
      systemPrompt,
      title: template.name,
      variables: variableValues
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
