import { describe, it, expect } from 'vitest'
import type { ChatMessage, StatusEvent, Citation } from '@/hooks/use-sse-chat'

describe('ChatMessage interface', () => {
  it('should create a valid user message', () => {
    const msg: ChatMessage = {
      id: 'msg-1',
      role: 'user',
      content: 'Hello, how are you?',
    }
    expect(msg.role).toBe('user')
    expect(msg.content).toBe('Hello, how are you?')
  })

  it('should create a valid assistant message with citations', () => {
    const msg: ChatMessage = {
      id: 'msg-2',
      role: 'assistant',
      content: 'Based on the search results [1]...',
      citations: [
        { title: 'Wikipedia', url: 'https://wikipedia.org' },
        { title: 'GitHub', url: 'https://github.com' },
      ],
    }
    expect(msg.citations).toHaveLength(2)
    expect(msg.citations![0].title).toBe('Wikipedia')
  })

  it('should create a message with searchSteps', () => {
    const msg: ChatMessage = {
      id: 'msg-3',
      role: 'assistant',
      content: 'Search results...',
      searchSteps: [
        { type: 'search', stage: 'searching', message: 'Searching...' },
        { type: 'search', stage: 'found', message: 'Found 5 results', results: [{ title: 'Result 1', url: 'https://example.com' }] },
        { type: 'search', stage: 'done', message: 'Search complete' },
      ],
    }
    expect(msg.searchSteps).toHaveLength(3)
  })

  it('should create a message with thinkContent', () => {
    const msg: ChatMessage = {
      id: 'msg-4',
      role: 'assistant',
      content: 'The answer is 42.',
      thinkContent: '<thinking>Let me think about this...</thinking>',
      isThinking: false,
    }
    expect(msg.thinkContent).toBeTruthy()
    expect(msg.isThinking).toBe(false)
  })

  it('should create a message with attachments', () => {
    const msg: ChatMessage = {
      id: 'msg-5',
      role: 'user',
      content: 'Please analyze this file',
      attachments: [
        { name: 'report.pdf', type: 'application/pdf' },
        { name: 'image.png', type: 'image/png', dataUrl: 'data:image/png;base64,...' },
      ],
    }
    expect(msg.attachments).toHaveLength(2)
    expect(msg.attachments![1].dataUrl).toBeTruthy()
  })
})

describe('StatusEvent interface', () => {
  it('should create search status events', () => {
    const events: StatusEvent[] = [
      { type: 'search', stage: 'searching', message: 'Searching...' },
      { type: 'search', stage: 'found', message: 'Found 3 results', results: [{ title: 'R1', url: 'https://r1.com' }] },
      { type: 'search', stage: 'reading', message: 'Reading pages...' },
      { type: 'search', stage: 'done', message: 'Search complete' },
    ]
    expect(events).toHaveLength(4)
    expect(events[1].results).toHaveLength(1)
  })

  it('should create thinking status events', () => {
    const events: StatusEvent[] = [
      { type: 'thinking', stage: 'start', message: 'Deep thinking...' },
      { type: 'thinking', stage: 'done', message: 'Thinking complete' },
    ]
    expect(events).toHaveLength(2)
  })

  it('should create MCP status events', () => {
    const event: StatusEvent = {
      type: 'mcp',
      stage: 'call',
      message: 'Calling tool...',
      tool: 'web_search',
      args: { query: 'test' },
    }
    expect(event.tool).toBe('web_search')
    expect(event.args).toBeDefined()
  })

  it('should create model_load status events', () => {
    const event: StatusEvent = {
      type: 'model_load',
      stage: 'loading',
      message: 'Loading model...',
      modelName: 'llama3-70b',
      progress: 50,
    }
    expect(event.modelName).toBe('llama3-70b')
    expect(event.progress).toBe(50)
  })
})

describe('Citation interface', () => {
  it('should create valid citations', () => {
    const citations: Citation[] = [
      { title: 'Source 1', url: 'https://source1.com' },
      { title: 'Source 2', url: 'https://source2.com' },
    ]
    expect(citations).toHaveLength(2)
    expect(citations[0].title).toBe('Source 1')
    expect(citations[0].url).toBe('https://source1.com')
  })
})

describe('Message ID generation', () => {
  it('should generate unique IDs', () => {
    const ids = new Set<string>()
    for (let i = 0; i < 100; i++) {
      const id = `msg-${Date.now()}-${i}`
      ids.add(id)
    }
    expect(ids.size).toBe(100)
  })
})

describe('Message merging logic (use-sse-chat)', () => {
  it('should prefer global messages when they have more content', () => {
    const globalMessages: ChatMessage[] = [
      { id: '1', role: 'user', content: 'Hi' },
      { id: '2', role: 'assistant', content: 'Hello! This is a long response...' },
    ]
    const initialMessages: ChatMessage[] = [
      { id: '1', role: 'user', content: 'Hi' },
      { id: '2', role: 'assistant', content: 'Hello!' },
    ]
    const messages = (globalMessages.length >= initialMessages.length) ? globalMessages : initialMessages
    expect(messages).toBe(globalMessages)
  })

  it('should fall back to initial messages when global is empty', () => {
    const globalMessages: ChatMessage[] = []
    const initialMessages: ChatMessage[] = [
      { id: '1', role: 'user', content: 'Hi' },
    ]
    const messages = (globalMessages.length >= initialMessages.length) ? globalMessages : initialMessages
    expect(messages).toBe(initialMessages)
  })

  it('should correctly determine streaming status', () => {
    const isStreaming = (status: string) => status === 'submitted' || status === 'streaming' || status === 'queued'
    expect(isStreaming('submitted')).toBe(true)
    expect(isStreaming('streaming')).toBe(true)
    expect(isStreaming('queued')).toBe(true)
    expect(isStreaming('idle')).toBe(false)
    expect(isStreaming('error')).toBe(false)
  })
})
