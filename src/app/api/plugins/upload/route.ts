import { NextResponse } from 'next/server'
import { PluginEngine } from '@/lib/plugin-engine'

export async function POST(req: Request) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    if (!file.name.endsWith('.zip') && !file.name.endsWith('.plugin')) {
      return NextResponse.json({ error: 'Only .zip or .plugin archives are supported' }, { status: 400 })
    }

    const arrayBuffer = await file.arrayBuffer()
    const plugin = await PluginEngine.installFromZip(arrayBuffer)

    return NextResponse.json({
      success: true,
      message: `Plugin "${plugin.name}" installed successfully`,
      plugin
    })
  } catch (error: any) {
    console.error('[API Plugin Upload POST] Error:', error)
    return NextResponse.json({ error: error.message || 'Failed to install uploaded plugin' }, { status: 500 })
  }
}
