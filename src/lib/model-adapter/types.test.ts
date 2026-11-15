import { describe, it, expect } from 'vitest'
import { parseModelId, getProviderInfo } from '@/lib/model-adapter/types'
import type { ProviderType } from '@/lib/model-adapter/types'

describe('parseModelId', () => {
  it('should parse ollama model without prefix', () => {
    const result = parseModelId('llama3')
    expect(result).toEqual({ provider: 'ollama', model: 'llama3' })
  })

  it('should parse openai model with prefix', () => {
    const result = parseModelId('openai::gpt-4')
    expect(result).toEqual({ provider: 'openai', model: 'gpt-4' })
  })

  it('should parse deepseek model with prefix', () => {
    const result = parseModelId('deepseek::deepseek-chat')
    expect(result).toEqual({ provider: 'deepseek', model: 'deepseek-chat' })
  })

  it('should parse local-gguf model with prefix', () => {
    const result = parseModelId('local-gguf::my-model.gguf')
    expect(result).toEqual({ provider: 'local-gguf', model: 'my-model.gguf' })
  })

  it('should parse minimax model', () => {
    const result = parseModelId('minimax::abab6.5s-chat')
    expect(result).toEqual({ provider: 'minimax', model: 'abab6.5s-chat' })
  })

  it('should parse openrouter model', () => {
    const result = parseModelId('openrouter::anthropic/claude-3')
    expect(result).toEqual({ provider: 'openrouter', model: 'anthropic/claude-3' })
  })

  it('should parse nvidia model', () => {
    const result = parseModelId('nvidia::meta/llama3-70b')
    expect(result).toEqual({ provider: 'nvidia', model: 'meta/llama3-70b' })
  })

  it('should handle model id with multiple colons', () => {
    const result = parseModelId('openai::gpt-4::turbo')
    expect(result.provider).toBe('openai')
    expect(result.model).toBe('gpt-4::turbo')
  })

  it('should parse volcengine model with prefix', () => {
    const result = parseModelId('volcengine::ark-code-latest')
    expect(result).toEqual({ provider: 'volcengine', model: 'ark-code-latest' })
  })
})

describe('getProviderInfo', () => {
  it('should return info for ollama', () => {
    const info = getProviderInfo('ollama')
    expect(info.type).toBe('ollama')
    expect(info.name).toBe('Ollama')
    expect(info.maxConcurrency).toBe(2)
    expect(info.requiresApiKey).toBe(false)
  })

  it('should return info for openai', () => {
    const info = getProviderInfo('openai')
    expect(info.type).toBe('openai')
    expect(info.name).toBe('OpenAI')
    expect(info.maxConcurrency).toBe(5)
    expect(info.requiresApiKey).toBe(true)
  })

  it('should return info for local-gguf', () => {
    const info = getProviderInfo('local-gguf')
    expect(info.type).toBe('local-gguf')
    expect(info.maxConcurrency).toBe(1)
    expect(info.requiresApiKey).toBe(false)
  })

  it('should return info for all provider types', () => {
    const providers: ProviderType[] = [
      'ollama', 'lmstudio', 'openai', 'deepseek', 'minimax',
      'openrouter', 'nvidia', 'anthropic', 'google', 'groq',
      'mistral', 'zhipu', 'lingyi', 'volcengine', 'local-gguf',
    ]
    for (const p of providers) {
      const info = getProviderInfo(p)
      expect(info.type).toBe(p)
      expect(info.name).toBeTruthy()
      expect(info.maxConcurrency).toBeGreaterThan(0)
    }
  })
})
