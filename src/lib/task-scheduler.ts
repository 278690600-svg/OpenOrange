import { parseModelId, getProviderInfo, createInferenceStream, getProviderConfig } from '@/lib/model-adapter'
import type { ProviderType, InferenceOptions, ModelMessage } from '@/lib/model-adapter'
import { extractContent } from '@/lib/ai-provider'
import prisma from '@/lib/db'
import { v4 as uuidv4 } from 'uuid'
import { PERSIST_INTERVAL_MS, PERSIST_MIN_LENGTH, CHAT_REQUEST_TIMEOUT, CRAWL_TIMEOUT, MAX_CRAWL_TEXT_LENGTH } from '@/lib/constants'
import { buildKnowledgeContext } from '@/lib/knowledge'
import { searchWithFallback, SearchResult } from '@/lib/search-service'
import { shouldRetryWithFallback, getFallbackModel, getModelDisplayName, FallbackAttempt } from '@/lib/model-fallback'
import { rankSearchResults, extractGoldenSnippets } from '@/lib/search-reranker'

export type TaskStatus = 'submitted' | 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'

export async function prismaRetry<T>(fn: () => Promise<T>, retries = 5, delay = 150): Promise<T> {
  let attempt = 0
  while (true) {
    try {
      return await fn()
    } catch (e: any) {
      attempt++
      const msg = (e.message || '').toLowerCase()
      const isDbLocked = msg.includes('lock') || 
                         msg.includes('busy') ||
                         e.code === 'P2034' || 
                         e.code === 'P2028'
      if (isDbLocked && attempt < retries) {
        const backoff = delay * Math.pow(2, attempt - 1) * (0.8 + Math.random() * 0.4)
        console.warn(`[TaskScheduler] Database locked/busy (code=${e.code || 'n/a'}). Retrying in ${Math.round(backoff)}ms (attempt ${attempt}/${retries})...`)
        await new Promise(resolve => setTimeout(resolve, backoff))
        continue
      }
      throw e
    }
  }
}

export interface TaskInput {
  taskId: string
  chatId: string
  model: string
  messages: Array<Record<string, unknown>>
  deepThink?: boolean
  webSearch?: boolean | 'auto' | 'deep'
  kbId?: string | null
  files?: Array<Record<string, unknown>>
  promptId?: string | null
  docType?: 'none' | 'ppt' | 'docx' | 'xlsx'
  docStyle?: string
  docTheme?: string
}

const DOCX_SYSTEM_PROMPT = `
# WORD DOCUMENT GENERATION MODE - MANDATORY
When user asks for a Word document, report, article, or any text document, you MUST respond with structured HTML content inside a \`\`\`docx code block. Do NOT just describe the document - you MUST output the actual HTML code block.

CRITICAL RULE: Your response MUST contain a \`\`\`docx code block with valid HTML. No exceptions.

## Rules:
1. Output well-structured HTML inside a \`\`\`docx code block.
2. Use semantic HTML tags: <h1>, <h2>, <h3>, <p>, <ul>, <ol>, <li>, <strong>, <em>, <table>, <tr>, <td>, <th>, <blockquote>, <code>.
3. For tables, use proper <table> markup with headers.
4. Keep content professional and well-organized.
5. Do NOT include <html>, <head>, <body> tags - just the content HTML.

## Example:
\`\`\`docx
<h1>Project Report</h1>
<h2>Executive Summary</h2>
<p>This report covers <strong>key findings</strong> from Q4 analysis.</p>
<table>
  <tr><th>Metric</th><th>Value</th></tr>
  <tr><td>Revenue</td><td>$1.2M</td></tr>
</table>
\`\`\`
`

const EXCEL_SYSTEM_PROMPT = `
# EXCEL SPREADSHEET GENERATION MODE - MANDATORY
When user asks for a spreadsheet, table data, or Excel file, you MUST respond with structured JSON inside a \`\`\`xlsx code block. Do NOT just describe the data - you MUST output the actual JSON code block.

CRITICAL RULE: Your response MUST contain a \`\`\`xlsx code block with valid JSON. No exceptions.

## Rules:
1. Output a JSON object inside a \`\`\`xlsx code block.
2. The JSON must have a "sheets" array with sheet objects.
3. Each sheet has "name", "headers" (array of column names), and "rows" (array of arrays).
4. Keep data types consistent (numbers as numbers, strings as strings).
5. Support multiple sheets if the user requests.

## Example:
\`\`\`xlsx
{
  "sheets": [
    {
      "name": "Sales Report",
      "headers": ["Product", "Q1", "Q2", "Q3", "Q4"],
      "rows": [
        ["Widget A", 1200, 1500, 1800, 2100],
        ["Widget B", 800, 950, 1100, 1350]
      ]
    }
  ]
}
\`\`\`
`

const PPT_SYSTEM_PROMPT = `
# PPT GENERATION MODE - MANDATORY
When user asks for a PPT, presentation, or slides, you MUST respond with a structured JSON block inside a \`\`\`ppt code block. Do NOT describe the PPT in plain text - you MUST output the actual JSON code block.

CRITICAL RULE: Your response MUST contain a \`\`\`ppt code block with valid JSON. No exceptions.

Act as a **World-Class Visual Designer** (Swiss, Apple, Vogue editorial standards).

## Design Intelligence Rules:
1. **Background Mastery**: 
   - Use \`background\` (hex) for solid colors.
   - Use \`backgroundUrl\` for breathtaking full-bleed photographic backgrounds.
   - Theme fallback colors: zinc(#18181b), orange(#ea580c), blue(#2563eb), green(#16a34a), rose(#e11d48).
2. **Image Prompt Engineering**:
   - \`imageUrl\` prompts MUST be detailed, English, and aesthetic.
   - Keywords: "cinematic lighting", "minimalist architecture", "editorial photography", "vibrant gradient", "abstract 3D render".
   - Use \`https://loremflickr.com/1280/720/[keywords]?random=[1-100]\`.
3. **Typography Scaling**:
   - Title: 60-80px. Subtitle: 24-32px. Body: 18-20px.
4. **Layout Blueprints (MASTER MODE)**:
   - **Swiss Grid**: { "layout": "custom", "blocks": [...] } with heavy usage of shapes (boxes) for structure.
   - **Apple Dark**: Black background, white semi-bold text, centered with 3D abstract imagery.
   - **Editorial Vogue**: Serif fonts (style:editorial), beige background, large images with tight margins.

## JSON Schema:
\`\`\`ppt
{
  "title": "Presentation Header",
  "theme": "zinc", // zinc, orange, blue, green, rose
  "style": "swiss", // swiss, apple, editorial, modern, pencil
  "background": "#ffffff", // Global background
  "slides": [
    {
       "title": "Slide Title",
       "layout": "custom", // Use "custom" for advanced blocks, or templates: "title", "hero", "image_left", "image_right", "two_column", "three_column", "kpi", "quote", "section", "bullet"
       "background": "#f8f9fa",
       "backgroundUrl": "...", // Full-slide background image
       "blocks": [
         { "type": "shape", "x": 0, "y": 0, "w": 400, "h": 720, "fill": "#18181b" },
         { "type": "text", "x": 50, "y": 100, "w": 300, "h": 100, "content": "Bold Statement", "fontSize": 70, "color": "#ffffff", "fontWeight": "bold" },
         { "type": "image", "x": 450, "y": 100, "w": 780, "h": 520, "imageUrl": "..." }
       ],
       "notes": "..."
    }
  ]
}
\`\`\`
CRITICAL: Use high-quality visual keywords for images. Avoid generic terms.

## Interactive Interaction Rules:
1. **CRITICAL JSON LENGTH LIMIT**: To prevent truncation, DO NOT generate more than 6-8 slides in a single response. If the presentation requires more slides, generate the first batch, close the JSON block, and provide an option to continue.
2. **Task Splitting**: Before or during a complex task (like generating a long PPT), output a \`task\` block to list milestones.
   Example:
   \`\`\`task
   [x] 规划大纲内容
   [ ] 生成核心幻灯片 1-5
   [ ] 生成后续幻灯片 6-10
   \`\`\`
3. **Selectable Options**: When you need user input or offer next steps, use \`[option: Label | Value]\`.
   Example: \`[option: 继续生成第6-10页幻灯片 | 好的，请继续生成第6到10页]\`
   Example: \`[option: 修改主题颜色 | 帮我换一个深色主题]\`
`

