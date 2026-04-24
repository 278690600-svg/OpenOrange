import { NextResponse } from 'next/server'
import { mcpManager } from '@/lib/mcp'
import { streamText } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import prisma from '@/lib/db'

// Reuse the same cleanSSELine function for MiniMax
function cleanSSELine(line: string): string | null {
  if (!line.startsWith('data: ')) return line
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

// Shared provider resolver (same logic as chat route)
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
      provider: createOpenAI({ apiKey: deepseekKey, baseURL: 'https://api.deepseek.com' }),
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
            console.warn('[Agent/MiniMax] Request transform failed:', e)
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

        return new Response(transformedStream, { status: res.status, statusText: res.statusText, headers: res.headers })
      }
    } as any)
    return { provider: minimaxProvider.chat, resolvedId }
  }

  if (modelId.startsWith('openrouter::')) {
    const openrouterProvider = createOpenAI({
      apiKey: openrouterKey,
      baseURL: 'https://openrouter.ai/api/v1',
      compatibility: 'compatible',
      headers: { 'HTTP-Referer': 'https://github.com/OpenOrangeAI', 'X-Title': 'OpenOrangeAI' }
    })
    return { provider: openrouterProvider.chat, resolvedId: modelId.replace('openrouter::', '') }
  }

  const isLms = modelId.startsWith('lmstudio::')
  const defaultBase = isLms ? `${lmstudioUrl}/v1` : `${ollamaUrl}/v1`
  const fallbackBase = isLms ? `${lmstudioUrl.replace('127.0.0.1', 'localhost')}/v1` : `${ollamaUrl.replace('127.0.0.1', 'localhost')}/v1`
  const resolvedId = isLms ? modelId.replace('lmstudio::', '') : modelId.replace('ollama::', '')

  for (const base of [defaultBase, fallbackBase]) {
    try {
      const res = await fetch(`${base}/models`, { signal: AbortSignal.timeout(1500) })
      if (res.ok) return { provider: createOpenAI({ baseURL: base, apiKey: isLms ? 'lmstudio' : 'ollama' }), resolvedId }
    } catch {}
  }

  return { provider: createOpenAI({ baseURL: defaultBase, apiKey: isLms ? 'lmstudio' : 'ollama' }), resolvedId }
}

function extractContent(msg: any): string {
  if (typeof msg.content === 'string') return msg.content
  if (Array.isArray(msg.content)) {
    return msg.content.filter((p: any) => p.type === 'text').map((p: any) => p.text).join('\n')
  }
  return String(msg.content || '')
}

function buildAgentPrompt(mcpTools: Record<string, any>): string {
  const toolNames = Object.keys(mcpTools).slice(0, 20).join(', ')
  return `You are an AI Agent with access to tools. Your job is to help users complete tasks by using available tools.

AVAILABLE TOOLS:
${toolNames}

WORKFLOW:
1. When user gives you a task, think about which tool(s) to use.
2. Call the appropriate tool(s) with the correct parameters.
3. After each tool execution, BRIEFLY summarize what happened in Chinese.
4. Then ASK the user: "接下来需要我做什么？" or provide suggested next actions.
5. Wait for user's response before taking the next action.

IMPORTANT RULES:
- After completing a tool action, ALWAYS ask the user what they want to do next.
- Keep responses concise and actionable.
- When navigating to URLs, show the user what page was opened and what's on it.
- When searching, show the top 3 results with titles and brief descriptions.
- If a tool fails, explain the error in simple terms and suggest alternatives.
- Always respond in Chinese unless the user asks otherwise.`
}

function sseEvent(type: string, data: any): string {
  return `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`
}

