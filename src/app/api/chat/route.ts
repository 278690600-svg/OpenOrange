import { streamText, generateText, type ToolSet } from 'ai'
import { v4 as uuidv4 } from 'uuid'
import prisma from '@/lib/db'
import { adjustModelParams } from '@/lib/model-specs'
import { buildKnowledgeContext } from '@/lib/knowledge'
import { searchWithFallback, type SearchResult } from '@/lib/search-service'
import { mcpManager } from '@/lib/mcp'
import { resolveModelPath } from '@/lib/models'
import { getSmartProvider, extractContent, sseEvent, Settings } from '@/lib/ai-provider'
import { CRAWL_TIMEOUT, MAX_CRAWL_TEXT_LENGTH, CHAT_REQUEST_TIMEOUT, PERSIST_INTERVAL_MS, PERSIST_MIN_LENGTH, MAX_TOOL_STEPS } from '@/lib/constants'
import { buildMemoryContext, formatMemoryForPrompt, extractMemoriesFromResponse } from '@/lib/agent-memory'
import { triggerWebhook } from '@/lib/webhook'
import path from 'path'

import fs from 'fs'

// Local GGUF chat handlers have been refactored and moved to src/lib/local-gguf.ts

interface ChatMessage {
  role: string
  content: unknown
}



// SearchResult is imported from @/lib/search-service

const DEEP_THINK_SYSTEM_PROMPT = `You are a highly capable reasoning assistant. When answering, first think step-by-step inside <think>/think> tags, then provide your final answer. Show your complete reasoning process in the thinking block before concluding.

Respond in 中文.`

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
  "templateId": "optional_id_from_available_templates",
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

/**
 * Basic HTML crawler to extract main text content
 */
function isPrivateUrl(urlStr: string): boolean {
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

async function crawlPage(url: string, timeout = CRAWL_TIMEOUT): Promise<string> {
  if (isPrivateUrl(url)) {
    console.warn(`[Crawl] Blocked private/internal URL: ${url}`)
    return ''
  }
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
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
  } catch (e) {
    console.warn(`[Crawl] Failed to crawl ${url}:`, (e as Error).message)
    return ''
  }
}

/**
 * Fast rule-based check: does this query obviously NOT need a search?
 */
function obviouslyNoSearch(query: string): boolean {
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

function needsMcpTools(query: string, mcpTools: Record<string, unknown>): boolean {
  if (Object.keys(mcpTools).length === 0) return false
  const q = query.toLowerCase().trim()

  const noMcpPatterns = [
    /^(你好|hi|hello|嗨|哈喽)\s*[!！。.]*$/i,
    /^(谢谢|感谢|thank|thx)\s*[!！。.]*$/i,
    /^(写|帮我写|write|create|generate|生成).{0,20}(代码|code|函数|function|脚本|script)/i,
    /^(翻译|translate|转换成|convert\s+to)/i,
    /^(解释|explain\s+)/i,
    /^(计算|算|compute|calculate|solve)\s/i,
    /^(总结|summarize|归纳|概括)/i,
    /^(格式化|format|整理|lint|refactor|重构)/i,
  ]
  if (noMcpPatterns.some(p => p.test(q))) return false

  const mcpSignals = [
    /(打开|open|访问|visit|浏览|browse|navigate).{0,20}(网页|网站|页面|url|link|网站)/i,
    /(截图|screenshot|截屏|capture|快照)/i,
    /(点击|click|按下|press|选择|select)/i,
    /(输入|type|填写|fill|填入)/i,
    /(滚动|scroll|下滑|上滑)/i,
    /(搜索|search|查找|find).{0,10}(网页|网站|页面|web|online)/i,
    /(帮我|请|can you).{0,10}(打开|操作|执行|运行|run|execute|perform)/i,
    /(桌面|desktop|屏幕|screen)/i,
    /(自动化|automate|脚本操作|script.*action)/i,
  ]
  if (mcpSignals.some(p => p.test(q))) return true

  return false
}

/**
 * Helper: retry generateText call with exponential backoff or simple delay
 */
async function retryGenerateText(params: Parameters<typeof generateText>[0], maxRetries = 2, delayMs = 1500) {
  let lastError: unknown
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await generateText(params)
    } catch (e: unknown) {
      lastError = e
      const err = e as Error
      const msg = err.message || ''
      if (msg.includes('Unauthorized') || msg.includes('401') || msg.includes('login fail') || msg.includes('API key') || msg.includes('auth')) {
        console.warn(`[AI SDK] Auth error, not retrying: ${msg}`)
        throw e
      }
      if (msg.includes('rate limit') || msg.includes('429')) {
        console.warn(`[AI SDK] Rate limit, not retrying: ${msg}`)
        throw e
      }
      if (i < maxRetries) {
        console.warn(`[AI SDK] Retry ${i + 1}/${maxRetries} after error: ${err.message}`)
        await new Promise(resolve => setTimeout(resolve, delayMs))
      }
    }
  }
  throw lastError
}

/**
 * Auto mode: decide if a web search is needed.
 * Logic:
 *  1. If obviously no search (pure code/math/creative) → skip
 *  2. If strong search signals detected → immediately search (no LLM call)
 *  3. Otherwise → quick LLM judgment as fallback
 */

