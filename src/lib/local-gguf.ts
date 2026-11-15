import { resolveModelPath } from '@/lib/models'
import path from 'path'
import fs from 'fs'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LlamaCache = {
  modelPath: string | null;
  model: unknown;
  context: unknown;
  session: unknown;
  isLoaded: boolean;
  loadingPromise: Promise<void> | null;
  systemPrompt: string | undefined;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let llamaInstance: any = null

async function getLlamaInstance() {
  if (!llamaInstance) {
    // Use Function() to bypass Turbopack/webpack module resolution entirely.
    // This is the officially recommended workaround for ESM-only packages
    // in bundler environments (see node-llama-cpp troubleshooting docs).
    const nlc: typeof import('node-llama-cpp') = await Function('return import("node-llama-cpp")')()
    const { getLlama } = nlc
    console.log('[Llama] Loading engine (strictly using prebuilt binaries only)...')
    llamaInstance = await getLlama({ gpu: 'auto', build: 'never' })
  }
  return llamaInstance
}

export interface GgufSettings {
  localGgufContextSize?: number
  localGgufTemperature?: number
  localGgufTopP?: number
  localGgufMaxTokens?: number
}

export interface GgufChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

/**
 * 核心流式推理生成器：将基于回调的 node-llama-cpp 转换成标准异步 Generator，支持通过队列向外吐出 Token 并转发加载状态。
 */
export async function* streamLocalGgufChat({
  modelId,
  messages,
  systemPrompt,
  settings,
  onStatus,
}: {
  modelId: string
  messages: GgufChatMessage[]
  systemPrompt?: string
  settings?: GgufSettings
  onStatus?: (event: { type: string; stage: string; message: string; progress?: number; modelName?: string }) => void
}): AsyncGenerator<string, void, unknown> {
  const fileName = modelId.replace('local-gguf::', '')
  const modelPath = resolveModelPath(fileName)
  console.log(`[Local GGUF] Loading model from: ${modelPath}`)

  // ===== 使用 globalThis 作为单例缓存，防止多轮请求重复加载模型导致显存撑爆 =====
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const g = globalThis as any & { localGgufCache?: LlamaCache }
  g.localGgufCache = g.localGgufCache || {
    modelPath: null,
    model: null,
    context: null,
    session: null,
    isLoaded: false,
    loadingPromise: null,
    systemPrompt: undefined,
  }
  const cache = g.localGgufCache

  if (cache.loadingPromise) {
    await cache.loadingPromise
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let llama: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let model: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let context: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let session: any
  const isSmallModel = fileName.toLowerCase().includes('1b') || fileName.toLowerCase().includes('0.5b') || fileName.toLowerCase().includes('3b')

  const emitStatus = (event: { type: string; stage: string; message: string; progress?: number; modelName?: string }) => {
    if (onStatus) {
      try {
        onStatus(event)
      } catch (e) {
        console.warn('[Local GGUF] onStatus callback error:', e)
      }
    }
  }

  try {
    const finalSystemPrompt = isSmallModel 
      ? 'You are a helpful AI assistant. Answer concisely.' 
      : systemPrompt

    llama = await getLlamaInstance()

    if (cache.modelPath !== modelPath || cache.systemPrompt !== finalSystemPrompt) {
      // 如果之前有其他模型在加载，先等待加载完成并容错
      if (cache.loadingPromise) {
        try {
          await cache.loadingPromise
        } catch (e) {
          console.warn('[Local GGUF] Previous loading promise rejected, resetting cache promise...', e)
          cache.loadingPromise = null
        }
      }
      
      // 再次检查确认
      if (cache.modelPath === modelPath && cache.systemPrompt === finalSystemPrompt) {
        model = cache.model
        context = cache.context
        session = cache.session
      } else {
        const loadingPromise = (async () => {
          try {
            emitStatus({ type: 'model_load', stage: 'compiling', message: '正在启动本地推理引擎...', progress: 0, modelName: fileName })
            
            // 释放旧模型及上下文，释放显存与系统内存
            if (cache.context) { try { await cache.context.dispose() } catch {} }
            if (cache.model) { try { await cache.model.dispose() } catch {} }

            emitStatus({ type: 'model_load', stage: 'loading', message: `正在加载模型: ${fileName}`, progress: 0, modelName: fileName })

            let lastProgress = 0
            model = await llama.loadModel({
              modelPath,
              onLoadProgress: (progress: number) => {
                const pct = Math.round(progress * 100)
                if (pct >= lastProgress + 5 || pct === 100) {
                  lastProgress = pct
                  emitStatus({ type: 'model_load', stage: 'loading', message: `加载模型中 ${pct}%`, progress: pct, modelName: fileName })
                }
              }
            })

            emitStatus({ type: 'model_load', stage: 'context', message: '正在初始化对话上下文...', progress: 100, modelName: fileName })
            
            const fileNameLower = fileName.toLowerCase()
            const isGemma = fileNameLower.includes('gemma')
            const contextSize = settings?.localGgufContextSize || (isGemma ? 8192 : 4096)
            context = await model.createContext({ contextSize })

            const nlc2: typeof import('node-llama-cpp') = await Function('return import("node-llama-cpp")')()
            const { LlamaChatSession } = nlc2
            session = new LlamaChatSession({
              contextSequence: context.getSequence(),
              systemPrompt: finalSystemPrompt,
              ...(isGemma ? { autoDisposeSequence: false } : {})
            })

            cache.modelPath = modelPath
            cache.model = model
            cache.context = context
            cache.session = session
            cache.isLoaded = true
            cache.systemPrompt = finalSystemPrompt
            cache.loadingPromise = null
            emitStatus({ type: 'model_load', stage: 'ready', message: `模型 ${fileName} 加载完成`, progress: 100, modelName: fileName })
          } catch (e) {
            // 发生异常时，立刻释放所有引用并重置状态，防止全局单例被 Rejected Promise 锁死
            cache.loadingPromise = null
            cache.isLoaded = false
            cache.modelPath = null
            cache.model = null
            cache.context = null
            cache.session = null
            throw e
          }
        })()
        
        cache.loadingPromise = loadingPromise
        await loadingPromise
      }
    } else {
      model = cache.model
      context = cache.context
      session = cache.session
      emitStatus({ type: 'model_load', stage: 'ready', message: `状态: 模型已就绪 (${fileName})`, progress: 100, modelName: fileName })
    }
  } catch (error: unknown) {
    if (g.localGgufCache) {
      g.localGgufCache.loadingPromise = null
      g.localGgufCache.isLoaded = false
      g.localGgufCache.modelPath = null
      g.localGgufCache.model = null
      g.localGgufCache.context = null
      g.localGgufCache.session = null
    }
    const err = error as Error
    console.error('[Local GGUF] Initialization Error:', err)
    let errorMsg = err?.message || '文件损坏或引擎不支持'
    if (errorMsg.includes('VRAM') || errorMsg.includes('memory')) {
      errorMsg = '显存不足，请尝试使用更小或量化级别更高 (Q4/Q2) 的模型'
    }
    
    // 异步记录详细错误日志
    try {
      const modelsDir = path.join(process.cwd(), '.models')
      const altModelsDir = path.join(process.cwd(), 'models')
      const targetDir = fs.existsSync(modelsDir) ? modelsDir : (fs.existsSync(altModelsDir) ? altModelsDir : modelsDir)
      
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true })
      }
      fs.writeFileSync(path.join(targetDir, 'error.log'), String(err?.stack || err))
    } catch {}
    
    emitStatus({ type: 'model_load', stage: 'error', message: `加载失败: ${errorMsg}`, progress: 0 })
    throw new Error(`本地模型加载失败: ${errorMsg}`)
  }

  const isGemma = fileName.toLowerCase().includes('gemma')

  // 将对话历史转换为 node-llama-cpp 支持的格式
  const newHistory = messages.slice(0, -1).map(m => ({
    role: m.role === 'assistant' ? (isGemma ? 'model' : 'assistant') : m.role,
    content: [m.content]
  }))

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sessionObj = session as any
  const existingHistory = sessionObj.getChatHistory()
  let isMatch = false
  
  if (existingHistory.length > 0 && newHistory.length === existingHistory.length) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    isMatch = existingHistory.every((msg: any, i: number) => {
      const newMsg = newHistory[i]
      const oldContent = Array.isArray(msg.content) ? msg.content.join('') : String(msg.content)
      const newContent = Array.isArray(newMsg.content) ? newMsg.content.join('') : String(newMsg.content)
      return msg.role === newMsg.role && oldContent === newContent
    })
  } else if (existingHistory.length === 0 && newHistory.length === 0) {
    isMatch = true
  }

  if (!isMatch) {
    console.log('[Local GGUF] History changed or mismatch. Refreshing session...')
    sessionObj.setChatHistory(newHistory)
  }

  // 内存异步队列桥接设计
  const tokenQueue: string[] = []
  let done = false
  let errorOccurred: Error | null = null

  const lastMsg = messages[messages.length - 1]
  const promptText = lastMsg.content

  sessionObj.prompt(promptText, {
    onToken: (token: unknown) => {
      if (typeof token === 'string') {
        if (token) tokenQueue.push(token)
      } else {
        try {
          const text = model.detokenize(Array.isArray(token) ? token : [token])
          if (text) tokenQueue.push(text)
        } catch {}
      }
    },
    temperature: settings?.localGgufTemperature ?? (isSmallModel ? 0.2 : 0.7),
    topP: settings?.localGgufTopP ?? 0.8,
    topK: 40,
    repeatPenalty: { penalty: 1.1 },
    maxTokens: settings?.localGgufMaxTokens ?? 2048
  }).then(() => {
    done = true
  }).catch((err: unknown) => {
    errorOccurred = err as Error
    done = true
  })

  // 消费内存异步队列，直到提示完毕且队列为空
  try {
    while (!done || tokenQueue.length > 0) {
      if (errorOccurred) {
        throw errorOccurred
      }
      if (tokenQueue.length > 0) {
        yield tokenQueue.shift()!
      } else {
        // 避免 CPU 盲等空跑，让出执行权 15ms
        await new Promise(resolve => setTimeout(resolve, 15))
      }
    }
  } catch (err) {
    console.warn('[Local GGUF] 推理中途发生异常，正在重置引擎以防止状态受损:', err)
    if (cache.context) { try { await cache.context.dispose() } catch {} }
    if (cache.model) { try { await cache.model.dispose() } catch {} }
    cache.modelPath = null
    cache.model = null
    cache.context = null
    cache.session = null
    cache.isLoaded = false
    throw err
  }
}
