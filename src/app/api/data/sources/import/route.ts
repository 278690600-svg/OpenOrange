import fs from 'fs'
import path from 'path'
import { NextRequest, NextResponse } from 'next/server'
import { importBackupDataSource } from '@/lib/data-sources'

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const nameFromForm = formData.get('name')

    if (!file) {
      return NextResponse.json({ error: 'No backup file uploaded' }, { status: 400 })
    }

    const uploadDir = path.join(process.cwd(), 'uploads', 'backups')
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true })
    }

    const fileName = `${Date.now()}-${file.name}`
    const filePath = path.join(uploadDir, fileName)
    const buffer = Buffer.from(await file.arrayBuffer())
    fs.writeFileSync(filePath, buffer)

    const source = await importBackupDataSource({
      name: String(nameFromForm || path.parse(file.name).name),
      filePath,
    })

    return NextResponse.json(source)
  } catch (error) {
    console.error('Backup import Error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to import backup file' },
      { status: 400 }
    )
  }
}
