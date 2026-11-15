import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { scanLocalGgufModels } from '@/lib/models'

const CLOUD_MODELS: Record<string, Array<{ id: string; name: string; provider: string }>> = {
  openai: [
    { id: 'openai::gpt-4o', name: 'GPT-4o', provider: 'openai' },
    { id: 'openai::gpt-4o-mini', name: 'GPT-4o Mini', provider: 'openai' },
    { id: 'openai::gpt-4-turbo', name: 'GPT-4 Turbo', provider: 'openai' },
    { id: 'openai::gpt-3.5-turbo', name: 'GPT-3.5 Turbo', provider: 'openai' },
    { id: 'openai::o1', name: 'o1', provider: 'openai' },
    { id: 'openai::o3-mini', name: 'o3 Mini', provider: 'openai' },
  ],
  anthropic: [
    { id: 'anthropic::claude-sonnet-4-20250514', name: 'Claude Sonnet 4', provider: 'anthropic' },
    { id: 'anthropic::claude-opus-4-20250514', name: 'Claude Opus 4', provider: 'anthropic' },
    { id: 'anthropic::claude-3-5-sonnet-latest', name: 'Claude 3.5 Sonnet', provider: 'anthropic' },
    { id: 'anthropic::claude-3-haiku-20240307', name: 'Claude 3 Haiku', provider: 'anthropic' },
  ],
  google: [
    { id: 'google::gemini-2.5-pro', name: 'Gemini 2.5 Pro', provider: 'google' },
    { id: 'google::gemini-2.0-flash', name: 'Gemini 2.0 Flash', provider: 'google' },
    { id: 'google::gemini-1.5-pro', name: 'Gemini 1.5 Pro', provider: 'google' },
  ],
  deepseek: [
    { id: 'deepseek::deepseek-chat', name: 'DeepSeek Chat', provider: 'deepseek' },
    { id: 'deepseek::deepseek-reasoner', name: 'DeepSeek Reasoner', provider: 'deepseek' },
  ],
  minimax: [
    { id: 'minimax::MiniMax-M2.7', name: 'MiniMax M2.7', provider: 'minimax' },
    { id: 'minimax::abab6.5s-chat', name: 'MiniMax abab6.5s', provider: 'minimax' },
  ],
  openrouter: [
    { id: 'openrouter::anthropic/claude-sonnet-4', name: 'Claude Sonnet 4 (via OpenRouter)', provider: 'openrouter' },
    { id: 'openrouter::openai/gpt-4o', name: 'GPT-4o (via OpenRouter)', provider: 'openrouter' },
    { id: 'openrouter::google/gemini-pro', name: 'Gemini Pro (via OpenRouter)', provider: 'openrouter' },
  ],
  nvidia: [
    { id: 'nvidia::meta/llama3-70b', name: 'Llama3 70B (via NVIDIA)', provider: 'nvidia' },
    { id: 'nvidia::mistralai/mixtral-8x7b', name: 'Mixtral 8x7B (via NVIDIA)', provider: 'nvidia' },
  ],
  groq: [
    { id: 'groq::llama3-70b-8192', name: 'Llama3 70B (via Groq)', provider: 'groq' },
    { id: 'groq::mixtral-8x7b-32768', name: 'Mixtral 8x7B (via Groq)', provider: 'groq' },
    { id: 'groq::gemma2-9b-it', name: 'Gemma2 9B (via Groq)', provider: 'groq' },
  ],
  mistral: [
    { id: 'mistral::mistral-large-latest', name: 'Mistral Large', provider: 'mistral' },
    { id: 'mistral::mistral-medium-latest', name: 'Mistral Medium', provider: 'mistral' },
    { id: 'mistral::open-mistral-nemo', name: 'Mistral Nemo', provider: 'mistral' },
  ],
  zhipu: [
    { id: 'zhipu::glm-4', name: 'GLM-4', provider: 'zhipu' },
    { id: 'zhipu::glm-4-flash', name: 'GLM-4 Flash', provider: 'zhipu' },
    { id: 'zhipu::glm-4-plus', name: 'GLM-4 Plus', provider: 'zhipu' },
    { id: 'zhipu::glm-4-air', name: 'GLM-4 Air', provider: 'zhipu' },
    { id: 'zhipu::glm-4-airx', name: 'GLM-4 AirX', provider: 'zhipu' },
    { id: 'zhipu::glm-z1-flash', name: 'GLM-Z1 Flash', provider: 'zhipu' },
    { id: 'zhipu::glm-z1-air', name: 'GLM-Z1 Air', provider: 'zhipu' },
    { id: 'zhipu::glm-z1-airx', name: 'GLM-Z1 AirX', provider: 'zhipu' },
    { id: 'zhipu::glm-z1', name: 'GLM-Z1', provider: 'zhipu' },
    { id: 'zhipu::glm-5.2', name: 'GLM-5.2', provider: 'zhipu' },
  ],

  lingyi: [
    { id: 'lingyi::yi-lightning', name: 'Yi Lightning', provider: 'lingyi' },
    { id: 'lingyi::yi-large', name: 'Yi Large', provider: 'lingyi' },
  ],
  volcengine: [
    { id: 'volcengine::ark-code-latest', name: 'Ark Code Latest', provider: 'volcengine' },
    { id: 'volcengine::doubao-seed-2.0-code', name: 'Doubao Seed 2.0 Code', provider: 'volcengine' },
  ],
}

