import { NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { mcpManager } from '@/lib/mcp'

interface PrismaLike {
  mcpServer: {
    update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<unknown>
    create: (args: { data: Record<string, unknown> }) => Promise<unknown>
  }
}

const db = prisma as unknown as PrismaLike

export async function GET() {
  try {
    const servers = await mcpManager.getAllServers()
    return NextResponse.json(servers)
  } catch (error: unknown) {
    console.error("MCP GET Error:", (error as Error)?.message || error)
    return NextResponse.json({ error: "Failed to fetch MCP servers" }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const data = await req.json()
    const { id, name, type, command, args, url, env, enabled } = data

    if (id) {
      const server = await db.mcpServer.update({
        where: { id },
        data: { name, type, command, args: JSON.stringify(args), url, env: JSON.stringify(env), enabled }
      })
      return NextResponse.json(server)
    } else {
      const server = await db.mcpServer.create({
        data: { name, type, command, args: JSON.stringify(args), url, env: JSON.stringify(env), enabled: enabled ?? true }
      })
      return NextResponse.json(server)
    }
  } catch (error: unknown) {
    console.error("MCP POST Error:", (error as Error)?.message || error)
    return NextResponse.json({ error: "Failed to save MCP server" }, { status: 500 })
  }
}
