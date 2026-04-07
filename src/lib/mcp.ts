import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js"
import { tool as aiTool, jsonSchema } from 'ai'
import prisma from "@/lib/db"

export interface McpTool {
  name: string
  description: string
  inputSchema: any
  execute: (args: any) => Promise<any>
}

class McpManager {
  private clients: Map<string, Client> = new Map()

  async getEnabledServers() {
    return await (prisma as any).mcpServer.findMany({
      where: { enabled: true }
    })
  }

  async initializeClient(server: any) {
    if (this.clients.has(server.id)) return this.clients.get(server.id)

    let transport
    if (server.type === 'stdio') {
      transport = new StdioClientTransport({
        command: server.command,
        args: JSON.parse(server.args || '[]'),
        env: { ...process.env, ...JSON.parse(server.env || '{}') }
      })
    } else {
      transport = new SSEClientTransport(new URL(server.url))
    }

    const client = new Client(
      { name: "OpenOrangeAI-Client", version: "1.0.0" },
      { capabilities: { } }
    )

    await client.connect(transport)
    this.clients.set(server.id, client)
    return client
  }

  async getTools(): Promise<Record<string, any>> {
    const servers = await this.getEnabledServers()
    const allTools: Record<string, any> = {}

    for (const server of servers) {
      try {
        const client = await this.initializeClient(server)
        if (!client) continue
        const { tools } = await client.listTools()
        
        for (const tool of (tools || [])) {
          const toolName = `${server.name.replace(/[\s-]/g, '_')}_${tool.name}`
          allTools[toolName] = aiTool({
            description: tool.description,
            parameters: jsonSchema(tool.inputSchema),
            execute: async (args: any) => {
              const res = await client.callTool({
                name: tool.name,
                arguments: args
              })
              return res.content
            }
          } as any)
        }
      } catch (error) {
        console.error(`Failed to load tools from MCP server ${server.name}:`, error)
      }
    }

    return allTools
  }

  async closeAll() {
    for (const client of this.clients.values()) {
      try { await client.close() } catch {}
    }
    this.clients.clear()
  }
}

export const mcpManager = new McpManager()
