import { NextResponse } from 'next/server'
import { MARKETPLACE_PLUGINS, MarketplacePlugin } from '@/lib/plugins-market-data'
import { PluginEngine } from '@/lib/plugin-engine'

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const search = (searchParams.get('search') || '').toLowerCase().trim()
    const category = searchParams.get('category') || 'all'
    const sort = searchParams.get('sort') || 'popular' // popular, rating, newest

    // Get installed plugins to mark installed state
    const installed = await PluginEngine.getInstalledPlugins()
    const installedMap = new Map(installed.map((p: any) => [p.pluginId, p]))

    let results = MARKETPLACE_PLUGINS.map(p => {
      const installedPlugin = installedMap.get(p.id)
      return {
        ...p,
        isInstalled: !!installedPlugin,
        installedData: installedPlugin || null
      }
    })

    // Filter by Category
    if (category && category !== 'all') {
      results = results.filter(p => p.category === category)
    }

    // Filter by Search query
    if (search) {
      results = results.filter(p =>
        p.name.toLowerCase().includes(search) ||
        p.description.toLowerCase().includes(search) ||
        p.author.toLowerCase().includes(search) ||
        p.tags.some(t => t.toLowerCase().includes(search))
      )
    }

    // Sorting
    if (sort === 'rating') {
      results.sort((a, b) => b.rating - a.rating)
    } else if (sort === 'newest') {
      results.sort((a, b) => b.version.localeCompare(a.version))
    } else {
      // Default: popularity / downloads
      results.sort((a, b) => b.downloads - a.downloads)
    }

    const categoriesCount = {
      all: MARKETPLACE_PLUGINS.length,
      productivity: MARKETPLACE_PLUGINS.filter(p => p.category === 'productivity').length,
      devtools: MARKETPLACE_PLUGINS.filter(p => p.category === 'devtools').length,
      data: MARKETPLACE_PLUGINS.filter(p => p.category === 'data').length,
      workflow: MARKETPLACE_PLUGINS.filter(p => p.category === 'workflow').length,
      creative: MARKETPLACE_PLUGINS.filter(p => p.category === 'creative').length,
      theme: MARKETPLACE_PLUGINS.filter(p => p.category === 'theme').length,
    }

    return NextResponse.json({
      plugins: results,
      total: results.length,
      categoriesCount
    })
  } catch (error: any) {
    console.error('[API Plugins Market GET] Error:', error)
    return NextResponse.json({ error: error.message || 'Failed to query market' }, { status: 500 })
  }
}
