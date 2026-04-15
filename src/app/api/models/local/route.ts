import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import { getLocalModelsDir, scanLocalGgufModels } from '@/lib/models'

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url)
  const fileName = searchParams.get('fileName')

  if (!fileName) {
    return NextResponse.json({ error: 'Missing fileName' }, { status: 400 })
  }

  try {
    const modelsDir = getLocalModelsDir()
    // Prevent directory traversal
    const safeName = path.basename(fileName)
    const filePath = path.join(modelsDir, safeName)

    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath)
      // Force refresh the cache
      await scanLocalGgufModels(true)
      return NextResponse.json({ success: true })
    } else {
      return NextResponse.json({ error: 'File not found' }, { status: 404 })
    }
  } catch (error: any) {
    console.error('[Models Delete API] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
