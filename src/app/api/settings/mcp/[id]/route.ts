import { NextResponse } from 'next/server'
import prisma from '@/lib/db'

interface PrismaLike {
  mcpServer: {
    delete: (args: { where: { id: string } }) => Promise<unknown>
  }
}

const db = prisma as unknown as PrismaLike

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    await db.mcpServer.delete({
      where: { id }
    })
    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    console.error("MCP DELETE Error:", (error as Error)?.message || error)
    return NextResponse.json({ error: "Failed to delete MCP server" }, { status: 500 })
  }
}
