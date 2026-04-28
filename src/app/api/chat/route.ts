import { streamText, generateText } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import prisma from '@/lib/db'
import { buildKnowledgeContext } from '@/lib/knowledge'
import { mcpManager } from '@/lib/mcp'
import { resolveModelPath } from '@/lib/models'
import path from 'path'

import fs from 'fs'

let llamaInstance: any = null
let llamaIsCompiling = false

async function getLlamaInstance(isGemma4 = false) {
  if (!llamaInstance) {
    const { getLlama } = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ 'node-llama-cpp')
    
    console.log('[Llama] Loading engine (strictly using prebuilt binaries only)...')
    // We set gpu: 'auto' to automatically leverage CUDA/Vulkan if available.
    // 'build: never' prevents node-llama-cpp from attempting to compile local variants
    // if the ideal GPU environment is missing, allowing a graceful fallback to the prebuilt CPU driver.
    llamaInstance = await getLlama({ gpu: 'auto', build: 'never' })
  }
  return llamaInstance
}

async function handleLocalGgufChat({
  modelId,
  messages,
  systemPrompt,
  onToken,
  onStatus,
  settings,
}: {
  modelId: string
  messages: any[]
  systemPrompt?: string
  onToken: (token: string) => Promise<void>
  onStatus: (event: Record<string, any>) => Promise<void>
  settings?: any
}) {
  const fileName = modelId.replace('local-gguf::', '')
  const modelPath = resolveModelPath(fileName)
  console.log(`[Local GGUF] Loading model from: ${modelPath}`)

  // ===== Global cache to avoid re-loading on each request =====
  const g = globalThis as any
  g.localGgufCache = g.localGgufCache || {
    modelPath: null,
    model: null,
    context: null,
    session: null,
    isLoaded: false
  }

  let llama: any, model: any, context: any, session: any

  try {
    // Immediate feedback that we are starting the local engine
    await onStatus({ type: 'model_load', stage: 'compiling', message: '正在启动本地推理引擎...', progress: 0, modelName: fileName })
    
    const isGemma4 = fileName.toLowerCase().includes('gemma-4')
    llama = await getLlamaInstance(isGemma4)

    if (g.localGgufCache.modelPath !== modelPath) {
      // Dispose old model if switching
      if (g.localGgufCache.context) { try { await g.localGgufCache.context.dispose() } catch {} }
      if (g.localGgufCache.model) { try { await g.localGgufCache.model.dispose() } catch {} }

      await onStatus({ type: 'model_load', stage: 'loading', message: `正在加载模型: ${fileName}`, progress: 0, modelName: fileName })

      let lastProgress = 0
      model = await llama.loadModel({
        modelPath,
        onLoadProgress: (progress: number) => {
          const pct = Math.round(progress * 100)
          // Throttle: only send when changed by >=5%
          if (pct >= lastProgress + 5 || pct === 100) {
            lastProgress = pct
            onStatus({ type: 'model_load', stage: 'loading', message: `加载模型中 ${pct}%`, progress: pct, modelName: fileName }).catch(() => {})
          }
        }
      })

      await onStatus({ type: 'model_load', stage: 'context', message: '正在初始化对话上下文...', progress: 100, modelName: fileName })
      
      // Detect model family for proper chat template
      const fileNameLower = fileName.toLowerCase()
      const isGemma = fileNameLower.includes('gemma')
      const contextSize = settings?.localGgufContextSize || (isGemma ? 8192 : 4096)
      
      context = await model.createContext({ contextSize })

      const { LlamaChatSession } = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ 'node-llama-cpp')
      session = new LlamaChatSession({
        contextSequence: context.getSequence(),
        systemPrompt,
        // Gemma 4 uses a specific chat template; node-llama-cpp auto-detects from GGUF metadata
        // but we can hint to avoid issues
        ...(isGemma ? { autoDisposeSequence: false } : {})
      })

      g.localGgufCache = { modelPath, model, context, session, isLoaded: true }
      await onStatus({ type: 'model_load', stage: 'ready', message: `模型 ${fileName} 加载完成`, progress: 100, modelName: fileName })
    } else {
      // Reuse cached model
      model = g.localGgufCache.model
      context = g.localGgufCache.context
      session = g.localGgufCache.session
      // Brief status to confirm reuse
      await onStatus({ type: 'model_load', stage: 'ready', message: `使用已缓存模型: ${fileName}`, progress: 100, modelName: fileName })
    }
  } catch (error: any) {
    console.error('[Local GGUF] Initialization Error:', error)
    let errorMsg = error?.message || '文件损坏或引擎不支持'
    if (errorMsg.includes('VRAM') || errorMsg.includes('memory')) {
      errorMsg = '显存不足，请尝试使用更小或量化级别更高 (Q4/Q2) 的模型'
    }
    try {
      const modelsDir = path.join(process.cwd(), '.models')
      const altModelsDir = path.join(process.cwd(), 'models')
      const targetDir = fs.existsSync(modelsDir) ? modelsDir : (fs.existsSync(altModelsDir) ? altModelsDir : modelsDir)
      
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true })
      }
      fs.writeFileSync(path.join(targetDir, 'error.log'), String(error?.stack || error))
      console.log(`[Local GGUF] Error saved to ${path.join(targetDir, 'error.log')}`)
    } catch (e) {
      console.error('[Local GGUF] Failed to write error log:', e)
    }
    await onStatus({ type: 'model_load', stage: 'error', message: `加载失败: ${errorMsg}`, progress: 0 })
    await onToken(`\n\n[本地模型加载失败: ${errorMsg}]\n\n`)
    return
  }

  // Convert history
  const history = messages.slice(0, -1).map(m => ({
    role: m.role === 'assistant' ? 'model' : m.role,
    content: [typeof m.content === 'string' ? m.content : JSON.stringify(m.content)]
  }))
  session.setChatHistory(history as any)

  // Run the prompt
  try {
    const lastMsg = messages[messages.length - 1]
    const promptText = typeof lastMsg.content === 'string' ? lastMsg.content : JSON.stringify(lastMsg.content)

    await session.prompt(promptText, {
      onToken: (tokens: any) => {
        let text = ''
        if (typeof tokens === 'string') {
          text = tokens
        } else if (model && typeof model.detokenize === 'function') {
          text = model.detokenize(tokens)
        } else if (llama && typeof llama.detokenize === 'function') {
          text = llama.detokenize(tokens)
        } else {
          text = String(tokens)
        }
        onToken(text).catch((e: any) => {
          if (e?.name !== 'ResponseAborted' && !String(e).includes('ResponseAborted')) {
            console.error('[Stream Error]', e)
          }
        })
      },
      temperature: settings?.localGgufTemperature ?? 0.7,
      topP: settings?.localGgufTopP ?? 0.95,
      repeatPenalty: { penalty: settings?.localGgufRepeatPenalty ?? 1.1 },
      maxTokens: settings?.localGgufMaxTokens ?? 1024
    })
  } catch (error: any) {
    console.error('[Local GGUF] Inference Error:', error)
    await onToken(`\n\n[推理发生异常: ${error?.message || '未知错误'}]\n\n`)
  }
}



