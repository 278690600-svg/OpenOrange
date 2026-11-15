import { describe, it, expect } from 'vitest'
import {
  DEFAULT_OLLAMA_URL,
  DEFAULT_LMSTUDIO_URL,
  DEEPSEEK_API_BASE,
  MINIMAX_API_BASE,
  OPENROUTER_API_BASE,
  NVIDIA_API_BASE,
  MODEL_PROBE_TIMEOUT,
  CRAWL_TIMEOUT,
  MAX_CRAWL_TEXT_LENGTH,
  CHAT_REQUEST_TIMEOUT,
  PERSIST_INTERVAL_MS,
  PERSIST_MIN_LENGTH,
} from '@/lib/constants'

describe('Constants', () => {
  it('should have correct default URLs', () => {
    expect(DEFAULT_OLLAMA_URL).toBe('http://127.0.0.1:11434')
    expect(DEFAULT_LMSTUDIO_URL).toBe('http://127.0.0.1:1234')
  })

  it('should have correct API base URLs', () => {
    expect(DEEPSEEK_API_BASE).toBe('https://api.deepseek.com')
    expect(MINIMAX_API_BASE).toBe('https://api.minimaxi.com/v1')
    expect(OPENROUTER_API_BASE).toBe('https://openrouter.ai/api/v1')
    expect(NVIDIA_API_BASE).toBe('https://integrate.api.nvidia.com/v1')
  })

  it('should have reasonable timeout values', () => {
    expect(MODEL_PROBE_TIMEOUT).toBe(1500)
    expect(CRAWL_TIMEOUT).toBe(8000)
    expect(CHAT_REQUEST_TIMEOUT).toBe(300_000)
  })

  it('should have reasonable persistence values', () => {
    expect(PERSIST_INTERVAL_MS).toBe(3000)
    expect(PERSIST_MIN_LENGTH).toBe(500)
    expect(MAX_CRAWL_TEXT_LENGTH).toBe(2000)
  })

  it('should have all timeouts as positive numbers', () => {
    expect(MODEL_PROBE_TIMEOUT).toBeGreaterThan(0)
    expect(CRAWL_TIMEOUT).toBeGreaterThan(0)
    expect(CHAT_REQUEST_TIMEOUT).toBeGreaterThan(0)
    expect(PERSIST_INTERVAL_MS).toBeGreaterThan(0)
    expect(PERSIST_MIN_LENGTH).toBeGreaterThan(0)
  })
})
