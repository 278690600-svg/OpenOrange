import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { analyzeData, analyzeTimeSeries, parseData, detectColumnType, computeCorrelations } from '@/lib/data-analysis'
import { generateText } from 'ai'
import { getSmartProvider } from '@/lib/ai-provider'

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

  // Analyze uploaded data
  if (action === 'analyze') {
    try {
      const body = await req.json()
      const { format, content } = body

      let columns: string[]
      let data: Record<string, unknown>[]

      if (content) {
        const parsed = parseData(content, format as 'csv' | 'json')
        columns = parsed.columns
        data = parsed.data
      } else {
        return NextResponse.json({ error: 'No data provided' }, { status: 400 })
      }

      if (data.length === 0) {
        return NextResponse.json({ error: 'No data rows found' }, { status: 400 })
      }

      const analysis = analyzeData(data, columns)

      // Detect time series data
      const dateColumns = analysis.columns.filter(s => s.type === 'datetime').map(s => s.column)
      const numericColumns = analysis.columns.filter(s => s.type === 'numeric').map(s => s.column)

      let timeSeries = analysis.timeSeries
      if (!timeSeries && dateColumns.length > 0 && numericColumns.length > 0) {
        timeSeries = analyzeTimeSeries(data, dateColumns[0], numericColumns.slice(0, 5))
      }

      let correlations = analysis.correlations
      if (!correlations && numericColumns.length >= 2) {
        correlations = computeCorrelations(data, numericColumns)
      }

      return NextResponse.json({
        rowCount: data.length,
        columnCount: columns.length,
        columns: analysis.columns,
        timeSeries,
        correlations,
      })
    } catch (error) {
      console.error('[Analysis] Parse/analyze error:', error)
      return NextResponse.json({ error: 'Failed to analyze data', details: (error as Error).message }, { status: 500 })
    }
  }

  // AI interpretation of analysis results
  if (action === 'interpret') {
    try {
      const body = await req.json()
      const { analysis, dataName, dataSample } = body

      const statsSummary = analysis.columns
        .filter((c: { type: string }) => c.type === 'numeric')
        .map((c: Record<string, unknown>) =>
          `${String(c.column)}: mean=${c.mean}, median=${c.median}, std=${c.stdDev}, min=${c.min}, max=${c.max}`
        )
        .join('\n')

      const correlationSummary = (analysis.correlations || [])
        .slice(0, 5)
        .map((c: Record<string, unknown>) =>
          `${String(c.colA)} <-> ${String(c.colB)}: r=${c.coefficient}`
        )
        .join('\n')

      const trendSummary = (analysis.timeSeries || [])
        .map((t: Record<string, unknown>) =>
          `${String(t.column)}: trend=${t.trend}, growth=${t.growthRate}%`
        )
        .join('\n')

      const prompt = `You are an expert data analyst. Analyze this dataset and provide clear, actionable insights.

Dataset: ${dataName || 'Uploaded Data'}
Rows: ${analysis.rowCount}
Columns: ${analysis.columnCount}

Column Statistics:
${statsSummary}

${correlationSummary ? `Key Correlations:\n${correlationSummary}` : ''}
${trendSummary ? `Time Series Trends:\n${trendSummary}` : ''}

Data Sample (first 10 rows):
${JSON.stringify(dataSample, null, 2)}

Please provide:
1. A brief overview of the dataset
2. Key statistical findings (notable distributions, outliers, ranges)
3. Important patterns or relationships between variables
4. Actionable recommendations or insights

Be concise and specific. Use bullet points. Focus on what matters.`

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
            { role: 'system', content: 'You are a senior data analyst. Provide clear, actionable insights from data analysis results. Be concise and specific.' },
            { role: 'user', content: prompt }
          ],
          temperature: 0.3,
          max_tokens: 1500
        })
      })

      const result = await response.json()
      const interpretation = result.choices?.[0]?.message?.content || 'No interpretation generated'

      return NextResponse.json({ interpretation })
    } catch (error) {
      console.error('[Analysis] AI interpretation error:', error)
      return NextResponse.json({ error: 'AI interpretation failed', details: (error as Error).message }, { status: 500 })
    }
  }

  // AI OCR Correction and Processing
  if (action === 'ocr-correct') {
    try {
      const body = await req.json()
      const { text, option } = body

      if (!text) {
        return NextResponse.json({ error: 'No text provided' }, { status: 400 })
      }

      let systemPrompt = '你是一个高水平的文本处理专家。请根据用户的指令精细化处理文本。务必直接输出处理后的纯文本/Markdown结果，不要包含任何多余的解释、确认或旁白。'
      let userPrompt = ''

      switch (option) {
        case 'markdown':
          userPrompt = `请将以下通过 OCR 识别出的乱序、含有错乱换行和多余空格的文本，整理为结构清晰、排版美化的 Markdown 文档。如果文本中包含表格数据，请转换为标准的 Markdown 表格进行格式化呈现：\n\n${text}`
          break
        case 'translate':
          userPrompt = `请对以下合同或文档内容进行专业翻译。如果原文是中文，请翻译为精确流利的英文（使用涉外法律合同的法言法语）；如果是英文或其它语言，请翻译为流畅的中文。只输出翻译结果：\n\n${text}`
          break
        case 'summary':
          userPrompt = `请对以下 OCR 文本进行核心内容大纲提炼，列出最重要的 3-5 个要点摘要。请以清晰的 Markdown 无序列表符号排版：\n\n${text}`
          break
        case 'correct':
        default:
          userPrompt = `请对以下 OCR 提取的粗糙文本进行段落重组、错别字纠错和符号标点整理。智能理顺换行和空格，保持原文核心意思不变：\n\n${text}`
          break
      }

      const settings = await prisma.settings.findUnique({ where: { id: 'default' } })
      const modelId = settings?.defaultModel || 'ollama::llama3'
      const { provider, resolvedId } = await getSmartProvider(modelId, settings || {})

      const { text: resultText } = await generateText({
        model: provider(resolvedId) as any,
        system: systemPrompt,
        prompt: userPrompt,
        temperature: 0.3,
      })

      return NextResponse.json({ result: resultText })
    } catch (error) {
      console.error('[Analysis] OCR Correction error:', error)
      return NextResponse.json({ error: 'OCR Correction failed', details: (error as Error).message }, { status: 500 })
    }
  }

  // AI Multimodal OCR
  if (action === 'ocr-ai') {
    try {
      const body = await req.json()
      const { image, language } = body

      if (!image) {
        return NextResponse.json({ error: 'No image data provided' }, { status: 400 })
      }

      const match = image.match(/^data:([^;]+);base64,(.+)$/)
      if (!match) {
        return NextResponse.json({ error: 'Invalid image format' }, { status: 400 })
      }
      const mimeType = match[1]
      const base64Data = match[2]

      const settings = await prisma.settings.findUnique({ where: { id: 'default' } })
      const modelId = settings?.defaultModel || 'ollama::llama3'
      const { provider, resolvedId } = await getSmartProvider(modelId, settings || {})

      // Call multimodal AI SDK
      const response = await generateText({
        model: provider(resolvedId) as any,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `你是一个高精度的 OCR 视觉识别与文本分析专家。请仔细识别并提取出图片中的所有文本内容。
要求：
1. 语言：目标文本主要是 ${language || '中文/英文'}，请准确识别。
2. 格式：如果图片中包含表格，请使用标准的 Markdown 表格输出；如果有标题、段落、列表，请使用对应的 Markdown 格式整理输出，以保证完美的排版。
3. 公式：如果有数学/科学公式，请使用 LaTeX 格式输出。
4. 约束：不要输出任何多余的解释、确认、问候语或旁白，直接输出识别出的 Markdown 文本内容。`
              },
              {
                type: 'image',
                image: image
              }
            ]
          }
        ]
      })

      return NextResponse.json({ text: response.text, modelUsed: modelId })
    } catch (error) {
      console.error('[Analysis] AI OCR error:', error)
      
      const errMsg = (error as Error).message || ''
      let userFriendlyError = 'AI OCR 识别失败。'
      
      const isVisionUnsupported = 
        errMsg.toLowerCase().includes('image') || 
        errMsg.toLowerCase().includes('multimodal') || 
        errMsg.toLowerCase().includes('vision') || 
        errMsg.toLowerCase().includes('type: "image"') || 
        errMsg.toLowerCase().includes('support') ||
        errMsg.toLowerCase().includes('model_not_found') ||
        errMsg.toLowerCase().includes('invalid_model')

      if (isVisionUnsupported) {
        userFriendlyError = '当前配置的默认大模型可能不支持图片输入（不支持 Vision/多模态）。请前往“设置 -> 模型管理”将默认模型切换为支持视觉识别的多模态模型（如 gpt-4o, gemini-1.5, Claude 3.5 Sonnet，或本地的 llama3.2-vision/minicpm-v 等）后重试。'
      } else {
        userFriendlyError = `AI OCR 失败：${errMsg}`
      }

      return NextResponse.json({ 
        error: 'AI OCR failed', 
        details: userFriendlyError,
        isVisionUnsupported: isVisionUnsupported
      }, { status: 500 })
    }
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}