type SearchResult = { title: string; snippet: string; url: string }

const DEEP_THINK_SYSTEM_PROMPT = `You are a highly capable reasoning assistant. When answering, first think step-by-step inside <think>...</think> tags, then provide your final answer. Show your complete reasoning process in the thinking block before concluding.`

const PPT_SYSTEM_PROMPT = `
# PPT GENERATION MODE
When the user asks to create a presentation or PPT, you MUST output a structured JSON block inside a \`ppt\` code block.
The system will automatically render it as a PREMIUM interactive slide deck.

## Technical Instructions:
1. **Language**: Always respond in the language of the user's request (default: Chinese).
2. **Conciseness**: Keep slide content punchy and professional.
3. **Themes**: Choose a theme based on the topic:
   - \`zinc\`: High-tech, minimal, clean.
   - \`orange\`: Energetic, startup, marketing.
   - \`blue\`: Corporate, professional, institutional.
   - \`green\`: Growth, environment, health.
   - \`rose\`: Creative, luxury, design.
4. **Styles**: Choose a design style:
   - \`pencil\`: Hand-drawn, sketch style, best for creative or brainstorming.
   - \`gradient\`: Modern translucent glassmorphism with colorful gradients.
   - \`brutalism\`: High-contrast, sharp, bold and black outlines.
   - \`modern\`: Standard corporate and academic layout.

## JSON Schema:
\`\`\`ppt
{
  "title": "Main Presentation Title",
  "theme": "orange", // zinc, orange, blue, green, rose
  "style": "modern", // Choose one: modern, pencil, gradient, brutalism, cyberpunk, notion, retro, bauhaus, terminal, academic
  "slides": [
    {
       "title": "Slide Title",
       "subtitle": "Subtitle or context text",
       "layout": "bullet", // "title" (cover), "section" (break), "kpi" (huge numbers), "quote" (impact), "three_column" (3 pillars), "two_column", "hero", "bullet"
       "content": ["Point A", "Point B"], // Use for bullet/hero/three_column/kpi/quote layouts
       "leftContent": ["..."], // Use only for two_column
       "rightContent": ["..."], // Use only for two_column
       "notes": "Speaker notes"
    }
  ]
}
\`\`\`
Only output the code block when requested. Mix different layouts for visual variety.
`