async function shouldSearch(query: string, history: ChatMessage[], provider: (id: string) => unknown, resolvedId: string): Promise<boolean> {
  const q = query.trim()
  
  if (obviouslyNoSearch(q)) {
    return false
  }

  const strongSearchSignals = [
    /(搜索|搜一下|帮我搜|搜索一下)/i,
    /(search|google|look up|find out)/i,
    /(最新新闻|最近新闻|今日新闻|今天新闻|今日热点|最新消息)/i,
    /(价格|价钱|多少钱|price|cost|股价|汇率|rate|stock)/i,
    /(天气|weather|气温|温度|forecast)/i,
    /(发布|release|launch|公告|announcement|上市|官方|official)/i,
    /(是什么|什么是|who is|what is|when did|how to|why).{0,20}(最新|最近|今天|current|recent|new)/i,
  ]

  const noSearchWhenMcp = [
    /(打开|open|启动|launch).{0,20}(浏览器|browser|网页|网站|page)/i,
    /(截图|screenshot|截屏|capture)/i,
    /(浏览|browse|访问|visit|navigate).{0,20}(网页|网站|page|url)/i,
    /(帮我|请).{0,10}(打开|操作|执行)/i,
  ]

  if (noSearchWhenMcp.some(p => p.test(q))) {
    return false
  }
  
  if (strongSearchSignals.some(p => p.test(q))) {
    return true
  }

  const weakNoSearchSignals = [
    /^(写|帮我写|write|create|generate|生成|做|制作)/i,
    /^(翻译|translate|转换)/i,
    /^(解释|explain|说明)/i,
    /^(计算|算|compute|calculate)/i,
    /^(总结|summarize|归纳)/i,
    /^(你好|hi|hello|嗨|哈喽|谢谢|感谢|thank)/i,
    /^(画|绘制|设计|design)/i,
    /^(修改|优化|完善|改进|improve|fix|fixing)/i,
  ]
  
  if (weakNoSearchSignals.some(p => p.test(q))) {
    return false
  }
  
  try {
    const recentHistory = history.slice(-3).map(m => {
      const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
      return `${m.role}: ${content.substring(0, 100)}`
    }).join('\n')
    
    const prompt = `Decide if this user query requires searching the internet for up-to-date information.

Answer YES if:
- Query asks about real-world facts, people, events, products, or current topics
- Query cannot be answered confidently without recent information

Answer NO if:
- Query is about coding, math, writing, explaining concepts
- Query is conversational (greetings, thanks, general questions)
- Query asks to create something (PPT, code, diagrams, creative writing)

Context:
${recentHistory}

Query: ${q}

Answer (YES or NO only):`

    const { text } = await retryGenerateText({
      model: provider(resolvedId) as Parameters<typeof generateText>[0]['model'],
      prompt,
      maxOutputTokens: 3,
    } as Parameters<typeof generateText>[0])
    
    return text.trim().toUpperCase().startsWith('YES')
  } catch {
    console.warn('[Intent] LLM decision failed, defaulting to NO search')
    return false
  }
}

type SettingsData = {
  defaultModel?: string
  mcpEnabled?: boolean
  apiContextSize?: number
  apiTemperature?: number
  apiTopP?: number
  apiMaxTokens?: number
  localGgufEnabled?: boolean
  localGgufContextSize?: number
  localGgufTemperature?: number
  localGgufTopP?: number
  localGgufMaxTokens?: number
}

let settingsCache: { data: SettingsData | null; timestamp: number } | null = null
const SETTINGS_CACHE_TTL = 30_000

import { decryptSettingsPayload } from '@/lib/crypto'

async function getSettings() {
  const now = Date.now()
  if (settingsCache && now - settingsCache.timestamp < SETTINGS_CACHE_TTL) {
    return settingsCache.data
  }
  const data = await prisma.settings.findUnique({ where: { id: 'default' } })
  const decrypted = data ? decryptSettingsPayload(data as any) : data
  settingsCache = { data: decrypted, timestamp: now }
  return decrypted
}

