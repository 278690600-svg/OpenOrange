import { NextResponse } from 'next/server'
import { mcpManager } from '@/lib/mcp'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')

  if (!id) {
    return NextResponse.json({ error: 'Missing server ID' }, { status: 400 })
  }

  try {
    const details = await mcpManager.getServerDetails(id)
    return NextResponse.json(details)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
