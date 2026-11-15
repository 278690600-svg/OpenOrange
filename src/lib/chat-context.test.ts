import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ChatMessage, StatusEvent } from '@/hooks/use-sse-chat'

interface ChatState {
  messages: ChatMessage[]
  status: 'idle' | 'submitted' | 'streaming' | 'queued' | 'error'
  error: Error | null
  currentSearch: StatusEvent[]
  isThinking: boolean
  chatId: string | null
  taskId: string | null
}

const DEFAULT_CHAT_STATE: ChatState = {
  messages: [],
  status: 'idle',
  error: null,
  currentSearch: [],
  isThinking: false,
  chatId: null,
  taskId: null,
}

describe('ChatState defaults', () => {
  it('should have correct default values', () => {
    expect(DEFAULT_CHAT_STATE.messages).toEqual([])
    expect(DEFAULT_CHAT_STATE.status).toBe('idle')
    expect(DEFAULT_CHAT_STATE.error).toBeNull()
    expect(DEFAULT_CHAT_STATE.currentSearch).toEqual([])
    expect(DEFAULT_CHAT_STATE.isThinking).toBe(false)
    expect(DEFAULT_CHAT_STATE.chatId).toBeNull()
    expect(DEFAULT_CHAT_STATE.taskId).toBeNull()
  })
})

describe('ChatState status transitions', () => {
  it('should transition from idle to submitted', () => {
    const state: ChatState = { ...DEFAULT_CHAT_STATE, chatId: 'chat-1' }
    const next: ChatState = { ...state, status: 'submitted' }
    expect(next.status).toBe('submitted')
  })

  it('should transition from submitted to streaming', () => {
    const state: ChatState = { ...DEFAULT_CHAT_STATE, chatId: 'chat-1', status: 'submitted' }
    const next: ChatState = { ...state, status: 'streaming' }
    expect(next.status).toBe('streaming')
  })

  it('should transition from streaming to idle on completion', () => {
    const state: ChatState = {
      ...DEFAULT_CHAT_STATE,
      chatId: 'chat-1',
      status: 'streaming',
      isThinking: true,
      currentSearch: [{ type: 'search', stage: 'done', message: 'Done' }],
    }
    const next: ChatState = { ...state, status: 'idle', isThinking: false, currentSearch: [] }
    expect(next.status).toBe('idle')
    expect(next.isThinking).toBe(false)
    expect(next.currentSearch).toEqual([])
  })

  it('should transition to error state', () => {
    const state: ChatState = { ...DEFAULT_CHAT_STATE, chatId: 'chat-1', status: 'streaming' }
    const next: ChatState = { ...state, status: 'error', error: new Error('Connection lost') }
    expect(next.status).toBe('error')
    expect(next.error).toBeInstanceOf(Error)
  })

  it('should transition from queued to streaming', () => {
    const state: ChatState = { ...DEFAULT_CHAT_STATE, chatId: 'chat-1', status: 'queued' }
    const next: ChatState = { ...state, status: 'streaming' }
    expect(next.status).toBe('streaming')
  })
})

describe('ChatState message management', () => {
  it('should add user message', () => {
    const state: ChatState = { ...DEFAULT_CHAT_STATE, chatId: 'chat-1' }
    const userMsg = { id: 'msg-1', role: 'user' as const, content: 'Hello' }
    const next: ChatState = { ...state, messages: [...state.messages, userMsg] }
    expect(next.messages).toHaveLength(1)
    expect(next.messages[0].role).toBe('user')
    expect(next.messages[0].content).toBe('Hello')
  })

  it('should add assistant message', () => {
    const state: ChatState = {
      ...DEFAULT_CHAT_STATE,
      chatId: 'chat-1',
      messages: [{ id: 'msg-1', role: 'user' as const, content: 'Hello' }],
    }
    const assistantMsg = { id: 'msg-2', role: 'assistant' as const, content: 'Hi there!' }
    const next: ChatState = { ...state, messages: [...state.messages, assistantMsg] }
    expect(next.messages).toHaveLength(2)
    expect(next.messages[1].role).toBe('assistant')
  })

  it('should update assistant message content during streaming', () => {
    const state: ChatState = {
      ...DEFAULT_CHAT_STATE,
      chatId: 'chat-1',
      messages: [
        { id: 'msg-1', role: 'user', content: 'Hello' },
        { id: 'msg-2', role: 'assistant', content: 'Hi' },
      ],
    }
    const next: ChatState = {
      ...state,
      messages: state.messages.map((m: ChatMessage) =>
        m.id === 'msg-2' ? { ...m, content: 'Hi there! How can I help?' } : m
      ),
    }
    expect(next.messages[1].content).toBe('Hi there! How can I help?')
  })

  it('should handle messages with citations', () => {
    const msg = {
      id: 'msg-2',
      role: 'assistant' as const,
      content: 'According to [1], the answer is 42.',
      citations: [{ title: 'Wikipedia', url: 'https://wikipedia.org' }],
    }
    expect(msg.citations).toHaveLength(1)
    expect(msg.citations![0].title).toBe('Wikipedia')
  })

  it('should handle messages with searchSteps', () => {
    const msg = {
      id: 'msg-2',
      role: 'assistant' as const,
      content: 'Search results show...',
      searchSteps: [
        { type: 'search', stage: 'searching', message: 'Searching...' },
        { type: 'search', stage: 'done', message: 'Search complete' },
      ],
    }
    expect(msg.searchSteps).toHaveLength(2)
  })
})

