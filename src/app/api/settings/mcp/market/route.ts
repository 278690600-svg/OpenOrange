import { NextResponse } from 'next/server'
import prisma from '@/lib/db'

const GITHUB_REGISTRY_API = 'https://registry.modelcontextprotocol.io/v0.1/servers'
const MODELSCOPE_SEARCH_API = 'https://modelscope.cn/api/v1/dolphin/mcpServers'
const SMITHERY_SEARCH_API = 'https://api.smithery.ai/servers'
const GLAMA_SEARCH_API = 'https://glama.ai/mcp/servers.data'

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const search = searchParams.get('search') || ''
    const source = searchParams.get('source') || 'github'
    
    if (source === 'modelscope') {
      const res = await fetch(MODELSCOPE_SEARCH_API, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/plain, */*',
          'X-Requested-With': 'XMLHttpRequest',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Referer': 'https://modelscope.cn/mcp',
          'Origin': 'https://modelscope.cn'
        },
        body: JSON.stringify({
          PageSize: 30,
          PageNumber: 1,
          Query: search,
          Criterion: []
        }),
        signal: AbortSignal.timeout(15000),
      })
      
      if (!res.ok) {
        throw new Error(`ModelScope API failed: ${res.statusText}`)
      }
      
      const data = await res.json()
      const servers = (data.McpServers || []).map((s: any) => ({
        name: s.Name,
        description: s.AbstractCN || s.Abstract || '',
        vendor: s.Publisher,
        homepage: `https://modelscope.cn/mcp/servers/${s.Publisher}/${s.Name}`,
        transport: s.Hosted ? 'sse' : 'stdio',
        modelscopeId: s.Id,
        isHosted: s.Hosted
      }))
      
      return NextResponse.json({ servers })
    } else if (source === 'smithery') {
      const url = `${SMITHERY_SEARCH_API}?q=${encodeURIComponent(search)}&page=1&pageSize=30`
      const res = await fetch(url, {
        headers: { 'accept': 'application/json' }
      })
      
      if (!res.ok) {
        throw new Error(`Smithery API failed: ${res.statusText}`)
      }
      
      const data = await res.json()
      const servers = (data.servers || []).map((s: any) => ({
        name: s.displayName || s.name,
        description: s.description || '',
        vendor: s.author?.name || 'Community',
        homepage: s.homepage || `https://smithery.ai/server/${s.name}`,
        transport: 'stdio',
        iconUrl: s.iconUrl,
        smitheryId: s.id,
        packageName: s.packageName || s.name
      }))
      
      return NextResponse.json({ servers })
    } else if (source === 'glama') {
      const url = `${GLAMA_SEARCH_API}?query=${encodeURIComponent(search)}`
      const res = await fetch(url, {
        headers: { 'accept': 'application/json' }
      })
      
      if (!res.ok) {
        throw new Error(`Glama API failed: ${res.statusText}`)
      }
      
      const data = await res.json()
      const serversData = Array.isArray(data) ? data : (data?.servers || [])
      const servers = serversData.map((s: any) => ({
        name: s.name || s.displayName,
        description: s.description || '',
        vendor: s.author?.name || s.author || 'Community',
        homepage: s.homepage || s.url || `https://glama.ai/mcp/servers/${s.name}`,
        transport: 'stdio',
        iconUrl: s.iconUrl,
        packageName: s.npmPackage || s.name
      }))
      
      return NextResponse.json({ servers })
    } else {
      let url = GITHUB_REGISTRY_API
      if (search) {
        url += `?search=${search}`
      }

      const res = await fetch(url)
      if (!res.ok) {
        throw new Error(`GitHub Registry API failed: ${res.statusText}`)
      }

      const data = await res.json()
      const servers = (data.servers || []).map((item: any) => {
        const s = item.server || item
        return {
          name: s.name,
          description: s.description,
          vendor: s.vendor || 'Community',
          homepage: s.homepage || s.repository?.url,
          transport: s.transport || 'stdio',
          githubUrl: s.repository?.url || s.githubUrl
        }
      })
      
      return NextResponse.json({ servers })
    }
  } catch (error: any) {
    console.error('[MCP Market] Error fetching registry:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const data = await req.json()
    const { name, description, transport, command, args, url, env, homepage, source } = data

    const existing = await (prisma as any).mcpServer.findFirst({
      where: { name }
    })

    if (existing) {
      return NextResponse.json({ error: 'Server with this name already exists' }, { status: 409 })
    }

    let parsedArgs = args
    if (typeof args === 'string') {
      try {
        parsedArgs = JSON.parse(args)
      } catch {
        parsedArgs = [args]
      }
    }
    if (!Array.isArray(parsedArgs)) {
      parsedArgs = []
    }

    let parsedEnv = env
    if (typeof env === 'string') {
      try {
        parsedEnv = JSON.parse(env)
      } catch {
        parsedEnv = {}
      }
    }
    if (typeof parsedEnv !== 'object' || parsedEnv === null) {
      parsedEnv = {}
    }

    const server = await (prisma as any).mcpServer.create({
      data: {
        name,
        type: transport || 'stdio',
        command: command || '',
        args: JSON.stringify(parsedArgs),
        url: url || '',
        env: JSON.stringify(parsedEnv),
        enabled: true
      }
    })

    return NextResponse.json(server)
  } catch (error: any) {
    console.error('[MCP Market Install] Error:', error)
    return NextResponse.json({ error: error.message || 'Failed to install server' }, { status: 500 })
  }
}
