import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import * as XLSX from 'xlsx'
import Papa from 'papaparse'

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
  const { searchParams } = new URL(req.url)
  const action = searchParams.get('action')

  if (action === 'export') {
    const body = await req.json()
    const { title, columns, data, format } = body

    if (format === 'json') {
      return new NextResponse(JSON.stringify({ columns, data }, null, 2), {
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="${title}.json"`
        }
      })
    }

    if (format === 'csv') {
      const csv = Papa.unparse(data)
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="${title}.csv"`
        }
      })
    }

    if (format === 'xlsx') {
      const ws = XLSX.utils.json_to_sheet(data)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, title)
      const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
      return new NextResponse(buffer, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${title}.xlsx"`
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

    if (ext === 'xlsx' || ext === 'xls') {
      const wb = XLSX.read(buffer)
      const ws = wb.Sheets[wb.SheetNames[0]]
      const data = XLSX.utils.sheet_to_json(ws)
      const columns = data.length > 0 ? Object.keys(data[0] as Record<string, unknown>) : []
      return NextResponse.json({ columns, data })
    }

    if (ext === 'csv') {
      const text = buffer.toString('utf-8')
      const result = Papa.parse(text, { header: true })
      return NextResponse.json({
        columns: result.meta.fields || [],
        data: result.data
      })
    }

    if (ext === 'json') {
      const text = buffer.toString('utf-8')
      const parsed = JSON.parse(text)
      const data = parsed.data || parsed
      const columns = data.length > 0 ? Object.keys(data[0]) : []
      return NextResponse.json({ columns, data })
    }

    return NextResponse.json({ error: 'Unsupported file type' }, { status: 400 })
  }

  if (action === 'ai-analyze') {
    const body = await req.json()
    const { title, columns, data } = body

    try {
      const prompt = `Analyze the following spreadsheet data and provide insights:

Title: ${title}
Columns: ${columns.join(', ')}
Data Sample (first 20 rows):
${JSON.stringify(data.slice(0, 20), null, 2)}

Provide:
1. Summary statistics (count, averages for numeric columns)
2. Key insights or patterns
3. Recommendations

Keep your analysis concise and actionable.`

      const config = await getOpenAiConfig()
      const response = await fetch(`${config.apiBase.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`
        },
        body: JSON.stringify({
          model: 'deepseek-v4-pro',
          messages: [
            { role: 'system', content: 'You are a data analyst. Analyze spreadsheet data and provide clear, actionable insights.' },
            { role: 'user', content: prompt }
          ],
          temperature: 0.3,
          max_tokens: 1000
        })
      })

      const result = await response.json()
      const analysis = result.choices?.[0]?.message?.content || 'No analysis generated'

      return NextResponse.json({ analysis })
    } catch (err) {
      return NextResponse.json({ error: 'AI analysis failed', details: (err as Error).message }, { status: 500 })
    }
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}
