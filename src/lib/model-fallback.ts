import { parseModelId, getProviderInfo } from '@/lib/model-adapter'
import type { ProviderType } from '@/lib/model-adapter'

interface FallbackRule {
  primary: string
  fallback: string
  enabled: boolean
}

interface FallbackAttempt {
  model: string
  error: string
  timestamp: Date
}

const DEFAULT_FALLBACK_CHAINS: FallbackRule[] = [
  { primary: 'openai', fallback: 'deepseek', enabled: true },
  { primary: 'openai', fallback: 'openrouter', enabled: true },
  { primary: 'deepseek', fallback: 'openrouter', enabled: true },
  { primary: 'minimax', fallback: 'openrouter', enabled: true },
  { primary: 'nvidia', fallback: 'openrouter', enabled: true },
  { primary: 'anthropic', fallback: 'openrouter', enabled: true },
  { primary: 'google', fallback: 'openrouter', enabled: true },
  { primary: 'groq', fallback: 'openrouter', enabled: true },
  { primary: 'ollama', fallback: 'lmstudio', enabled: true },
  { primary: 'lmstudio', fallback: 'ollama', enabled: true },
]

const FALLBACK_MODEL_DEFAULTS: Record<string, string> = {
  openai: 'openai::gpt-4o-mini',
  deepseek: 'deepseek::deepseek-chat',
  openrouter: 'openrouter::anthropic/claude-3.5-haiku',
  minimax: 'minimax::MiniMax-M2.5',
  nvidia: 'nvidia::meta/llama-3.1-70b-instruct',
  anthropic: 'anthropic::claude-3-5-sonnet-20241022',
  google: 'google::gemini-2.0-flash',
  groq: 'groq::llama-3.3-70b-versatile',
  ollama: 'ollama::llama3.2',
  lmstudio: 'lmstudio::local-model',
}

export function shouldRetryWithFallback(error: string): boolean {
  if (!error) return false
  const lower = error.toLowerCase()
  const retryableErrors = [
    'econnrefused',
    'fetch failed',
    '401',
    'unauthorized',
    '429',
    'rate_limit',
    '500',
    'internal server error',
    'timeout',
    'etimedout',
    'socket hang up',
    'network error',
    'service unavailable',
    'bad gateway',
    'model not found',
    'context_length_exceeded',
  ]
  return retryableErrors.some(e => lower.includes(e))
}

export function getFallbackModel(primaryModelId: string, settings: Record<string, unknown>, attemptHistory: FallbackAttempt[]): string | null {
  const { provider: primaryProvider } = parseModelId(primaryModelId)
  
  const customFallback = settings[`${primaryProvider}FallbackModel`] as string
  if (customFallback && !attemptHistory.some(a => a.model === customFallback)) {
    return customFallback
  }

  const autoChains = settings?.autoFallbackChains as FallbackRule[]
  const chains = autoChains || DEFAULT_FALLBACK_CHAINS

  for (const rule of chains) {
    if (!rule.enabled) continue
    
    const ruleProvider = rule.primary as ProviderType
    if (ruleProvider === primaryProvider) {
      const fallbackProvider = rule.fallback as string
      const fallbackModelId = FALLBACK_MODEL_DEFAULTS[fallbackProvider]
      
      if (fallbackModelId && !attemptHistory.some(a => a.model === fallbackModelId)) {
        const fallbackKey = `${fallbackProvider}Key` as keyof typeof settings
        const hasApiKey = !!settings[fallbackKey]
        const isLocalProvider = ['ollama', 'lmstudio'].includes(fallbackProvider)
        
        if (hasApiKey || isLocalProvider) {
          return fallbackModelId
        }
      }
    }
  }

  return null
}

export function getModelDisplayName(modelId: string): string {
  const { provider } = parseModelId(modelId)
  const info = getProviderInfo(provider)
  const modelName = modelId.replace(/^[a-z-]+::/i, '')
  return `${info.name} / ${modelName}`
}

export function getAvailableFallbackModels(settings: Record<string, unknown>): string[] {
  const available: string[] = []
  
  for (const [provider, modelId] of Object.entries(FALLBACK_MODEL_DEFAULTS)) {
    const key = `${provider}Key`
    const hasApiKey = !!settings[key]
    const isLocalProvider = ['ollama', 'lmstudio'].includes(provider)
    
    if (hasApiKey || isLocalProvider) {
      available.push(modelId)
    }
  }
  
  return available
}

export type { FallbackRule, FallbackAttempt }
export { DEFAULT_FALLBACK_CHAINS, FALLBACK_MODEL_DEFAULTS }
