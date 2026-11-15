import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import mammoth from 'mammoth'
import { JSDOM } from 'jsdom'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    const action = searchParams.get('action')

    if (id) {
      const doc = await prisma.document.findUnique({ where: { id } })
      if (!doc) {
        return NextResponse.json({ error: 'Document not found' }, { status: 404 })
      }
      return NextResponse.json(doc)
    }

    if (action === 'list') {
      const docs = await prisma.document.findMany({
        orderBy: { updatedAt: 'desc' },
        take: 50
      })
      return NextResponse.json(docs)
    }

    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  } catch (err) {
    console.error('[Documents] GET error:', err)
    return NextResponse.json({ error: 'Failed to fetch documents' }, { status: 500 })
  }
}

async function getOpenAiConfig() {
  try {
    const settings = await prisma.settings.findUnique({ where: { id: 'default' } })
    return {
      apiKey: settings?.openaiKey || process.env.OPENAI_API_KEY || '',
      apiBase: settings?.openaiApiBase || process.env.OPENAI_API_BASE || 'https://api.openai.com/v1'
    }
  } catch {
    return {
      apiKey: process.env.OPENAI_API_KEY || '',
      apiBase: process.env.OPENAI_API_BASE || 'https://api.openai.com/v1'
    }
  }
}

export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const action = searchParams.get('action')

    if (action === 'create') {
      const body = await req.json()
      const doc = await prisma.document.create({
        data: {
          title: body.title || '未命名文档',
          content: body.content || '',
          wordCount: body.wordCount || 0,
          ...body.settings
        }
      })
      return NextResponse.json(doc)
    }

    if (action === 'save') {
      const body = await req.json()
      const existingDoc = await prisma.document.findUnique({ where: { id: body.id } })
      if (!existingDoc) {
        return NextResponse.json({ error: 'Document not found' }, { status: 404 })
      }
      const doc = await prisma.document.update({
        where: { id: body.id },
        data: {
          content: body.content,
          wordCount: body.wordCount,
          title: body.title,
          updatedAt: new Date()
        }
      })
      return NextResponse.json(doc)
    }

    if (action === 'ai-assist') {
      const body = await req.json()
      const { action: aiAction, text } = body

      const prompts: Record<string, string> = {
        'continue': `Continue writing the following text naturally. Return only the continuation, no explanation:\n\n${text}`,
        'summarize': `Summarize the following text in 2-3 sentences. Return only the summary:\n\n${text}`,
        'improve': `Improve the writing of the following text. Make it clearer and more professional. Return only the improved text:\n\n${text}`,
        'translate-zh': `Translate the following text to Chinese. Return only the translation:\n\n${text}`,
        'translate-en': `Translate the following text to English. Return only the translation:\n\n${text}`,
        'expand': `Expand the following text with more details and examples. Return only the expanded text:\n\n${text}`,
        'shorten': `Shorten the following text while keeping the main points. Return only the shortened text:\n\n${text}`
      }

      const prompt = prompts[aiAction]
      if (!prompt) {
        return NextResponse.json({ error: 'Unknown AI action' }, { status: 400 })
      }

      const config = await getOpenAiConfig()
      const response = await fetch(`${config.apiBase.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`
        },
        body: JSON.stringify({
          model: 'minimax-minimax-m2.7',
          messages: [
            { role: 'system', content: 'You are a helpful writing assistant. Provide only the requested text without any additional commentary.' },
            { role: 'user', content: prompt }
          ],
          temperature: 0.7,
          max_tokens: 2000
        })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        return NextResponse.json(
          { error: 'AI request failed', details: errorData.error?.message || response.statusText },
          { status: response.status }
        )
      }

      const data = await response.json()
      const result = data.choices?.[0]?.message?.content || ''

      return NextResponse.json({ result })
    }

    if (action === 'export') {
      const body = await req.json()
      const { content, title, format } = body

      if (format === 'html') {
        return new NextResponse(content, {
          headers: {
            'Content-Type': 'text/html',
            'Content-Disposition': `attachment; filename="${title}.html"`
          }
        })
      }

      if (format === 'md') {
        const dom = new JSDOM(content)
        const text = dom.window.document.body.textContent || ''
        return new NextResponse(text, {
          headers: {
            'Content-Type': 'text/markdown',
            'Content-Disposition': `attachment; filename="${title}.md"`
          }
        })
      }

      if (format === 'docx') {
        return new NextResponse(content, {
          headers: {
            'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'Content-Disposition': `attachment; filename="${title}.docx"`
          }
        })
      }

      return NextResponse.json({ error: 'Unsupported format' }, { status: 400 })
    }

    if (action === 'import') {
      const formData = await req.formData()
      const file = formData.get('file') as File

      if (!file) {
        return NextResponse.json({ error: 'No file provided' }, { status: 400 })
      }

      const buffer = Buffer.from(await file.arrayBuffer())
      const ext = file.name.split('.').pop()?.toLowerCase()

      if (ext === 'docx') {
        const result = await mammoth.extractRawText({ buffer })
        return NextResponse.json({ content: result.value })
      }

      if (ext === 'html' || ext === 'htm') {
        return NextResponse.json({ content: buffer.toString('utf-8') })
      }

      if (ext === 'md' || ext === 'txt') {
        return NextResponse.json({ content: buffer.toString('utf-8') })
      }

      return NextResponse.json({ error: 'Unsupported file type' }, { status: 400 })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (err) {
    console.error('[Documents] POST error:', err)
    return NextResponse.json({ error: 'Operation failed', details: (err as Error).message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'Document ID required' }, { status: 400 })
    }

    const existingDoc = await prisma.document.findUnique({ where: { id } })
    if (!existingDoc) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    await prisma.document.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[Documents] DELETE error:', err)
    return NextResponse.json({ error: 'Failed to delete document' }, { status: 500 })
  }
}
