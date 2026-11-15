export type ProviderType =
  | 'ollama'
  | 'lmstudio'
  | 'openai'
  | 'deepseek'
  | 'minimax'
  | 'openrouter'
  | 'nvidia'
  | 'anthropic'
  | 'google'
  | 'groq'
  | 'mistral'
  | 'zhipu'
  | 'lingyi'
  | 'volcengine'
  | 'local-gguf'

export interface ModelMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface InferenceOptions {
  model: string
  messages: ModelMessage[]
  systemPrompt?: string
  temperature?: number
  topP?: number
  maxTokens?: number
  signal?: AbortSignal
  tools?: Record<string, unknown>
  toolChoice?: string
  images?: string[]
  deepThink?: boolean
}

export interface InferenceResult {
  stream: AsyncGenerator<string, void, unknown>
  provider: ProviderType
  resolvedModelId: string
}

export interface ProviderInfo {
  type: ProviderType
  name: string
  maxConcurrency: number
  requiresApiKey: boolean
}

export function parseModelId(modelId: string): { provider: ProviderType; model: string } {
  if (modelId.startsWith('local-gguf::')) {
    return { provider: 'local-gguf', model: modelId.replace('local-gguf::', '') }
  }
  const sep = modelId.indexOf('::')
  if (sep === -1) {
    const knownModelPrefixes: [RegExp, ProviderType][] = [
      [/^gpt-/i, 'openai'],
      [/^o[134]-/i, 'openai'],
      [/^chatgpt-/i, 'openai'],
      [/^deepseek/i, 'deepseek'],
      [/^MiniMax/i, 'minimax'],
      [/^abab/i, 'minimax'],
    ]
    for (const [regex, provider] of knownModelPrefixes) {
      if (regex.test(modelId)) {
        console.warn(`[parseModelId] Model ID "${modelId}" missing provider prefix, auto-detected as ${provider}`)
        return { provider, model: modelId }
      }
    }
    console.warn(`[parseModelId] Model ID "${modelId}" has no provider prefix and could not be auto-detected, defaulting to ollama`)
    return { provider: 'ollama', model: modelId }
  }
  return {
    provider: modelId.substring(0, sep) as ProviderType,
    model: modelId.substring(sep + 2),
  }
}

export function getProviderInfo(type: ProviderType): ProviderInfo {
  const map: Record<ProviderType, ProviderInfo> = {
    ollama: { type: 'ollama', name: 'Ollama', maxConcurrency: 2, requiresApiKey: false },
    lmstudio: { type: 'lmstudio', name: 'LM Studio', maxConcurrency: 2, requiresApiKey: false },
    openai: { type: 'openai', name: 'OpenAI', maxConcurrency: 5, requiresApiKey: true },
    deepseek: { type: 'deepseek', name: 'DeepSeek', maxConcurrency: 3, requiresApiKey: true },
    minimax: { type: 'minimax', name: 'MiniMax', maxConcurrency: 3, requiresApiKey: true },
    openrouter: { type: 'openrouter', name: 'OpenRouter', maxConcurrency: 5, requiresApiKey: true },
    nvidia: { type: 'nvidia', name: 'NVIDIA', maxConcurrency: 3, requiresApiKey: true },
    anthropic: { type: 'anthropic', name: 'Anthropic', maxConcurrency: 3, requiresApiKey: true },
    google: { type: 'google', name: 'Google', maxConcurrency: 3, requiresApiKey: true },
    groq: { type: 'groq', name: 'Groq', maxConcurrency: 3, requiresApiKey: true },
    mistral: { type: 'mistral', name: 'Mistral', maxConcurrency: 3, requiresApiKey: true },
    zhipu: { type: 'zhipu', name: 'Zhipu', maxConcurrency: 3, requiresApiKey: true },
    lingyi: { type: 'lingyi', name: 'Lingyi', maxConcurrency: 3, requiresApiKey: true },
    volcengine: { type: 'volcengine', name: 'Volcengine (火山引擎)', maxConcurrency: 5, requiresApiKey: true },
    'local-gguf': { type: 'local-gguf', name: 'Local GGUF', maxConcurrency: 1, requiresApiKey: false },
  }
  return map[type]
}