function getPptTemplatesPrompt(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs')
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require('path')
    
    const templatesFile = path.join(process.cwd(), 'uploads', 'ppt-templates.json')
    let templates: any[] = []
    
    if (fs.existsSync(templatesFile)) {
      const content = fs.readFileSync(templatesFile, 'utf-8')
      templates = JSON.parse(content)
    }

    let promptText = `\n\n## 现有 PPT 模版库 (Model Template Library):\n`
    promptText += `你当前拥有以下内置和自定义 PPT 模板。如果用户在指令中要求你“套用模版”、“使用模版”、“仿照模版”来制作 PPT，或者用户提到了与模板相关的名字（例如“工作汇报”、“商业策划”等），你必须：\n`
    promptText += `1. 仿照、借鉴该模版的幻灯片大纲、页面布局、主题层次以及文案结构，将用户输入的主题和内容无缝填入与扩展！\n`
    promptText += `2. **强制规则**：你必须在输出的 \`\`\`ppt 代码块的 JSON 顶级属性中设置 \`"templateId": "选中的模版ID"\` 字段（例如 \`"templateId": "working-report-xml"\`）！\n\n`
    
    const defaultTemplates = [
      { id: 'business-pitch', name: 'Business Pitch Deck', description: '商业策划书、项目路演' },
      { id: 'project-report', name: 'Project Report', description: '项目汇报、周报、月度汇报' },
      { id: 'tech-presentation', name: 'Technical Presentation', description: '技术分享、架构设计、技术演练' }
    ]

    const allTemplates = [...templates]
    defaultTemplates.forEach(dt => {
      if (!allTemplates.some(t => t.id === dt.id)) {
        allTemplates.push({ id: dt.id, name: dt.name, description: dt.description, slides: [] })
      }
    })

    allTemplates.forEach(t => {
      promptText += `- **模版 ID**: \`${t.id}\` | **名称**: "${t.name}" | **说明**: ${t.description || '无'}\n`
      if (t.slides && t.slides.length > 0) {
        promptText += `  该模版包含 ${t.slides.length} 页，其参考页面大纲如下：\n`
        t.slides.forEach((s: any, idx: number) => {
          promptText += `    - 第 ${idx + 1} 页: "${s.title}" (布局: ${s.layout})\n`
        })
      }
      promptText += `\n`
    })

    return promptText
  } catch (err) {
    console.error('Failed to generate ppt templates prompt:', err)
    return ''
  }
}

export interface TaskOutput {
  taskId: string
  status: TaskStatus
  fullText: string
  error?: string
  chatId: string
}

type TaskSubscriber = (event: string, data: unknown) => void | Promise<void>

class ProviderSemaphore {
  private counts: Map<ProviderType, number> = new Map()
  private queues: Map<ProviderType, Array<() => void>> = new Map()

  async acquire(provider: ProviderType): Promise<void> {
    const info = getProviderInfo(provider)
    const max = info.maxConcurrency
    const current = this.counts.get(provider) || 0

    if (current < max) {
      this.counts.set(provider, current + 1)
      return
    }

    return new Promise<void>((resolve) => {
      const queue = this.queues.get(provider) || []
      queue.push(resolve)
      this.queues.set(provider, queue)
    })
  }

  release(provider: ProviderType): void {
    const current = this.counts.get(provider) || 0
    this.counts.set(provider, Math.max(0, current - 1))

    const queue = this.queues.get(provider) || []
    if (queue.length > 0) {
      const next = queue.shift()!
      this.counts.set(provider, (this.counts.get(provider) || 0) + 1)
      next()
    }
  }

  getActiveCount(provider: ProviderType): number {
    return this.counts.get(provider) || 0
  }
}

class TaskScheduler {
  private taskQueue: TaskInput[] = []
  private activeTasks: Map<string, { input: TaskInput; abortController: AbortController }> = new Map()
  private subscribers: Map<string, Set<TaskSubscriber>> = new Map()
  private semaphore = new ProviderSemaphore()
  private abortRegistry: Map<string, AbortController> = new Map()
  private isProcessing = false
  private settings: Record<string, unknown> | null = null
  private settingsTimestamp = 0
  readonly instanceId: string
  private taskSnapshots: Map<string, {
    status: TaskStatus
    chatId: string
    originalChatId: string
    accumulatedText: string
  }> = new Map()
  private eventBuffer: Map<string, Array<{ event: string; data: unknown }>> = new Map()

  constructor() {
    this.instanceId = Math.random().toString(36).substring(2, 8)
    console.log(`[TaskScheduler] Instance created: ${this.instanceId}`)
  }

  async getSettings() {
    const now = Date.now()
    // BUG-013 FIX: 缩短缓存时间到10秒，使API Key更新更快生效
    if (this.settings && now - this.settingsTimestamp < 10000) {
      return this.settings
    }
    this.settings = await prisma.settings.findUnique({ where: { id: 'default' } })
    this.settingsTimestamp = now
    return this.settings
  }

  invalidateSettings() {
    this.settings = null
    this.settingsTimestamp = 0
  }

  enqueue(input: TaskInput): string {
    const existing = this.taskQueue.find(t => t.taskId === input.taskId)
    if (existing) return input.taskId

    this.taskQueue.push(input)
    this.abortRegistry.set(input.taskId, new AbortController())

    console.log(`[TaskScheduler:${this.instanceId}] Enqueue task ${input.taskId}, queue=${this.taskQueue.length}, active=${this.activeTasks.size}`)

    this.processQueue()

    if (this.isProcessing) {
      setTimeout(() => this.processQueue(), 200)
    }

    return input.taskId
  }

  cancel(taskId: string): boolean {
    const controller = this.abortRegistry.get(taskId)
    if (controller) {
      controller.abort()
      this.abortRegistry.delete(taskId)
    }

    this.taskQueue = this.taskQueue.filter(t => t.taskId !== taskId)

    const active = this.activeTasks.get(taskId)
    if (active) {
      active.abortController.abort()
      const { provider } = parseModelId(active.input.model)
      this.semaphore.release(provider)
      this.activeTasks.delete(taskId)
    }

    this.emit(taskId, 'status', { type: 'task', stage: 'cancelled', message: '任务已取消' })
    return true
  }

  subscribe(taskId: string, subscriber: TaskSubscriber): () => void {
    if (!this.subscribers.has(taskId)) {
      this.subscribers.set(taskId, new Set())
    }
    this.subscribers.get(taskId)!.add(subscriber)
    console.log(`[TaskScheduler:${this.instanceId}] Subscribe to ${taskId}, total subscribers=${this.subscribers.get(taskId)!.size}, queue=${this.taskQueue.length}, active=${this.activeTasks.size}`)
    return () => {
      this.subscribers.get(taskId)?.delete(subscriber)
    }
  }

  getBufferedEvents(taskId: string): Array<{ event: string; data: unknown }> {
    return this.eventBuffer.get(taskId) || []
  }

  getTaskStatus(taskId: string): TaskStatus | null {
    if (this.activeTasks.has(taskId)) return 'running'
    if (this.taskQueue.some(t => t.taskId === taskId)) return 'queued'
    const snapshot = this.taskSnapshots.get(taskId)
    if (snapshot) {
      if (snapshot.status === 'completed' || snapshot.status === 'failed' || snapshot.status === 'cancelled') {
        return snapshot.status
      }
      if (snapshot.status === 'running' || snapshot.status === 'submitted') {
        return snapshot.status
      }
    }
    return null
  }

  getActiveTaskCount(): number {
    return this.activeTasks.size
  }

  getQueueLength(): number {
    return this.taskQueue.length
  }

  getTaskInfo(taskId: string): { status: TaskStatus; chatId: string; originalChatId: string; accumulatedText: string } | null {
    return this.taskSnapshots.get(taskId) || null
  }

  private async getMaxConcurrent(providerType: ProviderType): Promise<number> {
    try {
      const settings = await this.getSettings()
      const maxChats = settings?.maxConcurrentChats as number
      if (maxChats && maxChats > 0) {
        return maxChats
      }
    } catch {}
    return getProviderInfo(providerType).maxConcurrency
  }

  getQueueTasks(): TaskInput[] {
    return [...this.taskQueue]
  }

  cancelTask(taskId: string) {
    const abortController = this.abortRegistry.get(taskId)
    if (abortController) {
      abortController.abort()
      console.log(`[TaskScheduler:${this.instanceId}] Aborted task ${taskId}`)
    }

    this.taskQueue = this.taskQueue.filter(t => t.taskId !== taskId)
    this.activeTasks.delete(taskId)
    this.abortRegistry.delete(taskId)
    this.taskSnapshots.delete(taskId)

    this.emit(taskId, 'status', { type: 'task', stage: 'cancelled', message: '任务已取消' })

    setTimeout(() => this.processQueue(), 50)
  }

  cancelAllTasks() {
    console.log(`[TaskScheduler:${this.instanceId}] Cancelling all tasks, queue=${this.taskQueue.length}, active=${this.activeTasks.size}`)

    for (const [taskId, { abortController }] of this.activeTasks) {
      abortController.abort()
      this.emit(taskId, 'status', { type: 'task', stage: 'cancelled', message: '任务已取消' })
    }

    for (const task of this.taskQueue) {
      this.emit(task.taskId, 'status', { type: 'task', stage: 'cancelled', message: '任务已取消' })
    }

    this.taskQueue = []
    this.activeTasks.clear()
    this.abortRegistry.clear()
    this.taskSnapshots.clear()
  }

  private emit(taskId: string, event: string, data: unknown) {
    if (!this.taskSnapshots.has(taskId)) {
      this.taskSnapshots.set(taskId, { status: 'submitted', chatId: '', originalChatId: '', accumulatedText: '' })
    }
    const snapshot = this.taskSnapshots.get(taskId)!

    if (event === 'status') {
      const d = data as Record<string, string>
      if (d.stage === 'running') snapshot.status = 'running'
      else if (d.stage === 'queued') snapshot.status = 'queued'
      else if (d.stage === 'cancelled') snapshot.status = 'cancelled'
    } else if (event === 'chatId') {
      const d = data as Record<string, string>
      snapshot.chatId = d.id
      snapshot.originalChatId = d.oldId || ''
    } else if (event === 'text') {
      const d = data as Record<string, string>
      snapshot.accumulatedText += d.content || ''
    } else if (event === 'done') {
      snapshot.status = 'completed'
    } else if (event === 'task_error') {
      snapshot.status = 'failed'
    }

    if (!this.eventBuffer.has(taskId)) {
      this.eventBuffer.set(taskId, [])
    }
    this.eventBuffer.get(taskId)!.push({ event, data })

    const subs = this.subscribers.get(taskId)
    console.log(`[TaskScheduler:${this.instanceId}] Emit '${event}' to ${taskId}, subscribers=${subs?.size || 0}, snapshot=${snapshot.status}`)
    subs?.forEach(sub => {
      try {
        Promise.resolve(sub(event, data)).catch(e => console.error(`[TaskScheduler] Async emit error:`, e))
      } catch (e) { console.error(`[TaskScheduler] Emit error:`, e) }
    })
  }