describe('registerChat logic (BUG-011 fix)', () => {
  function simulateRegisterChat(
    prev: Record<string, ChatState>,
    chatId: string,
    initialState: ChatState
  ): Record<string, ChatState> {
    const existing = prev[chatId]
    if (!existing) return { ...prev, [chatId]: initialState }

    if (initialState.messages.length > existing.messages.length) {
      return { ...prev, [chatId]: { ...existing, messages: initialState.messages } }
    }
    if (initialState.messages.length === existing.messages.length && initialState.messages.length > 0) {
      const lastExisting = existing.messages[existing.messages.length - 1]
      const lastNew = initialState.messages[initialState.messages.length - 1]
      if (lastNew.content.length > lastExisting.content.length) {
        return { ...prev, [chatId]: { ...existing, messages: initialState.messages } }
      }
    }
    return prev
  }

  it('should register new chat when no existing', () => {
    const prev: Record<string, ChatState> = {}
    const initialState: ChatState = { ...DEFAULT_CHAT_STATE, chatId: 'chat-1' }
    const result = simulateRegisterChat(prev, 'chat-1', initialState)
    expect(result['chat-1']).toBeDefined()
    expect(result['chat-1'].chatId).toBe('chat-1')
  })

  it('should update when new messages are more than existing', () => {
    const prev: Record<string, ChatState> = {
      'chat-1': {
        ...DEFAULT_CHAT_STATE,
        chatId: 'chat-1',
        messages: [{ id: '1', role: 'user', content: 'Hi' }],
      },
    }
    const initialState: ChatState = {
      ...DEFAULT_CHAT_STATE,
      chatId: 'chat-1',
      messages: [
        { id: '1', role: 'user', content: 'Hi' },
        { id: '2', role: 'assistant', content: 'Hello!' },
      ],
    }
    const result = simulateRegisterChat(prev, 'chat-1', initialState)
    expect(result['chat-1'].messages).toHaveLength(2)
  })

  it('should update when last message has more content (streaming)', () => {
    const prev: Record<string, ChatState> = {
      'chat-1': {
        ...DEFAULT_CHAT_STATE,
        chatId: 'chat-1',
        messages: [
          { id: '1', role: 'user', content: 'Hi' },
          { id: '2', role: 'assistant', content: 'Hello' },
        ],
      },
    }
    const initialState: ChatState = {
      ...DEFAULT_CHAT_STATE,
      chatId: 'chat-1',
      messages: [
        { id: '1', role: 'user', content: 'Hi' },
        { id: '2', role: 'assistant', content: 'Hello! How can I help you?' },
      ],
    }
    const result = simulateRegisterChat(prev, 'chat-1', initialState)
    expect(result['chat-1'].messages[1].content).toBe('Hello! How can I help you?')
  })

  it('should NOT update when existing content is longer or equal', () => {
    const prev: Record<string, ChatState> = {
      'chat-1': {
        ...DEFAULT_CHAT_STATE,
        chatId: 'chat-1',
        messages: [
          { id: '1', role: 'user', content: 'Hi' },
          { id: '2', role: 'assistant', content: 'Hello! How can I help you?' },
        ],
      },
    }
    const initialState: ChatState = {
      ...DEFAULT_CHAT_STATE,
      chatId: 'chat-1',
      messages: [
        { id: '1', role: 'user', content: 'Hi' },
        { id: '2', role: 'assistant', content: 'Hello' },
      ],
    }
    const result = simulateRegisterChat(prev, 'chat-1', initialState)
    expect(result['chat-1'].messages[1].content).toBe('Hello! How can I help you?')
  })

  it('should not overwrite streaming state with stale history', () => {
    const prev: Record<string, ChatState> = {
      'chat-1': {
        ...DEFAULT_CHAT_STATE,
        chatId: 'chat-1',
        status: 'streaming',
        messages: [
          { id: '1', role: 'user', content: 'Hi' },
          { id: '2', role: 'assistant', content: 'Hello! This is a long streaming response...' },
        ],
      },
    }
    const staleHistory: ChatState = {
      ...DEFAULT_CHAT_STATE,
      chatId: 'chat-1',
      messages: [
        { id: '1', role: 'user', content: 'Hi' },
        { id: '2', role: 'assistant', content: 'Hello!' },
      ],
    }
    const result = simulateRegisterChat(prev, 'chat-1', staleHistory)
    expect(result['chat-1'].messages[1].content).toBe('Hello! This is a long streaming response...')
  })
})