export async function POST(req: Request) {
  try {
    const { message, history, model } = await req.json()
    if (!message) return NextResponse.json({ error: 'Message required' }, { status: 400 })

    const settings = await prisma.settings.findUnique({ where: { id: 'default' } })
    if (!settings) return NextResponse.json({ error: 'Settings not found' }, { status: 500 })

    const resolvedModel = model || settings.defaultModel || 'ollama::llama3'
    const { provider, resolvedId } = await getSmartProvider(resolvedModel, settings)

    // Load MCP tools
    const mcpTools = settings?.mcpEnabled ? await mcpManager.getTools() : {}
    const hasTools = Object.keys(mcpTools).length > 0

    console.log(`[Agent] Message: "${message}" | Model: ${resolvedModel} | Tools: ${Object.keys(mcpTools).length}`)

    // Provider is a function that takes model ID - call it to get the actual model
    const modelProvider = typeof provider === 'function' ? (provider as any)(resolvedId) : provider

    const fullMessages: any[] = [
      { role: 'system', content: buildAgentPrompt(mcpTools) },
      ...(history || []).filter((m: any) => m.role !== 'tool').map((m: any) => ({
        role: m.role,
        content: m.role === 'user' ? extractContent(m) : m.content,
      })),
      { role: 'user', content: message },
    ]

    const encoder = new TextEncoder()

    const stream = new ReadableStream({
      async start(controller) {
        const write = (chunk: string) => controller.enqueue(encoder.encode(chunk))

        try {
          await write(sseEvent('agent-start', { message: 'Agent 开始执行任务' }))

          const result = streamText({
            model: modelProvider,
            messages: fullMessages,
            tools: hasTools ? mcpTools : undefined,
            toolChoice: hasTools ? 'auto' : undefined,
            temperature: (settings as any)?.apiTemperature ?? 0.7,
            topP: (settings as any)?.apiTopP ?? 0.9,
            maxTokens: (settings as any)?.apiMaxTokens ?? 4096,
            maxSteps: 10,
            maxRetries: 0,
            onStepFinish: async (step: any) => {
              if (step.toolCalls?.length) {
                for (const tc of step.toolCalls) {
                  const callInfo: any = {
                    type: 'agent-tool-call',
                    tool: tc.toolName,
                    args: (tc as any).arguments,
                    message: `正在调用: ${tc.toolName}`,
                  }
                  const args = (tc as any).arguments || {}
                  if (args.url) { callInfo.url = args.url; callInfo.message = `正在打开: ${args.url}` }
                  if (args.query) { callInfo.query = args.query; callInfo.message = `正在搜索: ${args.query}` }
                  if (args.text) callInfo.text = args.text
                  await write(sseEvent('agent-event', callInfo))
                }
              }
              if (step.toolResults?.length) {
                for (const tr of step.toolResults) {
                  const resultText = Array.isArray(tr.result)
                    ? tr.result.map((r: any) => r.text || JSON.stringify(r)).join('\n')
                    : JSON.stringify(tr.result)

                  const resultInfo: any = {
                    type: 'agent-tool-result',
                    tool: tr.toolName,
                    message: `${tr.toolName} 执行完成`,
                    result: resultText.substring(0, 1000),
                  }

                  try {
                    const parsed = JSON.parse(resultText)
                    if (Array.isArray(parsed)) {
                      resultInfo.items = parsed.slice(0, 5).map((item: any) => ({
                        title: item.title || item.name || '',
                        url: item.url || item.link || '',
                        snippet: item.snippet || item.content || item.description || '',
                      }))
                    }
                    if (parsed.url) resultInfo.completedUrl = parsed.url
                    if (parsed.title) resultInfo.pageTitle = parsed.title
                    if (parsed.screenshot) resultInfo.screenshot = parsed.screenshot
                  } catch {}

                  await write(sseEvent('agent-event', resultInfo))
                }
              }
            },
          })

          for await (const chunk of result.textStream) {
            await write(sseEvent('text', { text: chunk }))
          }
          await write(sseEvent('done', {}))
        } catch (error: any) {
          console.error('[Agent] Error:', error)
          await write(sseEvent('error', { message: error.message || 'Agent 执行出错' }))
        } finally {
          controller.close()
        }
      },
    })

    return new Response(stream, {
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' },
    })
  } catch (error: any) {
    console.error('[Agent] Fatal error:', error)
    return NextResponse.json({ error: error.message || 'Agent API error' }, { status: 500 })
  }
}
