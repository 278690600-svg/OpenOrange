import { createOpenAI } from '@ai-sdk/openai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import {
  DEFAULT_OLLAMA_URL,
  DEFAULT_LMSTUDIO_URL,
  DEEPSEEK_API_BASE,
  MINIMAX_API_BASE,
  OPENROUTER_API_BASE,
  NVIDIA_API_BASE,
  VOLCENGINE_API_BASE,
  MODEL_PROBE_TIMEOUT,
} from './constants'

/**
 * Settings interface for AI provider configuration
 */
export interface Settings {
  ollamaUrl?: string
  lmstudioUrl?: string
  openaiKey?: string
  deepseekKey?: string
  minimaxKey?: string
  openrouterKey?: string
  nvidiaKey?: string
  volcengineKey?: string
  [key: string]: unknown
}

/**
 * Clean a MiniMax SSE line to match the OpenAI schema that the AI SDK expects.
 * MiniMax returns non-standard SSE events that cause @ai-sdk/openai schema validation errors.
 */
export function cleanSSELine(line: string): string | null {
  // Filter out event type lines - MiniMax sends non-standard events like
  // "event: response.completed", "event: response.incomplete", etc.
  if (line.startsWith('event:')) {
    return null
  }

  // Only process data lines
  if (!line.startsWith('data: ')) {
    return line
  }

  const jsonStr = line.slice(6).trim()
  if (!jsonStr || jsonStr === '[DONE]') return line

  try {
    const chunk = JSON.parse(jsonStr)

    // Handle MiniMax-specific response formats
    // MiniMax may return chunks with "data" field containing the actual choices
    if (chunk.data && typeof chunk.data === 'object' && !chunk.choices) {
      const dataChunk = chunk.data as Record<string, unknown>
      if (dataChunk.choices && Array.isArray(dataChunk.choices)) {
        chunk.choices = dataChunk.choices
      }
      // Don't return null here - let the general check below handle it
    }

    // Filter out non-standard MiniMax response types that don't have choices
    // These include: response.created, response.completed, response.incomplete, etc.
    if (!chunk.choices || !Array.isArray(chunk.choices)) {
      // Handle error chunks
      if (chunk.error) {
        console.warn('[cleanSSELine] Error chunk received:', JSON.stringify(chunk.error).substring(0, 500))
        return null
      }
      return null
    }

    // Ensure required fields exist to prevent schema validation errors
    const cleaned: Record<string, unknown> = {
      id: chunk.id || '',
      object: chunk.object || 'chat.completion.chunk',
      created: chunk.created || Math.floor(Date.now() / 1000),
      model: chunk.model || '',
      choices: chunk.choices.map((c: Record<string, unknown>, idx: number) => {
        const choice: Record<string, unknown> = {
          index: c.index !== undefined ? c.index : idx
        }
        if (c.delta && typeof c.delta === 'object') {
          const delta = c.delta as Record<string, unknown>
          const cleanedDelta: Record<string, unknown> = {}
          // Only include known OpenAI-compatible delta fields
          if (delta.role !== undefined) cleanedDelta.role = delta.role
          if (delta.content !== undefined) cleanedDelta.content = delta.content
          if (delta.reasoning_content !== undefined) cleanedDelta.reasoning_content = delta.reasoning_content
          if (delta.tool_calls && Array.isArray(delta.tool_calls)) {
            cleanedDelta.tool_calls = delta.tool_calls.map((tc: Record<string, unknown>, tcIdx: number) => ({
              ...tc,
              index: tc.index ?? tcIdx,
            }))
          }
          // Only add delta if it has at least one field
          if (Object.keys(cleanedDelta).length > 0) {
            choice.delta = cleanedDelta
          }
        }
        if (c.finish_reason !== undefined && c.finish_reason !== null) {
          choice.finish_reason = c.finish_reason
        }
        // If choice has no delta and no finish_reason, add empty content to satisfy schema
        if (!choice.delta && choice.finish_reason === undefined) {
          choice.delta = { content: '' }
        }
        return choice
      }),
    }
    if (chunk.usage) cleaned.usage = chunk.usage
    return 'data: ' + JSON.stringify(cleaned)
  } catch {
    // Invalid JSON - filter it out
    return null
  }
}

/**
 * Smart provider resolver: selects the correct AI provider based on modelId prefix.
 */
