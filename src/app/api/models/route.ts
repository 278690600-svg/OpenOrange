import { NextResponse } from 'next/server'
import prisma from '@/lib/db'

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

async function fetchJsonCandidates(baseUrl: string, paths: string[], init?: RequestInit) {
  const variants = Array.from(new Set([baseUrl, baseUrl.replace('127.0.0.1', 'localhost')]))

  for (const variant of variants) {
    for (const routePath of paths) {
      const url = joinUrl(variant, routePath)
      try {
        console.log(`[Models] probing ${url}`)
        const res = await fetch(url, {
          ...init,
          signal: AbortSignal.timeout(4000),
        })
        if (res.ok) return await res.json()
      } catch {
        // try next endpoint
      }
    }
  }

  return null
}

function toOpenAICompatibleModels(payload: unknown, provider: string, prefix: string) {
  if (!payload || typeof payload !== 'object' || !Array.isArray((payload as { data?: unknown[] }).data)) {
    return [] as ModelOption[]
  }

  return ((payload as { data: Array<{ id?: string }> }).data || [])
    .map((item) => item.id?.trim())
    .filter((id): id is string => Boolean(id))
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
    fetchJsonCandidates(ollamaUrl, ['/api/tags', '/v1/models']),
    fetchJsonCandidates(lmstudioUrl, ['/v1/models', '/models']),
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
    }
  )

  return toOpenAICompatibleModels(payload, provider, prefix)
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
      { id: 'minimax::MiniMax-M2.5', name: 'MiniMax-M2.5', provider: 'minimax' },
      { id: 'minimax::abab7-chat', name: 'abab7-chat', provider: 'minimax' }
    )
  }

  return models
}

export async function GET() {
  try {
    const settings = await prisma.settings.findUnique({ where: { id: 'default' } })

    const ollamaUrl = normalizeBaseUrl(settings?.ollamaUrl, 'http://127.0.0.1:11434')
    const lmstudioUrl = normalizeBaseUrl(settings?.lmstudioUrl, 'http://127.0.0.1:1234')

    const [localModels, openaiModels, deepseekModels, minimaxModels] = await Promise.all([
      discoverLocalModels(ollamaUrl, lmstudioUrl),
      discoverApiModels('https://api.openai.com', settings?.openaiKey || '', 'openai', 'openai::'),
      discoverApiModels('https://api.deepseek.com', settings?.deepseekKey || '', 'deepseek', 'deepseek::'),
      discoverApiModels('https://api.minimaxi.com', settings?.minimaxKey || '', 'minimax', 'minimax::'),
    ])

    let models = dedupeModels([
      ...localModels,
      ...openaiModels,
      ...deepseekModels,
      ...minimaxModels,
    ])

    if (models.length === 0) {
      models = dedupeModels(fallbackModels(settings || {}))
    }

    if (models.length === 0) {
      models = [{ id: 'ollama::llama3', name: 'llama3 (default)', provider: 'ollama' }]
    }

    return NextResponse.json({ models })
  } catch (error) {
    console.error('Models GET Error:', error)
    return NextResponse.json({ error: 'Failed to fetch models' }, { status: 500 })
  }
}
