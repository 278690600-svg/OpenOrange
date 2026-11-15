import { streamText } from 'ai'
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
} from '@/lib/constants'
import { cleanSSELine } from '@/lib/ai-provider'
import type { ProviderType, InferenceOptions, InferenceResult, ModelMessage } from './types'
import { adjustModelParams } from '@/lib/model-specs'

interface ProviderConfig {
  apiKey: string
  baseUrl: string
  settings?: Record<string, unknown>
}

function buildCoreMessages(messages: ModelMessage[], systemPrompt?: string) {
  const result: Array<Record<string, unknown>> = []
  if (systemPrompt) {
    result.push({ role: 'system', content: systemPrompt })
  }
  for (const m of messages) {
    result.push({ role: m.role, content: m.content })
  }
  return result
}

async function probeBaseUrl(primary: string, fallback: string): Promise<string> {
  for (const base of [primary, fallback]) {
    try {
      const res = await fetch(`${base}/models`, { signal: AbortSignal.timeout(MODEL_PROBE_TIMEOUT) })
      if (res.ok) return base
    } catch {}
  }
  return primary
}

async function streamFromOpenAICompatible(
  config: ProviderConfig,
  options: InferenceOptions,
  providerType: ProviderType
): Promise<InferenceResult> {
  const { apiKey, baseUrl } = config
  const provider = createOpenAI({ 
    apiKey, 
    baseURL: baseUrl,
    fetch: async (url: RequestInfo | URL, fetchOptions?: RequestInit) => {
      if (fetchOptions?.body && typeof fetchOptions.body === 'string') {
        try {
          const parsed = JSON.parse(fetchOptions.body)
          
          // Remove OpenAI-specific options for domestic/compatible providers
          if (providerType !== 'openai') {
            delete parsed.stream_options
            delete parsed.store
            delete parsed.metadata
            delete parsed.prediction
            delete parsed.service_tier
            delete parsed.reasoning_effort
          }

          // Specific parameter clamping for Zhipu AI
          if (providerType === 'zhipu') {
            if (typeof parsed.temperature === 'number') {
              parsed.temperature = Math.max(0.01, Math.min(1.0, parsed.temperature))
            }
            if (typeof parsed.top_p === 'number') {
              parsed.top_p = Math.max(0.01, Math.min(0.99, parsed.top_p))
            }
          }

          fetchOptions.body = JSON.stringify(parsed)
        } catch {}
      }
      return fetch(url, fetchOptions)
    }
  })
  const resolvedModelId = options.model
  const coreMessages = buildCoreMessages(options.messages, options.systemPrompt)

  const result = streamText({
    model: provider.chat(resolvedModelId),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    messages: coreMessages as any,
    // When undefined, Vercel AI SDK omits the field from the request body — correct behavior for "unlimited"
    temperature: options.temperature,
    topP: options.topP,
    maxOutputTokens: options.maxTokens,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tools: options.tools as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    toolChoice: options.toolChoice as any,
    maxRetries: 0,
    abortSignal: options.signal,
  })

  async function* stream() {
    let chunkCount = 0
    try {
      for await (const chunk of result.textStream) {
        if (options.signal?.aborted) break
        chunkCount++
        yield chunk
      }
    } catch (e: any) {
      console.error(`[streamFromOpenAICompatible] Error in textStream for ${providerType}/${resolvedModelId}:`, e.message || e)
      throw e
    }
  }

  return { stream: stream(), provider: providerType, resolvedModelId }
}

