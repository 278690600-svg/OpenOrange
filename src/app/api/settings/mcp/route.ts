import { NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { mcpManager } from '@/lib/mcp'

export async function GET() {
  try {
    const servers = await mcpManager.getAllServers()
    return NextResponse.json(servers)
  } catch (error: any) {
    console.error("MCP GET Error:", error?.message || error)
    return NextResponse.json({ error: "Failed to fetch MCP servers" }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const data = await req.json()
    const { id, name, type, command, args, url, env, enabled } = data

    if (id) {
      const server = await (prisma as any).mcpServer.update({
        where: { id },
        data: { name, type, command, args: JSON.stringify(args), url, env: JSON.stringify(env), enabled }
      })
      return NextResponse.json(server)
    } else {
      const server = await (prisma as any).mcpServer.create({
        data: { name, type, command, args: JSON.stringify(args), url, env: JSON.stringify(env), enabled: enabled ?? true }
      })
      return NextResponse.json(server)
    }
  } catch (error: any) {
    console.error("MCP POST Error:", error?.message || error)
    return NextResponse.json({ error: "Failed to save MCP server" }, { status: 500 })
  }
}