/**
 * Clean a MiniMax SSE line to match the OpenAI schema that the AI SDK expects.
 */
function cleanSSELine(line: string): string | null {
  if (!line.startsWith('data: ')) {
    return line
  }
  const jsonStr = line.slice(6).trim()
  if (!jsonStr || jsonStr === '[DONE]') return line
  try {
    const chunk = JSON.parse(jsonStr)
    const cleaned: any = {
      id: chunk.id,
      object: chunk.object,
      created: chunk.created,
      model: chunk.model,
      choices: (chunk.choices || []).map((c: any) => {
        const choice: any = { index: c.index }
        if (c.delta) {
          choice.delta = {}
          if (c.delta.role) choice.delta.role = c.delta.role
          if (c.delta.content !== undefined) choice.delta.content = c.delta.content
          if (c.delta.tool_calls) choice.delta.tool_calls = c.delta.tool_calls
        }
        if (c.finish_reason) choice.finish_reason = c.finish_reason
        return choice
      }),
    }
    if (chunk.usage) cleaned.usage = chunk.usage
    return 'data: ' + JSON.stringify(cleaned)
  } catch {
    return line
  }
}

async function getSmartProvider(modelId: string, settings: any) {
  const ollamaUrl = settings?.ollamaUrl || 'http://127.0.0.1:11434'
  const lmstudioUrl = (settings as any)?.lmstudioUrl || 'http://127.0.0.1:1234'
  const openAiKey = settings?.openaiKey || ''
  const deepseekKey = settings?.deepseekKey || ''
  const minimaxKey = settings?.minimaxKey || ''
  const openrouterKey = (settings as any)?.openrouterKey || ''

  if (modelId.startsWith('openai::')) {
    return {
      provider: createOpenAI({ apiKey: openAiKey }),
      resolvedId: modelId.replace('openai::', ''),
    }
  }

  if (modelId.startsWith('deepseek::')) {
    return {
      provider: createOpenAI({
        apiKey: deepseekKey,
        baseURL: 'https://api.deepseek.com'
      }),
      resolvedId: modelId.replace('deepseek::', ''),
    }
  }

  if (modelId.startsWith('minimax::')) {
    const resolvedId = modelId.replace('minimax::', '')
    const minimaxProvider = createOpenAI({
      apiKey: minimaxKey,
      baseURL: 'https://api.minimaxi.com/v1',
      compatibility: 'compatible',
      fetch: async (url: string, options: any) => {
        if (options && options.body && typeof options.body === 'string') {
          try {
            const parsed = JSON.parse(options.body)
            if (parsed.input && !parsed.messages) {
              parsed.messages = []
              for (const item of (Array.isArray(parsed.input) ? parsed.input : [parsed.input])) {
                const role = item.role || 'user'
                let content = ''
                if (typeof item.content === 'string') content = item.content
                else if (Array.isArray(item.content)) content = item.content.map((c: any) => c.text || c.input_text || '').join('')
                if (content) parsed.messages.push({ role, content })
              }
              delete parsed.input
            }
            if (Array.isArray(parsed.messages)) {
              parsed.messages = parsed.messages.map((m: any) => ({
                role: m.role || 'user',
                content: Array.isArray(m.content) ? m.content.map((c: any) => c.text || c.input_text || '').join('') : m.content
              }))
            }
            if (resolvedId === 'MiniMax-M2.5') parsed.reasoning_split = true
            parsed.stream = true
            parsed.model = resolvedId
            console.log('[MiniMax] Final request keys:', Object.keys(parsed).join(', '))
            console.log('[MiniMax] Final has tools:', !!parsed.tools, 'Tool count:', parsed.tools?.length || 0)
            if (parsed.tools && parsed.tools.length > 0) {
              console.log('[MiniMax] Tools:', parsed.tools.map((t: any) => t.function?.name || t.name).slice(0, 5).join(', '))
            }
            options.body = JSON.stringify(parsed)
          } catch (e) {
            console.warn('[MiniMax] Request transform failed:', e)
          }
        }

        const res = await fetch('https://api.minimaxi.com/v1/chat/completions', options)

        if (!res.body) return res
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        const encoder = new TextEncoder()
        let buffer = ''

        const transformedStream = new ReadableStream({
          async pull(controller) {
            while (true) {
              const { done, value } = await reader.read()
              if (done) {
                if (buffer.trim()) {
                  const cleaned = cleanSSELine(buffer)
                  if (cleaned) controller.enqueue(encoder.encode(cleaned))
                }
                controller.enqueue(encoder.encode('data: [DONE]\n\n'))
                controller.close()
                return
              }
              buffer += decoder.decode(value, { stream: true })
              const lines = buffer.split('\n')
              buffer = lines.pop() || ''
              for (const line of lines) {
                const cleaned = cleanSSELine(line)
                if (cleaned !== null) {
                  controller.enqueue(encoder.encode(cleaned + '\n'))
                }
              }
            }
          }
        })

        return new Response(transformedStream, {
          status: res.status,
          statusText: res.statusText,
          headers: res.headers,
        })
      }
    } as any)
    return {
      provider: minimaxProvider.chat,
      resolvedId,
    }
  }


  if (modelId.startsWith('openrouter::')) {
    const openrouterProvider = (createOpenAI as any)({
      apiKey: openrouterKey,
      baseURL: 'https://openrouter.ai/api/v1',
      compatibility: 'compatible', // Force compatibility for SSE streaming
      headers: {
        'HTTP-Referer': 'https://github.com/OpenOrangeAI', 
        'X-Title': 'OpenOrangeAI'
      }
    })
    return {
      provider: openrouterProvider.chat,
      resolvedId: modelId.replace('openrouter::', ''),
    }
  }

  const isLms = modelId.startsWith('lmstudio::')
  const defaultBase = isLms ? `${lmstudioUrl}/v1` : `${ollamaUrl}/v1`
  const fallbackBase = isLms
    ? `${lmstudioUrl.replace('127.0.0.1', 'localhost')}/v1`
    : `${ollamaUrl.replace('127.0.0.1', 'localhost')}/v1`
  const resolvedId = isLms ? modelId.replace('lmstudio::', '') : modelId.replace('ollama::', '')

  for (const base of [defaultBase, fallbackBase]) {
    try {
      const res = await fetch(`${base}/models`, { signal: AbortSignal.timeout(1500) })
      if (res.ok) {
        return {
          provider: createOpenAI({ baseURL: base, apiKey: isLms ? 'lmstudio' : 'ollama' }),
          resolvedId,
        }
      }
    } catch {}
  }

  return {
    provider: createOpenAI({ baseURL: defaultBase, apiKey: isLms ? 'lmstudio' : 'ollama' }),
    resolvedId,
  }
}