export async function getSmartProvider(modelId: string, settings: Settings) {
  const ollamaUrl = settings?.ollamaUrl || DEFAULT_OLLAMA_URL
  const lmstudioUrl = settings?.lmstudioUrl || DEFAULT_LMSTUDIO_URL
  const openAiKey = settings?.openaiKey || ''
  const deepseekKey = settings?.deepseekKey || ''
  const minimaxKey = settings?.minimaxKey || ''
  const openrouterKey = settings?.openrouterKey || ''
  const nvidiaKey = settings?.nvidiaKey || ''
  const volcengineKey = settings?.volcengineKey || ''
  const anthropicKey = (settings?.anthropicKey as string) || ''
  const googleKey = (settings?.googleKey as string) || ''
  const groqKey = (settings?.groqKey as string) || ''
  const mistralKey = (settings?.mistralKey as string) || ''
  const zhipuKey = (settings?.zhipuKey as string) || ''
  const lingyiKey = (settings?.lingyiKey as string) || ''

  if (modelId.startsWith('anthropic::')) {
    const anthropicProvider = createAnthropic({ apiKey: anthropicKey })
    return {
      provider: anthropicProvider,
      resolvedId: modelId.replace('anthropic::', ''),
    }
  }

  if (modelId.startsWith('google::')) {
    const googleProvider = createGoogleGenerativeAI({ apiKey: googleKey })
    return {
      provider: googleProvider,
      resolvedId: modelId.replace('google::', ''),
    }
  }

  if (modelId.startsWith('groq::')) {
    const groqProvider = createOpenAI({ apiKey: groqKey, baseURL: 'https://api.groq.com/openai/v1' })
    return {
      provider: groqProvider.chat,
      resolvedId: modelId.replace('groq::', ''),
    }
  }

  if (modelId.startsWith('mistral::')) {
    const mistralProvider = createOpenAI({ apiKey: mistralKey, baseURL: 'https://api.mistral.ai/v1' })
    return {
      provider: mistralProvider.chat,
      resolvedId: modelId.replace('mistral::', ''),
    }
  }

  if (modelId.startsWith('zhipu::')) {
    const zhipuProvider = createOpenAI({
      apiKey: zhipuKey,
      baseURL: 'https://open.bigmodel.cn/api/paas/v4',
      fetch: async (url: RequestInfo | URL, options?: RequestInit) => {
        if (options && options.body && typeof options.body === 'string') {
          try {
            const parsed = JSON.parse(options.body)
            // Zhipu does not support OpenAI-specific fields and returns 400
            delete parsed.stream_options
            delete parsed.store
            delete parsed.metadata
            delete parsed.prediction
            delete parsed.service_tier
            delete parsed.reasoning_effort

            // Zhipu requires temperature in (0.0, 1.0]
            if (typeof parsed.temperature === 'number') {
              parsed.temperature = Math.max(0.01, Math.min(1.0, parsed.temperature))
            }
            // Zhipu requires top_p in (0.0, 1.0)
            if (typeof parsed.top_p === 'number') {
              parsed.top_p = Math.max(0.01, Math.min(0.99, parsed.top_p))
            }

            options.body = JSON.stringify(parsed)
          } catch (e) {
            console.warn('[Zhipu API Client] Body parsing failed:', e)
          }
        }
        return fetch(url, options)
      }
    })
    return {
      provider: zhipuProvider.chat,
      resolvedId: modelId.replace('zhipu::', ''),
    }
  }

  if (modelId.startsWith('lingyi::')) {
    const lingyiProvider = createOpenAI({ apiKey: lingyiKey, baseURL: 'https://api.lingyiwanwu.com/v1' })
    return {
      provider: lingyiProvider.chat,
      resolvedId: modelId.replace('lingyi::', ''),
    }
  }

  if (modelId.startsWith('openai::')) {
    const baseURL = (settings?.openaiApiBase as string || '').trim() || undefined
    const openaiProvider = createOpenAI({
      apiKey: openAiKey,
      baseURL: baseURL,
    })
    return {
      provider: openaiProvider.chat,
      resolvedId: modelId.replace('openai::', ''),
    }
  }

  if (modelId.startsWith('deepseek::')) {
    const deepseekProvider = createOpenAI({
      apiKey: deepseekKey,
      baseURL: DEEPSEEK_API_BASE,
    })
    return {
      provider: deepseekProvider.chat,
      resolvedId: modelId.replace('deepseek::', ''),
    }
  }

  if (modelId.startsWith('minimax::')) {
    const resolvedId = modelId.replace('minimax::', '')
    const minimaxProvider = createOpenAI({
      apiKey: minimaxKey,
      baseURL: MINIMAX_API_BASE,
      fetch: async (url: string, options: RequestInit & { body?: BodyInit | null }) => {
        let isStreaming = false
        if (options && options.body && typeof options.body === 'string') {
          try {
            const parsed = JSON.parse(options.body)
            isStreaming = !!parsed.stream
            delete parsed.stream_options
            delete parsed.verbosity
            delete parsed.store
            delete parsed.metadata
            delete parsed.prediction
            delete parsed.reasoning_effort
            delete parsed.service_tier
            delete parsed.prompt_cache_key
            delete parsed.prompt_cache_retention
            delete parsed.safety_identifier
            if (parsed.input && !parsed.messages) {
              parsed.messages = []
              for (const item of (Array.isArray(parsed.input) ? parsed.input : [parsed.input])) {
                const role = item.role || 'user'
                let content = ''
                if (typeof item.content === 'string') content = item.content
                else if (Array.isArray(item.content)) content = (item.content as Array<Record<string, string>>).map((c) => c.text || c.input_text || '').join('')
                if (content) parsed.messages.push({ role, content })
              }
              delete parsed.input
            }
            if (Array.isArray(parsed.messages)) {
              console.log('[MiniMax] Message count:', parsed.messages.length)
              for (let i = parsed.messages.length - 3; i < parsed.messages.length; i++) {
                if (i >= 0) {
                  const m = parsed.messages[i]
                  console.log(`[MiniMax] msg[${i}] role=${m.role} hasToolCalls=${!!m.tool_calls} contentLen=${typeof m.content === 'string' ? m.content.length : 'n/a'}`)
                }
              }
              parsed.messages = parsed.messages.map((m: Record<string, unknown>) => {
                if (m.role === 'tool') {
                  return {
                    role: 'tool',
                    content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
                    tool_call_id: m.tool_call_id,
                  }
                }
                if (m.tool_calls) {
                  return {
                    role: m.role || 'assistant',
                    content: m.content || null,
                    tool_calls: m.tool_calls,
                  }
                }
                return {
                  role: m.role || 'user',
                  content: Array.isArray(m.content) ? (m.content as Array<Record<string, string>>).map((c) => c.text || c.input_text || '').join('') : m.content,
                }
              })
            }
            if (resolvedId.startsWith('MiniMax-M2.')) parsed.reasoning_split = true
            parsed.model = resolvedId
            console.log('[MiniMax] Final request keys:', Object.keys(parsed).join(', '))
            console.log('[MiniMax] Final has tools:', !!parsed.tools, 'Tool count:', parsed.tools?.length || 0)
            if (parsed.tools && parsed.tools.length > 0) {
              console.log('[MiniMax] Tools:', parsed.tools.map((t: Record<string, unknown>) => (t.function as Record<string, string>)?.name || (t.name as string)).slice(0, 5).join(', '))
            }
            options.body = JSON.stringify(parsed)
          } catch (e) {
            console.warn('[MiniMax] Request transform failed:', e)
          }
        }

        const res = await fetch(`${MINIMAX_API_BASE}/chat/completions`, options)
        console.log('[MiniMax] Response status:', res.status, res.statusText)

        if (!res.body || !isStreaming) return res
        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        const encoder = new TextEncoder()
        let buffer = ''

        let rawLineCount = 0
        let cleanedLineCount = 0
        const transformedStream = new ReadableStream({
          async pull(controller) {
            try {
              while (true) {
                const { done, value } = await reader.read()
                if (done) {
                  if (buffer.trim()) {
                    const cleaned = cleanSSELine(buffer)
                    if (cleaned) controller.enqueue(encoder.encode(cleaned))
                  }
                  controller.enqueue(encoder.encode('data: [DONE]\n\n'))
                  controller.close()
                  console.log(`[MiniMax] Stream done. Raw lines: ${rawLineCount}, Cleaned lines: ${cleanedLineCount}`)
                  return
                }
                buffer += decoder.decode(value, { stream: true })
                const lines = buffer.split('\n')
                buffer = lines.pop() || ''
                for (const line of lines) {
                  rawLineCount++
                  // Log dropped lines for debugging
                  if (rawLineCount <= 20) {
                    const cleaned = cleanSSELine(line)
                    if (cleaned === null) {
                      console.log(`[MiniMax] DROPPED line ${rawLineCount}:`, line.substring(0, 300))
                    } else {
                      if (cleanedLineCount <= 3) {
                        console.log(`[MiniMax] Cleaned line ${cleanedLineCount + 1}:`, cleaned.substring(0, 200))
                      }
                      controller.enqueue(encoder.encode(cleaned + '\n\n'))
                      cleanedLineCount++
                    }
                  } else {
                    const cleaned = cleanSSELine(line)
                    if (cleaned !== null) {
                      controller.enqueue(encoder.encode(cleaned + '\n\n'))
                      cleanedLineCount++
                    }
                  }
                }
              }
            } catch (err) {
              console.error('[MiniMax] Stream read error:', err)
              // Try to send a DONE message before closing
              try {
                controller.enqueue(encoder.encode('data: [DONE]\n\n'))
              } catch (enqueueErr) {
                console.warn('[MiniMax] Failed to enqueue DONE after error:', enqueueErr)
              }
              controller.close()
            }
          }
        })

        return new Response(transformedStream, {
          status: res.status,
          statusText: res.statusText,
          headers: res.headers,
        })
      }
    } as Parameters<typeof createOpenAI>[0])
    return {
      provider: minimaxProvider.chat,
      resolvedId,
    }
  }

  if (modelId.startsWith('openrouter::')) {
    const openrouterProvider = createOpenAI({
      apiKey: openrouterKey,
      baseURL: OPENROUTER_API_BASE,
      headers: {
        'HTTP-Referer': 'https://github.com/OpenOrangeAI',
        'X-Title': 'OpenOrangeAI',
      }
    })
    return {
      provider: openrouterProvider.chat,
      resolvedId: modelId.replace('openrouter::', ''),
    }
  }

  if (modelId.startsWith('nvidia::')) {
    return {
      provider: (createOpenAI({
        apiKey: nvidiaKey,
        baseURL: NVIDIA_API_BASE,
        fetch: async (url: RequestInfo | URL, options?: RequestInit) => {
          if (options && options.body && typeof options.body === 'string') {
            try {
              const parsed = JSON.parse(options.body)
              parsed.chat_template_kwargs = { "enable_thinking": true, "clear_thinking": false }
              options.body = JSON.stringify(parsed)
              console.log(`[NVIDIA] Requesting: ${url.toString()} | Model: ${parsed.model}`)
            } catch {}
          } else {
            console.log(`[NVIDIA] Requesting (no body): ${url.toString()}`)
          }
          const res = await fetch(url, options)
          if (!res.ok) {
            console.error(`[NVIDIA] Error ${res.status}: ${res.statusText} at ${url.toString()}`)
          }
          return res
        }
      })).chat,
      resolvedId: modelId.replace('nvidia::', ''),
    }
  }

  if (modelId.startsWith('volcengine::')) {
    const volcengineProvider = createOpenAI({
      apiKey: volcengineKey,
      baseURL: VOLCENGINE_API_BASE,
      fetch: async (url: RequestInfo | URL, options?: RequestInit) => {
        if (options && options.body && typeof options.body === 'string') {
          try {
            const parsed = JSON.parse(options.body)
            // Volcengine /api/coding/v3 may reject stream_options or other newer OpenAI fields
            delete parsed.stream_options
            options.body = JSON.stringify(parsed)
          } catch {}
        }
        const res = await fetch(url, options)
        if (!res.ok) {
          const errText = await res.text().catch(() => '')
          console.error(`[Volcengine API Error] ${res.status} ${res.statusText} at ${url.toString()} - Body: ${errText}`)
          return new Response(errText, { status: res.status, statusText: res.statusText })
        }
        return res
      }
    })
    return {
      provider: volcengineProvider.chat,
      resolvedId: modelId.replace('volcengine::', ''),
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
      const res = await fetch(`${base}/models`, { signal: AbortSignal.timeout(MODEL_PROBE_TIMEOUT) })
      if (res.ok) {
        const localProvider = createOpenAI({ baseURL: base, apiKey: isLms ? 'lmstudio' : 'ollama' })
        return {
          provider: localProvider.chat,
          resolvedId,
        }
      }
    } catch {}
  }

  const fallbackProvider = createOpenAI({ baseURL: defaultBase, apiKey: isLms ? 'lmstudio' : 'ollama' })
  return {
    provider: fallbackProvider.chat,
    resolvedId,
  }
}

/**
 * Extract usable text content from an AI SDK v6 UIMessage or a plain {role, content} object.
 */
export function extractContent(msg: unknown): string {
  if (!msg) return ''
  const msgObj = msg as Record<string, unknown>
  if (typeof msgObj.content === 'string' && msgObj.content.trim()) return msgObj.content
  if (msgObj.parts && Array.isArray(msgObj.parts)) {
    return (msgObj.parts as Array<Record<string, unknown> | string>)
      .map((p) => {
        if (typeof p === 'string') return p
        if (p?.type === 'text' && typeof p.text === 'string') return p.text
        return ''
      })
      .join('')
      .trim()
  }
  if (Array.isArray(msgObj.content)) {
    return (msgObj.content as Array<Record<string, string>>)
      .filter((p) => p.type === 'text')
      .map((p) => p.text)
      .join('\n')
  }
  if (msgObj.content) return JSON.stringify(msgObj.content)
  return ''
}

/**
 * Helper: send a custom SSE event
 */
export function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}
