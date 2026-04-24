import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js"
import { tool as aiTool, jsonSchema } from 'ai'
import prisma from "@/lib/db"
import fs from "fs"
import path from "path"
import os from "os"

export interface McpTool {
  name: string
  description: string
  inputSchema: any
  execute: (args: any) => Promise<any>
}

/** Windows command name → resolved .cmd/.exe variant */
const WIN_COMMAND_MAP: Record<string, string> = {
  npx: 'npx.cmd',
  'npx.cmd': 'npx.cmd',
  pnpm: 'pnpm.cmd',
  'pnpm.cmd': 'pnpm.cmd',
  yarn: 'yarn.cmd',
  'yarn.cmd': 'yarn.cmd',
  node: 'node.exe',
  'node.exe': 'node.exe',
  python: 'python.exe',
  'python.exe': 'python.exe',
  python3: 'python.exe',
  pip: 'pip.exe',
  'pip.exe': 'pip.exe',
  pipx: 'pipx.exe',
  'pipx.exe': 'pipx.exe',
  uvx: 'uvx.exe',
  'uvx.exe': 'uvx.exe',
  uv: 'uv.exe',
  'uv.exe': 'uv.exe',
  deno: 'deno.exe',
  'deno.exe': 'deno.exe',
  bun: 'bun.exe',
  'bun.exe': 'bun.exe',
}

class McpManager {
  private clients: Map<string, Client> = new Map()
  private configPath = path.join(os.homedir(), ".closedui", "mcp_config.json")
  private toolsCache: Record<string, any> | null = null
  private toolsCacheTime: number = 0
  private readonly TOOLS_CACHE_TTL = 60000 // 60 seconds cache

  private async loadConfigServers() {
    try {
      if (!fs.existsSync(this.configPath)) {
        const dir = path.dirname(this.configPath)
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
        fs.writeFileSync(this.configPath, JSON.stringify({ mcpServers: {} }, null, 2))
        return []
      }

      const content = fs.readFileSync(this.configPath, 'utf-8').trim()
      if (!content) {
        fs.writeFileSync(this.configPath, JSON.stringify({ mcpServers: {} }, null, 2))
        return []
      }

      let config
      try {
        config = JSON.parse(content)
      } catch (parseError) {
        console.error("[MCP] Config file corrupted, resetting to default:", parseError)
        fs.writeFileSync(this.configPath, JSON.stringify({ mcpServers: {} }, null, 2))
        return []
      }

      const servers = config.mcpServers || {}

      return Object.entries(servers).map(([name, entry]: [string, any]) => ({
        id: `config:${name}`,
        name: name,
        type: entry.type || 'stdio',
        command: entry.command,
        args: JSON.stringify(entry.args || []),
        url: entry.url,
        env: JSON.stringify(entry.env || {}),
        enabled: entry.enabled ?? true,
        source: 'config'
      }))
    } catch (error) {
      console.error("Failed to load global MCP config:", error)
      return []
    }
  }

  async getEnabledServers() {
    const dbServers = await (prisma as any).mcpServer.findMany({
      where: { enabled: true }
    })

    const configServers = await this.loadConfigServers()
    const enabledConfigServers = configServers.filter(s => s.enabled)

    return [...dbServers, ...enabledConfigServers]
  }

  async getAllServers() {
    const dbServers = await (prisma as any).mcpServer.findMany({
      orderBy: { createdAt: 'desc' }
    })
    const configServers = await this.loadConfigServers()
    return [...configServers, ...dbServers] // Config servers first?
  }