async function streamFromMinimax(
  config: ProviderConfig,
  options: InferenceOptions
): Promise<InferenceResult> {
  const { apiKey } = config
  const resolvedModelId = options.model
  const coreMessages = buildCoreMessages(options.messages, options.systemPrompt)

  const minimaxProvider = createOpenAI({
    apiKey,
    baseURL: MINIMAX_API_BASE,
    fetch: async (url: string, fetchOptions: RequestInit) => {
      let isStreaming = false
      if (fetchOptions?.body && typeof fetchOptions.body === 'string') {
        try {
          const parsed = JSON.parse(fetchOptions.body)
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
              else if (Array.isArray(item.content)) content = item.content.map((c: Record<string, string>) => c.text || c.input_text || '').join('')
              if (content) parsed.messages.push({ role, content })
            }
            delete parsed.input
          }
          if (Array.isArray(parsed.messages)) {
            parsed.messages = parsed.messages.map((m: Record<string, unknown>) => {
              if (m.role === 'tool') {
                return { role: 'tool', content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content), tool_call_id: m.tool_call_id }
              }
              if (m.tool_calls) {
                return { role: m.role || 'assistant', content: m.content || null, tool_calls: m.tool_calls }
              }
              return { role: m.role || 'user', content: Array.isArray(m.content) ? (m.content as Array<Record<string, string>>).map((c: Record<string, string>) => c.text || c.input_text || '').join('') : m.content }
            })
          }
          if (resolvedModelId.startsWith('MiniMax-M2.')) parsed.reasoning_split = true
          parsed.model = resolvedModelId
          console.log('[MiniMax adapter] Request model:', parsed.model, 'messages:', parsed.messages?.length, 'stream:', isStreaming)
          fetchOptions.body = JSON.stringify(parsed)
        } catch (e) {
          console.warn('[MiniMax adapter] Request transform failed:', e)
        }
      }

      const res = await fetch(`${MINIMAX_API_BASE}/chat/completions`, fetchOptions)
      console.log('[MiniMax adapter] Response status:', res.status, res.statusText)
      if (!res.body || !isStreaming) return res

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      const encoder = new TextEncoder()
      let buffer = ''
      let rawChunkCount = 0
      let cleanedChunkCount = 0

      const transformedStream = new ReadableStream({
        async pull(controller) {
          try {
            while (true) {
              const { done, value } = await reader.read()
              if (done) {
                if (buffer.trim()) {
                  const cleaned = cleanSSELine(buffer)
                  if (cleaned) {
                    controller.enqueue(encoder.encode(cleaned + '\n\n'))
                    cleanedChunkCount++
                  }
                }
                controller.enqueue(encoder.encode('data: [DONE]\n\n'))
                controller.close()
                console.log(`[MiniMax adapter] Stream done. Raw: ${rawChunkCount}, Cleaned: ${cleanedChunkCount}`)
                return
              }
              rawChunkCount++
              buffer += decoder.decode(value, { stream: true })
              const lines = buffer.split('\n')
              buffer = lines.pop() || ''
              for (const line of lines) {
                const cleaned = cleanSSELine(line)
                if (cleaned !== null) {
                  controller.enqueue(encoder.encode(cleaned + '\n\n'))
                  cleanedChunkCount++
                }
              }
            }
          } catch (err) {
            console.error('[MiniMax adapter] Stream read error:', err)
            try {
              controller.enqueue(encoder.encode('data: [DONE]\n\n'))
            } catch {}
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
  } as unknown as Parameters<typeof createOpenAI>[0])

  const result = streamText({
    model: minimaxProvider.chat(resolvedModelId),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    messages: coreMessages as any,
    temperature: options.temperature ?? 0.7,
    topP: options.topP ?? 0.9,
    maxOutputTokens: options.maxTokens ?? 2048,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tools: options.tools as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    toolChoice: options.toolChoice as any,
    maxRetries: 0,
    abortSignal: options.signal,
  })

  async function* stream() {
    for await (const chunk of result.textStream) {
      if (options.signal?.aborted) break
      yield chunk
    }
  }

  return { stream: stream(), provider: 'minimax', resolvedModelId }
}

async function streamFromNvidia(
  config: ProviderConfig,
  options: InferenceOptions
): Promise<InferenceResult> {
  const { apiKey } = config
  const resolvedModelId = options.model
  const coreMessages = buildCoreMessages(options.messages, options.systemPrompt)

  const nvidiaProvider = createOpenAI({
    apiKey,
    baseURL: NVIDIA_API_BASE,
    fetch: async (url: RequestInfo | URL, fetchOptions?: RequestInit) => {
      if (fetchOptions?.body && typeof fetchOptions.body === 'string') {
        try {
          const parsed = JSON.parse(fetchOptions.body)
          parsed.chat_template_kwargs = { "enable_thinking": true, "clear_thinking": false }
          fetchOptions.body = JSON.stringify(parsed)
        } catch {}
      }
      return fetch(url, fetchOptions)
    }
  })

  const result = streamText({
    model: nvidiaProvider.chat(resolvedModelId),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    messages: coreMessages as any,
    temperature: options.temperature ?? 0.7,
    topP: options.topP ?? 0.9,
    maxOutputTokens: options.maxTokens ?? 2048,
    maxRetries: 0,
    abortSignal: options.signal,
  })

  async function* stream() {
    for await (const chunk of result.textStream) {
      if (options.signal?.aborted) break
      yield chunk
    }
  }

  return { stream: stream(), provider: 'nvidia', resolvedModelId }
}

async function streamFromOpenRouter(
  config: ProviderConfig,
  options: InferenceOptions
): Promise<InferenceResult> {
  const { apiKey } = config
  const resolvedModelId = options.model
  const coreMessages = buildCoreMessages(options.messages, options.systemPrompt)

  const openrouterProvider = createOpenAI({
    apiKey,
    baseURL: OPENROUTER_API_BASE,
    headers: {
      'HTTP-Referer': 'https://github.com/OpenOrangeAI',
      'X-Title': 'OpenOrangeAI',
    }
  })

  const result = streamText({
    model: openrouterProvider.chat(resolvedModelId),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    messages: coreMessages as any,
    temperature: options.temperature ?? 0.7,
    topP: options.topP ?? 0.9,
    maxOutputTokens: options.maxTokens ?? 2048,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tools: options.tools as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    toolChoice: options.toolChoice as any,
    maxRetries: 0,
    abortSignal: options.signal,
  })

  async function* stream() {
    for await (const chunk of result.textStream) {
      if (options.signal?.aborted) break
      yield chunk
    }
  }

  return { stream: stream(), provider: 'openrouter', resolvedModelId }
}

async function streamFromAnthropic(
  config: ProviderConfig,
  options: InferenceOptions
): Promise<InferenceResult> {
  const resolvedModelId = options.model
  const coreMessages = buildCoreMessages(options.messages, options.systemPrompt)
  const anthropicProvider = createAnthropic({ apiKey: config.apiKey })
  const result = streamText({
    model: anthropicProvider(resolvedModelId) as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    messages: coreMessages as any,
    temperature: options.temperature ?? 0.7,
    topP: options.topP ?? 0.9,
    maxOutputTokens: options.maxTokens ?? 2048,
    abortSignal: options.signal,
  })
  async function* stream() {
    for await (const chunk of result.textStream) {
      if (options.signal?.aborted) break
      yield chunk
    }
  }
  return { stream: stream(), provider: 'anthropic', resolvedModelId }
}

async function streamFromGoogle(
  config: ProviderConfig,
  options: InferenceOptions
): Promise<InferenceResult> {
  const resolvedModelId = options.model
  const coreMessages = buildCoreMessages(options.messages, options.systemPrompt)
  const googleProvider = createGoogleGenerativeAI({ apiKey: config.apiKey })
  const result = streamText({
    model: googleProvider(resolvedModelId) as any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    messages: coreMessages as any,
    temperature: options.temperature ?? 0.7,
    topP: options.topP ?? 0.9,
    maxOutputTokens: options.maxTokens ?? 2048,
    abortSignal: options.signal,
  })
  async function* stream() {
    for await (const chunk of result.textStream) {
      if (options.signal?.aborted) break
      yield chunk
    }
  }
  return { stream: stream(), provider: 'google', resolvedModelId }
}

async function streamFromLocal(
  config: ProviderConfig,
  options: InferenceOptions
): Promise<InferenceResult> {
  const ollamaUrl = (config.settings?.ollamaUrl as string) || DEFAULT_OLLAMA_URL
  const lmstudioUrl = (config.settings?.lmstudioUrl as string) || DEFAULT_LMSTUDIO_URL
  const isLms = config.baseUrl.includes('lmstudio') || config.baseUrl.includes('1234')

  const defaultBase = isLms ? `${lmstudioUrl}/v1` : `${ollamaUrl}/v1`
  const fallbackBase = isLms
    ? `${lmstudioUrl.replace('127.0.0.1', 'localhost')}/v1`
    : `${ollamaUrl.replace('127.0.0.1', 'localhost')}/v1`

  const activeBase = await probeBaseUrl(defaultBase, fallbackBase)

  return streamFromOpenAICompatible(
    { apiKey: config.apiKey || (isLms ? 'lmstudio' : 'ollama'), baseUrl: activeBase },
    options,
    isLms ? 'lmstudio' : 'ollama'
  )
}

export async function createInferenceStream(
  providerType: ProviderType,
  config: ProviderConfig,
  options: InferenceOptions
): Promise<InferenceResult> {
  const fullModelId = options.model.includes('::') ? options.model : `${providerType}::${options.model}`
  const adjusted = adjustModelParams(fullModelId, {
    temperature: options.temperature,
    topP: options.topP,
    maxTokens: options.maxTokens,
  })

  options = {
    ...options,
    temperature: adjusted.temperature,
    topP: adjusted.topP,
    maxTokens: adjusted.maxTokens,
  }

  switch (providerType) {
    case 'openai':
      return streamFromOpenAICompatible(
        { apiKey: config.apiKey, baseUrl: 'https://api.openai.com/v1' },
        options,
        'openai'
      )
    case 'deepseek':
      return streamFromOpenAICompatible(
        { apiKey: config.apiKey, baseUrl: DEEPSEEK_API_BASE },
        options,
        'deepseek'
      )
    case 'minimax':
      return streamFromMinimax(config, options)
    case 'nvidia':
      return streamFromNvidia(config, options)
    case 'openrouter':
      return streamFromOpenRouter(config, options)
    case 'ollama':
    case 'lmstudio':
      return streamFromLocal(config, options)
    case 'anthropic':
      return streamFromAnthropic(config, options)
    case 'google':
      return streamFromGoogle(config, options)
    case 'groq':
    case 'mistral':
    case 'zhipu':
    case 'lingyi':
    case 'volcengine':
      return streamFromVolcengine(config, options)
    case 'local-gguf':
      throw new Error('Local GGUF inference is handled separately by handleLocalGgufChat')
    default:
      throw new Error(`Unknown provider: ${providerType}`)
  }
}

async function streamFromVolcengine(
  config: ProviderConfig,
  options: InferenceOptions
): Promise<InferenceResult> {
  const { apiKey } = config
  const resolvedModelId = options.model
  const coreMessages = buildCoreMessages(options.messages, options.systemPrompt)

  const url = `${VOLCENGINE_API_BASE}/chat/completions`
  const body: Record<string, any> = {
    model: resolvedModelId,
    messages: coreMessages.map(m => ({
      role: m.role,
      content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
    })),
    temperature: options.temperature,
    top_p: options.topP,
    max_tokens: options.maxTokens,
    stream: true
  }

  // Remove undefined parameters
  if (body.temperature === undefined) delete body.temperature
  if (body.top_p === undefined) delete body.top_p
  if (body.max_tokens === undefined) delete body.max_tokens

  async function* stream() {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(body),
      signal: options.signal
    })

    if (!response.ok) {
      const errText = await response.text().catch(() => '')
      throw new Error(`Volcengine API Error (${response.status}): ${errText}`)
    }

    if (!response.body) return

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let inReasoning = false

    // 仅当 options.deepThink 为 true，或者模型本身是已知推理模型（ID中包含 r1, reasoner）时，才开启思考标签包裹
    const shouldWrapReasoning = options.deepThink || 
      resolvedModelId.toLowerCase().includes('r1') || 
      resolvedModelId.toLowerCase().includes('reasoner')

    try {
      let isStreamEnded = false
      while (!isStreamEnded) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || !trimmed.startsWith('data: ')) continue
          
          const dataStr = trimmed.slice(6).trim()
          if (dataStr === '[DONE]') {
            isStreamEnded = true
            break
          }

          try {
            const parsed = JSON.parse(dataStr)
            const delta = parsed.choices?.[0]?.delta
            if (delta) {
              const content = delta.content || ''
              const reasoning = delta.reasoning_content || ''

              if (shouldWrapReasoning) {
                if (reasoning && !inReasoning) {
                  inReasoning = true
                  yield `<think>${reasoning}`
                } else if (reasoning && inReasoning) {
                  yield reasoning
                } else if (content && inReasoning) {
                  inReasoning = false
                  yield `</think>\n${content}`
                } else if (content && !inReasoning) {
                  yield content
                }
              } else {
                // 如果不需要包装，直接把所有推理流和正文流拼合输出
                const chunkText = content || reasoning || ''
                if (chunkText) {
                  yield chunkText
                }
              }
            }
          } catch {}
        }
      }

      // 结束后闭合推理块
      if (shouldWrapReasoning && inReasoning) {
        yield '</think>'
      }
    } catch (e: any) {
      if (e.name === 'AbortError') return
      console.error(`[streamFromVolcengine] Stream read error:`, e.message || e)
      throw e
    }
  }

  return { stream: stream(), provider: 'volcengine', resolvedModelId }
}