export async function invalidateSettingsCache() {
  settingsCache = null
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const reqUrl = new URL(req.url)
    const baseUrl = `${reqUrl.protocol}//${reqUrl.host}`
    const { messages, model, chatId, deepThink, webSearch, kbId, files, promptId } = body

    const settings = await getSettings()
    const defaultModel = settings?.defaultModel || 'ollama::llama3'
    const selectedModel = model || defaultModel

    console.log('[Chat] POST model:', selectedModel, 'chatId:', chatId)

    const { provider, resolvedId } = await getSmartProvider(selectedModel, settings as Settings)
    console.log('[Chat] Provider resolved:', resolvedId)

    // Load MCP tools if enabled
    let mcpTools: ToolSet = {}
    if (settings?.mcpEnabled) {
      try {
        console.log('[Chat] Loading MCP tools...')
        mcpTools = await mcpManager.getTools() as ToolSet
        console.log(`[Chat] Loaded ${Object.keys(mcpTools).length} MCP tools`)
      } catch (error) {
        console.error('[Chat] Failed to load MCP tools:', error)
      }
    }

    // Create a custom SSE stream for rich status updates
    const encoder = new TextEncoder()
    const stream = new TransformStream()
    const writer = stream.writable.getWriter()

    const write = async (data: string) => {
      await writer.write(encoder.encode(data))
    }

    const lastUserMsg = messages?.length > 0 ? messages[messages.length - 1] : null
    const originalQuery = extractContent(lastUserMsg)

    const mcpNeeded = needsMcpTools(originalQuery, mcpTools)
    console.log(`[Chat] MCP needed for this query: ${mcpNeeded}`)

    // Start processing in the background
    ;(async () => {
      const timeoutSignal = AbortSignal.timeout(CHAT_REQUEST_TIMEOUT)
      let collectedCitations: Array<{ title: string; url: string }> = []
      let collectedSearchSteps: Array<Record<string, unknown>> = []
      try {
        if (timeoutSignal.aborted) throw new Error('Request timeout')
        // --- Web Search & Knowledge Base ---
        let searchResults: SearchResult[] = []
        let systemInjection = ''
        let kbInjection = ''
        let fileInjection = ''

        // 1. Local Knowledge Base Retrieval
        if (kbId && originalQuery) {
           await write(sseEvent('status', { type: 'search', stage: 'searching', message: '正在检索本地知识库...' }))
           try {
             const kbContext = await buildKnowledgeContext(kbId, originalQuery)
             if (kbContext && kbContext.context) {
               kbInjection = kbContext.context
               
               if (kbContext.citations?.length) {
                collectedCitations = [...collectedCitations, ...kbContext.citations]
                await write(sseEvent('citations', {
                  results: kbContext.citations
                }))
              }
               await write(sseEvent('status', { type: 'search', stage: 'done', message: '知识库检索完成' }))
             } else {
               await write(sseEvent('status', { type: 'search', stage: 'skip', message: '知识库无相关内容' }))
             }
           } catch (e: unknown) {
             console.error('[KB] Retrieval error:', e)
             await write(sseEvent('status', { type: 'search', stage: 'error', message: '知识库检索失败' }))
           }
        }

        // 2. Web Search
        let searchQuery = originalQuery

        const deepSearch = webSearch === 'deep'
        const forceSearch = webSearch === true || deepSearch
        const autoSearch = webSearch === 'auto' || webSearch === undefined

        let isSearchNeeded = forceSearch
        if (!forceSearch && autoSearch && originalQuery) {
          await write(sseEvent('status', { type: 'search', stage: 'intent', message: '正在分析是否需要搜索...' }))
          isSearchNeeded = await shouldSearch(originalQuery, messages.slice(0, -1), provider, resolvedId)
          if (!isSearchNeeded) {
            await write(sseEvent('status', { type: 'search', stage: 'skip', message: '无需搜索' }))
          }
        }

        if (isSearchNeeded && searchQuery) {
          let rewrittenQuery: string | null = null
          const isVagueFollowUp = /^(好的|ok|继续|然后呢|搜吧|搜一下|查一下|帮我查|详细说说|展开说说|more|tell me more|go on|continue|elaborate|搜|查|嗯|对|是的|right|yes|yeah)$/i.test(originalQuery.trim())

          if (isVagueFollowUp) {
            try {
              await write(sseEvent('status', { type: 'search', stage: 'rewrite', message: '正在从上下文提取搜索关键词...' }))
              
              const recentCtx = messages.slice(-6).map((m: ChatMessage) => {
                const content = extractContent(m)
                return `[${m.role}]: ${content.substring(0, 300)}`
              }).join('\n')
              
              const rewritePrompt = `Based on the conversation, infer what the user wants to search for and output a search query.

Rules:
- Output ONLY the search query, nothing else. No quotes, no explanation, no prefix.
- The query should capture the actual topic from context that the user is referring to.
- Keep it natural — like what you would type into a search engine.
- Preserve named entities, technical terms, version numbers, and specific details.
- Use the same language as the conversation (Chinese → Chinese query, English → English query).
- Do NOT over-summarize. A good search query can be a full sentence or a precise phrase.

Conversation:
${recentCtx}

Search query:`

              const { text } = await retryGenerateText({
                model: provider(resolvedId) as Parameters<typeof generateText>[0]['model'],
                prompt: rewritePrompt,
                maxOutputTokens: 80,
              } as Parameters<typeof generateText>[0])

              if (text && text.trim().length > 1) {
                rewrittenQuery = text.trim().replace(/^["""']|["""']$/g, '').replace(/^搜索[:：]?\s*/i, '')
                searchQuery = rewrittenQuery
                await write(sseEvent('status', { type: 'search', stage: 'rewrite_done', message: `搜索: "${searchQuery}"` }))
              }
            } catch (e) {
              console.warn('[Chat] Query rewrite failed, using original:', e)
            }
          } else {
            await write(sseEvent('status', { type: 'search', stage: 'rewrite_done', message: `搜索: "${searchQuery}"` }))
          }

          // 2. Search (direct service call — no self-fetch HTTP loop)
          try {
            await write(sseEvent('status', { type: 'search', stage: 'searching', message: `正在搜索 "${searchQuery}"...` }))

            const searchEngine = (settings as Record<string, unknown>)?.searchEngine as string || 'bing'
            const searchKey = (settings as Record<string, unknown>)?.searchKey as string || ''
            const { results: rawResults } = await searchWithFallback(searchQuery, searchEngine, searchKey, deepSearch)

            if (rewrittenQuery && rewrittenQuery !== originalQuery) {
              try {
                const { results: originalResults } = await searchWithFallback(originalQuery, searchEngine, searchKey, false)
                const existingUrls = new Set(rawResults.map((r: SearchResult) => r.url))
                for (const r of originalResults) {
                  if (!existingUrls.has(r.url)) {
                    rawResults.push(r)
                    existingUrls.add(r.url)
                  }
                }
              } catch {}
            }

            await write(sseEvent('status', {
              type: 'search',
              stage: 'found',
              message: `找到 ${rawResults.length} 个结果`,
              results: rawResults.slice(0, 6).map((r: SearchResult) => ({ title: r.title, url: r.url }))
            }))

            // 3. Crawl top results
            const numToCrawl = deepSearch ? 15 : 3
            const topResults = rawResults.slice(0, numToCrawl)
            if (topResults.length > 0) {
              await write(sseEvent('status', { type: 'search', stage: 'reading', message: `正在深度阅读 ${topResults.length} 个核心网页...` }))

              const crawledContents: string[] = new Array(topResults.length).fill('')
              const CONCURRENCY_LIMIT = 5
              for (let batchStart = 0; batchStart < topResults.length; batchStart += CONCURRENCY_LIMIT) {
                const batch = topResults.slice(batchStart, batchStart + CONCURRENCY_LIMIT)
                const batchResults = await Promise.all(
                  batch.map(async (r: SearchResult, bi: number) => {
                    const i = batchStart + bi
                    const content = await crawlPage(r.url)
                    await write(sseEvent('status', {
                      type: 'search',
                      stage: 'read_page',
                      message: `已阅读: ${r.title}`,
                      pageIndex: i,
                    }))
                    return { index: i, content }
                  })
                )
                for (const { index, content } of batchResults) {
                  crawledContents[index] = content
                }
              }

              searchResults = rawResults.map((r: SearchResult, i: number) => {
                const crawled = i < topResults.length ? crawledContents[i] : ''
                return {
                  ...r,
                  snippet: crawled && crawled.length > r.snippet.length ? crawled : r.snippet
                }
              })
            } else {
              searchResults = rawResults
            }

            if (searchResults.length > 0) {
              const contextBlock = searchResults
                .map((r, i) => `SOURCE [${i + 1}]:\nTitle: ${r.title}\nContent: ${r.snippet}\nURL: ${r.url}`)
                .join('\n\n---\n\n')

              const baseInstruction = deepSearch
                ? `1. 你正在执行一项"深度研究 (Deep Research)"任务。用户期望一份极具深度、结构严谨的详尽研究报告。
2. 你必须结合这些大量的网页搜索结果，撰写一份至少 1000 字（如果用户明确要求甚至可以达到 10000 字）的高手级报告或论文。
3. 请使用清晰的标题、子标题、Markdown 格式来组织内容（比如：引言、核心分析、不同观点、背景、结论等）。
4. 绝不要仅仅是对检索结果进行简单罗列，必须对信息进行融会贯通、数据对比与逻辑推演。
5. 当你引用任何事实、数据或观点时，必须精准地尾随引用标注（例如 [1], [2] 等，对照上述的数据源SOURCE编号）。
6. 用用户的语言回复，尽量提供极致的细节和有洞见的分析，如果搜索结果不够支撑长篇大论，请尽你所能去深度推理或告知信息的边界。`
                : `1. **Prioritize the provided results** as the primary source of truth for recent events or specific details.
2. **Synthesize and integrate** the information into a comprehensive answer. Do not just list the results.
3. **Cite your sources** using the numbered format [1], [2], etc., corresponding to the SOURCE numbers above. Place citations immediately after the relevant information.
4. If the search results are insufficient or irrelevant, acknowledge it, but still try to use the most relevant parts.
5. **Output Language**: Respond in the language of the user's query (usually Chinese).`

              systemInjection = `
# WEB SEARCH CONTEXT
The user has requested a web search. Below are the most relevant and up-to-date search results from the internet.

## SEARCH RESULTS:
${contextBlock}

## INSTRUCTIONS:
${baseInstruction}
Current date is ${new Date().toISOString().split('T')[0]}.
`.trim()

              collectedCitations = [...collectedCitations, ...searchResults.map(r => ({ title: r.title, url: r.url }))]
              await write(sseEvent('citations', {
                results: searchResults.map(r => ({ title: r.title, url: r.url }))
              }))
            }

            await write(sseEvent('status', { type: 'search', stage: 'done', message: '搜索完成' }))
          } catch (e) {
            console.warn('[Chat] Search failed:', e)
            await write(sseEvent('status', { type: 'search', stage: 'error', message: '搜索失败' }))
          }
        }

        // 2. Uploaded Files & Images (Session Context)
        type UploadedFile = { name: string; content?: string; dataUrl?: string; type: string }
        const uploadedFiles = (files || []) as UploadedFile[]
        const imageFiles = uploadedFiles.filter(f => f.dataUrl && f.type.startsWith('image/'))
        const docFiles = uploadedFiles.filter(f => f.content !== undefined && !f.dataUrl)

        console.log(`[Chat] uploadedFiles=${uploadedFiles.length} images=${imageFiles.length} docs=${docFiles.length}`)

        // Build file context injection
        if (docFiles.length > 0) {
          const docBlocks = docFiles.map(f => {
            const preview = f.content && f.content.length > 0 ? f.content : '[Empty file or unsupported format]'
            return `### File: ${f.name}\n\`\`\`\n${preview}\n\`\`\`\n`
          }).join('\n')
          fileInjection = [
            '# 📎 UPLOADED FILES',
            '**CRITICAL INSTRUCTION: The user has attached the following files. You MUST read and analyze this content before answering. This is the primary source of truth for any question related to these files.**',
            '',
            docBlocks,
            '',
            'When answering, reference the specific file names and quote relevant sections from the content above.'
          ].join('\n')
        }



        // --- Build System Prompt ---
        const systemParts: string[] = []
        
        // 只在用户明确要求 PPT 或对话历史中已存在 PPT 内容时注入详细指令
        const isPptTopic = /ppt|slide|presentation|幻灯片|演示文稿|方案汇报|课件/i.test(originalQuery || '') || 
                          messages.some((m: ChatMessage) => extractContent(m).includes('```ppt'))
        
        if (isPptTopic) {
          systemParts.push(PPT_SYSTEM_PROMPT)
        } else {
          systemParts.push('If the user specifically asks for a presentation or PPT, you have the capability to generate a structured JSON block inside a "ppt" code block.')
        }

        const isDocxTopic = /word|文档|报告|文章|docx|document|report|article|合同|方案书|总结|汇报文档/i.test(originalQuery || '') ||
                          messages.some((m: ChatMessage) => extractContent(m).includes('```docx'))

        if (isDocxTopic) {
          systemParts.push(DOCX_SYSTEM_PROMPT)
        } else {
          systemParts.push('If the user asks for a Word document or report, you can generate structured HTML content inside a "docx" code block.')
        }

        const isExcelTopic = /excel|表格|电子表格|spreadsheet|xlsx|数据表|报表|统计表|明细表/i.test(originalQuery || '') ||
                          messages.some((m: ChatMessage) => extractContent(m).includes('```xlsx'))

        if (isExcelTopic) {
          systemParts.push(EXCEL_SYSTEM_PROMPT)
        } else {
          systemParts.push('If the user asks for a spreadsheet or Excel file, you can generate structured JSON data inside an "xlsx" code block.')
        }

        if (deepThink) systemParts.push(DEEP_THINK_SYSTEM_PROMPT)

        // 注入用户选择的角色预设
        if (promptId) {
          try {
            const promptRes = await (prisma as unknown as { promptTemplate: { findUnique: (args: { where: { id: string } }) => Promise<{ content?: string } | null> } }).promptTemplate.findUnique({
              where: { id: promptId }
            })
            if (promptRes?.content) {
              systemParts.push(promptRes.content)
            }
          } catch (e) {
            console.error('[Chat API] Failed to fetch prompt template:', e)
          }
        }

        // --- 智能化模板自动匹配注入 ---
        try {
          // Fetch presentation templates
          const presTemplates = await (prisma as any).presentationTemplate?.findMany({ select: { id: true, name: true, description: true } }) || [];
          if (presTemplates.length > 0) {
            const presTmplStr = presTemplates.map((t: any) => `- ID: ${t.id} | Name: ${t.name} | Desc: ${t.description}`).join('\n');
            systemParts.push(`## AVAILABLE PPT TEMPLATES\nIf the user asks for a PPT but does NOT specify a template, you can intelligently auto-select the best matching template from the list below based on their context. Include the field \`"templateId": "<id>"\` in your JSON output.\n\n${presTmplStr}`);
          }
          
          // Fetch document/excel templates (conversationTemplate / template)
          const docTemplates = await (prisma as any).conversationTemplate?.findMany({ select: { id: true, name: true, description: true, category: true } }) || [];
          if (docTemplates.length > 0) {
            const docTmplStr = docTemplates.map((t: any) => `- ID: ${t.id} | Name: ${t.name} | Category: ${t.category} | Desc: ${t.description}`).join('\n');
            systemParts.push(`## AVAILABLE DOC/EXCEL TEMPLATES\nIf the user asks for a Word or Excel document, you can intelligently select a template from below. When generating the docx or xlsx code block, append a comment at the top of the block like \`// TEMPLATE_ID: <id>\` so the system applies it.\n\n${docTmplStr}`);
          }
        } catch (e) {
          console.error('[Chat API] Failed to fetch intelligent templates:', e)
        }


        try {
          const memoryCtx = await buildMemoryContext(chatId || undefined)
          const memoryStr = formatMemoryForPrompt(memoryCtx)
          if (memoryStr) {
            systemParts.push(`# AGENT MEMORY\nYou have the following memories about this user and conversation context. Use this information to provide more personalized and contextually aware responses:\n\n${memoryStr}`)
          }
        } catch (e) {
          console.error('[Chat API] Failed to build memory context:', e)
        }
        
        // Add MCP tool usage instructions if tools are available
        if (mcpNeeded && Object.keys(mcpTools).length > 0) {
          const toolNames = Object.keys(mcpTools).join(', ')
          systemParts.push(`# MCP TOOLS AVAILABLE
You have access to the following MCP tools: ${toolNames}

**IMPORTANT INSTRUCTIONS:**
1. Only use MCP tools when the user's request actually requires performing actions (browsing, screenshots, file operations, etc.).
2. Do NOT call tools for simple questions that can be answered from your knowledge or the search results provided.
3. When using tools, call them precisely.
4. **CRITICAL: After receiving tool results, you MUST provide a detailed response to the user**:
   - Summarize what the tool did and what it returned
   - If it's a browser action, describe what you see on the page
   - If it's a file operation, confirm the result
   - If the tool returned data, analyze and present it clearly
   - NEVER just execute a tool and stop - always follow up with a meaningful explanation
5. If a tool call fails, try alternative approaches or inform the user of the issue.`)
        }
        
        const systemPrompt = systemParts.join('\n\n---\n\n') || undefined

        // --- Persist user message to DB ---
        let activeChatId = chatId
        const lastMsg = messages?.length > 0 ? messages[messages.length - 1] : null
        
        // actualContent is exactly what the user typed
        const actualContent = extractContent(lastMsg) || ''
        
        // dbContent includes file attachments for the UI to represent,
        // but actively excludes ephemeral search results to prevent DB bloat.
        let dbContent = actualContent
        if (fileInjection.trim()) {
          dbContent = `${fileInjection}\n\nUSER QUESTION:\n${actualContent}`
        }

        if (!activeChatId || activeChatId === 'new' || activeChatId.startsWith('new-')) {
          activeChatId = uuidv4()
          const firstTitle = extractContent(lastMsg).substring(0, 60) || 'OpenOrangeAI'
          
          await prisma.chat.create({
            data: {
              id: activeChatId,
              title: firstTitle,
              selectedPromptId: promptId || null,
            }
          })

          triggerWebhook('chat.created', { chatId: activeChatId, title: firstTitle }).catch(() => {})
          
          await prisma.message.create({
            data: { chatId: activeChatId, role: 'user', content: dbContent },
          })
        } else {
          const existingChat = await prisma.chat.findUnique({ where: { id: activeChatId } })
          if (existingChat) {
            try {
              await prisma.chat.update({
                where: { id: activeChatId },
                data: { selectedPromptId: promptId || null }
              })
            } catch {}
          } else {
            const firstTitle = extractContent(lastMsg).substring(0, 60) || 'OpenOrangeAI'
            await prisma.chat.create({
              data: {
                id: activeChatId,
                title: firstTitle,
                selectedPromptId: promptId || null,
              }
            })

            triggerWebhook('chat.created', { chatId: activeChatId, title: firstTitle }).catch(() => {})
          }
          
          await prisma.message.create({
            data: { chatId: activeChatId, role: 'user', content: dbContent },
          })
        }

        // Send chatId event
        await write(sseEvent('chatId', { id: activeChatId }))

        if (deepThink) {
          await write(sseEvent('status', { type: 'thinking', stage: 'start', message: '正在深度思考...' }))
        }

        // --- Build dynamic turn injection (Search, KB, Files) ---
        // This is sent to the LLM per-turn, bypassing the static systemPrompt limitation.
        const turnParts: string[] = []
        if (kbInjection) turnParts.push(kbInjection)
        if (systemInjection) turnParts.push(systemInjection)
        if (fileInjection) turnParts.push(fileInjection)
        
        const turnInjectionStr = turnParts.join('\n\n---\n\n')
        let fullyEnrichedContent = actualContent
        if (turnInjectionStr.trim()) {
          fullyEnrichedContent = `${turnInjectionStr}\n\nUSER QUESTION:\n${actualContent}`
        }

        let lastUserMsgIdx = -1
        for (let i = (messages || []).length - 1; i >= 0; i--) {
          if ((messages || [])[i].role === 'user') {
            lastUserMsgIdx = i
            break
          }
        }

        // --- Build core messages for the model (AI SDK multimodal format) ---
        const isVisionSupported = (modelId: string): boolean => {
          const m = modelId.toLowerCase()
          if (m.startsWith('openai::') && (m.includes('gpt-4o') || m.includes('gpt-4-turbo') || m.includes('vision') || m.includes('o1') || m.includes('o3'))) return true
          if (m.startsWith('anthropic::') && (m.includes('claude-3-5') || m.includes('claude-3-') || m.includes('claude-') || m.includes('vision'))) return true
          if (m.startsWith('google::') && (m.includes('gemini-') || m.includes('vision'))) return true
          if (m.startsWith('openrouter::') && (m.includes('gpt-4o') || m.includes('gemini-') || m.includes('claude-') || m.includes('vision') || m.includes('vl'))) return true
          if (m.startsWith('groq::') && (m.includes('vision') || m.includes('vl') || m.includes('llama-3.2'))) return true
          if ((m.startsWith('ollama::') || m.startsWith('lmstudio::')) && (m.includes('vision') || m.includes('vl') || m.includes('llava'))) return true
          
          // Added Volcengine multimodal model patterns
          if (m.startsWith('volcengine::') && (m.includes('pro') || m.includes('m3') || m.includes('glm') || m.includes('vision'))) return true

          // 如果没有匹配到前缀，但模型名字本身包含了 vision、vl、llava、gpt-4o、gemini、claude 字段，也予以信任
          const modelName = m.split('::')[1] || m
          if (modelName.includes('vision') || modelName.includes('-vl') || modelName.includes('llava') || modelName.includes('gpt-4o') || modelName.includes('gemini') || modelName.includes('claude') || modelName.includes('pro')) return true
          
          return false
        }

        const useVision = isVisionSupported(selectedModel)
        console.log(`[Chat] Model ${selectedModel} supports vision: ${useVision}`)

        if (imageFiles.length > 0) {
          if (useVision) {
            const imgList = imageFiles.map(f => `- ${f.name}`).join('\n')
            const imgNote = `\n\n# 🖼️ UPLOADED IMAGES\n${imageFiles.length} image(s) are attached as visual content to the latest message:\n${imgList}\nAnalyze these images carefully when responding.`
            fileInjection = fileInjection + imgNote
          } else {
            const imgNote = `\n\n# 🖼️ UPLOADED IMAGES\n[SYSTEM WARNING] The user uploaded ${imageFiles.length} image(s), but your current model version does NOT support vision capabilities. Please politely inform the user that you cannot see the images and suggest they switch to a vision-capable model (like GPT-4o, Claude 3.5 Sonnet, or Gemini 1.5 Pro).`
            fileInjection = fileInjection + imgNote
          }
        }

        const coreMessages = (messages || []).map((m: ChatMessage, idx: number) => {
          const role = m.role || 'user'
          
          // Use fully enriched context for the LAST user message
          const text = (idx === lastUserMsgIdx) ? fullyEnrichedContent : extractContent(m)

          // Attach images back to the LAST user message only if the model supports vision
          if (idx === lastUserMsgIdx && imageFiles.length > 0 && useVision) {
            const contentParts: Array<{ type: string; text?: string; image?: string }> = []
            if (text) contentParts.push({ type: 'text', text })
            for (const img of imageFiles) {
              contentParts.push({ type: 'image', image: img.dataUrl })
            }
            return { role, content: contentParts }
          }

          return { role, content: text }
        }).filter((m: { role: string; content: unknown }) => {
          if (Array.isArray(m.content)) return m.content.length > 0
          return m.content !== ''
        })

        // --- Prune core messages based on apiContextSize ---
        const maxContextTokens = settings?.apiContextSize || 8192
        let currentContextTokens = 0
        const prunedMessages = []
        
        // Always keep the system prompt if we had one (though it's passed separately in streamText)
        // We process from newest to oldest
        for (let i = coreMessages.length - 1; i >= 0; i--) {
          const msg = coreMessages[i]
          const msgContent = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
          // Better estimation for local models (roughly 4 chars per token for English/Code, more for Chinese)
          const estimatedTokens = Math.ceil(msgContent.length / (msgContent.match(/[\u4e00-\u9fa5]/) ? 1.5 : 3.5)) 
          if (currentContextTokens + estimatedTokens > maxContextTokens && prunedMessages.length > 0) break
          currentContextTokens += estimatedTokens
          prunedMessages.unshift(msg)
        }

        let fullText = ''

        if (selectedModel.startsWith('local-gguf::') && settings?.localGgufEnabled) {
          const { streamLocalGgufChat } = await import('@/lib/local-gguf')
          const ggufStream = streamLocalGgufChat({
            modelId: selectedModel,
            messages: prunedMessages as any,
            systemPrompt,
            settings: settings as any,
            onStatus: (event) => {
              write(sseEvent('status', event)).catch(() => {})
            }
          })
          for await (const chunk of ggufStream) {
            fullText += chunk
            await write(sseEvent('text', { content: chunk }))
          }
        } else {
          // --- Stream from the model ---
          console.log(`[Chat] Streaming with ${mcpNeeded ? Object.keys(mcpTools).length : 0} MCP tools available`)
          const activeTools = mcpNeeded ? mcpTools : undefined
          const activeToolChoice = mcpNeeded ? 'auto' : undefined
          
          const adjustedParams = adjustModelParams(resolvedId, {
            temperature: settings?.apiTemperature,
            topP: settings?.apiTopP,
            maxTokens: settings?.apiMaxTokens,
          })

          const result = streamText({
            model: provider(resolvedId) as any,
            system: systemPrompt,
            messages: prunedMessages as Parameters<typeof streamText>[0]['messages'],
            tools: activeTools,
            toolChoice: activeToolChoice,
            temperature: adjustedParams.temperature,
            topP: adjustedParams.topP,
            // @ts-expect-error - maxTokens is not in the public type but supported by the runtime
            maxTokens: adjustedParams.maxTokens,
            maxSteps: MAX_TOOL_STEPS,
            maxRetries: 0,
            onStepFinish: async (step: unknown) => {
              const stepData = step as { toolCalls?: Array<{ toolName: string }>; toolResults?: Array<{ toolName: string }> }
              console.log('[Chat] onStepFinish - toolCalls:', stepData.toolCalls?.length || 0, 'toolResults:', stepData.toolResults?.length || 0)
              if (stepData.toolCalls?.length) {
                for (const tc of stepData.toolCalls) {
                  const tcArgs = (tc as { args?: Record<string, unknown>; arguments?: Record<string, unknown> }).args || (tc as { args?: Record<string, unknown>; arguments?: Record<string, unknown> }).arguments || {}
                  const urlArg = tcArgs?.url || tcArgs?.page || tcArgs?.target
                  const callInfo: Record<string, unknown> = {
                    type: 'mcp',
                    stage: 'call' as const,
                    message: `调用工具: ${tc.toolName}`,
                    tool: tc.toolName,
                    args: tcArgs
                  }
                  if (urlArg) {
                    callInfo.url = urlArg
                    callInfo.message = `正在打开: ${urlArg}`
                  }
                  await write(sseEvent('status', callInfo))
                }
              }
              if (stepData.toolResults?.length) {
                for (const tr of stepData.toolResults) {
                  const trObj = tr as { result?: unknown; data?: unknown; toolName: string }
                  const resultData = trObj.result ?? trObj.data ?? tr
                  const resultText = Array.isArray(resultData)
                    ? resultData.map((r: { text?: string }) => r.text || JSON.stringify(r)).join('\n')
                    : (typeof resultData === 'string' ? resultData : JSON.stringify(resultData))

                  console.log(`[Chat] Tool result: ${trObj.toolName}`, resultText.substring(0, 100))

                  const resultInfo: Record<string, unknown> = {
                    type: 'mcp',
                    stage: 'result' as const,
                    message: `工具 ${trObj.toolName} 返回结果`,
                    tool: trObj.toolName,
                    result: resultText.substring(0, 500),
                    rawResult: resultText.substring(0, 2000)
                  }

                  try {
                    const parsed = JSON.parse(resultText)
                    if (parsed.url) resultInfo.completedUrl = parsed.url
                    if (parsed.title) resultInfo.pageTitle = parsed.title
                    if (parsed.status) resultInfo.status = parsed.status
                  } catch {}

                  await write(sseEvent('status', resultInfo))
                }
              }
            }
          })

          let lastPersistTime = Date.now()
          let lastPersistLength = 0
          let assistantMsgId: string | null = null
          let heartbeatInterval: NodeJS.Timeout | null = null
          let streamError: Error | null = null
          let hasOutput = false

          heartbeatInterval = setInterval(async () => {
            try {
              await write(': heartbeat\n\n')
            } catch {}
          }, 8000)

          try {
            for await (const chunk of result.textStream) {
              if (!hasOutput) hasOutput = true
              fullText += chunk
              await write(sseEvent('text', { content: chunk }))

              if (activeChatId && (Date.now() - lastPersistTime > PERSIST_INTERVAL_MS || fullText.length - lastPersistLength >= PERSIST_MIN_LENGTH)) {
                if (!assistantMsgId) {
                  const msg = await prisma.message.create({
                    data: { chatId: activeChatId, role: 'assistant', content: fullText },
                  })
                  assistantMsgId = msg.id
                } else {
                  await prisma.message.update({
                    where: { id: assistantMsgId },
                    data: { content: fullText },
                  })
                }
                lastPersistTime = Date.now()
                lastPersistLength = fullText.length
              }
            }

            try {
              const reasoning = await (result as any).reasoning
              if (reasoning && typeof reasoning === 'string' && reasoning.trim() && !fullText.includes('<think>')) {
                const thinkBlock = `<think>${reasoning.trim()}</think>\n`
                fullText = thinkBlock + fullText
                await write(sseEvent('text', { content: fullText, replace: true })) // trigger re-render with updated content
              }
            } catch { /* reasoning not available for this model, ignore */ }


          } catch (streamErr: unknown) {
            const err = streamErr as Error
            streamError = err
            console.error('[Chat] Stream iteration error:', err.message)
          } finally {
            if (heartbeatInterval) clearInterval(heartbeatInterval)
          }

          let allSteps: unknown[] = []
          try {
            allSteps = (await result.steps) as unknown[] || []
          } catch (stepsErr: unknown) {
            const err = stepsErr as Error
            console.error('[Chat] Steps await error:', err.message)
          }

          const allStepsTyped = allSteps as Array<{ toolCalls?: unknown[]; toolResults?: Array<{ toolName: string; result?: unknown; data?: unknown }> }> | undefined
          const toolCallSteps = allStepsTyped?.filter((s) => s.toolCalls && s.toolCalls.length > 0) || []
          const hasToolCalls = toolCallSteps.length > 0

          // Check if we got meaningful text output (not just whitespace)
          const hasMeaningfulText = fullText.trim().length > 0

          // Handle complete failure: no text and no tools
          if (!hasMeaningfulText && !hasToolCalls) {
            const errMsg = streamError?.message || ''
            let userFriendlyMsg: string
            
            if (errMsg.includes('ECONNREFUSED') || errMsg.includes('connect ECONN') || errMsg.includes('fetch failed') || errMsg.includes('network') || errMsg.includes('ENOTFOUND')) {
              userFriendlyMsg = '无法连接到模型服务，请检查 Ollama 或其他模型服务是否已启动。'
            } else if (errMsg.includes('No output generated') || errMsg.includes('empty')) {
              userFriendlyMsg = '模型未返回任何内容，请检查模型配置和API密钥是否正确。'
            } else if (errMsg.includes('Unauthorized') || errMsg.includes('login fail') || errMsg.includes('401') || errMsg.includes('AK/SK') || errMsg.includes('API key')) {
              userFriendlyMsg = 'API认证失败，请检查API密钥设置 (火山或其它云服务AK/SK无效)。'
            } else if (errMsg.includes('rate limit') || errMsg.includes('429')) {
              userFriendlyMsg = 'API请求频率超限，请稍后重试。'
            } else if (errMsg.includes('timeout') || errMsg.includes('ETIMEDOUT')) {
              userFriendlyMsg = '模型请求超时，请检查网络连接或稍后重试。'
            } else if (errMsg.includes('model not found') || errMsg.includes('404') || errMsg.includes('not found')) {
              userFriendlyMsg = `模型 "${resolvedId}" 未找到，请检查模型名称是否正确或先拉取模型。`
            } else if (errMsg) {
              userFriendlyMsg = `模型调用失败: ${errMsg}`
            } else {
              userFriendlyMsg = '模型未返回有效内容，请检查模型服务是否正常运行。'
            }
            
            fullText = userFriendlyMsg
            hasOutput = true
            await write(sseEvent('text', { content: userFriendlyMsg }))
            console.log('[Chat] No output detected, sending fallback message')
          }

          // Handle tool calls that completed but model didn't produce text
          const hasToolButNoText = hasToolCalls && !hasMeaningfulText
          
          if (hasToolButNoText) {
            console.log('[Chat] Tool calls completed but no text response, requesting summary...')
            const toolResults = toolCallSteps.flatMap((s) =>
              (s.toolResults || []).map((tr: { toolName: string; result?: unknown; data?: unknown }) => {
                const resultData = tr.result ?? tr.data ?? tr
                const resultText = Array.isArray(resultData)
                  ? resultData.map((r: { text?: string }) => r.text || JSON.stringify(r)).join('\n')
                  : (typeof resultData === 'string' ? resultData : JSON.stringify(resultData))
                return `Tool: ${tr.toolName}\nResult: ${resultText.substring(0, 2000)}`
              })
            )

            const toolNames = toolCallSteps.flatMap((s) => ((s.toolCalls || []) as Array<{ toolName: string }>).map((tc) => tc.toolName)).join(', ')
            const summaryPrompt = `Please summarize the results of the tool calls above and provide a clear response to the user.

Tool calls made: ${toolNames}

Tool results:
${toolResults.join('\n\n')}

Please provide a detailed response based on these tool results.`

            try {
              const summaryResult = streamText({
                model: provider(resolvedId) as any,
                system: systemPrompt,
                messages: [
                  ...prunedMessages,
                  { role: 'assistant' as const, content: `I called these tools: ${toolNames}` },
                  { role: 'user' as const, content: summaryPrompt }
                ],
                maxRetries: 1,
              })

              let summaryHasOutput = false
              let summaryText = ''
              for await (const chunk of summaryResult.textStream) {
                if (!summaryHasOutput) {
                  summaryHasOutput = true
                  // Clear the empty state if needed
                  if (!hasMeaningfulText) fullText = ''
                }
                summaryText += chunk
                fullText += chunk
                hasOutput = true
                await write(sseEvent('text', { content: chunk }))
              }
              
              if (!summaryHasOutput || summaryText.trim().length === 0) {
                const fallbackText = `工具调用已完成（${toolNames}）。结果如下：\n\n${toolResults.join('\n\n')}`
                fullText += fallbackText
                hasOutput = true
                await write(sseEvent('text', { content: fallbackText }))
                console.log('[Chat] Summary produced no output, using tool results as fallback')
              }
            } catch (summaryErr: unknown) {
              const err = summaryErr as Error
              console.error('[Chat] Summary generation failed:', err.message)
              const fallbackText = `工具调用已完成（${toolNames}）。结果如下：\n\n${toolResults.join('\n\n')}`
              fullText += fallbackText
              hasOutput = true
              await write(sseEvent('text', { content: fallbackText }))
            }
          }

          // Supplement short responses after tool calls
          if (hasToolCalls && hasOutput && fullText.trim().length < 50) {
            const toolNames = toolCallSteps.flatMap((s) => ((s.toolCalls || []) as Array<{ toolName: string }>).map((tc) => tc.toolName)).join(', ')
            const supplement = `\n\n以上是工具 ${toolNames} 的执行结果。如需进一步操作，请告诉我。`
            fullText += supplement
            await write(sseEvent('text', { content: supplement }))
          }

          try {
            const reason = await result.finishReason
            if (reason === 'length') {
              const truncationTip = '\n\n*(提示：因达到模型单次生成的最大字数限制，内容输出未完全。您可以输入“继续”以续接生成。)*'
              fullText += truncationTip
              await write(sseEvent('text', { content: truncationTip }))
            }
          } catch (reasonErr) {
            console.warn('[Chat] Failed to get finishReason:', reasonErr)
          }

          // Final persist
          if (fullText && activeChatId) {
            const citationsData = JSON.stringify(collectedCitations)
            const searchStepsData = JSON.stringify(collectedSearchSteps)
            if (!assistantMsgId) {
              await prisma.message.create({
                data: { chatId: activeChatId, role: 'assistant', content: fullText, citations: citationsData, searchSteps: searchStepsData },
              })
            } else {
              await prisma.message.update({
                where: { id: assistantMsgId },
                data: { content: fullText, citations: citationsData, searchSteps: searchStepsData },
              })
            }

            try {
              await extractMemoriesFromResponse(fullText, activeChatId)
            } catch (e) {
              console.error('[Chat API] Failed to extract memories:', e)
            }
          }
        }

        if (deepThink) {
          await write(sseEvent('status', { type: 'thinking', stage: 'done', message: '思考完成' }))
        }

        await write(sseEvent('done', { textLength: fullText.length }))

        if (activeChatId) {
          try {
            const messageCount = await prisma.message.count({ where: { chatId: activeChatId } })
            triggerWebhook('chat.completed', { chatId: activeChatId, messageCount }).catch(() => {})
          } catch {}
        }

        await writer.close()
      } catch (error: unknown) {
        console.error('[Chat] Stream processing error:', error)
        const err = error as Error
        try {
          await write(sseEvent('task_error', { message: err.message || 'Processing failed' }))
          await writer.close()
        } catch {}
      }
    })()

    return new Response(stream.readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    })
  } catch (error: unknown) {
    console.error('[Chat] API Error:', error)
    const err = error as Error
    return new Response(JSON.stringify({ error: err.message || 'Failed to process chat' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

export const maxBodyLength = 52428800