  /**
   * Check if a cached client is still alive by pinging it.
   * Returns true if the client is healthy, false otherwise.
   */
  private async isClientHealthy(client: Client): Promise<boolean> {
    try {
      // Attempt a lightweight operation - listTools with a short timeout
      const pingPromise = client.listTools()
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('health check timeout')), 5000)
      )
      await Promise.race([pingPromise, timeoutPromise])
      return true
    } catch {
      return false
    }
  }

  async initializeClient(server: any, forceReconnect = false) {
    // Check cached client first (unless forced to reconnect)
    if (!forceReconnect && this.clients.has(server.id)) {
      const cachedClient = this.clients.get(server.id)!
      if (await this.isClientHealthy(cachedClient)) {
        return cachedClient
      }
      // Client is dead - remove from cache and reconnect
      console.log(`[MCP] Cached client for ${server.name} is unhealthy, reconnecting...`)
      this.clients.delete(server.id)
      try { await cachedClient.close() } catch {}
    }

    // If forced reconnect, clean up old client
    if (forceReconnect && this.clients.has(server.id)) {
      const oldClient = this.clients.get(server.id)!
      this.clients.delete(server.id)
      try { await oldClient.close() } catch {}
    }

    let transport
    try {
      if (server.type === 'stdio') {
        let args = server.args
        console.log(`[MCP] Raw args for ${server.name}:`, typeof args, args)

        if (typeof args === 'string') {
          try {
            args = JSON.parse(args)
            console.log(`[MCP] Parsed args for ${server.name}:`, args)
          } catch {
            console.error(`[MCP] Failed to parse args for ${server.name}:`, args)
            args = []
          }
        }
        if (!Array.isArray(args)) args = []

        let env = server.env
        if (typeof env === 'string') {
          try { env = JSON.parse(env) } catch { env = {} }
        }
        if (typeof env !== 'object' || env === null) env = {}

        let command = server.command
        let finalArgs = args

        if (process.platform === 'win32') {
          // Resolve Windows command names to their .cmd/.exe variants
          const resolved = WIN_COMMAND_MAP[command]
          if (resolved) {
            command = resolved
          } else if (!command.endsWith('.exe') && !command.endsWith('.cmd') && !command.endsWith('.bat')) {
            // For unknown commands, try appending .cmd (common for npm-installed CLIs)
            // If .cmd doesn't exist, fall back to original command
            const cmdPath = require('child_process').execSync(`where ${command}.cmd 2>nul || where ${command} 2>nul`, { encoding: 'utf-8' }).split('\n')[0].trim()
            if (cmdPath) {
              command = cmdPath
            }
          }
        }

        console.log(`[MCP] Initializing ${server.name}: command=${command}, args=${JSON.stringify(finalArgs)}`)

        transport = new StdioClientTransport({
          command,
          args: finalArgs,
          env: { ...process.env, ...env }
        })

        // Listen to stderr for debugging
        transport.onclose = () => console.log(`[MCP] Transport closed for ${server.name}`)
      } else {
        transport = new SSEClientTransport(new URL(server.url))
      }
    } catch (error: any) {
      console.error(`[MCP] Failed to create transport for ${server.name}:`, error)
      return null
    }

    const client = new Client(
      { name: "OpenOrangeAI-Client", version: "1.0.0" },
      { capabilities: { } }
    )

    try {
      console.log(`[MCP] Connecting to ${server.name}...`)
      const connectPromise = client.connect(transport)
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Connection timeout (30s)')), 30000)
      )
      await Promise.race([connectPromise, timeoutPromise])
      this.clients.set(server.id, client)
      console.log(`[MCP] Successfully connected to ${server.name}`)
      return client
    } catch (error: any) {
      console.error(`[MCP] Failed to connect to ${server.name}:`, error)
      try { await transport.close() } catch {}
      return null
    }
  }

  async getTools(): Promise<Record<string, any>> {
    // Return cached tools if still valid
    const now = Date.now()
    if (this.toolsCache && (now - this.toolsCacheTime) < this.TOOLS_CACHE_TTL) {
      console.log('[MCP] Returning cached tools')
      return this.toolsCache
    }

    console.log('[MCP] Loading tools (cache miss or expired)')
    const servers = await this.getEnabledServers()
    const allTools: Record<string, any> = {}

    // Connect to all servers in parallel and fetch tools
    const serverResults = await Promise.allSettled(
      servers.map(async (server) => {
        try {
          const client = await this.initializeClient(server)
          if (!client) return { server, tools: [] }

          const listToolsPromise = client.listTools()
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('listTools timeout (15s)')), 15000)
          )
          const { tools } = await Promise.race([listToolsPromise, timeoutPromise]) as any

          return { server, tools: tools || [] }
        } catch (error) {
          console.error(`Failed to load tools from MCP server ${server.name}:`, error)
          return { server, tools: [] }
        }
      })
    )

    for (const result of serverResults) {
      if (result.status !== 'fulfilled') continue
      const { server, tools } = result.value
      const client = this.clients.get(server.id)
      if (!client) continue

      for (const tool of tools) {
        // Namespace the tool name: serverName_toolName
        const safeServerName = server.name.replace(/[^a-zA-Z0-9]/g, '_')
        const uniqueName = `${safeServerName}_${tool.name}`
        
        allTools[uniqueName] = {
          description: tool.description || `Tool from ${server.name}`,
          parameters: (tool.inputSchema as any),
          execute: async (args: any) => {
            console.log(`[MCP] Executing tool: ${uniqueName}`, JSON.stringify(args).substring(0, 50))
            const activeClient = this.clients.get(server.id)
            if (!activeClient) throw new Error(`Client for ${server.name} not found`)
            
            try {
              const res = await activeClient.callTool({
                name: tool.name,
                arguments: args
              })
              return res.content
            } catch (err: any) {
              console.error(`[MCP] Tool ${uniqueName} error:`, err)
              return [{ type: 'text', text: `Error: ${err.message}` }]
            }
          }
        }
      }
    }

    this.toolsCache = allTools
    this.toolsCacheTime = Date.now()
    return allTools
  }

  async testConnection(server: any) {
    try {
      const client = await this.initializeClient(server)
      if (!client) {
        return { success: false, tools: [], error: 'Failed to initialize client' }
      }
      
      const { tools } = await client.listTools()
      return { success: true, tools: tools || [], error: null }
    } catch (error: any) {
      console.error(`[MCP Test] Connection test failed for ${server.name}:`, error)
      return { success: false, tools: [], error: error.message || 'Connection failed' }
    }
  }

  async getServerDetails(serverId: string) {
    let server
    if (serverId.startsWith('config:')) {
      const configServers = await this.loadConfigServers()
      server = configServers.find(s => s.id === serverId)
    } else {
      server = await (prisma as any).mcpServer.findUnique({
        where: { id: serverId }
      })
    }
    
    if (!server) throw new Error("Server not found")

    console.log(`[MCP] getServerDetails - server:`, JSON.stringify({
      id: server.id,
      name: server.name,
      type: server.type,
      command: server.command,
      args: server.args,
      argsType: typeof server.args
    }))

    try {
      const client = await this.initializeClient(server)
      if (!client) {
        console.error(`[MCP] Client initialization failed for ${server.name}`)
        return { tools: [], resources: [], prompts: [], error: 'Failed to connect to server' }
      }
      
      const listToolsPromise = client.listTools().catch(err => { console.error('listTools error', err); return { tools: [] } })
      const listResourcesPromise = client.listResources().catch(() => ({ resources: [] }))
      const listPromptsPromise = client.listPrompts().catch(() => ({ prompts: [] }))
      
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('getServerDetails timeout (15s)')), 15000)
      )
      
      const [tools, resources, prompts] = await Promise.race([
        Promise.all([listToolsPromise, listResourcesPromise, listPromptsPromise]),
        timeoutPromise
      ]) as any
      
      return {
        tools: tools.tools || [],
        resources: resources.resources || [],
        prompts: prompts.prompts || []
      }
    } catch (error: any) {
      console.error(`Failed to get details for server ${server.name}:`, error)
      return { tools: [], resources: [], prompts: [], error: error.message }
    }
  }

  async closeAll() {
    for (const client of this.clients.values()) {
      try { await client.close() } catch {}
    }
    this.clients.clear()
  }
}

export const mcpManager = new McpManager()
