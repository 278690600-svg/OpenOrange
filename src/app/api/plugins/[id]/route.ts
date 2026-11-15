import { NextResponse } from 'next/server'
import { PluginEngine } from '@/lib/plugin-engine'

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const plugin = await PluginEngine.getPlugin(id)
    if (!plugin) {
      return NextResponse.json({ error: 'Plugin not found' }, { status: 404 })
    }
    return NextResponse.json({ plugin })
  } catch (error: any) {
    console.error('[API Plugin GET] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await req.json()
    const { action, enabled, config } = body

    if (action === 'toggle') {
      const updated = await PluginEngine.togglePlugin(id, enabled)
      return NextResponse.json({ success: true, plugin: updated })
    } else if (action === 'config') {
      if (!config || typeof config !== 'object') {
        return NextResponse.json({ error: 'Invalid config payload' }, { status: 400 })
      }
      const updated = await PluginEngine.savePluginConfig(id, config)
      return NextResponse.json({ success: true, plugin: updated })
    } else {
      return NextResponse.json({ error: 'Invalid action: must be "toggle" or "config"' }, { status: 400 })
    }
  } catch (error: any) {
    console.error('[API Plugin Action POST] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    await PluginEngine.uninstallPlugin(id)
    return NextResponse.json({ success: true, message: 'Plugin uninstalled successfully' })
  } catch (error: any) {
    console.error('[API Plugin DELETE] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
