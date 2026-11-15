import { NextResponse } from 'next/server'
import { mcpManager } from '@/lib/mcp'

export async function POST() {
  try {
    console.log('[MCP] Reloading: clearing all connections and caches...')
    await mcpManager.closeAll()
    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    console.error('[MCP Reload] Error:', (error as Error)?.message || error)
    return NextResponse.json({ error: 'Failed to reload MCP' }, { status: 500 })
  }
}