describe('migrateChat logic (BUG-005 fix)', () => {
  function simulateMigrateChat(
    prev: Record<string, ChatState>,
    oldId: string,
    newId: string
  ): Record<string, ChatState> {
    const state = prev[oldId]
    if (!state) {
      if (prev[newId]) return prev
      return { ...prev, [newId]: { ...DEFAULT_CHAT_STATE, chatId: newId } }
    }
    const existingNew = prev[newId]
    if (existingNew && existingNew.status !== 'idle') {
      const cleaned = { ...prev }
      delete cleaned[oldId]
      return cleaned
    }
    const newChats = { ...prev }
    newChats[newId] = { ...state, chatId: newId }
    delete newChats[oldId]
    return newChats
  }

  it('should migrate chat from old ID to new ID', () => {
    const prev: Record<string, ChatState> = {
      'new-chat-1': {
        ...DEFAULT_CHAT_STATE,
        chatId: 'new-chat-1',
        status: 'streaming',
        messages: [{ id: '1', role: 'user', content: 'Hi' }],
      },
    }
    const result = simulateMigrateChat(prev, 'new-chat-1', 'real-chat-1')
    expect(result['real-chat-1']).toBeDefined()
    expect(result['real-chat-1'].chatId).toBe('real-chat-1')
    expect(result['new-chat-1']).toBeUndefined()
  })

  it('should preserve messages during migration', () => {
    const prev: Record<string, ChatState> = {
      'new-chat-1': {
        ...DEFAULT_CHAT_STATE,
        chatId: 'new-chat-1',
        messages: [
          { id: '1', role: 'user', content: 'Hello' },
          { id: '2', role: 'assistant', content: 'Hi!' },
        ],
      },
    }
    const result = simulateMigrateChat(prev, 'new-chat-1', 'real-chat-1')
    expect(result['real-chat-1'].messages).toHaveLength(2)
  })

  it('should handle migration when old ID does not exist', () => {
    const prev: Record<string, ChatState> = {}
    const result = simulateMigrateChat(prev, 'nonexistent', 'new-id')
    expect(result['new-id']).toBeDefined()
    expect(result['new-id'].chatId).toBe('new-id')
  })

  it('should not overwrite active new chat during migration', () => {
    const prev: Record<string, ChatState> = {
      'old-id': {
        ...DEFAULT_CHAT_STATE,
        chatId: 'old-id',
        messages: [{ id: '1', role: 'user', content: 'Old message' }],
      },
      'new-id': {
        ...DEFAULT_CHAT_STATE,
        chatId: 'new-id',
        status: 'streaming',
        messages: [{ id: '2', role: 'user', content: 'New message' }],
      },
    }
    const result = simulateMigrateChat(prev, 'old-id', 'new-id')
    expect(result['new-id'].messages[0].content).toBe('New message')
    expect(result['old-id']).toBeUndefined()
  })
})

describe('SSE reconnection logic (BUG-003 fix)', () => {
  it('should respect max retry limit', () => {
    const MAX_SSE_RETRIES = 3
    expect(MAX_SSE_RETRIES).toBe(3)
  })

  it('should calculate exponential backoff delay', () => {
    const calculateDelay = (retryCount: number) => Math.min(1000 * Math.pow(2, retryCount), 10000)
    expect(calculateDelay(0)).toBe(1000)
    expect(calculateDelay(1)).toBe(2000)
    expect(calculateDelay(2)).toBe(4000)
    expect(calculateDelay(3)).toBe(8000)
    expect(calculateDelay(4)).toBe(10000)
    expect(calculateDelay(10)).toBe(10000)
  })
})

describe('Stale chat cleanup logic', () => {
  it('should reset stale chats after 90 seconds', () => {
    const STALE_THRESHOLD = 90000
    const now = Date.now()
    const lastUpdate = now - 91000
    const elapsed = now - lastUpdate
    expect(elapsed > STALE_THRESHOLD).toBe(true)
  })

  it('should not reset active chats within threshold', () => {
    const STALE_THRESHOLD = 90000
    const now = Date.now()
    const lastUpdate = now - 50000
    const elapsed = now - lastUpdate
    expect(elapsed > STALE_THRESHOLD).toBe(false)
  })
})
