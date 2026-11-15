import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { 
  createFileVersion, 
  getVersions, 
  getVersionDiff, 
  rollbackToVersion,
  deleteFileVersion 
} from '@/lib/file-versions'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { fileId, fileName, content, versionLabel } = body
    
    if (!fileId || !content) {
      return NextResponse.json(
        { error: 'fileId and content are required' },
        { status: 400 }
      )
    }
    
    const version = await createFileVersion({
      fileId,
      fileName: fileName || 'untitled',
      content,
      versionLabel,
    })
    
    return NextResponse.json({ success: true, version })
  } catch (error: unknown) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const fileId = searchParams.get('fileId')
    
    if (!fileId) {
      return NextResponse.json(
        { error: 'fileId query parameter is required' },
        { status: 400 }
      )
    }
    
    const versions = await getVersions(fileId)
    return NextResponse.json({ versions })
  } catch (error: unknown) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    )
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { fileId, versionId, action } = body
    
    if (!fileId || !versionId) {
      return NextResponse.json(
        { error: 'fileId and versionId are required' },
        { status: 400 }
      )
    }
    
    if (action === 'rollback') {
      const result = await rollbackToVersion(fileId, versionId)
      return NextResponse.json({ success: true, ...result })
    }
    
    if (action === 'diff') {
      const { versionIdA, versionIdB } = body
      if (!versionIdA || !versionIdB) {
        return NextResponse.json(
          { error: 'versionIdA and versionIdB are required for diff' },
          { status: 400 }
        )
      }
      const diff = await getVersionDiff(fileId, versionIdA, versionIdB)
      return NextResponse.json({ diff })
    }
    
    if (action === 'delete') {
      await deleteFileVersion(versionId)
      return NextResponse.json({ success: true })
    }
    
    return NextResponse.json(
      { error: 'Invalid action. Use: rollback, diff, or delete' },
      { status: 400 }
    )
  } catch (error: unknown) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 }
    )
  }
}