async function getAvailableCloudModels(settings: any, fetchDynamic: boolean = false) {
  const availableModels: Array<{ id: string; name: string; provider: string }> = []
  
  for (const [provider, models] of Object.entries(CLOUD_MODELS)) {
    const apiKeyField = `${provider}Key`
    const hasApiKey = settings[apiKeyField] && settings[apiKeyField].trim().length > 0
    
    if (hasApiKey) {
      availableModels.push(...models)
      
      // Dynamic fetch for OpenAI compatible proxies
      if (provider === 'openai' && fetchDynamic) {
        try {
          const baseUrl = (settings.openaiApiBase || 'https://api.openai.com/v1').replace(/\/$/, '')
          const res = await fetch(`${baseUrl}/models`, {
            headers: {
              'Authorization': `Bearer ${settings.openaiKey}`
            },
            signal: AbortSignal.timeout(5000)
          })
          if (res.ok) {
            const data = await res.json()
            if (data && Array.isArray(data.data)) {
              for (const m of data.data) {
                const modelId = `openai::${m.id}`
                if (!availableModels.find(x => x.id === modelId)) {
                  availableModels.push({
                    id: modelId,
                    name: m.id,
                    provider: 'openai'
                  })
                }
              }
            }
          }
        } catch (e) {
          console.warn('[Models API] Failed to fetch dynamic models from OpenAI proxy:', e)
        }
      }

      // Dynamic fetch for Volcengine
      if (provider === 'volcengine' && fetchDynamic) {
        try {
          const res = await fetch('https://ark.cn-beijing.volces.com/api/coding/v3/models', {
            headers: {
              'Authorization': `Bearer ${settings.volcengineKey}`
            },
            signal: AbortSignal.timeout(5000)
          })
          if (res.ok) {
            const data = await res.json()
            if (data && Array.isArray(data.data)) {
              for (const m of data.data) {
                const modelId = `volcengine::${m.id}`
                if (!availableModels.find(x => x.id === modelId)) {
                  availableModels.push({
                    id: modelId,
                    name: m.id,
                    provider: 'volcengine'
                  })
                }
              }
            }
          }
        } catch (e) {
          console.warn('[Models API] Failed to fetch dynamic models from Volcengine:', e)
        }
      }
    }
  }
  
  return availableModels
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const action = searchParams.get('action')
  const refresh = searchParams.get('refresh')
  const all = searchParams.get('all')

  if (refresh === 'true' || all === 'true' || (!action && !refresh && !all)) {
    try {
      const settings = await prisma.settings.findUnique({ where: { id: 'default' } })
      
      const localModels = await scanLocalGgufModels(refresh === 'true')
      
      // When refreshing or requesting all, we try to fetch dynamic models from the proxy
      const cloudModels = await getAvailableCloudModels(settings || {}, all === 'true' || refresh === 'true')
      
      // Merge manually added custom models
      let customList: Array<{ id: string; name: string; provider: string }> = []
      if ((settings as any)?.customModels) {
        try {
          customList = JSON.parse((settings as any).customModels)
        } catch (e) {
          console.error('[Models API] Failed to parse customModels:', e)
        }
      }
      for (const cm of customList) {
        if (!cloudModels.find(m => m.id === cm.id)) {
          cloudModels.push(cm)
        }
      }
      
      // For all === 'true', we also want to include the static fallback models just in case they aren't configured yet
      if (all === 'true') {
        const staticModels = Object.values(CLOUD_MODELS).flat()
        for (const sm of staticModels) {
          if (!cloudModels.find(m => m.id === sm.id)) {
            cloudModels.push(sm)
          }
        }
      }
      
      let models = [...cloudModels, ...localModels]

      if (all !== 'true') {
        let enabledList: string[] = []
        const rawEnabledModels = (settings as any)?.enabledModels
        if (rawEnabledModels) {
          try {
            enabledList = JSON.parse(rawEnabledModels)
          } catch (e) {
            console.error('[Models API] Failed to parse enabledModels:', e)
          }
        }
        if (Array.isArray(enabledList) && enabledList.length > 0) {
          models = models.filter(m => enabledList.includes(m.id))
        }
      }

      return NextResponse.json({ models })
    } catch (error) {
      console.error('[Models API] Error fetching models:', error)
      return NextResponse.json({ models: [] })
    }
  }

  if (action === 'list') {
    const performances = await prisma.modelPerformance.findMany({
      orderBy: { timestamp: 'desc' },
      take: 100
    })
    return NextResponse.json({ performances })
  }

  if (action === 'stats') {
    const stats = await prisma.modelPerformance.groupBy({
      by: ['model', 'provider', 'status'],
      _avg: { latency: true, tokensUsed: true, cost: true },
      _count: { id: true }
    })

    const summary = await prisma.modelPerformance.aggregate({
      _avg: { latency: true, tokensUsed: true, cost: true },
      _count: { id: true },
      _min: { latency: true },
      _max: { latency: true }
    })

    return NextResponse.json({ stats, summary })
  }

  if (action === 'embedding-models') {
    const models = [
      { id: 'text-embedding-3-small', name: 'OpenAI text-embedding-3-small', dimensions: 1536, provider: 'openai' },
      { id: 'text-embedding-3-large', name: 'OpenAI text-embedding-3-large', dimensions: 3072, provider: 'openai' },
      { id: 'bge-large-zh-v1.5', name: 'BAAI/bge-large-zh-v1.5', dimensions: 1024, provider: 'huggingface' },
      { id: 'bge-m3', name: 'BAAI/bge-m3', dimensions: 1024, provider: 'huggingface' },
      { id: 'nomic-embed-text', name: 'Nomic Embed Text', dimensions: 768, provider: 'ollama' },
      { id: 'm3e-base', name: 'Moka/m3e-base', dimensions: 768, provider: 'huggingface' }
    ]
    return NextResponse.json({ models })
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const action = searchParams.get('action')
  const body = await req.json()

  if (action === 'record') {
    const performance = await prisma.modelPerformance.create({
      data: {
        model: body.model,
        provider: body.provider,
        latency: body.latency,
        tokensUsed: body.tokensUsed || 0,
        cost: body.cost || 0,
        status: body.status || 'success'
      }
    })
    return NextResponse.json({ performance })
  }

  if (action === 'configure-embedding') {
    const { model, dimensions, apiKey, baseUrl } = body
    return NextResponse.json({
      configured: true,
      model,
      dimensions,
      provider: model.split('-')[0]
    })
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
}