/**
 * Basic HTML crawler to extract main text content
 */
async function crawlPage(url: string, timeout = 8000): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      signal: AbortSignal.timeout(timeout),
    })

    if (!res.ok) return ''
    const html = await res.text()

    let text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()

    return text.substring(0, 2000)
  } catch (e) {
    console.warn(`[Crawl] Failed to crawl ${url}:`, (e as Error).message)
    return ''
  }
}

/**
 * Fast rule-based check: does this query obviously NOT need a search?
 * This avoids an LLM round-trip for simple tasks.
 */
function obviouslyNoSearch(query: string): boolean {
  const q = query.toLowerCase().trim()
  
  // Pure creative / computation / explanation tasks don't need search
  const noSearchPatterns = [
    /^(写|帮我写|write|create|generate|生成).{0,20}(代码|code|函数|function|脚本|script|程序|program)/i,
    /^(翻译|translate|转换成|convert\s+to)/i,
    /^(解释|explain\s+).{0,30}(代码|code|函数|algorithm|算法)/i,
    /^(计算|算|compute|calculate|solve)\s/i,
    /^(格式化|format|整理|lint|refactor|重构)/i,
    /^(总结|summarize|归纳|概括).{0,10}(上面|以上|这段|以下|下面)/i,
    /^(你好|hi|hello|嗨|哈喽)\s*[!！。.]*$/i,
    /^(谢谢|感谢|thank|thx)\s*[!！。.]*$/i,
  ]
  
  return noSearchPatterns.some(p => p.test(q))
}

