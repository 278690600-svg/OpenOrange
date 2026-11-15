import { NextResponse } from 'next/server'
import { PluginEngine } from '@/lib/plugin-engine'

export async function GET() {
  try {
    const plugins = await PluginEngine.getInstalledPlugins()
    return NextResponse.json({ plugins })
  } catch (error: any) {
    console.error('[API Plugins GET] Error:', error)
    return NextResponse.json({ error: error.message || 'Failed to fetch plugins' }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { marketPluginId, url, manifest } = body

    let result
    if (marketPluginId) {
      result = await PluginEngine.installFromMarket(marketPluginId)
    } else if (url) {
      result = await PluginEngine.installFromUrl(url)
    } else if (manifest) {
      result = await PluginEngine.installFromManifest(manifest, 'raw_json')
    } else {
      return NextResponse.json({ error: 'Missing marketPluginId, url, or manifest' }, { status: 400 })
    }

    return NextResponse.json({ success: true, plugin: result })
  } catch (error: any) {
    console.error('[API Plugins POST Install] Error:', error)
    return NextResponse.json({ error: error.message || 'Failed to install plugin' }, { status: 500 })
  }
}
