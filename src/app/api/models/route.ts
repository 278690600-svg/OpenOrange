import { NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { scanLocalGgufModels } from '@/lib/models'

type ModelOption = {
  id: string
  name: string
  provider: string
}

function normalizeBaseUrl(rawValue: string | null | undefined, fallback: string) {
  const trimmed = (rawValue || fallback).trim()
  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`
  return withProtocol.replace(/\/+$/, '')
}

function joinUrl(baseUrl: string, routePath: string) {
  return `${baseUrl}${routePath.startsWith('/') ? routePath : `/${routePath}`}`
}

function dedupeModels(models: ModelOption[]) {
  const seen = new Set<string>()
  return models.filter((model) => {
    if (seen.has(model.id)) return false
    seen.add(model.id)
    return true
  })
}

async function fetchJsonCandidates(baseUrl: string, paths: string[], init?: RequestInit, timeoutMs = 5000) {
  for (const routePath of paths) {
    const url = joinUrl(baseUrl, routePath)
    try {
      const res = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(timeoutMs),
      })
      if (res.ok) return await res.json()
    } catch {
      // try next endpoint
    }
  }

  return null
}

function toOpenAICompatibleModels(payload: unknown, provider: string, prefix: string, filter?: (id: string) => boolean) {
  if (!payload || typeof payload !== 'object' || !Array.isArray((payload as { data?: unknown[] }).data)) {
    return [] as ModelOption[]
  }

  return ((payload as { data: Array<{ id?: string }> }).data || [])
    .map((item) => item.id?.trim())
    .filter((id): id is string => Boolean(id))
    .filter((id) => (filter ? filter(id) : true))
    .map((id) => ({
      id: `${prefix}${id}`,
      name: id,
      provider,
    }))
}

function toOllamaModels(payload: unknown) {
  if (!payload || typeof payload !== 'object' || !Array.isArray((payload as { models?: unknown[] }).models)) {
    return [] as ModelOption[]
  }

  return ((payload as { models: Array<{ name?: string; model?: string }> }).models || [])
    .map((item) => (item.name || item.model || '').trim())
    .filter((name): name is string => Boolean(name))
    .map((name) => ({
      id: `ollama::${name}`,
      name,
      provider: 'ollama',
    }))
}

async function discoverLocalModels(ollamaUrl: string, lmstudioUrl: string) {
  const [ollamaPayload, lmsPayload] = await Promise.all([
    fetchJsonCandidates(ollamaUrl, ['/api/tags', '/v1/models'], undefined, 5000),
    fetchJsonCandidates(lmstudioUrl, ['/v1/models', '/models'], undefined, 5000),
  ])

  const ollamaModels = toOllamaModels(ollamaPayload)
  const lmstudioModels = toOpenAICompatibleModels(lmsPayload, 'lmstudio', 'lmstudio::')

  return [...ollamaModels, ...lmstudioModels]
}

async function discoverApiModels(baseUrl: string, apiKey: string, provider: string, prefix: string) {
  if (!apiKey) return [] as ModelOption[]

  const payload = await fetchJsonCandidates(
    baseUrl,
    ['/v1/models', '/models'],
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    },
    10000
  )

  return toOpenAICompatibleModels(payload, provider, prefix, (id) => {
    if (provider === 'openrouter') {
      return id.endsWith(':free')
    }
    return true
  })
}

function fallbackModels(settings: {
  openaiKey?: string | null
  deepseekKey?: string | null
  minimaxKey?: string | null
}) {
  const models: ModelOption[] = []

  if (settings.openaiKey) {
    models.push(
      { id: 'openai::gpt-4o', name: 'gpt-4o', provider: 'openai' },
      { id: 'openai::gpt-4o-mini', name: 'gpt-4o-mini', provider: 'openai' },
      { id: 'openai::o1', name: 'o1', provider: 'openai' },
      { id: 'openai::o1-mini', name: 'o1-mini', provider: 'openai' }
    )
  }

  if (settings.deepseekKey) {
    models.push(
      { id: 'deepseek::deepseek-chat', name: 'deepseek-chat', provider: 'deepseek' },
      { id: 'deepseek::deepseek-reasoner', name: 'deepseek-reasoner', provider: 'deepseek' }
    )
  }

  if (settings.minimaxKey) {
    models.push(
      { id: 'minimax::MiniMax-M2.7', name: 'MiniMax-M2.7', provider: 'minimax' },
      { id: 'minimax::MiniMax-M2.5', name: 'MiniMax-M2.5', provider: 'minimax' },
    )
  }

  if ((settings as any).openrouterKey) {
    models.push(
      { id: 'openrouter::qwen/qwen3.6-plus:free', name: 'Qwen 3.6 Plus (Free)', provider: 'openrouter' },
      { id: 'openrouter::deepseek/deepseek-chat-v3-0324:free', name: 'DeepSeek V3 (Free)', provider: 'openrouter' },
      { id: 'openrouter::minimax/minimax-m2.5:free', name: 'MiniMax M2.5 (Free)', provider: 'openrouter' },
      { id: 'openrouter::stepfun/step-3.5-flash:free', name: 'Step 3.5 Flash (Free)', provider: 'openrouter' },
      { id: 'openrouter::nvidia/nemotron-3-super-120b-a12b:free', name: 'Nemotron 3 Super 120B (Free)', provider: 'openrouter' }
    )
  }

  if ((settings as any).nvidiaKey) {
    models.push(
      { id: 'nvidia::z-ai/glm-5.1', name: 'glm-5.1 (NVIDIA)', provider: 'nvidia' },
      { id: 'nvidia::meta/llama-3.1-405b-instruct', name: 'llama-3.1-405b (NVIDIA)', provider: 'nvidia' },
    )
  }
  return models
}

let modelsCache: { data: any; timestamp: number } | null = null
const MODELS_CACHE_TTL = 15000

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const refresh = searchParams.get('refresh') === 'true'
    const showAll = searchParams.get('all') === 'true'
    
    const now = Date.now()
    if (!refresh && modelsCache && (now - modelsCache.timestamp < MODELS_CACHE_TTL)) {
      return NextResponse.json(modelsCache.data)
    }

    const settings = (await prisma.settings.findUnique({ where: { id: 'default' } })) as any

    const ollamaUrl = normalizeBaseUrl(settings?.ollamaUrl, 'http://127.0.0.1:11434')
    const lmstudioUrl = normalizeBaseUrl(settings?.lmstudioUrl, 'http://127.0.0.1:1234')

    const results = await Promise.allSettled([
      settings?.localGgufEnabled ? scanLocalGgufModels(refresh) : Promise.resolve([]),
      discoverLocalModels(ollamaUrl, lmstudioUrl),
      discoverApiModels('https://api.openai.com', settings?.openaiKey || '', 'openai', 'openai::'),
      discoverApiModels('https://api.deepseek.com', settings?.deepseekKey || '', 'deepseek', 'deepseek::'),
      discoverApiModels('https://api.minimaxi.com', settings?.minimaxKey || '', 'minimax', 'minimax::'),
      discoverApiModels('https://openrouter.ai/api', (settings as any)?.openrouterKey || '', 'openrouter', 'openrouter::'),
      discoverApiModels('https://integrate.api.nvidia.com', (settings as any)?.nvidiaKey || '', 'nvidia', 'nvidia::'),
    ])

    const localGgufs = (settings as any)?.localGgufEnabled && results[0].status === 'fulfilled' ? results[0].value : []
    const localModels = results[1].status === 'fulfilled' ? results[1].value : []
    const openaiModels = results[2].status === 'fulfilled' ? results[2].value : []
    const deepseekModels = results[3].status === 'fulfilled' ? results[3].value : []
    const minimaxModels = results[4].status === 'fulfilled' ? results[4].value : []
    const openrouterModels = results[5].status === 'fulfilled' ? results[5].value : []
    const nvidiaModels = results[6].status === 'fulfilled' ? results[6].value : []

    let models = dedupeModels([
      ...localGgufs,
      ...localModels,
      ...openaiModels,
      ...deepseekModels,
      ...minimaxModels,
      ...openrouterModels,
      ...nvidiaModels,
      ...fallbackModels(settings || {}),
    ])

    // Filter by enabledModels if not showing all
    if (!showAll && settings?.enabledModels) {
      try {
        const enabledIds = JSON.parse(settings.enabledModels)
        if (Array.isArray(enabledIds) && enabledIds.length > 0) {
          const enabledSet = new Set(enabledIds)
          models = models.filter(m => enabledSet.has(m.id))
        }
      } catch (e) {
        console.error("Failed to parse enabledModels:", e)
      }
    }

    if (models.length === 0) {
      models = [{ id: 'ollama::llama3', name: 'llama3 (default)', provider: 'ollama' }]
    }

    modelsCache = { data: models, timestamp: Date.now() }
    return NextResponse.json(models)
  } catch (error) {
    console.error('Models GET Error:', error)
    return NextResponse.json([], { status: 500 })
  }
}