export function getProviderConfig(providerType: ProviderType, settings: Record<string, unknown>): ProviderConfig {
  const s = settings
  const keyMap: Record<string, string> = {
    openai: (s?.openaiKey as string) || '',
    deepseek: (s?.deepseekKey as string) || '',
    minimax: (s?.minimaxKey as string) || '',
    openrouter: (s?.openrouterKey as string) || '',
    nvidia: (s?.nvidiaKey as string) || '',
    anthropic: (s?.anthropicKey as string) || '',
    google: (s?.googleKey as string) || '',
    groq: (s?.groqKey as string) || '',
    mistral: (s?.mistralKey as string) || '',
    zhipu: (s?.zhipuKey as string) || '',
    lingyi: (s?.lingyiKey as string) || '',
    volcengine: (s?.volcengineKey as string) || '',
  }

  const baseMap: Record<string, string> = {
    ollama: `${(s?.ollamaUrl as string) || DEFAULT_OLLAMA_URL}/v1`,
    lmstudio: `${(s?.lmstudioUrl as string) || DEFAULT_LMSTUDIO_URL}/v1`,
    openai: 'https://api.openai.com/v1',
    deepseek: DEEPSEEK_API_BASE,
    minimax: MINIMAX_API_BASE,
    openrouter: OPENROUTER_API_BASE,
    nvidia: NVIDIA_API_BASE,
    volcengine: VOLCENGINE_API_BASE,
    groq: 'https://api.groq.com/openai/v1',
    mistral: 'https://api.mistral.ai/v1',
    zhipu: 'https://open.bigmodel.cn/api/paas/v4',
    lingyi: 'https://api.lingyiwanwu.com/v1',
  }

  return {
    apiKey: keyMap[providerType] || '',
    baseUrl: baseMap[providerType] || '',
    settings,
  }
}
