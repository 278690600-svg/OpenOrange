import { NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { mcpManager } from '@/lib/mcp'

export async function POST(req: Request) {
  try {
    const { id } = await req.json()
    if (!id) {
      return NextResponse.json({ success: false, error: 'Missing server ID' }, { status: 400 })
    }

    const server = await (prisma as any).mcpServer.findUnique({ where: { id } })
    if (!server) {
      return NextResponse.json({ success: false, error: 'Server not found' }, { status: 404 })
    }

    console.log(`[MCP Test] Testing connection to "${server.name}"...`)
    const result = await mcpManager.testConnection(server)
    console.log(`[MCP Test] Result for "${server.name}":`, result.success ? `${result.tools.length} tools` : result.error)

    return NextResponse.json(result)
  } catch (error: any) {
    console.error('[MCP Test] Error:', error?.message || error)
    return NextResponse.json({ success: false, tools: [], error: error.message || 'Test failed' }, { status: 500 })
  }
}
