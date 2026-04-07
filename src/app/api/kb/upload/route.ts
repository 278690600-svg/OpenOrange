import { NextRequest, NextResponse } from 'next/server'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'
import os from 'os'
import { createKnowledgeBase } from '@/lib/knowledge'

const UPLOAD_TMP_DIR = path.join(os.tmpdir(), 'closedui-kb-uploads')

export const config = { api: { bodyParser: false } }

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const files = formData.getAll('files') as File[]
    const name = formData.get('name') as string || `上传文件-${Date.now()}`

    if (!files || files.length === 0) {
      return NextResponse.json({ error: '请选择文件' }, { status: 400 })
    }

    // Create unique temp directory for this upload
    const uploadId = `upload-${Date.now()}-${Math.random().toString(36).slice(2)}`
    const uploadDir = path.join(UPLOAD_TMP_DIR, uploadId)
    await mkdir(uploadDir, { recursive: true })

    // Write all files to temp dir, preserving relative paths (for folder uploads)
    for (const file of files) {
      const relativePath = (file as any).webkitRelativePath || file.name
      const destPath = path.join(uploadDir, relativePath)
      // Ensure subdirectory exists
      await mkdir(path.dirname(destPath), { recursive: true })
      const buffer = Buffer.from(await file.arrayBuffer())
      await writeFile(destPath, buffer)
    }

    // Create a knowledge base pointing to the upload directory
    const kb = await createKnowledgeBase({
      name,
      sourceType: 'local',
      path: uploadDir,
      config: { rootPath: uploadDir, isUpload: true, fileCount: files.length },
    })

    return NextResponse.json(kb)
  } catch (err: any) {
    return NextResponse.json({ error: err.message || '上传失败' }, { status: 500 })
  }
}