  private async processQueue() {
    if (this.isProcessing) {
      console.log(`[TaskScheduler:${this.instanceId}] processQueue skipped, already processing`)
      return
    }
    this.isProcessing = true
    console.log(`[TaskScheduler:${this.instanceId}] processQueue start, queue=${this.taskQueue.length}, active=${this.activeTasks.size}`)

    try {
      if (this.activeTasks.size > 0) {
        const activeTaskIds = Array.from(this.activeTasks.keys())
        const completedTasks = await prisma.inferenceTask.findMany({
          where: {
            id: { in: activeTaskIds },
            status: { in: ['completed', 'failed', 'cancelled'] }
          },
          select: { id: true, status: true }
        })
        for (const dbTask of completedTasks) {
          console.log(`[TaskScheduler:${this.instanceId}] Removing zombie task ${dbTask.id} (db status: ${dbTask.status})`)
          const activeTask = this.activeTasks.get(dbTask.id)
          if (activeTask) {
            const { provider } = parseModelId(activeTask.input.model)
            this.semaphore.release(provider)
          }
          this.activeTasks.delete(dbTask.id)
          this.abortRegistry.delete(dbTask.id)
          this.taskSnapshots.delete(dbTask.id)
        }
        if (completedTasks.length > 0) {
          console.log(`[TaskScheduler:${this.instanceId}] Cleaned ${completedTasks.length} zombie tasks, active=${this.activeTasks.size}`)
        }
      }

      let hasQueuedTasks = false
      
      while (this.taskQueue.length > 0) {
        const task = this.taskQueue[0]
        const { provider: providerType } = parseModelId(task.model)
        
        // 重新计算活跃任务，排除僵尸任务
        const activeForProvider = Array.from(this.activeTasks.values())
          .filter(t => {
            const p = parseModelId(t.input.model).provider
            return p === providerType
          }).length

        const maxConcurrent = await this.getMaxConcurrent(providerType)

        console.log(`[TaskScheduler:${this.instanceId}] Checking task ${task.taskId}, provider=${providerType}, active=${activeForProvider}, max=${maxConcurrent}, queue=${this.taskQueue.length}`)

        if (activeForProvider >= maxConcurrent) {
          console.log(`[TaskScheduler:${this.instanceId}] Provider ${providerType} at capacity (${activeForProvider}/${maxConcurrent}), task ${task.taskId} will be queued`)
          // 只有真正需要等待的任务才标记为 queued
          if (!hasQueuedTasks) {
            this.emit(task.taskId, 'status', { type: 'task', stage: 'queued', message: '任务排队中', activeCount: activeForProvider, maxConcurrent })
            hasQueuedTasks = true
          }
          break
        }

        // 有可用槽位，直接开始执行
        this.taskQueue.shift()
        
        // 立即通知前端任务开始运行
        this.emit(task.taskId, 'status', { type: 'task', stage: 'running', message: '任务开始执行' })
        
        let abortController = this.abortRegistry.get(task.taskId)
        if (!abortController) {
          abortController = new AbortController()
          this.abortRegistry.set(task.taskId, abortController)
        }

        this.activeTasks.set(task.taskId, { input: task, abortController })

        console.log(`[TaskScheduler:${this.instanceId}] Acquiring semaphore for ${providerType}, task=${task.taskId}`)

        try {
          await this.semaphore.acquire(providerType)
          console.log(`[TaskScheduler:${this.instanceId}] Semaphore acquired for ${task.taskId}`)
        } catch (err) {
          console.error(`[TaskScheduler:${this.instanceId}] Semaphore acquire failed for ${task.taskId}:`, err)
          this.activeTasks.delete(task.taskId)
          this.taskQueue.unshift(task)
          continue
        }

        console.log(`[TaskScheduler:${this.instanceId}] Executing task ${task.taskId}`)

        // 异步执行任务，不阻塞队列处理
        this.executeTask(task, abortController).catch(err => {
          console.error(`[TaskScheduler] Task ${task.taskId} execution error:`, err)
        })
      }
    } catch (err) {
      console.error(`[TaskScheduler:${this.instanceId}] processQueue error:`, err)
    } finally {
      this.isProcessing = false
      console.log(`[TaskScheduler:${this.instanceId}] processQueue done, queue=${this.taskQueue.length}, active=${this.activeTasks.size}`)
    }

    // BUG-002 FIX: 如果还有任务在队列中，安排下一轮处理
    if (this.taskQueue.length > 0) {
      console.log(`[TaskScheduler:${this.instanceId}] Scheduling next processQueue in 100ms`)
      setTimeout(() => this.processQueue(), 100)
    }
  }