/**
 * Auto mode: decide if a web search is needed.
 * Logic:
 *  1. If obviously no search (pure code/math/creative) → skip
 *  2. If strong search signals detected → immediately search (no LLM call)
 *  3. Otherwise → quick LLM judgment as fallback
 */
async function shouldSearch(query: string, history: any[], provider: any, resolvedId: string): Promise<boolean> {
  const q = query.trim()
  
  // Step 1: Fast no-search rules
  if (obviouslyNoSearch(q)) {
    console.log('[Intent] Skipping search: obviously no-search task')
    return false
  }
  
  // Step 2: Strong search signals → search immediately without LLM
  const strongSearchSignals = [
    // Explicit search request
    /(搜索|搜一下|查一下|帮我查|查查|查找|上网|搜索一下|帮我搜)/i,
    /(search|google|look up|find out|check|browse)/i,
    // Time-sensitive queries
    /(最新|最近|今天|今日|现在|当前|实时|live|latest|recent|current|today|now|2024|2025|2026)/i,
    // News-style queries
    /(新闻|news|发生了|happening|event|事件|热点|trending)/i,
    // Prices and data
    /(价格|价钱|多少钱|price|cost|股价|汇率|rate|stock)/i,
    // Weather
    /(天气|weather|气温|温度|forecast)/i,
    // People / companies that might have new info
    /(发布|release|launch|公告|announcement|上市|官方|official)/i,
  ]
  
  if (strongSearchSignals.some(p => p.test(q))) {
    console.log('[Intent] Strong search signal detected, searching immediately')
    return true
  }
  
  // Step 3: For ambiguous cases, short LLM call as fallback
  // But default to true on error (err on the side of searching)
  try {
    const recentHistory = history.slice(-3).map(m => {
      const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
      return `${m.role}: ${content.substring(0, 100)}`
    }).join('\n')
    
    const prompt = `Task: decide if the user query requires searching the internet for up-to-date information.

Answer YES if:
- The query asks about real-world facts, people, events, products, or topics that change over time
- The query cannot be answered confidently without knowing recent information

Answer NO if:
- The query is about coding, math, writing, explaining concepts from scratch
- The answer is stable/timeless knowledge

Recent context:
${recentHistory}

Query: ${q}

Answer (YES or NO only):`

    const { text } = await generateText({
      model: provider(resolvedId),
      prompt,
      maxTokens: 3,
    } as any)
    
    const decision = text.trim().toUpperCase()
    console.log('[Intent] LLM decision:', decision)
    return decision.startsWith('YES')
  } catch (e) {
    console.warn('[Intent] LLM check failed, defaulting search to YES:', e)
    return true
  }
}

/**
 * Helper: send a custom SSE event
 */
