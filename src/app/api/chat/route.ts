import { streamText, generateText } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import prisma from '@/lib/db'

type SearchResult = { title: string; snippet: string; url: string }

const DEEP_THINK_SYSTEM_PROMPT = `You are a highly capable reasoning assistant. When answering, first think step-by-step inside <think>...</think> tags, then provide your final answer. Show your complete reasoning process in the thinking block before concluding.`

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
 * Intelligent Intent Detection
 */
async function shouldSearch(query: string, history: any[], provider: any, resolvedId: string): Promise<boolean> {
  try {
    const historyText = history.slice(-3).map(m => `${m.role}: ${m.content}`).join('\n')
    const prompt = `Based on the following conversation and the latest message, determine if a web search is absolutely necessary to provide an accurate, up-to-date answer (e.g., news, prices, recent events, technical specs of new products). 
Respond with only 'YES' or 'NO'.

History:
${historyText}

Latest Message: ${query}

Decision:`

    const { text } = await generateText({
      model: provider(resolvedId),
      prompt,
      maxTokens: 10,
    } as any)

    const decision = text.trim().toUpperCase()
    console.log('[Intent] Should search decision:', decision)
    return decision.includes('YES')
  } catch (e) {
    console.warn('[Intent] Detection failed, defaulting to NO:', e)
    return false
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
    let { messages, model, chatId, deepThink, webSearch } = body

    const settings = await prisma.settings.findUnique({ where: { id: 'default' } })
    const defaultModel = settings?.defaultModel || 'ollama::llama3'
    const selectedModel = model || defaultModel

    console.log('[Chat] POST model:', selectedModel, 'chatId:', chatId)

    const { provider, resolvedId } = await getSmartProvider(selectedModel, settings)
    console.log('[Chat] Provider resolved:', resolvedId)

    // Create a custom SSE stream for rich status updates
    const encoder = new TextEncoder()
    const stream = new TransformStream()
    const writer = stream.writable.getWriter()

    const write = async (data: string) => {
      await writer.write(encoder.encode(data))
    }

    // Start processing in the background
    ;(async () => {
      try {
        // --- Web Search ---
        let searchResults: SearchResult[] = []
        let systemInjection = ''
        const lastUserMsg = messages?.length > 0 ? messages[messages.length - 1] : null
        const originalQuery = extractContent(lastUserMsg)
        let searchQuery = originalQuery

        const forceSearch = webSearch === true
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
          // 1. Contextual Query Rewrite
          if (messages.length > 1) {
            try {
              await write(sseEvent('status', { type: 'search', stage: 'rewrite', message: '正在优化搜索关键词...' }))
              const historyText = messages.slice(-5).map((m: any) => `${m.role}: ${extractContent(m)}`).join('\n')
              const rewritePrompt = `Given the following conversation history and the latest user message, generate a concise, high-quality search query that captures the user's intent. Only output the search query text, nothing else.\n\nHistory:\n${historyText}\n\nLatest Message: ${searchQuery}\n\nSearch Query:`

              const { text: rewrittenQuery } = await generateText({
                model: provider(resolvedId),
                prompt: rewritePrompt,
                maxTokens: 50,
              } as any)

              if (rewrittenQuery) {
                searchQuery = rewrittenQuery.trim().replace(/^"|"$/g, '')
                await write(sseEvent('status', { type: 'search', stage: 'rewrite_done', message: `搜索: "${searchQuery}"` }))
              }
            } catch (e) {
              console.warn('[Chat] Query rewrite failed, using original:', e)
            }
          }

          // 2. Search
          try {
            await write(sseEvent('status', { type: 'search', stage: 'searching', message: `正在搜索 "${searchQuery}"...` }))

            const searchRes = await fetch(new URL('/api/search', baseUrl), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ query: searchQuery }),
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
            const topResults = rawResults.slice(0, 3)
            if (topResults.length > 0) {
              await write(sseEvent('status', { type: 'search', stage: 'reading', message: `正在阅读 ${topResults.length} 个网页...` }))

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

              systemInjection = `
# WEB SEARCH CONTEXT
The user has requested a web search. Below are the most relevant and up-to-date search results from the internet.

## SEARCH RESULTS:
${contextBlock}

## INSTRUCTIONS:
1. **Prioritize the provided results** as the primary source of truth for recent events or specific details.
2. **Synthesize and integrate** the information into a comprehensive answer. Do not just list the results.
3. **Cite your sources** using the numbered format [1], [2], etc., corresponding to the SOURCE numbers above. Place citations immediately after the relevant information.
4. **Current date** is ${new Date().toISOString().split('T')[0]}.
5. If the search results are insufficient or irrelevant, acknowledge it, but still try to use the most relevant parts.
6. **Output Language**: Respond in the language of the user's query (usually Chinese).
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

        // --- Build System Prompt ---
        const systemParts: string[] = []
        if (deepThink) systemParts.push(DEEP_THINK_SYSTEM_PROMPT)
        if (systemInjection) systemParts.push(systemInjection)
        const systemPrompt = systemParts.join('\n\n---\n\n') || undefined

        // --- Persist user message to DB ---
        let activeChatId = chatId
        const lastMsg = messages?.length > 0 ? messages[messages.length - 1] : null
        const actualContent = extractContent(lastMsg) || ''

        if (!activeChatId) {
          const firstContent = actualContent ? actualContent.substring(0, 60) : 'New Chat'
          const newChat = await prisma.chat.create({
            data: {
              title: firstContent,
              messages: { create: { role: 'user', content: actualContent } },
            },
          })
          activeChatId = newChat.id
        } else {
          await prisma.message.create({
            data: { chatId: activeChatId, role: 'user', content: actualContent },
          })
        }

        // Send chatId event
        await write(sseEvent('chatId', { id: activeChatId }))

        if (deepThink) {
          await write(sseEvent('status', { type: 'thinking', stage: 'start', message: '正在深度思考...' }))
        }

        // --- Build core messages for the model ---
        const coreMessages: Array<{ role: string; content: string }> = (messages || [])
          .map((m: any) => ({
            role: m.role || 'user',
            content: extractContent(m),
          }))
          .filter((m: { role: string; content: string }) => m.content !== '')

        // --- Stream from the model ---
        const result = streamText({
          model: provider(resolvedId),
          system: systemPrompt,
          messages: coreMessages as any,
          maxRetries: 0,
        })

        let fullText = ''
        for await (const chunk of result.textStream) {
          fullText += chunk
          // Send text chunks as SSE events
          await write(sseEvent('text', { content: chunk }))
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
