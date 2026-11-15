import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import prisma from '@/lib/db'

export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const action = searchParams.get('action')

    if (action === 'upload') {
      const formData = await req.formData()
      const files = formData.getAll('files') as File[]
      const knowledgeBaseId = formData.get('knowledgeBaseId') as string

      if (!knowledgeBaseId) {
        return NextResponse.json({ error: 'Knowledge base ID is required' }, { status: 400 })
      }

      if (!files || files.length === 0) {
        return NextResponse.json({ error: 'No files provided' }, { status: 400 })
      }

      const kb = await prisma.knowledgeBase.findUnique({
        where: { id: knowledgeBaseId }
      })

      if (!kb) {
        return NextResponse.json({ error: 'Knowledge base not found' }, { status: 404 })
      }

      const uploadDir = path.join(process.cwd(), 'uploads', 'kb', knowledgeBaseId)
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true })
      }

      const uploadedFiles = []
      const errors = []

      for (const file of files) {
        try {
          const fileName = `${Date.now()}-${file.name}`
          const filePath = path.join(uploadDir, fileName)
          const buffer = Buffer.from(await file.arrayBuffer())
          fs.writeFileSync(filePath, buffer)

          uploadedFiles.push({
            name: file.name,
            path: filePath,
            size: buffer.length
          })
        } catch (fileError) {
          errors.push({
            fileName: file.name,
            error: (fileError as Error).message
          })
        }
      }

      return NextResponse.json({
        success: true,
        uploadedCount: uploadedFiles.length,
        totalCount: files.length,
        uploadedFiles,
        errors: errors.length > 0 ? errors : undefined
      })
    }

    if (action === 'index') {
      const body = await req.json()
      const { fileIds, knowledgeBaseId } = body as { fileIds?: string[]; knowledgeBaseId: string }

      const kb = await prisma.knowledgeBase.findUnique({
        where: { id: knowledgeBaseId }
      })

      if (!kb) {
        return NextResponse.json({ error: 'Knowledge base not found' }, { status: 404 })
      }

      await prisma.knowledgeBase.update({
        where: { id: knowledgeBaseId },
        data: { status: 'indexing' }
      })

      const kbPath = path.join(process.cwd(), 'uploads', 'kb', knowledgeBaseId)
      if (!fs.existsSync(kbPath)) {
        return NextResponse.json({ error: 'No files found for this knowledge base' }, { status: 404 })
      }

      const files = fileIds
        ? fileIds.map(id => path.join(kbPath, id))
        : fs.readdirSync(kbPath).map(f => path.join(kbPath, f))

      let indexedCount = 0
      const errors = []

      for (const filePath of files) {
        try {
          const content = fs.readFileSync(filePath, 'utf-8')
          const fileName = path.basename(filePath)

          await prisma.knowledgeChunk.create({
            data: {
              knowledgeBaseId,
              sourceUri: filePath,
              title: fileName,
              chunkIndex: 0,
              content: content.slice(0, 4000),
              keywords: JSON.stringify([]),
              metadata: JSON.stringify({
                fileName,
                fileSize: fs.statSync(filePath).size,
                indexedAt: new Date().toISOString()
              })
            }
          })

          indexedCount++
        } catch (fileError) {
          errors.push({
            filePath,
            error: (fileError as Error).message
          })
        }
      }

      await prisma.knowledgeBase.update({
        where: { id: knowledgeBaseId },
        data: {
          status: 'ready',
          lastIndexedAt: new Date(),
          stats: JSON.stringify({
            indexedFiles: indexedCount,
            totalFiles: files.length,
            lastIndexed: new Date().toISOString()
          })
        }
      })

      return NextResponse.json({
        success: true,
        indexedCount,
        totalCount: files.length,
        errors: errors.length > 0 ? errors : undefined
      })
    }

    if (action === 'delete') {
      const body = await req.json()
      const { fileIds, knowledgeBaseId } = body as { fileIds: string[]; knowledgeBaseId: string }

      if (!knowledgeBaseId || !fileIds || fileIds.length === 0) {
        return NextResponse.json({ error: 'Knowledge base ID and file IDs are required' }, { status: 400 })
      }

      const kbPath = path.join(process.cwd(), 'uploads', 'kb', knowledgeBaseId)
      let deletedCount = 0
      const errors = []

      for (const fileId of fileIds) {
        try {
          const filePath = path.join(kbPath, fileId)
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath)
            deletedCount++
          }
        } catch (fileError) {
          errors.push({
            fileId,
            error: (fileError as Error).message
          })
        }
      }

      await prisma.knowledgeChunk.deleteMany({
        where: {
          knowledgeBaseId,
          sourceUri: { in: fileIds.map(id => path.join(kbPath, id)) }
        }
      })

      return NextResponse.json({
        success: true,
        deletedCount,
        totalCount: fileIds.length,
        errors: errors.length > 0 ? errors : undefined
      })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (error) {
    console.error('Batch file processing error:', error)
    return NextResponse.json(
      { error: 'Batch processing failed', details: (error as Error).message },
      { status: 500 }
    )
  }
}