function sseEvent(event: string, data: any): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const reqUrl = new URL(req.url)
    const baseUrl = `${reqUrl.protocol}//${reqUrl.host}`
    let { messages, model, chatId, deepThink, webSearch, kbId, files } = body

    const settings = await prisma.settings.findUnique({ where: { id: 'default' } })
    const defaultModel = settings?.defaultModel || 'ollama::llama3'
    const selectedModel = model || defaultModel

    console.log('[Chat] POST model:', selectedModel, 'chatId:', chatId)

    const { provider, resolvedId } = await getSmartProvider(selectedModel, settings)
    console.log('[Chat] Provider resolved:', resolvedId)

    // Load MCP tools if enabled
    let mcpTools: Record<string, any> = {}
    if (settings?.mcpEnabled) {
      try {
        console.log('[Chat] Loading MCP tools...')
        mcpTools = await mcpManager.getTools()
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

    // Start processing in the background
    ;(async () => {
      try {
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
                 await write(sseEvent('citations', {
                   results: kbContext.citations
                 }))
               }
               await write(sseEvent('status', { type: 'search', stage: 'done', message: '知识库检索完成' }))
             } else {
               await write(sseEvent('status', { type: 'search', stage: 'skip', message: '知识库无相关内容' }))
             }
           } catch (e: any) {
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
          // 1. Smart Query Rewrite
          try {
            await write(sseEvent('status', { type: 'search', stage: 'rewrite', message: '正在提取搜索关键词...' }))
            
            const recentCtx = messages.slice(-4).map((m: any) => {
              const content = extractContent(m)
              return `[${m.role}]: ${content.substring(0, 200)}`
            }).join('\n')
            
            const rewritePrompt = `Your job is to extract a concise, effective web search query from a conversation.

Rules:
- Output ONLY the search query string, nothing else. No quotes, no explanation.
- The query should be 3-8 words, like what you'd type into Google.
- If the user's message is vague or a follow-up (e.g., "好的", "ok", "搜吧"), look at the conversation context to find the actual topic.
- Remove filler words. Keep named entities, dates, version numbers, and key terms.
- Use the same language as the user (if Chinese question → Chinese query; if English → English query).

Conversation:
${recentCtx}

Search query:`

            const { text: rewrittenQuery } = await generateText({
              model: provider(resolvedId),
              prompt: rewritePrompt,
              maxTokens: 40,
            } as any)

            if (rewrittenQuery && rewrittenQuery.trim().length > 1) {
              searchQuery = rewrittenQuery.trim().replace(/^"|"$/g, '').replace(/^搜索[:：]?\s*/i, '')
              await write(sseEvent('status', { type: 'search', stage: 'rewrite_done', message: `搜索: "${searchQuery}"` }))
            }
          } catch (e) {
            console.warn('[Chat] Query rewrite failed, using original:', e)
          }

          // 2. Search
          try {
            await write(sseEvent('status', { type: 'search', stage: 'searching', message: `正在搜索 "${searchQuery}"...` }))

            const searchRes = await fetch(new URL('/api/search', baseUrl), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ query: searchQuery, deep: deepSearch }),
            })
            const searchData = await searchRes.json()
            const rawResults = searchData.results || []

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

              const crawledContents = await Promise.all(
                topResults.map(async (r: SearchResult, i: number) => {
                  const content = await crawlPage(r.url)
                  await write(sseEvent('status', {
                    type: 'search',
                    stage: 'read_page',
                    message: `已阅读: ${r.title}`,
                    pageIndex: i,
                  }))
                  return content
                })
              )

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

              // Send citations/search results to the client
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

        if (imageFiles.length > 0) {
          const imgList = imageFiles.map(f => `- ${f.name}`).join('\n')
          const imgNote = `\n\n# 🖼️ UPLOADED IMAGES\n${imageFiles.length} image(s) are attached as visual content to the latest message:\n${imgList}\nAnalyze these images carefully when responding.`
          fileInjection = fileInjection + imgNote
        }

        // --- Build System Prompt ---
        const systemParts: string[] = []
        systemParts.push(PPT_SYSTEM_PROMPT)
        if (deepThink) systemParts.push(DEEP_THINK_SYSTEM_PROMPT)
        
        // Add MCP tool usage instructions if tools are available
        if (Object.keys(mcpTools).length > 0) {
          const toolNames = Object.keys(mcpTools).join(', ')
          systemParts.push(`# MCP TOOLS AVAILABLE
You have access to the following MCP tools: ${toolNames}

**IMPORTANT INSTRUCTIONS:**
1. When the user asks you to perform actions like opening websites, browsing, taking screenshots, or any browser-related tasks, you MUST use the appropriate MCP tools.
2. Do NOT just describe what you would do - actually CALL the tools to perform the actions.
3. For browser tasks, use browser_navigate to open URLs, browser_take_screenshot to capture pages, browser_click to interact with elements, etc.
4. After using tools, report the results to the user based on what the tools returned.
5. If a tool call fails, try alternative approaches or inform the user of the issue.`)
        }
        
        const systemPrompt = systemParts.join('\n\n---\n\n') || undefined

        // --- Persist user message to DB ---
        let activeChatId = chatId
        const lastMsg = messages?.length > 0 ? messages[messages.length - 1] : null
        
        // actualContent is exactly what the user typed
        let actualContent = extractContent(lastMsg) || ''
        
        // dbContent includes file attachments for the UI to represent,
        // but actively excludes ephemeral search results to prevent DB bloat.
        let dbContent = actualContent
        if (fileInjection.trim()) {
          dbContent = `${fileInjection}\n\nUSER QUESTION:\n${actualContent}`
        }

        if (!activeChatId) {
          const firstTitle = extractContent(lastMsg).substring(0, 60) || 'OpenOrangeAI'
          const newChat = await prisma.chat.create({
            data: {
              title: firstTitle,
              messages: { create: { role: 'user', content: dbContent } },
            },
          })
          activeChatId = newChat.id
        } else {
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

        // --- Build core messages for the model (AI SDK multimodal format) ---
        const coreMessages = (messages || []).map((m: any, idx: number) => {
          const role = m.role || 'user'
          
          // Use fully enriched context for the LAST user message
          const text = (idx === messages.length - 1 && role === 'user') ? fullyEnrichedContent : extractContent(m)

          // Attach images back to the LAST user message
          if (idx === messages.length - 1 && role === 'user' && imageFiles.length > 0) {
            const contentParts: any[] = []
            if (text) contentParts.push({ type: 'text', text })
            for (const img of imageFiles) {
              contentParts.push({ type: 'image', image: img.dataUrl })
            }
            return { role, content: contentParts }
          }

          return { role, content: text }
        }).filter((m: any) => {
          if (Array.isArray(m.content)) return m.content.length > 0
          return m.content !== ''
        })

        // --- Prune core messages based on apiContextSize ---
        const settings = (await prisma.settings.findUnique({ where: { id: "default" } })) as any
        const maxContextTokens = settings?.apiContextSize || 8192
        let currentContextTokens = 0
        const prunedMessages = []
        
        // Always keep the system prompt if we had one (though it's passed separately in streamText)
        // We process from newest to oldest
        for (let i = coreMessages.length - 1; i >= 0; i--) {
          const msg = coreMessages[i]
          const msgContent = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
          const estimatedTokens = Math.ceil(msgContent.length / 3) 
          if (currentContextTokens + estimatedTokens > maxContextTokens && prunedMessages.length > 0) break
          currentContextTokens += estimatedTokens
          prunedMessages.unshift(msg)
        }

        let fullText = ''

        if (selectedModel.startsWith('local-gguf::') && settings?.localGgufEnabled) {
          await handleLocalGgufChat({
            modelId: selectedModel,
            messages: prunedMessages,
            systemPrompt,
            settings: settings,
            onToken: async (token) => {
              fullText += token
              await write(sseEvent('text', { content: token }))
            },
            onStatus: async (event) => {
              await write(sseEvent('status', event))
            }
          })
        } else {
          // --- Stream from the model ---
          console.log(`[Chat] Streaming with ${Object.keys(mcpTools).length} MCP tools available`)
          if (Object.keys(mcpTools).length > 0) {
            console.log('[Chat] Available tools:', Object.keys(mcpTools).slice(0, 10).join(', '), '...')
          }
          
          const result = streamText({
            model: provider(resolvedId),
            system: systemPrompt,
            messages: prunedMessages as any,
            tools: Object.keys(mcpTools).length > 0 ? mcpTools : undefined,
            toolChoice: Object.keys(mcpTools).length > 0 ? 'auto' : undefined,
            temperature: settings?.apiTemperature ?? 0.7,
            topP: settings?.apiTopP ?? 0.9,
            // @ts-ignore
            maxTokens: settings?.apiMaxTokens ?? 2048,
            // @ts-ignore
            maxSteps: 5,
            maxRetries: 0,
            onStepFinish: async (step) => {
              console.log('[Chat] onStepFinish - toolCalls:', step.toolCalls?.length || 0, 'toolResults:', step.toolResults?.length || 0)
              if (step.toolCalls?.length) {
                for (const tc of step.toolCalls) {
                  const callInfo: any = { 
                    type: 'mcp', 
                    stage: 'call' as const, 
                    message: `调用工具: ${tc.toolName}`,
                    tool: tc.toolName,
                    args: (tc as any).args || (tc as any).arguments
                  }
                  // Extract URL from arguments for browser navigation tools
                  const tcArgs = (tc as any).args || (tc as any).arguments || {}
                  const urlArg = tcArgs?.url || tcArgs?.page || tcArgs?.target
                  if (urlArg) {
                    callInfo.url = urlArg
                    callInfo.message = `正在打开: ${urlArg}`
                  }
                  await write(sseEvent('status', callInfo))
                }
              }
              if (step.toolResults?.length) {
                for (const tr of step.toolResults) {
                  const resultData = (tr as any).result || (tr as any).data || tr
                  const resultText = Array.isArray(resultData) 
                    ? resultData.map((r: any) => r.text || JSON.stringify(r)).join('\n')
                    : (typeof resultData === 'string' ? resultData : JSON.stringify(resultData))
                  
                  console.log(`[Chat] Tool result: ${tr.toolName}`, resultText.substring(0, 100))
                  
                  const resultInfo: any = { 
                    type: 'mcp', 
                    stage: 'result' as const, 
                    message: `工具 ${tr.toolName} 返回结果`,
                    tool: tr.toolName,
                    result: resultText.substring(0, 500),
                    rawResult: resultText.substring(0, 2000)
                  }
                  
                  // Parse result to extract meaningful info
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

          for await (const chunk of result.textStream) {
            fullText += chunk
            // Send text chunks as SSE events
            await write(sseEvent('text', { content: chunk }))
          }
        }

        if (deepThink) {
          await write(sseEvent('status', { type: 'thinking', stage: 'done', message: '思考完成' }))
        }

        // Persist assistant message
        if (fullText && activeChatId) {
          await prisma.message.create({
            data: { chatId: activeChatId, role: 'assistant', content: fullText },
          })
        }

        await write(sseEvent('done', { textLength: fullText.length }))
        await writer.close()
      } catch (error: any) {
        console.error('[Chat] Stream processing error:', error)
        try {
          await write(sseEvent('error', { message: error.message || 'Processing failed' }))
          await writer.close()
        } catch {}
      }
    })()

    return new Response(stream.readable, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    })
  } catch (error: any) {
    console.error('[Chat] API Error:', error)
    return new Response(JSON.stringify({ error: error.message || 'Failed to process chat' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

/**
 * Extract usable text content from an AI SDK v6 UIMessage or a plain {role, content} object.
 */
function extractContent(msg: any): string {
  if (!msg) return ''
  if (typeof msg.content === 'string' && msg.content.trim()) return msg.content
  if (msg.parts && Array.isArray(msg.parts)) {
    return msg.parts
      .map((p: any) => {
        if (typeof p === 'string') return p
        if (p?.type === 'text' && typeof p.text === 'string') return p.text
        return ''
      })
      .join('')
      .trim()
  }
  if (msg.content) return JSON.stringify(msg.content)
  return ''
}
