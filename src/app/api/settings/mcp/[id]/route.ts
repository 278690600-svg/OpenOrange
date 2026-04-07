import { NextResponse } from 'next/server'
import prisma from '@/lib/db'

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    await (prisma as any).mcpServer.delete({
      where: { id }
    })
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error("MCP DELETE Error:", error?.message || error)
    return NextResponse.json({ error: "Failed to delete MCP server" }, { status: 500 })
  }
}
