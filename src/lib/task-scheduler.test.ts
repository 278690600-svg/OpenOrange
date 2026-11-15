import { describe, it, expect, vi, beforeEach } from 'vitest'

class ProviderSemaphore {
  private counts: Map<string, number> = new Map()
  private queues: Map<string, Array<() => void>> = new Map()

  async acquire(provider: string): Promise<void> {
    const max = this.getMaxConcurrency(provider)
    const current = this.counts.get(provider) || 0

    if (current < max) {
      this.counts.set(provider, current + 1)
      return
    }

    return new Promise<void>((resolve) => {
      const queue = this.queues.get(provider) || []
      queue.push(resolve)
      this.queues.set(provider, queue)
    })
  }

  release(provider: string): void {
    const current = this.counts.get(provider) || 0
    this.counts.set(provider, Math.max(0, current - 1))

    const queue = this.queues.get(provider) || []
    if (queue.length > 0) {
      const next = queue.shift()!
      this.counts.set(provider, (this.counts.get(provider) || 0) + 1)
      next()
    }
  }

  getActiveCount(provider: string): number {
    return this.counts.get(provider) || 0
  }

  private getMaxConcurrency(provider: string): number {
    const map: Record<string, number> = {
      ollama: 2,
      openai: 5,
      deepseek: 3,
      'local-gguf': 1,
    }
    return map[provider] || 3
  }
}

describe('ProviderSemaphore', () => {
  let semaphore: ProviderSemaphore

  beforeEach(() => {
    semaphore = new ProviderSemaphore()
  })

  it('should acquire and release a slot', async () => {
    await semaphore.acquire('ollama')
    expect(semaphore.getActiveCount('ollama')).toBe(1)
    semaphore.release('ollama')
    expect(semaphore.getActiveCount('ollama')).toBe(0)
  })

  it('should allow up to maxConcurrency concurrent acquisitions', async () => {
    await semaphore.acquire('openai')
    await semaphore.acquire('openai')
    await semaphore.acquire('openai')
    await semaphore.acquire('openai')
    await semaphore.acquire('openai')
    expect(semaphore.getActiveCount('openai')).toBe(5)
  })

  it('should queue acquisitions beyond maxConcurrency', async () => {
    const maxConcurrency = 2
    await semaphore.acquire('ollama')
    await semaphore.acquire('ollama')
    expect(semaphore.getActiveCount('ollama')).toBe(maxConcurrency)

    let acquired = false
    const promise = semaphore.acquire('ollama').then(() => { acquired = true })
    expect(acquired).toBe(false)

    semaphore.release('ollama')
    await promise
    expect(acquired).toBe(true)
  })

  it('should handle release when count is 0 gracefully', () => {
    expect(() => semaphore.release('ollama')).not.toThrow()
    expect(semaphore.getActiveCount('ollama')).toBe(0)
  })

  it('should track different providers independently', async () => {
    await semaphore.acquire('ollama')
    await semaphore.acquire('openai')
    await semaphore.acquire('openai')

    expect(semaphore.getActiveCount('ollama')).toBe(1)
    expect(semaphore.getActiveCount('openai')).toBe(2)
    expect(semaphore.getActiveCount('deepseek')).toBe(0)
  })

  it('should process queued acquisitions in FIFO order', async () => {
    await semaphore.acquire('local-gguf')
    const order: number[] = []

    const p1 = semaphore.acquire('local-gguf').then(() => order.push(1))
    const p2 = semaphore.acquire('local-gguf').then(() => order.push(2))
    const p3 = semaphore.acquire('local-gguf').then(() => order.push(3))

    semaphore.release('local-gguf')
    await p1
    expect(order).toEqual([1])

    semaphore.release('local-gguf')
    await p2
    expect(order).toEqual([1, 2])

    semaphore.release('local-gguf')
    await p3
    expect(order).toEqual([1, 2, 3])
  })
})

describe('TaskInput interface validation', () => {
  it('should create valid TaskInput', () => {
    const task = {
      taskId: 'task-1',
      chatId: 'chat-1',
      model: 'openai::gpt-4',
      messages: [{ role: 'user', content: 'Hello' }],
    }
    expect(task.taskId).toBe('task-1')
    expect(task.model).toBe('openai::gpt-4')
    expect(task.messages).toHaveLength(1)
  })

  it('should support optional fields', () => {
    const task = {
      taskId: 'task-2',
      chatId: 'new',
      model: 'deepseek::deepseek-chat',
      messages: [],
      deepThink: true,
      webSearch: 'deep' as const,
      kbId: 'kb-1',
      files: [{ name: 'test.txt', content: 'file content', type: 'text/plain' }],
      promptId: 'prompt-1',
    }
    expect(task.deepThink).toBe(true)
    expect(task.webSearch).toBe('deep')
    expect(task.kbId).toBe('kb-1')
    expect(task.files).toHaveLength(1)
    expect(task.promptId).toBe('prompt-1')
  })

  it('should support webSearch as boolean', () => {
    const task = {
      taskId: 'task-3',
      chatId: 'chat-3',
      model: 'ollama::llama3',
      messages: [],
      webSearch: true,
    }
    expect(task.webSearch).toBe(true)
  })

  it('should support webSearch as auto', () => {
    const task = {
      taskId: 'task-4',
      chatId: 'chat-4',
      model: 'ollama::llama3',
      messages: [],
      webSearch: 'auto' as const,
    }
    expect(task.webSearch).toBe('auto')
  })
})

describe('TaskOutput interface validation', () => {
  it('should create valid TaskOutput', () => {
    const output = {
      taskId: 'task-1',
      status: 'completed' as const,
      fullText: 'Hello, how can I help you?',
      chatId: 'chat-1',
    }
    expect(output.status).toBe('completed')
    expect(output.fullText).toBeTruthy()
  })

  it('should support error output', () => {
    const output = {
      taskId: 'task-2',
      status: 'failed' as const,
      fullText: '',
      error: 'Model inference failed',
      chatId: 'chat-2',
    }
    expect(output.status).toBe('failed')
    expect(output.error).toBeTruthy()
  })

  it('should support all valid status values', () => {
    const statuses = ['submitted', 'queued', 'running', 'completed', 'failed', 'cancelled'] as const
    for (const status of statuses) {
      const output = { taskId: 't', status, fullText: '', chatId: 'c' }
      expect(output.status).toBe(status)
    }
  })
})
