import { NextRequest, NextResponse } from 'next/server'
import { extractFileText, TEXT_EXTENSIONS } from '@/lib/knowledge'
import fs from 'fs'
import path from 'path'
import os from 'os'

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml', 'image/bmp'])
const MAX_TEXT_LENGTH = 60000 // ~15k tokens safety limit

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const files = formData.getAll('files') as File[]

    if (!files || files.length === 0) {
      return NextResponse.json({ error: 'No files uploaded' }, { status: 400 })
    }

    const results = []

    for (const file of files) {
      const bytes = await file.arrayBuffer()
      const buffer = Buffer.from(bytes)
      const fileName = file.name
      const mimeType = file.type || getMimeFromExt(fileName)

      console.log(`[Upload] Processing: ${fileName} (${mimeType}, ${buffer.length} bytes)`)

      // ── 1. Images → Base64 DataURL ────────────────────────────────────────
      if (IMAGE_TYPES.has(mimeType) || mimeType.startsWith('image/')) {
        const base64 = buffer.toString('base64')
        const dataUrl = `data:${mimeType};base64,${base64}`
        results.push({ name: fileName, type: mimeType, size: file.size, dataUrl })
        console.log(`[Upload] Image encoded: ${fileName}`)
        continue
      }

      // ── 2. Documents → Text Extraction ────────────────────────────────────
      const tempDir = path.join(os.tmpdir(), 'closedui-uploads')
      if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true })
      const tempPath = path.join(tempDir, `${Date.now()}-${fileName.replace(/[^a-zA-Z0-9._-]/g, '_')}`)

      fs.writeFileSync(tempPath, buffer)

      try {
        let content = await extractFileText(tempPath)
        
        if (!content || content.trim().length === 0) {
          // fallback: try reading as utf8 if recognized extension
          const ext = path.extname(fileName).toLowerCase()
          if (TEXT_EXTENSIONS.has(ext) || TEXT_EXTENSIONS.has('.' + fileName.split('.').pop()?.toLowerCase())) {
            try { content = buffer.toString('utf-8') } catch {}
          }
        }

        // Truncate very large files
        if (content && content.length > MAX_TEXT_LENGTH) {
          content = content.substring(0, MAX_TEXT_LENGTH) + '\n\n[... FILE TRUNCATED DUE TO LENGTH ...]'
        }

        results.push({ name: fileName, type: mimeType, size: file.size, content: content || '' })
        console.log(`[Upload] Text extracted: ${fileName} (${content?.length || 0} chars)`)
      } finally {
        try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath) } catch {}
      }
    }

    return NextResponse.json({ files: results })
  } catch (error) {
    console.error('[Upload] Error:', error)
    return NextResponse.json({ error: 'Failed to process files', detail: String(error) }, { status: 500 })
  }
}

function getMimeFromExt(filename: string): string {
  const ext = path.extname(filename).toLowerCase()
  const map: Record<string, string> = {
    '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
    '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp',
    '.svg': 'image/svg+xml', '.pdf': 'application/pdf',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.txt': 'text/plain', '.md': 'text/markdown', '.json': 'application/json',
  }
  return map[ext] || 'text/plain'
}