  private async isPrivateUrl(urlStr: string): Promise<boolean> {
    try {
      const u = new URL(urlStr)
      const hostname = u.hostname.toLowerCase()
      if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '0.0.0.0') return true
      if (hostname.startsWith('10.') || hostname.startsWith('192.168.')) return true
      if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname)) return true
      if (hostname.startsWith('169.254.') || hostname.endsWith('.internal') || hostname.endsWith('.local')) return true
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return true
      return false
    } catch {
      return true
    }
  }

  private async crawlPage(url: string, timeout = 4000): Promise<string> {
    if (await this.isPrivateUrl(url)) return ''
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        signal: AbortSignal.timeout(timeout),
      })
      if (!res.ok) return ''
      const html = await res.text()
      const text = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
      return text.substring(0, MAX_CRAWL_TEXT_LENGTH)
    } catch {
      return ''
    }
  }

  private obviouslyNoSearch(query: string): boolean {
    const q = query.toLowerCase().trim()
    const noSearchPatterns = [
      /^(写|帮我写|write|create|generate|生成).{0,20}(代码|code|函数|function|脚本|script|程序|program)/i,
      /^(翻译|translate|转换成|convert\s+to)/i,
      /^(解释|explain\s+).{0,30}(代码|code|函数|algorithm|算法)/i,
      /^(计算|算|compute|calculate|solve)\s/i,
      /^(格式化|format|整理|lint|refactor|重构)/i,
      /^(总结|summarize|归纳|概括).{0,10}(上面|以上|这段|以下|下面)/i,
      /^(你好|hi|hello|嗨|哈喽)\s*[!！。.]*$/i,
      /^(谢谢|感谢|thank|thx)\s*[!！。.]*$/i,
      /^(做|制作|生成|create|make|generate|build).{0,10}(ppt|幻灯片|演示文稿|presentation|课件)/i,
      /^(画|绘制|生成|create|draw|make|design).{0,10}(图|图表|diagram|chart|flow)/i,
    ]
    return noSearchPatterns.some(p => p.test(q))
  }

  private async shouldSearch(query: string, history: Array<Record<string, unknown>>, providerType: ProviderType, config: any, model: string): Promise<boolean> {
    const q = query.trim()
    if (this.obviouslyNoSearch(q)) return false

    const strongSearchSignals = [
      /(搜索|搜一下|帮我搜|搜索一下|联网搜索|百度|谷歌|查一下|找一下)/i,
      /(search|google|look up|find out|bing)/i,
      /(最新新闻|最近新闻|今日新闻|今天新闻|今日热点|最新消息|实时热点)/i,
      /(价格|价钱|多少钱|price|cost|股价|汇率|rate|stock|大盘|跌|涨|金价|币值)/i,
      /(天气|weather|气温|温度|forecast|下雨|刮风|暴雨)/i,
      /(发布|release|launch|公告|announcement|上市|官方|official|发售|开售)/i,
      /(是什么|什么是|who is|what is|when did|how to|why).{0,20}(最新|最近|今天|current|recent|new|实时)/i,
      /(今天|昨日|最近|今年|202[4-6]年|本周|本月|本季|今年第一季度)/i,
      /(发生了什么|发生什么事|重大事件|头条|突发)/i,
      /(谁是|介绍下|个人资料|履历|背景|现任|是谁)/i,
      /(最新版|最新版本|新出的|评测|对比|哪个好|好用吗|对比推荐|排行|排名)/i
    ]

    const noSearchWhenMcp = [
      /(打开|open|启动|launch).{0,20}(浏览器|browser|网页|网站|page)/i,
      /(截图|screenshot|截屏|capture)/i,
      /(浏览|browse|访问|visit|navigate).{0,20}(网页|网站|page|url)/i,
      /(帮我|请).{0,10}(打开|操作|执行)/i,
    ]

    if (noSearchWhenMcp.some(p => p.test(q))) return false
    if (strongSearchSignals.some(p => p.test(q))) {
      console.log(`[DEBUG_SEARCH] Matched strong search regex signal for: "${q}"`)
      return true
    }

    try {
      const recentHistory = history.slice(-3).map(m => {
        const content = extractContent(m)
        return `${m.role || 'user'}: ${content.substring(0, 100)}`
      }).join('\n')

      const prompt = `你是一个智能搜索引擎意图分析专家。你的任务是分析用户的当前提问是否需要通过搜索引擎联网获取最新、最准的事实性信息。

请回答 YES 如果：
1. 问题涉及真实世界的事实、人物、最新新闻、实时事件、产品参数、软件版本、近期政策等。
2. 问题要求写一篇关于某个特定主题、事件或人物的报告/文章/分析，而这需要最新的事实数据作为支撑。
3. 问题包含对某个不熟悉的专业名词、最新概念的“解释”或“介绍”。
4. 问题如果不进行联网搜索，仅凭截止到2024年的知识库无法给出准确详实的回答。

请回答 NO 如果：
1. 问题完全是关于编写代码、解答数学题、翻译句子、文本格式化等纯逻辑、计算或语言转换任务。
2. 问题是闲聊（如“你好”、“谢谢”、“你是谁”）。
3. 问题仅要求进行纯主观的创作（如写小说、写诗、脑暴想法）而不需要特定事实支撑。
4. 用户明确表示不需要联网搜索。

注意：当前时间是 ${new Date().toLocaleDateString('zh-CN')}。任何涉及近期、今年、近几年、或者需要最新准确数据的查询都应当回答 YES。

对话历史：
${recentHistory}

用户当前提问：
${q}

请仅输出 YES 或 NO：`

      if (providerType === 'local-gguf') {
        return false
      }

      const inferenceOptions: InferenceOptions = {
        model: parseModelId(model).model,
        messages: [{ role: 'user', content: prompt }],
        maxTokens: 150,
        temperature: 0.1,
      }
      
      console.log(`[DEBUG_SEARCH] Calling LLM intent check stream...`)
      const result = await createInferenceStream(providerType, config, inferenceOptions)
      let text = ''
      
      for await (const chunk of result.stream) {
        text += chunk
      }
      
      let finalCleanText = text
      if (finalCleanText.includes('<think>')) {
        const parts = finalCleanText.split('</think>')
        finalCleanText = parts[parts.length - 1]
      }
      if (finalCleanText.includes('<thought>')) {
        const parts = finalCleanText.split('</thought>')
        finalCleanText = parts[parts.length - 1]
      }

      const finalTrimmed = finalCleanText.trim().toUpperCase()
      console.log(`[DEBUG_SEARCH] Stream completed. text="${text}", finalCleanText="${finalCleanText}"`)
      return finalTrimmed.startsWith('YES') || (finalTrimmed.includes('YES') && !finalTrimmed.includes('NO'))
    } catch (e) {
      console.warn('[Intent] LLM search decision failed, defaulting to NO search. Error:', e)
      return false
    }
  }

  private async generateSearchQuery(query: string, history: Array<Record<string, unknown>>, providerType: ProviderType, config: any, model: string): Promise<string> {
    const q = query.trim()
    if (q.length < 8) {
      return q
    }

    const recentHistory = history.slice(-3).map(m => {
      const content = extractContent(m)
      return `${m.role || 'user'}: ${content.substring(0, 100)}`
    }).join('\n')

    const prompt = `你是一个智能搜索引擎专家。请根据用户的当前问题 and 对话历史，提炼出最适合在搜索引擎（如 Bing 或 Google）中检索的 1 到 4 个以空格分隔的关键词。
你的任务是将用户的长句、语气词、重复提问进行精炼，只提取最核心的专有名词或事实搜索词。

规则：
1. 仅输出提炼后的关键词，用空格分隔，不要有任何多余的解释、标点符号、MarkDown 标记或前缀（如 "关键词是"、"Search Query" 等）。
2. 保留最关键的专有名词、技术术语、事件名称或最新的产品名。
3. 关键词要精准，能够准确表达用户真实的检索意图。如果无法提炼，就直接原样输出用户的关键查询。

对话历史：
${recentHistory}

用户当前提问：
${q}

提炼后的搜索关键词：`

    if (providerType === 'local-gguf') {
      return q
    }

    const inferenceOptions: InferenceOptions = {
      model: parseModelId(model).model,
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 100,
      temperature: 0.1,
    }

    try {
      console.log(`[DEBUG_SEARCH] Generating precise search query via LLM...`)
      const result = await createInferenceStream(providerType, config, inferenceOptions)
      let text = ''
      
      for await (const chunk of result.stream) {
        text += chunk
      }
      
      let finalCleanText = text
      if (finalCleanText.includes('<think>')) {
        const parts = finalCleanText.split('</think>')
        finalCleanText = parts[parts.length - 1]
      }
      if (finalCleanText.includes('<thought>')) {
        const parts = finalCleanText.split('</thought>')
        finalCleanText = parts[parts.length - 1]
      }
      
      const rewritten = finalCleanText.trim().replace(/["'`]/g, '')
      console.log(`[DEBUG_SEARCH] Raw rewritten text from LLM: "${text}", clean rewritten query: "${rewritten}"`)
      
      if (rewritten.length > 0 && rewritten.length < q.length * 1.2) {
        return rewritten
      }
      return q
    } catch (e) {
      console.warn('[SearchRewrite] Failed to rewrite query, defaulting to original. Error:', e)
      return q
    }
  }

  private async generateDeepSearchQueries(query: string, history: Array<Record<string, unknown>>, providerType: ProviderType, config: any, model: string): Promise<string[]> {
    const q = query.trim()
    if (providerType === 'local-gguf') {
      return [q]
    }

    const recentHistory = history.slice(-3).map(m => {
      const content = extractContent(m)
      return `${m.role || 'user'}: ${content.substring(0, 100)}`
    }).join('\n')

    const prompt = `你是一个资深的深度研究专家。请根据用户的当前问题以及对话历史，将其拆解并提炼出 3 个不同维度、最适合搜索引擎检索的子查询词（每个词不要太长，使用空格分隔关键词）。
你的任务是让我们能够多角度检索，获取最全面的网络线索，以覆盖问题涉及的不同时间、背景、技术细节或对比维度。

规则：
1. 必须且仅输出一个合法的 JSON 数组，包含 3 个字符串子查询。例如：["子查询1", "子查询2", "子查询3"]。不要有任何多余的解释、Markdown 标记或前置说明。
2. 每个子查询要精准，避免口语化，提炼核心专有名词。
3. 确保 3 个子查询侧重点不同（例如一个偏向最新进展，一个偏向原理细节，一个偏向对比评测）。

对话历史：
${recentHistory}

用户当前提问：
${q}

JSON格式的子查询列表：`

    const inferenceOptions: InferenceOptions = {
      model: parseModelId(model).model,
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 200,
      temperature: 0.2,
    }

    try {
      console.log(`[DEBUG_SEARCH] Generating multiple deep search queries via LLM...`)
      const result = await createInferenceStream(providerType, config, inferenceOptions)
      let text = ''
      for await (const chunk of result.stream) {
        text += chunk
      }
      
      let finalCleanText = text
      if (finalCleanText.includes('<think>')) {
        const parts = finalCleanText.split('</think>')
        finalCleanText = parts[parts.length - 1]
      }
      if (finalCleanText.includes('<thought>')) {
        const parts = finalCleanText.split('</thought>')
        finalCleanText = parts[parts.length - 1]
      }

      const jsonStart = finalCleanText.indexOf('[')
      const jsonEnd = finalCleanText.lastIndexOf(']')
      if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
        const jsonStr = finalCleanText.substring(jsonStart, jsonEnd + 1)
        const parsed = JSON.parse(jsonStr)
        if (Array.isArray(parsed) && parsed.length > 0) {
          console.log(`[DEBUG_SEARCH] Parsed sub-queries:`, parsed)
          return parsed.map(s => String(s).trim()).filter(s => s.length > 0)
        }
      }
      return [q]
    } catch (e) {
      console.warn('[SearchRewrite] Failed to generate deep queries, fallback to single query. Error:', e)
      return [q]
    }
  }

  private async executeTask(task: TaskInput, abortController: AbortController) {
    const { taskId, chatId, model, messages, deepThink, webSearch, kbId, files, promptId, docType, docStyle, docTheme } = task
    const { provider: providerType } = parseModelId(model)

    const timeoutSignal = AbortSignal.timeout(CHAT_REQUEST_TIMEOUT)
    const combinedSignal = AbortSignal.any([abortController.signal, timeoutSignal])

    console.log(`[TaskScheduler:${this.instanceId}] executeTask START for ${taskId}, model=${model}, chatId=${chatId}, provider=${providerType}`)

    let originalQuery = ''
    let activeChatId = chatId
    let assistantMsgId: string | null = null
    let collectedCitations: Array<{ title: string; url: string }> = []

    try {
      const settings = await this.getSettings()
      console.log(`[TaskScheduler:${this.instanceId}] executeTask got settings for ${taskId}`)

      await prismaRetry(() => prisma.inferenceTask.update({
        where: { id: taskId },
        data: { status: 'running', startedAt: new Date() },
      })).catch(err => console.warn(`[TaskScheduler] DB update failed for ${taskId}:`, err))

      const config = getProviderConfig(providerType, settings ?? {})
      const signal = combinedSignal

      const resolvedMessages: Array<Record<string, unknown>> = Array.isArray(messages) ? messages : (typeof messages === 'string' ? (() => { try { return JSON.parse(messages) } catch { return [] } })() : [])
      console.log(`[TaskScheduler:${this.instanceId}] Resolved ${resolvedMessages.length} messages for ${taskId} (type=${typeof messages})`)

      let lastUserMsgIdx = -1
      for (let i = resolvedMessages.length - 1; i >= 0; i--) {
        if (resolvedMessages[i].role === 'user') {
          lastUserMsgIdx = i
          break
        }
      }
      const lastUserMsg = lastUserMsgIdx >= 0 ? resolvedMessages[lastUserMsgIdx] : null
      originalQuery = extractContent(lastUserMsg)

      const deepSearch = webSearch === 'deep'
      const forceSearch = webSearch === true || deepSearch
      const autoSearch = webSearch === 'auto' || webSearch === undefined

      let systemInjection = ''
      let kbInjection = ''
      let fileInjection = ''

      if (kbId && originalQuery) {
        this.emit(taskId, 'status', { type: 'search', stage: 'searching', message: '正在检索本地知识库...' })
        try {
          const kbContext = await buildKnowledgeContext(kbId, originalQuery)
          if (kbContext && kbContext.context) {
            kbInjection = kbContext.context
            if (kbContext.citations?.length) {
              collectedCitations = [...collectedCitations, ...kbContext.citations]
              this.emit(taskId, 'citations', { results: kbContext.citations })
            }
            this.emit(taskId, 'status', { type: 'search', stage: 'done', message: '知识库检索完成' })
          } else {
            this.emit(taskId, 'status', { type: 'search', stage: 'skip', message: '知识库无相关内容' })
          }
        } catch (e) {
          console.error('[TaskScheduler] KB retrieval error:', e)
          this.emit(taskId, 'status', { type: 'search', stage: 'error', message: '知识库检索失败' })
        }
      }

      let isSearchNeeded = forceSearch
      if (!forceSearch && autoSearch && originalQuery) {
        this.emit(taskId, 'status', { type: 'search', stage: 'intent', message: '正在分析是否需要搜索...' })
        isSearchNeeded = await this.shouldSearch(originalQuery, resolvedMessages.slice(0, -1), providerType, config, model)
        if (!isSearchNeeded) {
          this.emit(taskId, 'status', { type: 'search', stage: 'skip', message: '无需搜索' })
        }
      }

      if (isSearchNeeded && originalQuery) {
        let searchQuery = originalQuery
        let searchQueries = [originalQuery]
        const searchEngine = (settings as Record<string, unknown>)?.searchEngine as string || 'bing'
        const searchKey = (settings as Record<string, unknown>)?.searchKey as string || ''

        if (deepSearch) {
          try {
            this.emit(taskId, 'status', { type: 'search', stage: 'intent', message: '正在分析搜索意图，提炼多维度子查询...' })
            searchQueries = await this.generateDeepSearchQueries(originalQuery, resolvedMessages.slice(0, -1), providerType, config, model)
            searchQuery = searchQueries[0] || originalQuery
          } catch (e) {
            console.warn('[SearchRewrite] Failed during generateDeepSearchQueries', e)
          }
        } else {
          try {
            this.emit(taskId, 'status', { type: 'search', stage: 'intent', message: '正在分析搜索意图和提炼关键词...' })
            searchQuery = await this.generateSearchQuery(originalQuery, resolvedMessages.slice(0, -1), providerType, config, model)
            searchQueries = [searchQuery]
          } catch (e) {
            console.warn('[SearchRewrite] Failed during generateSearchQuery, fallback to original query', e)
          }
        }

        if (deepSearch) {
          this.emit(taskId, 'status', { type: 'search', stage: 'rewrite_done', message: `提炼多维度子查询: ${searchQueries.join(' | ')}` })
        } else {
          this.emit(taskId, 'status', { type: 'search', stage: 'rewrite_done', message: `提炼关键词: "${searchQuery}"` })
        }

        try {
          let rawResults: SearchResult[] = []

          if (deepSearch) {
            this.emit(taskId, 'status', { type: 'search', stage: 'searching', message: '正在多维度检索全网线索...' })
            const searchPromises = searchQueries.map(sq => 
              searchWithFallback(sq, searchEngine, searchKey, true)
            )
            const resolvedSearches = await Promise.allSettled(searchPromises)
            let combined: SearchResult[] = []
            for (const item of resolvedSearches) {
              if (item.status === 'fulfilled') {
                combined = combined.concat(item.value.results)
              }
            }
            // 根据 url 去重
            rawResults = Array.from(new Map(combined.map(r => [r.url, r])).values())
          } else {
            this.emit(taskId, 'status', { type: 'search', stage: 'searching', message: `正在搜索 "${searchQuery}"...` })
            const searchRes = await searchWithFallback(searchQuery, searchEngine, searchKey, false)
            rawResults = searchRes.results
          }

          // RAG 第一阶段：预筛选预重排 (Pre-filtering)
          rawResults = rankSearchResults(originalQuery, rawResults)

          const foundLimit = deepSearch ? rawResults.length : 30
          this.emit(taskId, 'status', {
            type: 'search', stage: 'found', message: `找到 ${rawResults.length} 个结果`,
            results: rawResults.slice(0, foundLimit).map(r => ({ title: r.title, url: r.url })),
          })

          // 网页深度阅读数量限制 (捞回百级线索后，仅深读最相关的 15 个以保障高速，普通搜索深读 3 个)
          const numToCrawl = deepSearch ? Math.min(rawResults.length, 15) : 3
          const topResults = rawResults.slice(0, numToCrawl)
          const searchResults: Array<{ title: string; snippet: string; url: string }> = [...rawResults]

          if (topResults.length > 0) {
            this.emit(taskId, 'status', { type: 'search', stage: 'reading', message: `正在深度阅读 ${topResults.length} 个核心网页...` })
            const crawledContents: string[] = new Array(topResults.length).fill('')
            const CONCURRENCY_LIMIT = 5
            for (let batchStart = 0; batchStart < topResults.length; batchStart += CONCURRENCY_LIMIT) {
              const batch = topResults.slice(batchStart, batchStart + CONCURRENCY_LIMIT)
              const batchResults = await Promise.all(
                batch.map(async (r, bi) => {
                  const i = batchStart + bi
                  const content = await this.crawlPage(r.url)
                  this.emit(taskId, 'status', { type: 'search', stage: 'read_page', message: `已阅读: ${r.title}`, pageIndex: i })
                  return { index: i, content }
                })
              )
              for (const { index, content } of batchResults) {
                crawledContents[index] = content
              }
            }

            for (let i = 0; i < topResults.length; i++) {
              if (crawledContents[i] && crawledContents[i].trim().length > 0) {
                // RAG 第二阶段：滑动窗口提炼网页“黄金段落”摘要，剔除无用广告
                const goldenSnippet = extractGoldenSnippets(originalQuery, crawledContents[i], 800)
                if (goldenSnippet.length > searchResults[i].snippet.length) {
                  searchResults[i].snippet = goldenSnippet
                }
              }
            }
          }

          // RAG 第三阶段：后重排 (Post-reranking)
          // 全局结合已深读的黄金文本和未深读的搜索摘要，再次全局匹配相关度，保证灌给模型的是最优黄金线索
          const finalResults = rankSearchResults(originalQuery, searchResults)

          if (finalResults.length > 0) {
            // 普通搜索截取前 30 个，深度搜索截取前 60 个以喂给大模型
            const resultsToInclude = finalResults.slice(0, deepSearch ? Math.min(finalResults.length, 60) : 30)
            const contextBlock = resultsToInclude
              .map((r, i) => `SOURCE [${i + 1}]:\nTitle: ${r.title}\nContent: ${r.snippet}\nURL: ${r.url}`)
              .join('\n\n---\n\n')

            const baseInstruction = deepSearch
              ? `1. 你正在执行一项"深度研究 (Deep Research)"任务。用户期望一份极具深度、结构严谨的详尽研究报告。
2. 你必须结合这些大量的网页搜索结果，撰写一份至少 1000 字的高手级报告或论文。
3. 请使用清晰的标题、子标题、Markdown 格式来组织内容。
4. 绝不要仅仅是对检索结果进行简单罗列，必须对信息进行融会贯通、数据对比与逻辑推演。
5. 当你引用任何事实、数据或观点时，必须精准地尾随引用标注（例如 [1], [2] 等）。
6. 用用户的语言回复，尽量提供极致的细节 and 有洞见的分析。`
              : `1. **Prioritize the provided results** as the primary source of truth for recent events or specific details.
2. **Synthesize and integrate** the information into a comprehensive answer. Do not just list the results.
3. **Cite your sources** using the numbered format [1], [2], etc.
4. If the search results are insufficient or irrelevant, acknowledge it, but still try to use the most relevant parts.
5. **Output Language**: Respond in the language of the user's query (usually Chinese).`

            systemInjection = `# WEB SEARCH CONTEXT\nThe user has requested a web search. Below are the most relevant and up-to-date search results.\n\n## SEARCH RESULTS:\n${contextBlock}\n\n## INSTRUCTIONS:\n${baseInstruction}\nCurrent date is ${new Date().toISOString().split('T')[0]}.`

            collectedCitations = [...collectedCitations, ...resultsToInclude.map(r => ({ title: r.title, url: r.url }))]
            this.emit(taskId, 'citations', {
              results: resultsToInclude.map(r => ({ title: r.title, url: r.url })),
            })
          }

          this.emit(taskId, 'status', { type: 'search', stage: 'done', message: '搜索完成' })
        } catch (e) {
          console.warn('[TaskScheduler] Search failed:', e)
          this.emit(taskId, 'status', { type: 'search', stage: 'error', message: '搜索失败' })
        }
      }

      type UploadedFile = { name: string; content?: string; dataUrl?: string; type: string }
      const uploadedFiles = (files || []) as UploadedFile[]
      const docFiles = uploadedFiles.filter(f => f.content !== undefined && !f.dataUrl)

      if (docFiles.length > 0) {
        const docBlocks = docFiles.map(f => {
          const preview = f.content && f.content.length > 0 ? f.content : '[Empty file or unsupported format]'
          return `### File: ${f.name}\n\`\`\`\n${preview}\n\`\`\`\n`
        }).join('\n')
        fileInjection = [
          '# UPLOADED FILES',
          '**The user has attached the following files. You MUST read and analyze this content before answering.**',
          '',
          docBlocks,
          '',
          'When answering, reference the specific file names and quote relevant sections from the content above.',
        ].join('\n')
      }

      let dbContent = originalQuery
      if (fileInjection.trim()) {
        dbContent = `${fileInjection}\n\nUSER QUESTION:\n${originalQuery}`
      }

      if (!activeChatId || activeChatId === 'new' || activeChatId.startsWith('new-')) {
        activeChatId = uuidv4()
        const firstTitle = originalQuery.substring(0, 60) || 'OpenOrangeAI'
        await prismaRetry(() => prisma.chat.create({
          data: { id: activeChatId, title: firstTitle, selectedPromptId: promptId || null }
        }))
        await prismaRetry(() => prisma.message.create({
          data: { chatId: activeChatId, role: 'user', content: dbContent }
        }))
      } else {
        const existingChat = await prisma.chat.findUnique({ where: { id: activeChatId } })
        if (existingChat) {
          await prismaRetry(() => prisma.chat.update({
            where: { id: activeChatId },
            data: { selectedPromptId: promptId || null }
          })).catch(() => {})
        } else {
          const firstTitle = originalQuery.substring(0, 60) || 'OpenOrangeAI'
          await prismaRetry(() => prisma.chat.create({
            data: { id: activeChatId, title: firstTitle, selectedPromptId: promptId || null }
          }))
        }
        await prismaRetry(() => prisma.message.create({
          data: { chatId: activeChatId, role: 'user', content: dbContent }
        }))
      }

      this.emit(taskId, 'chatId', { id: activeChatId, oldId: chatId })

      await prismaRetry(() => prisma.inferenceTask.update({
        where: { id: taskId },
        data: { chatId: activeChatId },
      })).catch(err => console.warn(`[TaskScheduler] Failed to update task chatId:`, err))

      if (deepThink) {
        this.emit(taskId, 'status', { type: 'thinking', stage: 'start', message: '正在深度思考...' })
      }

      const systemParts: string[] = []
      if (deepThink) {
        systemParts.push('You are a highly capable reasoning assistant. When answering, first think step-by-step inside <thinking>...</thinking> tags, then provide your final answer. Show your complete reasoning process in the thinking block before concluding.')
      }

      // 强注入文档 Prompts (结合前置 state + 模糊正则)
      const effectiveDocType = docType || 'none'
      const isPptTopic = effectiveDocType === 'ppt' || /ppt|slide|presentation|幻灯片|演示文稿|方案汇报|课件/i.test(originalQuery || '') || 
                         resolvedMessages.some((m: Record<string, unknown>) => extractContent(m).includes('```ppt'))
      
      if (isPptTopic) {
        let pptPrompt = PPT_SYSTEM_PROMPT + getPptTemplatesPrompt()
        // 根据风格和配色追加约束
        const styleLabels: Record<string, string> = {
          swiss: '瑞士网格设计风 (Swiss Grid layout, structure-heavy, elegant color balance, highly alignment-centric)',
          apple: '苹果极简风 (Apple minimal layout, centered key text, heavy bold titles, deep contrast or pure dark elegant style)',
          editorial: '社论时尚杂志风 (Vogue editorial serif typography, large imagery, beige elements, custom spacing)',
          modern: '现代极简风 (Modern tech flat layout, card-based blocks, subtle micro-elements)',
          pencil: '手绘涂鸦风 (Hand-drawn organic shapes, high playfulness)'
        }
        const themeLabels: Record<string, string> = {
          zinc: '极简黑白 (Zinc: #18181b, solid white, elegant dark gradients)',
          orange: '活力暖阳 (Orange Accent: #ea580c base, warm dynamic highlight)',
          blue: '蔚蓝科技 (Blue Tech Accent: #2563eb base, modern depth)',
          green: '薄荷清新 (Green Mint Accent: #16a34a base, clean contrast)',
          rose: '浪漫玫瑰 (Rose Pink Accent: #e11d48 base, rich highlight)'
        }
        
        pptPrompt += `\n\n## 强制约束风格与配色:\n`
        pptPrompt += `- 你必须把生成的 PPT 风格设定为: "${styleLabels[docStyle || 'swiss'] || 'swiss'}"。\n`
        pptPrompt += `- 你必须把生成的 PPT 主题颜色设定为: "${themeLabels[docTheme || 'zinc'] || 'zinc'}"，在 JSON 中设定 "theme": "${docTheme || 'zinc'}"，并且多用相匹配的 hex 背景与文字色彩。\n`
        pptPrompt += `- 确保你的 PPT 充满视觉层次，第一页为大气的封面页，中间页具有丰富的网格和图表形状 blocks 或者是 image 块。\n`
        
        systemParts.push(pptPrompt)
      } else {
        systemParts.push('If the user specifically asks for a presentation or PPT, you have the capability to generate a structured JSON block inside a "ppt" code block.')
      }

      const isDocxTopic = effectiveDocType === 'docx' || /word|文档|报告|文章|docx|document|report|article|合同|方案书|总结|汇报文档/i.test(originalQuery || '') ||
                          resolvedMessages.some((m: Record<string, unknown>) => extractContent(m).includes('```docx'))

      if (isDocxTopic) {
        systemParts.push(DOCX_SYSTEM_PROMPT)
      } else {
        systemParts.push('If the user asks for a Word document or report, you can generate structured HTML content inside a "docx" code block.')
      }

      const isExcelTopic = effectiveDocType === 'xlsx' || /excel|表格|电子表格|spreadsheet|xlsx|数据表|报表|统计表|明细表/i.test(originalQuery || '') ||
                           resolvedMessages.some((m: Record<string, unknown>) => extractContent(m).includes('```xlsx'))

      if (isExcelTopic) {
        systemParts.push(EXCEL_SYSTEM_PROMPT)
      } else {
        systemParts.push('If the user asks for a spreadsheet or Excel file, you can generate structured JSON data inside an "xlsx" code block.')
      }

      if (promptId) {
        try {
          const promptRes = await (prisma as unknown as { promptTemplate: { findUnique: (args: { where: { id: string } }) => Promise<{ content?: string } | null> } }).promptTemplate.findUnique({
            where: { id: promptId }
          })
          if (promptRes?.content) {
            systemParts.push(promptRes.content)
          }
        } catch (e) {
          console.error('[TaskScheduler] Failed to fetch prompt template:', e)
        }
      }

      const systemPrompt = systemParts.join('\n\n---\n\n') || undefined

      const turnParts: string[] = []
      if (kbInjection) turnParts.push(kbInjection)
      if (systemInjection) turnParts.push(systemInjection)
      if (fileInjection) turnParts.push(fileInjection)
      const turnInjectionStr = turnParts.join('\n\n---\n\n')

      let fullyEnrichedContent = originalQuery
      if (turnInjectionStr.trim()) {
        fullyEnrichedContent = `${turnInjectionStr}\n\nUSER QUESTION:\n${originalQuery}`
      }

      const rawCoreMessages: ModelMessage[] = (resolvedMessages || []).map((m: Record<string, unknown>, idx: number) => {
        const role = ((m.role as string) || 'user') as 'user' | 'assistant' | 'system'
        const text = (idx === lastUserMsgIdx) ? fullyEnrichedContent : extractContent(m)
        return { role, content: text }
      }).filter((m: { content: string }) => m.content !== '') as ModelMessage[]

      const maxContextTokens = ((settings as Record<string, unknown>)?.apiContextSize as number) || 8192
      let currentContextTokens = 0
      const prunedMessages: ModelMessage[] = []
      for (let i = rawCoreMessages.length - 1; i >= 0; i--) {
        const msg = rawCoreMessages[i]
        const estimatedTokens = Math.ceil(msg.content.length / (msg.content.match(/[\u4e00-\u9fa5]/) ? 1.5 : 3.5))
        if (currentContextTokens + estimatedTokens > maxContextTokens && prunedMessages.length > 0) break
        currentContextTokens += estimatedTokens
        prunedMessages.unshift(msg)
      }

      const coreMessages = prunedMessages

      console.log(`[TaskScheduler:${this.instanceId}] Prepared ${coreMessages.length} messages for inference`)

      const dynamicMaxTokens = (settings as Record<string, unknown>)?.apiMaxTokens as number || 16384
      if (isPptTopic || isDocxTopic || isExcelTopic) {
        console.log(`[TaskScheduler:${this.instanceId}] Document generation: using maxTokens=${dynamicMaxTokens}`)
      }

      const rawTemp1 = (settings as Record<string, unknown>)?.apiTemperature as number | undefined
      const rawTopP1 = (settings as Record<string, unknown>)?.apiTopP as number | undefined
      const rawMaxTokens1 = (settings as Record<string, unknown>)?.apiMaxTokens as number | undefined

      const inferenceOptions: InferenceOptions = {
        model: parseModelId(model).model,
        messages: coreMessages,
        systemPrompt,
        temperature: (rawTemp1 === 0 || rawTemp1 == null) ? undefined : rawTemp1,
        topP: (rawTopP1 === 0 || rawTopP1 == null) ? undefined : rawTopP1,
        maxTokens: (rawMaxTokens1 === 0 || rawMaxTokens1 == null) ? undefined : dynamicMaxTokens,
        signal,
        deepThink,
      }

      console.log(`[TaskScheduler:${this.instanceId}] Calling createInferenceStream for ${taskId}, provider=${providerType}, model=${inferenceOptions.model}`)
      
      let stream: AsyncGenerator<string, void, unknown>
      try {
        if (providerType === 'local-gguf') {
          const { streamLocalGgufChat } = await import('@/lib/local-gguf')
          stream = streamLocalGgufChat({
            modelId: model,
            messages: coreMessages,
            systemPrompt,
            settings: {
              localGgufContextSize: (settings as Record<string, unknown>)?.localGgufContextSize as number | undefined,
              localGgufTemperature: (settings as Record<string, unknown>)?.localGgufTemperature as number | undefined,
              localGgufTopP: (settings as Record<string, unknown>)?.localGgufTopP as number | undefined,
              localGgufMaxTokens: (settings as Record<string, unknown>)?.localGgufMaxTokens as number | undefined,
            },
            onStatus: (event) => {
              this.emit(taskId, 'status', event)
            }
          })
        } else {
          const result = await createInferenceStream(providerType, config, inferenceOptions)
          stream = result.stream
        }
        console.log(`[TaskScheduler:${this.instanceId}] Stream created successfully for ${taskId}`)
      } catch (streamError: unknown) {
        console.error(`[TaskScheduler:${this.instanceId}] Stream creation failed for ${taskId}:`, streamError)
        throw new Error(`模型推理失败: ${(streamError as Error).message || '未知错误'}`)
      }

      console.log(`[TaskScheduler:${this.instanceId}] Starting stream iteration for ${taskId}`)

      let fullText = ''
      let lastPersistTime = Date.now()
      let lastPersistLength = 0
      let chunkCount = 0

      for await (const chunk of stream) {
        if (signal.aborted) {
          console.log(`[TaskScheduler:${this.instanceId}] Stream aborted for ${taskId}`)
          break
        }

        fullText += chunk
        chunkCount++
        
        if (chunkCount % 10 === 0) {
          console.log(`[TaskScheduler:${this.instanceId}] Task ${taskId}: ${chunkCount} chunks, ${fullText.length} chars`)
        }

        this.emit(taskId, 'text', { content: chunk })

        if (activeChatId && (Date.now() - lastPersistTime > PERSIST_INTERVAL_MS || fullText.length - lastPersistLength >= PERSIST_MIN_LENGTH)) {
          try {
            if (!assistantMsgId) {
              const msg = await prismaRetry(() => prisma.message.create({
                data: { chatId: activeChatId, role: 'assistant', content: fullText }
              }))
              assistantMsgId = msg.id
              console.log(`[TaskScheduler:${this.instanceId}] Created assistant message ${assistantMsgId} for ${taskId}`)
            } else {
              await prismaRetry(() => prisma.message.update({
                where: { id: assistantMsgId || undefined },
                data: { content: fullText }
              }))
            }
            lastPersistTime = Date.now()
            lastPersistLength = fullText.length
          } catch (e) {
            console.warn('[TaskScheduler] Persist error:', e)
          }
        }
      }

      console.log(`[TaskScheduler:${this.instanceId}] Stream completed for ${taskId}: ${chunkCount} chunks, ${fullText.length} chars`)

      if (!fullText.trim()) {
        const errMsg = '模型未返回有效内容，请检查模型服务是否正常运行。'
        fullText = errMsg
        this.emit(taskId, 'text', { content: errMsg })
        console.log(`[TaskScheduler:${this.instanceId}] No output detected, sending fallback message for ${taskId}`)
      }

      if (activeChatId) {
        try {
          const citationsData = JSON.stringify(collectedCitations)
          if (!assistantMsgId) {
            await prismaRetry(() => prisma.message.create({
              data: { chatId: activeChatId, role: 'assistant', content: fullText, citations: citationsData }
            }))
          } else {
            await prismaRetry(() => prisma.message.update({
              where: { id: assistantMsgId || undefined },
              data: { content: fullText, citations: citationsData }
            }))
          }
          console.log(`[TaskScheduler:${this.instanceId}] Final message persisted for ${taskId}`)
        } catch (e) {
          console.warn('[TaskScheduler] Final persist error:', e)
        }
      }

      if (deepThink) {
        this.emit(taskId, 'status', { type: 'thinking', stage: 'done', message: '思考完成' })
      }

      console.log(`[TaskScheduler:${this.instanceId}] Emitting done event for ${taskId}`)
      this.emit(taskId, 'done', { textLength: fullText.length, chatId: activeChatId })

      await prismaRetry(() => prisma.inferenceTask.update({
        where: { id: taskId },
        data: { status: 'completed', result: fullText, completedAt: new Date() },
      })).catch(() => {})

      console.log(`[TaskScheduler:${this.instanceId}] Task ${taskId} completed successfully`)

    } catch (error: unknown) {
      console.error(`[TaskScheduler] Task ${taskId} failed:`, error)
      
      if ((error as Error).name === 'AbortError') {
        console.log(`[TaskScheduler:${this.instanceId}] Task ${taskId} was cancelled`)
        this.emit(taskId, 'status', { type: 'task', stage: 'cancelled', message: '任务已取消' })
        await prismaRetry(() => prisma.inferenceTask.update({
          where: { id: taskId },
          data: { status: 'cancelled', completedAt: new Date() },
        })).catch(() => {})
      } else {
        let userMessage = (error as Error).message || 'Processing failed'
        if (userMessage.includes('ECONNREFUSED') || userMessage.includes('fetch failed')) {
          userMessage = '无法连接到模型服务，请检查模型是否正在运行'
        } else if (userMessage.includes('401') || userMessage.includes('Unauthorized')) {
          userMessage = 'API Key 无效或已过期，请检查设置'
        } else if (userMessage.includes('429') || userMessage.includes('rate_limit')) {
          userMessage = '请求过于频繁，请稍后再试'
        } else if (userMessage.includes('500') || userMessage.includes('Internal Server Error')) {
          userMessage = '模型服务内部错误，请稍后重试'
        } else if (userMessage.includes('timeout') || userMessage.includes('ETIMEDOUT')) {
          userMessage = '请求超时，请检查网络连接'
        }

        if (shouldRetryWithFallback(userMessage)) {
          const settings = await this.getSettings()
          const fallbackAttempts: FallbackAttempt[] = [{ model, error: userMessage, timestamp: new Date() }]
          const fallbackModel = getFallbackModel(model, settings ?? {}, fallbackAttempts)
          
          if (fallbackModel) {
            console.log(`[TaskScheduler:${this.instanceId}] Attempting fallback from ${model} to ${fallbackModel} for task ${taskId}`)
            this.emit(taskId, 'status', { type: 'fallback', stage: 'retrying', message: `主模型失败，正在切换到备用模型...` })
            
            try {
              await this.retryWithFallback(task, fallbackModel, settings ?? {}, originalQuery, deepThink ?? false, webSearch || false, kbId || null, files || [], promptId || null, activeChatId, assistantMsgId, collectedCitations, userMessage)
              return
            } catch (fallbackError: unknown) {
              console.error(`[TaskScheduler:${this.instanceId}] Fallback model ${fallbackModel} also failed:`, fallbackError)
              userMessage = `主模型和备用模型均失败。备用模型错误: ${(fallbackError as Error).message}`
            }
          }
        }

        this.emit(taskId, 'task_error', { message: userMessage })
        const detailedError = `${userMessage}\nOriginal: ${(error as Error).message}\nStack: ${(error as Error).stack}`
        await prismaRetry(() => prisma.inferenceTask.update({
          where: { id: taskId },
          data: { status: 'failed', error: detailedError, completedAt: new Date() },
        })).catch(() => {})
      }
    } finally {
      console.log(`[TaskScheduler:${this.instanceId}] Cleaning up task ${taskId}`)
      const { provider: pt } = parseModelId(model)
      this.semaphore.release(pt)
      this.activeTasks.delete(taskId)
      this.abortRegistry.delete(taskId)

      setTimeout(() => {
        this.taskSnapshots.delete(taskId)
        this.eventBuffer.delete(taskId)
      }, 30000)

      console.log(`[TaskScheduler:${this.instanceId}] Task ${taskId} cleanup complete, scheduling next queue process`)
      setTimeout(() => this.processQueue(), 50)
    }
  }

  private async retryWithFallback(
    task: TaskInput,
    fallbackModel: string,
    settings: Record<string, unknown>,
    originalQuery: string,
    deepThink: boolean,
    webSearch: boolean | 'auto' | 'deep',
    kbId: string | null,
    files: Array<Record<string, unknown>>,
    promptId: string | null,
    activeChatId: string,
    assistantMsgId: string | null,
    collectedCitations: Array<{ title: string; url: string }>,
    primaryError: string
  ) {
    const { taskId, chatId, messages, docType, docStyle, docTheme } = task
    const { provider: fallbackProviderType } = parseModelId(fallbackModel)
    const fallbackConfig = getProviderConfig(fallbackProviderType, settings)

    this.emit(taskId, 'status', { type: 'fallback', stage: 'switched', message: `已切换到备用模型: ${fallbackModel}` })

    const resolvedMessages: Array<Record<string, unknown>> = Array.isArray(messages) ? messages : []
    const lastUserMsg = resolvedMessages.length > 0 ? resolvedMessages[resolvedMessages.length - 1] : null
    const query = extractContent(lastUserMsg)

    const systemParts: string[] = []
    if (deepThink) {
      systemParts.push('You are a highly capable reasoning assistant. When answering, first think step-by-step inside <thinking>...</thinking> tags, then provide your final answer. Show your complete reasoning process in the thinking block before concluding.')
    }

    // 强注入文档 Prompts
    const effectiveDocType = docType || 'none'
    const isPptTopic = effectiveDocType === 'ppt' || /ppt|slide|presentation|幻灯片|演示文稿|方案汇报|课件/i.test(query || '') || 
                       resolvedMessages.some((m: Record<string, unknown>) => extractContent(m).includes('```ppt'))
    
    if (isPptTopic) {
      let pptPrompt = PPT_SYSTEM_PROMPT + getPptTemplatesPrompt()
      const styleLabels: Record<string, string> = {
        swiss: '瑞士网格设计风 (Swiss Grid layout, structure-heavy, elegant color balance, highly alignment-centric)',
        apple: '苹果极简风 (Apple minimal layout, centered key text, heavy bold titles, deep contrast or pure dark elegant style)',
        editorial: '社论时尚杂志风 (Vogue editorial serif typography, large imagery, beige elements, custom spacing)',
        modern: '现代极简风 (Modern tech flat layout, card-based blocks, subtle micro-elements)',
        pencil: '手绘涂鸦风 (Hand-drawn organic shapes, high playfulness)'
      }
      const themeLabels: Record<string, string> = {
        zinc: '极简黑白 (Zinc: #18181b, solid white, elegant dark gradients)',
        orange: '活力暖阳 (Orange Accent: #ea580c base, warm dynamic highlight)',
        blue: '蔚蓝科技 (Blue Tech Accent: #2563eb base, modern depth)',
        green: '薄荷清新 (Green Mint Accent: #16a34a base, clean contrast)',
        rose: '浪漫玫瑰 (Rose Pink Accent: #e11d48 base, rich highlight)'
      }
      
      pptPrompt += `\n\n## 强制约束风格与配色:\n`
      pptPrompt += `- 你必须把生成的 PPT 风格设定为: "${styleLabels[docStyle || 'swiss'] || 'swiss'}"。\n`
      pptPrompt += `- 你必须把生成的 PPT 主题颜色设定为: "${themeLabels[docTheme || 'zinc'] || 'zinc'}"，在 JSON 中设定 "theme": "${docTheme || 'zinc'}"，并且多用相匹配 of hex 背景与文字色彩。\n`
      
      systemParts.push(pptPrompt)
    }

    const isDocxTopic = effectiveDocType === 'docx' || /word|文档|报告|文章|docx|document|report|article|合同|方案书|总结|汇报文档/i.test(query || '') ||
                        resolvedMessages.some((m: Record<string, unknown>) => extractContent(m).includes('```docx'))

    if (isDocxTopic) {
      systemParts.push(DOCX_SYSTEM_PROMPT)
    }

    const isExcelTopic = effectiveDocType === 'xlsx' || /excel|表格|电子表格|spreadsheet|xlsx|数据表|报表|统计表|明细表/i.test(query || '') ||
                         resolvedMessages.some((m: Record<string, unknown>) => extractContent(m).includes('```xlsx'))

    if (isExcelTopic) {
      systemParts.push(EXCEL_SYSTEM_PROMPT)
    }

    if (promptId) {
      try {
        const promptRes = await (prisma as unknown as { promptTemplate: { findUnique: (args: { where: { id: string } }) => Promise<{ content?: string } | null> } }).promptTemplate.findUnique({
          where: { id: promptId }
        })
        if (promptRes?.content) {
          systemParts.push(promptRes.content)
        }
      } catch (e) {
        console.error('[TaskScheduler] Failed to fetch prompt template during fallback:', e)
      }
    }
    const systemPrompt = systemParts.join('\n\n---\n\n') || undefined

    const maxContextTokens = (settings?.apiContextSize as number) || 8192
    let currentContextTokens = 0
    const rawCoreMessages: ModelMessage[] = (resolvedMessages || []).map((m: Record<string, unknown>, idx: number) => {
      const role = ((m.role as string) || 'user') as 'user' | 'assistant' | 'system'
      const text = (idx === resolvedMessages.length - 1 && role === 'user') ? query : extractContent(m)
      return { role, content: text }
    }).filter((m: { content: string }) => m.content !== '') as ModelMessage[]

    const prunedMessages: ModelMessage[] = []
    for (let i = rawCoreMessages.length - 1; i >= 0; i--) {
      const msg = rawCoreMessages[i]
      const estimatedTokens = Math.ceil(msg.content.length / (msg.content.match(/[\u4e00-\u9fa5]/) ? 1.5 : 3.5))
      if (currentContextTokens + estimatedTokens > maxContextTokens && prunedMessages.length > 0) break
      currentContextTokens += estimatedTokens
      prunedMessages.unshift(msg)
    }


    const rawTemp2 = settings?.apiTemperature as number | undefined
    const rawTopP2 = settings?.apiTopP as number | undefined
    const rawMaxTokens2 = settings?.apiMaxTokens as number | undefined

    const inferenceOptions: InferenceOptions = {
      model: parseModelId(fallbackModel).model,
      messages: prunedMessages,
      systemPrompt,
      temperature: (rawTemp2 === 0 || rawTemp2 == null) ? undefined : rawTemp2,
      topP: (rawTopP2 === 0 || rawTopP2 == null) ? undefined : rawTopP2,
      maxTokens: (rawMaxTokens2 === 0 || rawMaxTokens2 == null) ? undefined : rawMaxTokens2,
      signal: AbortSignal.timeout(CHAT_REQUEST_TIMEOUT),
      deepThink,
    }


    let stream: AsyncGenerator<string, void, unknown>
    try {
      if (fallbackProviderType === 'local-gguf') {
        const { streamLocalGgufChat } = await import('@/lib/local-gguf')
        stream = streamLocalGgufChat({
          modelId: fallbackModel,
          messages: prunedMessages,
          systemPrompt,
          settings: {
            localGgufContextSize: (settings as Record<string, unknown>)?.localGgufContextSize as number | undefined,
            localGgufTemperature: (settings as Record<string, unknown>)?.localGgufTemperature as number | undefined,
            localGgufTopP: (settings as Record<string, unknown>)?.localGgufTopP as number | undefined,
            localGgufMaxTokens: (settings as Record<string, unknown>)?.localGgufMaxTokens as number | undefined,
          },
          onStatus: (event) => {
            this.emit(taskId, 'status', event)
          }
        })
      } else {
        const result = await createInferenceStream(fallbackProviderType, fallbackConfig, inferenceOptions)
        stream = result.stream
      }
    } catch (streamError: unknown) {
      throw new Error(`备用模型启动失败: ${(streamError as Error).message || '未知错误'}`)
    }

    let fullText = ''
    let lastPersistTime = Date.now()
    let lastPersistLength = 0
    let localAssistantMsgId = assistantMsgId
    let chunkCount = 0

    for await (const chunk of stream) {
      if (inferenceOptions.signal?.aborted) break

      fullText += chunk
      chunkCount++

      if (chunkCount === 1) {
        this.emit(taskId, 'text', { content: `\n\n---\n\n[自动切换到备用模型: ${fallbackModel}]\n\n`, replace: false })
      }
      this.emit(taskId, 'text', { content: chunk })

      if (activeChatId && (Date.now() - lastPersistTime > PERSIST_INTERVAL_MS || fullText.length - lastPersistLength >= PERSIST_MIN_LENGTH)) {
        try {
          if (!localAssistantMsgId) {
            const msg = await prismaRetry(() => prisma.message.create({
              data: { chatId: activeChatId, role: 'assistant', content: fullText }
            }))
            localAssistantMsgId = msg.id
          } else {
            await prismaRetry(() => prisma.message.update({
              where: { id: localAssistantMsgId || undefined },
              data: { content: fullText }
            }))
          }
          lastPersistTime = Date.now()
          lastPersistLength = fullText.length
        } catch (e) {
          console.warn('[TaskScheduler] Fallback persist error:', e)
        }
      }
    }

    if (!fullText.trim()) {
      throw new Error('备用模型未返回有效内容')
    }

    if (activeChatId) {
      try {
        const citationsData = JSON.stringify(collectedCitations)
        if (!localAssistantMsgId) {
          await prismaRetry(() => prisma.message.create({
            data: { chatId: activeChatId, role: 'assistant', content: fullText, citations: citationsData }
          }))
        } else {
          await prismaRetry(() => prisma.message.update({
            where: { id: localAssistantMsgId },
            data: { content: fullText, citations: citationsData }
          }))
        }
      } catch (e) {
        console.warn('[TaskScheduler] Fallback final persist error:', e)
      }
    }

    if (deepThink) {
      this.emit(taskId, 'status', { type: 'thinking', stage: 'done', message: '思考完成' })
    }

    this.emit(taskId, 'fallback', { stage: 'success', model: fallbackModel, primaryError })
    this.emit(taskId, 'done', { textLength: fullText.length, chatId: activeChatId })

    await prismaRetry(() => prisma.inferenceTask.update({
      where: { id: taskId },
      data: { status: 'completed', result: fullText, completedAt: new Date(), model: fallbackModel },
    })).catch(() => {})

    console.log(`[TaskScheduler:${this.instanceId}] Fallback task completed successfully with ${fallbackModel}`)
  }
}

const globalForScheduler = globalThis as typeof globalThis & {
  __taskSchedulerInstance?: TaskScheduler
}

export function getTaskScheduler(): TaskScheduler {
  // BUG-009 FIX: 确保全局单例，即使在 Next.js 开发模式下也只创建一个实例
  if (!globalForScheduler.__taskSchedulerInstance) {
    globalForScheduler.__taskSchedulerInstance = new TaskScheduler()
    console.log(`[TaskScheduler] Created new singleton instance: ${globalForScheduler.__taskSchedulerInstance.instanceId}`)
  }
  return globalForScheduler.__taskSchedulerInstance
}

export { TaskScheduler, ProviderSemaphore }
