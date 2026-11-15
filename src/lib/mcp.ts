import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js"
import prisma from "@/lib/db"
import { mcpLogger } from "@/lib/mcp-logger"
import fs from "fs"
import path from "path"
import os from "os"
import { MCP_CONNECT_TIMEOUT, MCP_LIST_TOOLS_TIMEOUT, MCP_TOOL_EXEC_TIMEOUT } from "./constants"

export interface McpTool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  execute: (args: Record<string, unknown>) => Promise<unknown>
}

interface McpServer {
  id: string
  name: string
  type: string
  command?: string
  args?: string
  url?: string
  env?: string
  enabled?: boolean
  source?: string
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
  private toolsCache: Record<string, unknown> | null = null
  private toolsCacheTime: number = 0
  private readonly TOOLS_CACHE_TTL = 60000 // 60 seconds cache

  clearCache() {
    this.toolsCache = null
    this.toolsCacheTime = 0
  }

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

      return Object.entries(servers).map(([name, entry]: [string, unknown]) => {
        const serverEntry = entry as Record<string, unknown>
        return {
          id: `config:${name}`,
          name: name,
          type: typeof serverEntry.type === 'string' ? serverEntry.type : 'stdio',
          command: typeof serverEntry.command === 'string' ? serverEntry.command : undefined,
          args: typeof serverEntry.args === 'string' ? serverEntry.args : JSON.stringify(serverEntry.args || []),
          url: typeof serverEntry.url === 'string' ? serverEntry.url : undefined,
          env: typeof serverEntry.env === 'string' ? serverEntry.env : JSON.stringify(serverEntry.env || {}),
          enabled: typeof serverEntry.enabled === 'boolean' ? serverEntry.enabled : true,
          source: 'config'
        } as McpServer
      })
    } catch (error) {
      console.error("Failed to load global MCP config:", error)
      return []
    }
  }

  private async getPrisma() {
    return prisma as unknown as {
      mcpServer: {
        findMany: (args: { where?: { enabled?: boolean }; orderBy?: { createdAt?: string } }) => Promise<McpServer[]>
        findUnique: (args: { where: { id: string } }) => Promise<McpServer | null>
        findFirst: (args: { where: { name?: string } }) => Promise<McpServer | null>
        create: (args: { data: Record<string, unknown> }) => Promise<McpServer>
        update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<McpServer>
        delete: (args: { where: { id: string } }) => Promise<McpServer>
      }
    }
  }

  async getEnabledServers(): Promise<McpServer[]> {
    const db = await this.getPrisma()
    const dbServers = await db.mcpServer.findMany({
      where: { enabled: true }
    }) as McpServer[]

    const configServers = await this.loadConfigServers()
    const enabledConfigServers = configServers.filter(s => s.enabled)

    return [...dbServers, ...enabledConfigServers]
  }

  async getAllServers() {
    const db = await this.getPrisma()
    const dbServers = await db.mcpServer.findMany({
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

  private parseArgs(raw: unknown): string[] {
    if (Array.isArray(raw)) return raw.map(String)
    if (typeof raw !== 'string') return []
    if (!raw.trim()) return []

    let current = raw
    let depth = 0
    while (typeof current === 'string' && depth < 10) {
      const trimmed = current.trim()
      if (trimmed.startsWith('[')) {
        try {
          const parsed = JSON.parse(trimmed)
          if (Array.isArray(parsed)) return parsed.map(String)
          current = parsed
        } catch {
          break
        }
      } else {
        try {
          const parsed = JSON.parse(trimmed)
          if (Array.isArray(parsed)) return parsed.map(String)
          if (typeof parsed === 'string') {
            current = parsed
            depth++
            continue
          }
          break
        } catch {
          break
        }
      }
      depth++
    }

    if (typeof current === 'string') {
      const cleaned = current.replace(/^\[|\]$/g, '').replace(/^"|"$/g, '').replace(/\\+"/g, '"')
      const items = cleaned.split(',').map(s => s.trim().replace(/^"|"$/g, '').replace(/^'|"$/g, '')).filter(Boolean)
      if (items.length > 0) return items
    }

    return []
  }

  private parseEnv(raw: unknown): Record<string, string> {
    if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
      const obj = raw as Record<string, unknown>
      const result: Record<string, string> = {}
      for (const [k, v] of Object.entries(obj)) {
        if (typeof v === 'string') result[k] = v
      }
      return result
    }
    if (typeof raw !== 'string') return {}
    if (!raw.trim()) return {}

    let current = raw
    let depth = 0
    while (typeof current === 'string' && depth < 10) {
      try {
        const parsed = JSON.parse(current.trim())
        if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) return parsed
        if (typeof parsed === 'string') {
          current = parsed
          depth++
          continue
        }
        break
      } catch {
        break
      }
    }
    return {}
  }

  async initializeClient(server: McpServer, forceReconnect = false) {
    if (!forceReconnect && this.clients.has(server.id)) {
      const cachedClient = this.clients.get(server.id)!
      if (await this.isClientHealthy(cachedClient)) {
        return cachedClient
      }
      console.log(`[MCP] Cached client for ${server.name} is unhealthy, reconnecting...`)
      this.clients.delete(server.id)
      try { await cachedClient.close() } catch {}
    }

    if (forceReconnect && this.clients.has(server.id)) {
      const oldClient = this.clients.get(server.id)!
      this.clients.delete(server.id)
      try { await oldClient.close() } catch {}
    }

    let transport
    try {
      if (server.type === 'stdio') {
        const args = this.parseArgs(server.args)
        const env = this.parseEnv(server.env)

        let command = server.command || ''
        const finalArgs = args

        if (process.platform === 'win32') {
          const resolved = WIN_COMMAND_MAP[command]
          if (resolved) {
            command = resolved
          } else if (!command.endsWith('.exe') && !command.endsWith('.cmd') && !command.endsWith('.bat')) {
            const { execFile } = await import('child_process')
            const cmdPath = await new Promise<string>((resolve) => {
              execFile('where', [`${command}.cmd`], { encoding: 'utf-8', shell: true }, (err: Error | null, stdout: string) => {
                if (!err && stdout.trim()) {
                  resolve(stdout.split('\n')[0].trim())
                } else {
                  execFile('where', [command], { encoding: 'utf-8', shell: true }, (err2: Error | null, stdout2: string) => {
                    resolve(!err2 && stdout2.trim() ? stdout2.split('\n')[0].trim() : command)
                  })
                }
              })
            })
            if (cmdPath) {
              command = cmdPath
            }
          }
        }

        console.log(`[MCP] Initializing ${server.name}: command=${command}, args=${JSON.stringify(finalArgs)}`)

        transport = new StdioClientTransport({
          command,
          args: finalArgs,
          env: { ...process.env, ...env } as Record<string, string>
        })

        transport.onclose = () => console.log(`[MCP] Transport closed for ${server.name}`)
      } else if (server.url) {
        transport = new SSEClientTransport(new URL(server.url))
      }
    } catch (error: unknown) {
      console.error(`[MCP] Failed to create transport for ${server.name}:`, error)
      return null
    }

    const client = new Client(
      { name: "OpenOrangeAI-Client", version: "1.0.0" },
      { capabilities: { } }
    )

    const maxRetries = 2
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          console.log(`[MCP] Retry ${attempt}/${maxRetries} for ${server.name}...`)
          await new Promise(r => setTimeout(r, 1000 * attempt))
        }
        console.log(`[MCP] Connecting to ${server.name}...`)
        let timeoutId: ReturnType<typeof setTimeout> | undefined
        const connectPromise = client.connect(transport!)
        const timeoutPromise = new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error('Connection timeout (30s)')), MCP_CONNECT_TIMEOUT)
        })
        try {
          await Promise.race([connectPromise, timeoutPromise])
        } finally {
          clearTimeout(timeoutId!)
        }
        this.clients.set(server.id, client)
        this.clearCache()
        console.log(`[MCP] Successfully connected to ${server.name}`)
        return client
      } catch (error: unknown) {
        const err = error as Error
        console.error(`[MCP] Connection attempt ${attempt + 1} failed for ${server.name}:`, err.message)
        if (attempt === maxRetries) {
          try { await transport?.close?.() } catch {}
          return null
        }
      }
    }
    return null
  }

  async getTools(): Promise<Record<string, unknown>> {
    // Return cached tools if still valid
    const now = Date.now()
    if (this.toolsCache && (now - this.toolsCacheTime) < this.TOOLS_CACHE_TTL) {
      console.log('[MCP] Returning cached tools')
      return this.toolsCache
    }

    console.log('[MCP] Loading tools (cache miss or expired)')
    const servers = await this.getEnabledServers()
    const allTools: Record<string, unknown> = {}

    // Connect to all servers in parallel and fetch tools
    const serverResults = await Promise.allSettled(
      (servers as McpServer[]).map(async (server) => {
        try {
          const client = await this.initializeClient(server)
          if (!client) return { server, tools: [] }

          let timeoutId: ReturnType<typeof setTimeout> | undefined
          const listToolsPromise = client.listTools()
          const timeoutPromise = new Promise<never>((_, reject) => {
            timeoutId = setTimeout(() => reject(new Error('listTools timeout (15s)')), MCP_LIST_TOOLS_TIMEOUT)
          })
          let result: { tools?: Array<{ name: string; description?: string; inputSchema?: unknown }> }
          try {
            result = await Promise.race([listToolsPromise, timeoutPromise])
          } finally {
            clearTimeout(timeoutId)
          }
          const { tools } = result || {}

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
          parameters: tool.inputSchema,
          execute: async (args: Record<string, unknown>) => {
            const startTime = Date.now()
            console.log(`[MCP] Executing tool: ${uniqueName}`, JSON.stringify(args).substring(0, 100))
            let activeClient: Client | null = this.clients.get(server.id) ?? null

            if (!activeClient) {
              console.log(`[MCP] Client for ${server.name} not cached, attempting reconnect...`)
              activeClient = await this.initializeClient(server)
              if (!activeClient) {
                const duration = Date.now() - startTime
                mcpLogger.logToolCall({
                  toolName: uniqueName,
                  serverName: server.name,
                  args,
                  result: { error: 'Client not available' },
                  status: 'error',
                  duration,
                }).catch(() => {})
                return [{ type: 'text', text: `Error: Client for ${server.name} not available after reconnect` }]
              }
            }

            try {
              let timeoutId: ReturnType<typeof setTimeout> | undefined
              const callPromise = activeClient.callTool({
                name: tool.name,
                arguments: args
              })
              const timeoutPromise = new Promise<never>((_, reject) => {
                timeoutId = setTimeout(() => reject(new Error(`Tool ${uniqueName} timeout (60s)`)), MCP_TOOL_EXEC_TIMEOUT)
              })
              let res: Record<string, unknown>
              try {
                res = await Promise.race([callPromise, timeoutPromise]) as Record<string, unknown>
              } finally {
                clearTimeout(timeoutId)
              }

              // Fire-and-forget logging
              const duration = Date.now() - startTime
              mcpLogger.logToolCall({
                toolName: uniqueName,
                serverName: server.name,
                args,
                result: res.content,
                status: 'success',
                duration,
              }).catch(() => {})

              return res.content
            } catch (err: unknown) {
              const error = err as Error
              console.error(`[MCP] Tool ${uniqueName} error:`, error.message)
              if (error.message?.includes('timeout') || error.message?.includes('not connected')) {
                this.clients.delete(server.id)
                try { await activeClient.close() } catch {}
              }

              // Fire-and-forget error logging
              const duration = Date.now() - startTime
              mcpLogger.logToolCall({
                toolName: uniqueName,
                serverName: server.name,
                args,
                result: { error: error.message },
                status: 'error',
                duration,
              }).catch(() => {})

              return [{ type: 'text', text: `Error: ${error.message}` }]
            }
          }
        }
      }
    }

    this.toolsCache = allTools
    this.toolsCacheTime = Date.now()

    const builtinTools = this.getBuiltinTools()
    for (const [name, t] of Object.entries(builtinTools)) {
      allTools[name] = t
    }

    return allTools
  }

  private getBuiltinTools(): Record<string, unknown> {
    return {
      builtin_get_current_time: {
        description: '获取当前日期和时间，包括时区信息。当用户询问当前时间、日期、星期几时使用。',
        parameters: {
          type: 'object',
          properties: {
            timezone: {
              type: 'string',
              description: '时区，如 Asia/Shanghai, America/New_York',
              default: 'Asia/Shanghai'
            }
          }
        },
        execute: async (args: Record<string, unknown>) => {
          const tz = (args?.timezone as string) || 'Asia/Shanghai'
          try {
            const now = new Date()
            const formatted = now.toLocaleString('zh-CN', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', weekday: 'long' })
            const iso = now.toISOString()
            return [{ type: 'text', text: `当前时间: ${formatted}\nISO格式: ${iso}\n时区: ${tz}` }]
          } catch {
            return [{ type: 'text', text: `当前时间: ${new Date().toISOString()}` }]
          }
        }
      },
      builtin_calculate: {
        description: '执行数学计算。支持基本运算、三角函数、对数等。当用户需要精确计算时使用。',
        parameters: {
          type: 'object',
          properties: {
            expression: {
              type: 'string',
              description: '数学表达式，如 "2+3*4", "sqrt(144)", "sin(PI/4)"'
            }
          },
          required: ['expression']
        },
        execute: async (args: Record<string, unknown>) => {
          const expr = args?.expression as string | undefined
          if (!expr) return [{ type: 'text', text: '错误: 请提供数学表达式' }]
          // Whitelist: only allow digits, operators, parentheses, decimal points, spaces, and known math functions
          if (!/^[0-9+\-*/().%\s,sincotaglqrtqpweflPIEe]+$/.test(expr)) {
            return [{ type: 'text', text: '错误: 表达式包含不允许的字符' }]
          }
          try {
            // Simple safe math evaluator using whitelisted tokens
            const mathFns: Record<string, (...args: number[]) => number> = {
              sqrt: Math.sqrt,
              abs: Math.abs,
              sin: Math.sin,
              cos: Math.cos,
              tan: Math.tan,
              asin: Math.asin,
              acos: Math.acos,
              atan: Math.atan,
              log: Math.log,
              log2: Math.log2,
              log10: Math.log10,
              exp: Math.exp,
              pow: Math.pow,
              floor: Math.floor,
              ceil: Math.ceil,
              round: Math.round,
              min: Math.min,
              max: Math.max,
            }
            const constants: Record<string, number> = {
              PI: Math.PI,
              E: Math.E,
            }
            // Replace function names and constants, then evaluate with Function
            let safeExpr = expr
            for (const [name, val] of Object.entries(constants)) {
              safeExpr = safeExpr.replace(new RegExp(`\\b${name}\\b`, 'g'), String(val))
            }
            for (const name of Object.keys(mathFns)) {
              safeExpr = safeExpr.replace(new RegExp(`\\b${name}\\b`, 'g'), `Math.${name}`)
            }
            // Double-check: only allow safe characters after substitution
            if (!/^[0-9+\-*/().%\s,Math.sqrabflceipowgtnx]+$/.test(safeExpr)) {
              return [{ type: 'text', text: '错误: 表达式包含不允许的字符' }]
            }
            const fn = new Function(`"use strict"; return (${safeExpr})`)
            const result = fn()
            if (typeof result !== 'number' || !isFinite(result)) {
              return [{ type: 'text', text: `计算结果无效: ${result}` }]
            }
            return [{ type: 'text', text: `${expr} = ${result}` }]
          } catch (e: unknown) {
            return [{ type: 'text', text: `计算错误: ${(e as Error).message}` }]
          }
        }
      },
      builtin_read_file: {
        description: '读取本地文件内容。当用户需要查看文件内容时使用。',
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: '文件的绝对路径'
            },
            encoding: {
              type: 'string',
              description: '文件编码，默认utf-8',
              default: 'utf-8'
            }
          },
          required: ['path']
        },
        execute: async (args: Record<string, unknown>) => {
          const filePath = args?.path as string | undefined
          if (!filePath) return [{ type: 'text', text: '错误: 请提供文件路径' }]
          const resolved = path.resolve(filePath)
          const homeDir = os.homedir()
          const allowedDirs = [homeDir, os.tmpdir(), process.cwd()]
          const isAllowed = allowedDirs.some(d => resolved.startsWith(d))
          if (!isAllowed) return [{ type: 'text', text: `错误: 不允许访问此路径。允许的目录: ${allowedDirs.join(', ')}` }]
          // Sensitive directory blacklist
          const sensitiveDirs = ['.ssh', '.aws', '.gnupg', '.env', '.git']
          const pathParts = resolved.split(path.sep)
          if (pathParts.some(p => sensitiveDirs.includes(p))) {
            return [{ type: 'text', text: '错误: 不允许访问敏感目录 (.ssh, .aws, .gnupg, .env, .git)' }]
          }
          try {
            const stat = fs.statSync(resolved)
            if (stat.size > 1024 * 1024) return [{ type: 'text', text: `错误: 文件过大 (${(stat.size / 1024 / 1024).toFixed(1)}MB)，最大支持1MB` }]
            const content = String(fs.readFileSync(resolved, { encoding: ((args?.encoding as string) || 'utf-8') as BufferEncoding }))
            return [{ type: 'text', text: `文件: ${resolved}\n大小: ${stat.size} bytes\n\n${content.substring(0, 5000)}${content.length > 5000 ? '\n...(截断)' : ''}` }]
          } catch (e: unknown) {
            return [{ type: 'text', text: `读取文件失败: ${(e as Error).message}` }]
          }
        }
      },
      builtin_list_directory: {
        description: '列出目录内容。当用户需要查看目录中的文件和文件夹时使用。',
        parameters: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: '目录的绝对路径'
            }
          },
          required: ['path']
        },
        execute: async (args: Record<string, unknown>) => {
          const dirPath = args?.path as string | undefined
          if (!dirPath) return [{ type: 'text', text: '错误: 请提供目录路径' }]
          const resolved = path.resolve(dirPath)
          // Path whitelist - same as builtin_read_file
          const homeDir = os.homedir()
          const allowedDirs = [homeDir, os.tmpdir(), process.cwd()]
          const isAllowed = allowedDirs.some(d => resolved.startsWith(d))
          if (!isAllowed) return [{ type: 'text', text: `错误: 不允许访问此路径。允许的目录: ${allowedDirs.join(', ')}` }]
          // Sensitive directory blacklist
          const sensitiveDirs = ['.ssh', '.aws', '.gnupg', '.env', '.git']
          const pathParts = resolved.split(path.sep)
          if (pathParts.some(p => sensitiveDirs.includes(p))) {
            return [{ type: 'text', text: '错误: 不允许访问敏感目录 (.ssh, .aws, .gnupg, .env, .git)' }]
          }
          try {
            const entries = fs.readdirSync(resolved, { withFileTypes: true })
            const items = entries.slice(0, 100).map(e => {
              const prefix = e.isDirectory() ? '📁' : e.isFile() ? '📄' : '🔗'
              return `${prefix} ${e.name}`
            })
            return [{ type: 'text', text: `目录: ${dirPath}\n共 ${entries.length} 项${entries.length > 100 ? '（仅显示前100项）' : ''}\n\n${items.join('\n')}` }]
          } catch (e: unknown) {
            return [{ type: 'text', text: `列出目录失败: ${(e as Error).message}` }]
          }
        }
      },
      builtin_get_system_info: {
        description: '获取系统信息，包括操作系统、CPU、内存等。当用户询问系统信息时使用。',
        parameters: {
          type: 'object',
          properties: {}
        },
        execute: async () => {
          const cpus = os.cpus()
          const totalMem = os.totalmem()
          const freeMem = os.freemem()
          return [{
            type: 'text',
            text: `系统信息:
操作系统: ${os.type()} ${os.release()} ${os.arch()}
CPU: ${cpus[0]?.model || 'Unknown'} (${cpus.length} 核)
内存: ${(freeMem / 1024 / 1024 / 1024).toFixed(1)}GB 可用 / ${(totalMem / 1024 / 1024 / 1024).toFixed(1)}GB 总计
运行时间: ${(os.uptime() / 3600).toFixed(1)} 小时
Node.js: ${process.version}`
          }]
        }
      },
      builtin_url_encode_decode: {
        description: 'URL编码或解码字符串。当用户需要处理URL中的特殊字符时使用。',
        parameters: {
          type: 'object',
          properties: {
            text: {
              type: 'string',
              description: '要编码或解码的文本'
            },
            mode: {
              type: 'string',
              enum: ['encode', 'decode'],
              description: 'encode为编码，decode为解码'
            }
          },
          required: ['text', 'mode']
        },
        execute: async (args: Record<string, unknown>) => {
          const text = (args as Record<string, unknown>)?.text as string | undefined
          const mode = (args as Record<string, unknown>)?.mode as string | undefined
          if (!text || !mode) return [{ type: 'text', text: '错误: 请提供text和mode参数' }]
          try {
            const result = mode === 'encode' ? encodeURIComponent(text) : decodeURIComponent(text)
            return [{ type: 'text', text: `${mode === 'encode' ? '编码' : '解码'}结果: ${result}` }]
          } catch (e: unknown) {
            return [{ type: 'text', text: `${mode}失败: ${(e as Error).message}` }]
          }
        }
      },
      builtin_json_format: {
        description: '格式化或验证JSON字符串。当用户需要美化JSON或检查JSON格式是否正确时使用。',
        parameters: {
          type: 'object',
          properties: {
            json: {
              type: 'string',
              description: 'JSON字符串'
            },
            indent: {
              type: 'number',
              description: '缩进空格数，默认2',
              default: 2
            }
          },
          required: ['json']
        },
        execute: async (args: Record<string, unknown>) => {
          const json = (args as Record<string, unknown>)?.json as string | undefined
          const indent = (args as Record<string, unknown>)?.indent as number | undefined
          if (!json) return [{ type: 'text', text: '错误: 请提供JSON字符串' }]
          try {
            const parsed = JSON.parse(json)
            return [{ type: 'text', text: JSON.stringify(parsed, null, indent || 2) }]
          } catch (e: unknown) {
            return [{ type: 'text', text: `JSON格式错误: ${(e as Error).message}` }]
          }
        }
      }
    }
  }

  async testConnection(server: McpServer) {
    try {
      const client = await this.initializeClient(server)
      if (!client) {
        return { success: false, tools: [], error: 'Failed to initialize client' }
      }
      
      const { tools } = await client.listTools()
      return { success: true, tools: tools || [], error: null }
    } catch (error: unknown) {
      console.error(`[MCP Test] Connection test failed for ${server.name}:`, error)
      return { success: false, tools: [], error: (error as Error).message || 'Connection failed' }
    }
  }

  async getServerDetails(serverId: string) {
    let server: McpServer | null | undefined
    const db = await this.getPrisma()
    if (serverId.startsWith('config:')) {
      const configServers = await this.loadConfigServers()
      server = configServers.find(s => s.id === serverId) as McpServer | undefined
    } else {
      server = await db.mcpServer.findUnique({
        where: { id: serverId }
      }) as McpServer | null
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

      let timeoutId: ReturnType<typeof setTimeout> | undefined
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('getServerDetails timeout (15s)')), MCP_LIST_TOOLS_TIMEOUT)
      })

      let results: [
        { tools?: Array<{ name: string }> },
        { resources?: unknown[] },
        { prompts?: unknown[] }
      ]
      try {
        results = await Promise.race([
          Promise.all([listToolsPromise, listResourcesPromise, listPromptsPromise]),
          timeoutPromise
        ])
      } finally {
        clearTimeout(timeoutId)
      }

      const [tools, resources, prompts] = results

      return {
        tools: tools?.tools || [],
        resources: resources?.resources || [],
        prompts: prompts?.prompts || []
      }
    } catch (error: unknown) {
      console.error(`Failed to get details for server ${server.name}:`, error)
      return { tools: [], resources: [], prompts: [], error: (error as Error).message }
    }
  }

  async closeAll() {
    for (const client of this.clients.values()) {
      try { await client.close() } catch {}
    }
    this.clients.clear()
    this.clearCache()
  }
}

export const mcpManager = new McpManager()
