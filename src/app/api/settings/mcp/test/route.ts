import { NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { mcpManager } from '@/lib/mcp'

interface PrismaLike {
  mcpServer: {
    findUnique: (args: { where: { id: string } }) => Promise<unknown>
  }
}

const db = prisma as unknown as PrismaLike

export async function POST(req: Request) {
  try {
    const { id } = await req.json()
    if (!id) {
      return NextResponse.json({ success: false, error: 'Missing server ID' }, { status: 400 })
    }

    const serverData = await db.mcpServer.findUnique({ where: { id } })
    if (!serverData) {
      return NextResponse.json({ success: false, error: 'Server not found' }, { status: 404 })
    }

    const serverObj = serverData as { id: string; name: string; type: string; command?: string; args?: string; url?: string; env?: string; enabled?: boolean }
    console.log(`[MCP Test] Testing connection to "${serverObj.name}"...`)
    const result = await mcpManager.testConnection(serverObj)
    console.log(`[MCP Test] Result for "${serverObj.name}":`, result.success ? `${result.tools.length} tools` : result.error)

    return NextResponse.json(result)
  } catch (error: unknown) {
    console.error('[MCP Test] Error:', (error as Error)?.message || error)
    return NextResponse.json({ success: false, tools: [], error: (error as Error).message || 'Test failed' }, { status: 500 })
  }
}