// GET /api/dashboards - List dashboards
export async function GET() {
  try {
    const dashboards = await prisma.dashboard.findMany({
      orderBy: { updatedAt: 'desc' }
    })

    return NextResponse.json({
      dashboards: dashboards.map(d => ({
        id: d.id,
        title: d.title,
        dataName: d.dataName,
        widgetCount: JSON.parse(d.widgets).length,
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
      }))
    })
  } catch (error) {
    console.error('[Dashboards] List error:', error)
    return NextResponse.json({ error: 'Failed to list dashboards' }, { status: 500 })
  }
}

// POST /api/dashboards - Create dashboard
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json()
    const { id, title, dataName, columns, data, widgets } = body

    if (id) {
      const dashboard = await prisma.dashboard.update({
        where: { id },
        data: {
          title,
          dataName,
          columns: JSON.stringify(columns),
          data: JSON.stringify(data),
          widgets: JSON.stringify(widgets),
        }
      })
      return NextResponse.json({ dashboard })
    }

    const dashboard = await prisma.dashboard.create({
      data: {
        title: title || 'Untitled Dashboard',
        dataName,
        columns: JSON.stringify(columns || []),
        data: JSON.stringify(data || []),
        widgets: JSON.stringify(widgets || []),
      }
    })

    return NextResponse.json({ dashboard })
  } catch (error) {
    console.error('[Dashboards] Create/Update error:', error)
    return NextResponse.json({ error: 'Failed to save dashboard' }, { status: 500 })
  }
}

// DELETE /api/dashboards?id=X
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'Dashboard ID required' }, { status: 400 })
    }

    await prisma.dashboard.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[Dashboards] Delete error:', error)
    return NextResponse.json({ error: 'Failed to delete dashboard' }, { status: 500 })
  }
}
