import { NextRequest, NextResponse } from 'next/server'
import mammoth from 'mammoth'
import * as XLSX from 'xlsx'
import pptxgen from 'pptxgenjs'
import { JSDOM } from 'jsdom'
import { asBlob } from 'html-docx-js-typescript'

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File
    const targetFormat = formData.get('targetFormat') as string

    if (!file || !targetFormat) {
      return NextResponse.json({ error: 'File and target format required' }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const ext = file.name.split('.').pop()?.toLowerCase()
    const title = file.name.replace(/\.[^/.]+$/, '')
    const encodedTitle = encodeURIComponent(title)

    // Convert to HTML first as intermediate format
    let htmlContent = ''
    let textContent = ''

    if (ext === 'docx') {
      const htmlResult = await mammoth.convertToHtml({ buffer })
      htmlContent = htmlResult.value
      const textResult = await mammoth.extractRawText({ buffer })
      textContent = textResult.value
    } else if (ext === 'xlsx' || ext === 'xls') {
      const wb = XLSX.read(buffer)
      const ws = wb.Sheets[wb.SheetNames[0]]
      htmlContent = XLSX.utils.sheet_to_html(ws)
      textContent = XLSX.utils.sheet_to_csv(ws)
    } else if (ext === 'pptx') {
      textContent = 'PPTX content extraction requires additional library'
      htmlContent = `<html><body><h1>${title}</h1><p>Presentation content</p></body></html>`
    } else if (ext === 'html' || ext === 'htm') {
      htmlContent = buffer.toString('utf-8')
      const dom = new JSDOM(htmlContent)
      textContent = dom.window.document.body.textContent || ''
    } else if (ext === 'md' || ext === 'txt') {
      textContent = buffer.toString('utf-8')
      htmlContent = `<html><body>${textContent.split('\n').map(p => `<p>${p}</p>`).join('')}</body></html>`
    } else {
      return NextResponse.json({ error: 'Unsupported file type' }, { status: 400 })
    }

    // Convert from HTML/text to target format
    if (targetFormat === 'docx') {
      const docxBlob = await asBlob(htmlContent) as any
      const docxBuffer = Buffer.isBuffer(docxBlob) ? docxBlob : Buffer.from(await (docxBlob as Blob).arrayBuffer())
      return new NextResponse(docxBuffer as any, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'Content-Disposition': `attachment; filename*=UTF-8''${encodedTitle}.docx`
        }
      })
    }

    if (targetFormat === 'xlsx') {
      const wb = XLSX.utils.book_new()
      const ws = XLSX.utils.aoa_to_sheet([textContent.split('\n').map(row => row.split(','))])
      XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
      const xlsxBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
      return new NextResponse(xlsxBuffer, {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename*=UTF-8''${encodedTitle}.xlsx`
        }
      })
    }

    if (targetFormat === 'pdf') {
      let bodyContent = htmlContent
      if (htmlContent.includes('<body')) {
        const match = htmlContent.match(/<body[^>]*>([\s\S]*)<\/body>/i)
        if (match) bodyContent = match[1]
      }

      const styledHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${title}</title>
  <style>
    @media print {
      body {
        padding: 0 !important;
        margin: 1.6cm 1.4cm !important;
        font-size: 11.5pt !important;
      }
      .page-break { page-break-after: always; }
      pre { page-break-inside: avoid; }
      tr { page-break-inside: avoid; }
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, "PingFang SC", "Microsoft YaHei", sans-serif;
      color: #1f2937;
      line-height: 1.75;
      max-width: 800px;
      margin: 0 auto;
      padding: 40px 24px;
      background-color: #ffffff;
    }
    h1 {
      font-size: 2.25rem;
      font-weight: 700;
      color: #111827;
      margin-bottom: 2rem;
      border-bottom: 2px solid #f3f4f6;
      padding-bottom: 0.75rem;
      line-height: 1.25;
    }
    h2 {
      font-size: 1.5rem;
      font-weight: 600;
      color: #1f2937;
      margin-top: 2.5rem;
      margin-bottom: 1.25rem;
      border-bottom: 1px solid #f9fafb;
      padding-bottom: 0.5rem;
      line-height: 1.3;
    }
    h3 {
      font-size: 1.25rem;
      font-weight: 600;
      color: #374151;
      margin-top: 2rem;
      margin-bottom: 0.75rem;
    }
    p {
      margin-bottom: 1.25rem;
      text-align: justify;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 1.5rem;
      margin-bottom: 2rem;
      font-size: 0.875rem;
    }
    th, td {
      border: 1px solid #e5e7eb;
      padding: 10px 14px;
      text-align: left;
    }
    th {
      background-color: #f9fafb;
      font-weight: 600;
      color: #111827;
    }
    tr:nth-child(even) {
      background-color: #fafafa;
    }
    pre, code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
      background-color: #f3f4f6;
      border-radius: 6px;
    }
    code {
      padding: 3px 6px;
      font-size: 0.85em;
      color: #e06c75;
      font-weight: 500;
    }
    pre {
      padding: 1.25rem;
      overflow: auto;
      font-size: 0.875rem;
      margin: 1.5rem 0;
      border-left: 4px solid #6366f1;
      color: #374151;
    }
    pre code {
      padding: 0;
      color: inherit;
      background-color: transparent;
      font-size: inherit;
    }
    blockquote {
      border-left: 4px solid #e5e7eb;
      padding-left: 1.25rem;
      color: #6b7280;
      font-style: italic;
      margin: 1.5rem 0;
    }
    ul, ol {
      margin-top: 0;
      margin-bottom: 1.25rem;
      padding-left: 1.5rem;
    }
    li {
      margin-bottom: 0.5rem;
    }
    img {
      max-width: 100%;
      height: auto;
      border-radius: 8px;
      margin: 1.5rem 0;
      box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.05);
    }
  </style>
</head>
<body>
  ${bodyContent}
</body>
</html>`

      return new NextResponse(styledHtml, {
        headers: {
          'Content-Type': 'text/html',
          'Content-Disposition': `attachment; filename*=UTF-8''${encodedTitle}.html`
        }
      })
    }

    if (targetFormat === 'html') {
      return new NextResponse(htmlContent, {
        headers: {
          'Content-Type': 'text/html',
          'Content-Disposition': `attachment; filename*=UTF-8''${encodedTitle}.html`
        }
      })
    }

    if (targetFormat === 'md') {
      return new NextResponse(textContent, {
        headers: {
          'Content-Type': 'text/markdown',
          'Content-Disposition': `attachment; filename*=UTF-8''${encodedTitle}.md`
        }
      })
    }

    if (targetFormat === 'pptx') {
      const pptx = new pptxgen()
      // Title slide
      let slide = pptx.addSlide()
      slide.background = { fill: 'F3F4F6' }
      slide.addText(title, {
        x: 1, y: 2.2, fontSize: 32, bold: true, color: '1F2937', align: 'center', w: 8
      })
      slide.addText("由 ClosedUI 格式转换中心自动生成", {
        x: 1, y: 3.5, fontSize: 14, color: '6B7280', align: 'center', w: 8
      })

      // Content slides: split by double newlines (paragraphs)
      const paragraphs = textContent
        .split('\n\n')
        .map(p => p.trim())
        .filter(p => p.length > 10)

      if (paragraphs.length > 0) {
        for (let i = 0; i < Math.min(paragraphs.length, 12); i++) {
          const p = paragraphs[i]
          slide = pptx.addSlide()
          slide.addText(`段落 ${i + 1}`, { x: 0.8, y: 0.6, fontSize: 18, color: '6366F1', bold: true })
          slide.addText(p.slice(0, 1000), { x: 0.8, y: 1.3, fontSize: 14, color: '374151', w: 8.4, h: 4.2 })
        }
      } else {
        // Fallback slide
        slide = pptx.addSlide()
        slide.addText(textContent.slice(0, 1000), { x: 1, y: 1.5, fontSize: 14, color: '374151', w: 8, h: 4 })
      }

      const pptxBuffer = await pptx.write({ outputType: 'nodebuffer' })
      return new NextResponse(Buffer.from(pptxBuffer as ArrayBuffer), {
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          'Content-Disposition': `attachment; filename*=UTF-8''${encodedTitle}.pptx`
        }
      })
    }

    if (targetFormat === 'txt') {
      return new NextResponse(textContent, {
        headers: {
          'Content-Type': 'text/plain',
          'Content-Disposition': `attachment; filename*=UTF-8''${encodedTitle}.txt`
        }
      })
    }

    return NextResponse.json({ error: 'Unsupported target format' }, { status: 400 })
  } catch (err) {
    console.error('Conversion error:', err)
    return NextResponse.json({ error: 'Conversion failed', details: (err as Error).message }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({
    supportedFormats: {
      input: ['docx', 'xlsx', 'pptx', 'html', 'md', 'txt'],
      output: ['docx', 'xlsx', 'pptx', 'pdf', 'html', 'md', 'txt']
    },
    conversionMatrix: {
      docx: ['html', 'md', 'txt', 'pdf'],
      xlsx: ['csv', 'html', 'json', 'pdf'],
      pptx: ['html', 'pdf', 'txt'],
      html: ['docx', 'md', 'txt', 'pdf'],
      md: ['html', 'docx', 'txt', 'pdf'],
      txt: ['html', 'docx', 'md', 'pdf']
    }
  })
}
