import { NextRequest, NextResponse } from 'next/server'
import { extractFileText, TEXT_EXTENSIONS } from '@/lib/knowledge'
import fs from 'fs'
import path from 'path'
import os from 'os'

const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml', 'image/bmp'])
const MAX_TEXT_LENGTH = 60000 // ~15k tokens safety limit
const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB
const MAX_FILES = 10

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const files = formData.getAll('files') as File[]

    if (!files || files.length === 0) {
      return NextResponse.json({ error: 'No files uploaded' }, { status: 400 })
    }

    if (files.length > MAX_FILES) {
      return NextResponse.json({ error: `Maximum ${MAX_FILES} files allowed` }, { status: 400 })
    }

    const results = []

    for (const file of files) {
      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json({ error: `File too large: ${file.name}` }, { status: 400 })
      }
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

      const tempDir = path.join(os.tmpdir(), 'openorange-uploads')
      if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true })
      
      const fileExt = path.extname(fileName).toLowerCase()
      const tempId = Math.random().toString(36).substring(7) + Date.now()
      const tempPath = path.join(tempDir, `upload_${tempId}${fileExt}`)

      fs.writeFileSync(tempPath, buffer)

      try {
        const ext = path.extname(fileName).toLowerCase()
        let content = await extractFileText(tempPath)
        
        const isExcel = ext === '.xlsx' || ext === '.xls'
        
        if (!content || content.trim().length === 0) {
          // fallback: try reading as utf8 if recognized extension or excel
          if (isExcel || TEXT_EXTENSIONS.has(ext)) {
            try { content = buffer.toString('utf-8') } catch {}
          }
        }

        // Truncate very large files
        if (content && content.length > MAX_TEXT_LENGTH) {
          content = content.substring(0, MAX_TEXT_LENGTH) + '\n\n[... FILE TRUNCATED DUE TO LENGTH ...]'
        }

        console.log(`[Upload] Result for ${fileName}: contentLen=${content?.length || 0}`)
        if (!content || content.trim().length === 0) {
           console.warn(`[Upload] WARNING: Extracted content is EMPTY for ${fileName}`)
        }

        results.push({ name: fileName, type: mimeType, size: file.size, content: content || '' })
      } catch (err: unknown) {
        console.error(`[Upload] Error during extraction for ${fileName}:`, (err as Error).message)
      } finally {
        // Keep file for a moment for debugging if extraction failed
        // try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath) } catch {}
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

export const maxBodyLength = 52428800
