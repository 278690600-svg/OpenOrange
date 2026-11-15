import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { mcpManager } from '@/lib/mcp'

const configPath = path.join(os.homedir(), ".closedui", "mcp_config.json")

export async function GET() {
  try {
    if (!fs.existsSync(configPath)) {
      return NextResponse.json({ mcpServers: {} })
    }
    const content = fs.readFileSync(configPath, 'utf-8')
    return NextResponse.json(JSON.parse(content))
  } catch (error: unknown) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const config = await req.json()
    
    if (!config || typeof config !== 'object') {
      throw new Error("Invalid config format")
    }

    const dir = path.dirname(configPath)
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
    
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2))
    
    await mcpManager.closeAll()
    
    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    return NextResponse.json({ error: (error as Error).message }, { status: 500 })
  }
}
