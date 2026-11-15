"use client"

import React, { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react'
import { ChatMessage, StatusEvent } from '@/hooks/use-sse-chat'

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

const ChatStateContext = createContext<Record<string, ChatState>>({})
const ChatActionsContext = createContext<{
  registerChat: (chatId: string, initialState: ChatState) => void
  updateChat: (chatId: string, update: Partial<ChatState> | ((prev: ChatState) => ChatState)) => void
  migrateChat: (oldId: string, newId: string) => void
  getChat: (chatId: string) => ChatState | undefined
  getMigratedChatId: (oldId: string) => string | undefined
  stopAll: () => void
  abortChat: (chatId: string) => void
  subscribeToTask: (chatId: string, taskId: string) => void
} | undefined>(undefined)

interface SSEConnectionState {
  eventSource: EventSource
  taskId: string
  chatId: string
  assistantId: string | null
  accumulatedText: string
  lastUpdateTime: number
  pendingUpdate: boolean
  retryCount: number
  isReconnecting?: boolean
}

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const [chats, setChats] = useState<Record<string, ChatState>>({})

  const chatsRef = useRef(chats)

  const activeAbortControllers = useRef<Record<string, AbortController>>({})
  const chatIdMappingRef = useRef<Map<string, string>>(new Map())
  const activeSSEConnections = useRef<Record<string, SSEConnectionState>>({})
  const MAX_SSE_RETRIES = 3
  const setupSSEConnectionRef = useRef<(chatId: string, taskId: string, retryCount: number) => void>(() => {})

  // Keep chatsRef in sync
  useEffect(() => {
    chatsRef.current = chats
  }, [chats])

  // Load chatIdMapping from sessionStorage on mount
  useEffect(() => {
    if (chatIdMappingRef.current.size === 0) {
      try {
        const stored = sessionStorage.getItem('chatIdMapping')
        if (stored) {
          const parsed = JSON.parse(stored)
          if (Array.isArray(parsed)) {
            chatIdMappingRef.current = new Map(parsed)
          }
        }
      } catch {}
    }
  }, [])

  // 超时清理：每30秒检查一次，如果chat状态超过90秒没有更新，且没有在重连，自动重置为idle
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now()
      setChats(prev => {
        let changed = false
        const next = { ...prev }
        for (const id of Object.keys(next)) {
          const chat = next[id]
          if (chat.status !== 'idle' && chat.status !== 'error') {
            const conn = activeSSEConnections.current[id]
            if (conn) {
              const elapsed = now - (conn.lastUpdateTime || 0)
              if (elapsed > 90000 && !conn.isReconnecting) {
                console.log(`[ChatContext] Stale chat ${id} (status=${chat.status}, ${Math.round(elapsed/1000)}s since last update), resetting to idle`)
                next[id] = { ...chat, status: 'idle', isThinking: false, currentSearch: [] }
                try {
                  conn.eventSource.close()
                } catch {}
                delete activeSSEConnections.current[id]
                if (typeof window !== 'undefined') {
                  window.dispatchEvent(new CustomEvent('chat-task-finished', { detail: { chatId: id } }))
                }
                changed = true
              }
            } else {
              // 没有SSE连接但状态不是idle，直接重置
              next[id] = { ...chat, status: 'idle', isThinking: false, currentSearch: [] }
              if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('chat-task-finished', { detail: { chatId: id } }))
              }
              changed = true
            }
          }
        }
        return changed ? next : prev
      })
    }, 30000)
    return () => clearInterval(interval)
  }, [])

  // BUG-FIX: 监听 chat-done-result 事件 - 当 Fast Refresh 导致 ChatProvider 重新挂载时，
  // 旧的 EventSource 回调更新的是已死的旧 state。通过 window 事件桥接，确保结果总能到达当前活跃的 Provider。
  useEffect(() => {
    const handleDoneResult = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (!detail?.chatId || !detail?.text) return
      const { chatId: resultChatId, text, searchSteps, citations } = detail
      console.log(`[ChatContext] chat-done-result received for ${resultChatId}, ${text.length} chars`)
      setChats(prev => {
        const curr = prev[resultChatId]
        if (!curr) return prev
        // 检查是否已有包含内容的助手消息
        const lastMsg = curr.messages[curr.messages.length - 1]
        if (lastMsg && lastMsg.role === 'assistant' && lastMsg.content && lastMsg.content.length > 10) {
          // 已经有内容了，只需确保状态为idle
          if (curr.status !== 'idle') {
            return { ...prev, [resultChatId]: { ...curr, status: 'idle', isThinking: false, currentSearch: [] } }
          }
          return prev
        }
        // 创建或更新助手消息
        const recoveryId = `msg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
        return {
          ...prev,
          [resultChatId]: {
            ...curr,
            status: 'idle',
            isThinking: false,
            currentSearch: [],
            messages: [...curr.messages, {
              id: recoveryId,
              role: 'assistant' as const,
              content: text,
              searchSteps: searchSteps || [],
              citations: citations || [],
              isThinking: false,
            }]
          }
        }
      })
    }
    window.addEventListener('chat-done-result', handleDoneResult)
    return () => window.removeEventListener('chat-done-result', handleDoneResult)
  }, [])

  // BUG-FIX: 监听实时流式文本事件 - 确保 Fast Refresh 后文本仍然实时显示
  useEffect(() => {
    const handleStreamingText = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (!detail?.chatId || !detail?.assistantId) return
      const { chatId: sChatId, assistantId, text, isNew } = detail
      setChats(prev => {
        const curr = prev[sChatId] || {
          chatId: sChatId,
          status: 'streaming',
          messages: [],
          currentSearch: [],
          isThinking: false,
        }
        const hasMsg = curr.messages.some(m => m.id === assistantId)
        if (isNew && !hasMsg) {
          return {
            ...prev,
            [sChatId]: {
              ...curr,
              status: 'streaming',
              messages: [...curr.messages, {
                id: assistantId,
                role: 'assistant' as const,
                content: '',
                searchSteps: [],
                citations: [],
                isThinking: false,
              }]
            }
          }
        }
        if (hasMsg && text !== undefined) {
          return {
            ...prev,
            [sChatId]: {
              ...curr,
              status: 'streaming',
              messages: curr.messages.map(m => m.id === assistantId ? { ...m, content: text } : m)
            }
          }
        }
        if (!hasMsg && text) {
          return {
            ...prev,
            [sChatId]: {
              ...curr,
              status: 'streaming',
              messages: [...curr.messages, {
                id: assistantId,
                role: 'assistant' as const,
                content: text,
                searchSteps: [],
                citations: [],
                isThinking: false,
              }]
            }
          }
        }
        return prev
      })
    }
    window.addEventListener('chat-streaming-text', handleStreamingText)
    return () => window.removeEventListener('chat-streaming-text', handleStreamingText)
  }, [])

  const persistMapping = useCallback(() => {
    try {
      const entries = Array.from(chatIdMappingRef.current.entries())
      sessionStorage.setItem('chatIdMapping', JSON.stringify(entries))
    } catch {}
  }, [])

  const registerChat = useCallback((chatId: string, initialState: ChatState) => {
    setChats(prev => {
      const existing = prev[chatId]
      if (!existing) return { ...prev, [chatId]: initialState }
      if (initialState.messages.length > existing.messages.length) {
        return { ...prev, [chatId]: { ...existing, messages: initialState.messages } }
      }
      if (existing.messages.length === 0 && initialState.messages.length > 0) {
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
    })
  }, [])

  const updateChat = useCallback((chatId: string, update: Partial<ChatState> | ((prev: ChatState) => ChatState)) => {
    setChats(prev => {
      const current = prev[chatId] || { ...DEFAULT_CHAT_STATE, chatId }
      const next = typeof update === 'function' ? update(current) : { ...current, ...update }
      return { ...prev, [chatId]: next }
    })
  }, [])

  // BUG-005 FIX: 完整的chatId迁移，同步所有状态
  const migrateChat = useCallback((oldId: string, newId: string) => {
    chatIdMappingRef.current.set(oldId, newId)
    persistMapping()
    setChats(prev => {
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
    })
    // BUG-005 FIX: 同步迁移所有关联状态
    if (activeAbortControllers.current[oldId]) {
      activeAbortControllers.current[newId] = activeAbortControllers.current[oldId]
      delete activeAbortControllers.current[oldId]
    }
    if (activeSSEConnections.current[oldId]) {
      activeSSEConnections.current[newId] = activeSSEConnections.current[oldId]
      activeSSEConnections.current[newId].chatId = newId
      delete activeSSEConnections.current[oldId]
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('chat-updated'))
      window.dispatchEvent(new CustomEvent('chat-id-migrated', {
        detail: { oldId, newId }
      }))
    }
  }, [persistMapping])

  const getChat = useCallback((chatId: string) => {
    return chatsRef.current[chatId]
  }, [])

  const getMigratedChatId = useCallback((oldId: string) => {
    return chatIdMappingRef.current.get(oldId)
  }, [])

  // BUG-007 FIX: 安全关闭SSE连接
  const closeSSEConnection = useCallback((chatId: string) => {
    const conn = activeSSEConnections.current[chatId]
    if (conn) {
      conn.eventSource.close()
      delete activeSSEConnections.current[chatId]
    }
  }, [])

  const abortChat = useCallback((chatId: string) => {
    const controller = activeAbortControllers.current[chatId]
    if (controller) {
      controller.abort()
      delete activeAbortControllers.current[chatId]
    }
    closeSSEConnection(chatId)

    const state = chatsRef.current[chatId]
    if (state?.taskId) {
      fetch('/api/chat/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId: state.taskId }),
      }).catch(() => {})
    }

    updateChat(chatId, {
      status: 'idle',
      isThinking: false,
      currentSearch: [],
    })
    // BUG-001 FIX: 通知 sendingRef 重置
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('chat-task-finished', {
        detail: { chatId }
      }))
    }
  }, [updateChat, closeSSEConnection])

  const stopAll = useCallback(() => {
    Object.keys(activeAbortControllers.current).forEach(id => {
      activeAbortControllers.current[id]?.abort()
      delete activeAbortControllers.current[id]
    })
    // BUG-007 FIX: 正确关闭所有SSE连接
    Object.keys(activeSSEConnections.current).forEach(id => {
      const conn = activeSSEConnections.current[id]
      if (conn) conn.eventSource.close()
      delete activeSSEConnections.current[id]
    })
    setChats(prev => {
      const next = { ...prev }
      Object.keys(next).forEach(id => {
        if (next[id].status !== 'idle') {
          next[id] = { ...next[id], status: 'idle', isThinking: false, currentSearch: [] }
        }
      })
      return next
    })
    window.dispatchEvent(new CustomEvent('stop-all-chats'))
  }, [])

  // BUG-003 FIX: SSE 重连逻辑
  const reconnectSSE = useCallback((chatId: string, taskId: string, retryCount: number) => {
    if (retryCount >= MAX_SSE_RETRIES) {
      console.log(`[ChatContext] Max retries reached for ${chatId}, giving up`)
      updateChat(chatId, { status: 'error', error: new Error('连接断开，请重试'), isThinking: false })
      closeSSEConnection(chatId)
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('chat-task-error', {
          detail: { chatId }
        }))
      }
      return
    }

    const delay = Math.min(1000 * Math.pow(2, retryCount), 10000)
    console.log(`[ChatContext] Reconnecting SSE for ${chatId} in ${delay}ms (attempt ${retryCount + 1}/${MAX_SSE_RETRIES})`)

    setTimeout(() => {
      const state = chatsRef.current[chatId]
      if (!state || state.status === 'idle') {
        closeSSEConnection(chatId)
        return // 已经结束，不需要重连
      }

      // 检查任务是否还在运行
      fetch(`/api/chat/task?taskId=${taskId}`)
        .then(res => res.json())
        .then(data => {
          if (data.status === 'completed' || data.status === 'failed' || data.status === 'cancelled') {
            // 任务已经结束 - 如果有结果文本，创建助手消息显示它
            if (data.status === 'completed' && data.result) {
              console.log(`[ChatContext] Reconnect found completed task for ${chatId}, recovering ${data.result.length} chars`)
              const recoveryId = `msg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
              setChats(prev => {
                const curr = prev[chatId]
                if (!curr) return prev
                // 检查是否已有助手消息（避免重复）
                const lastMsg = curr.messages[curr.messages.length - 1]
                if (lastMsg && lastMsg.role === 'assistant' && lastMsg.content && lastMsg.content.length > 0) {
                  return { ...prev, [chatId]: { ...curr, status: 'idle', isThinking: false, currentSearch: [] } }
                }
                return {
                  ...prev,
                  [chatId]: {
                    ...curr,
                    status: 'idle',
                    isThinking: false,
                    currentSearch: [],
                    messages: [...curr.messages, {
                      id: recoveryId,
                      role: 'assistant' as const,
                      content: data.result,
                      searchSteps: curr.currentSearch || [],
                      citations: [],
                      isThinking: false,
                    }]
                  }
                }
              })
            } else {
              updateChat(chatId, { status: 'idle', isThinking: false, currentSearch: [] })
            }
            closeSSEConnection(chatId)
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('chat-task-finished', {
                detail: { chatId }
              }))
            }
            return
          }
          // 任务仍在运行，重连SSE
          setupSSEConnectionRef.current(chatId, taskId, retryCount + 1)
        })
        .catch(() => {
          // 无法检查任务状态，尝试重连
          setupSSEConnectionRef.current(chatId, taskId, retryCount + 1)
        })
    }, delay)
  }, [updateChat, closeSSEConnection])

  // 提取SSE连接设置逻辑为独立函数
  const setupSSEConnection = useCallback((chatId: string, taskId: string, retryCount: number = 0) => {
    console.log(`[ChatContext] Setting up SSE connection for chat=${chatId}, task=${taskId}, retry=${retryCount}`)

    // BUG-007 FIX: 先关闭旧连接
    const oldConn = activeSSEConnections.current[chatId]
    if (oldConn) {
      try {
        oldConn.eventSource.close()
      } catch {}
    }

    const eventSource = new EventSource(`/api/chat/stream?taskId=${taskId}`)

    const connState: SSEConnectionState = {
      eventSource,
      taskId,
      chatId,
      assistantId: null,
      accumulatedText: '',
      lastUpdateTime: Date.now(),
      pendingUpdate: false,
      retryCount,
    }
    activeSSEConnections.current[chatId] = connState

    const ensureAssistantMsg = (initialFields?: Partial<ChatMessage>) => {
      if (!connState.assistantId) {
        connState.assistantId = `msg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
        const aId = connState.assistantId
        updateChat(chatId, prev => {
          const hasAssistant = prev.messages.some(m => m.id === aId)
          if (hasAssistant) return prev
          return {
            ...prev,
            messages: [...prev.messages, { 
              id: aId, 
              role: 'assistant' as const, 
              content: '', 
              searchSteps: [], 
              citations: [],
              ...initialFields
            }]
          }
        })
        // Bridge: ensure assistant message exists in current Provider after Fast Refresh
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('chat-streaming-text', {
            detail: { chatId, assistantId: aId, text: '', isNew: true }
          }))
        }
      }
      return connState.assistantId
    }

    const flushUpdate = () => {
      if (!connState.pendingUpdate) return
      connState.pendingUpdate = false
      const text = connState.accumulatedText
      const aId = connState.assistantId
      if (!aId) return
      // Bridge: dispatch streaming text via window for Fast Refresh resilience
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('chat-streaming-text', {
          detail: { chatId, assistantId: aId, text, isNew: false }
        }))
      }
      setChats(prev => {
        const curr = prev[chatId]
        if (!curr) return prev
        return {
          ...prev,
          [chatId]: {
            ...curr,
            messages: curr.messages.map(m => m.id === aId ? { ...m, content: text } : m)
          }
        }
      })
    }

    const scheduleUpdate = () => {
      const now = Date.now()
      if (now - connState.lastUpdateTime >= 120) {
        connState.lastUpdateTime = now
        connState.pendingUpdate = true
        flushUpdate()
      } else if (!connState.pendingUpdate) {
        connState.pendingUpdate = true
        setTimeout(flushUpdate, 120 - (now - connState.lastUpdateTime))
      }
    }

    eventSource.addEventListener('status', (e: MessageEvent) => {
      connState.lastUpdateTime = Date.now()
      try {
        const data = JSON.parse(e.data)
        if (data.type === 'task') {
          if (data.stage === 'running') {
            updateChat(chatId, { status: 'streaming' })
          } else if (data.stage === 'queued') {
            updateChat(chatId, { status: 'queued' })
          } else if (data.stage === 'cancelled') {
            updateChat(chatId, { status: 'idle', isThinking: false, currentSearch: [] })
            try {
              eventSource.close()
            } catch {}
            delete activeSSEConnections.current[chatId]
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('chat-task-finished', { detail: { chatId } }))
            }
          }
        }
        if (data.type === 'thinking') {
          const isThinkingActive = data.stage === 'start'
          const aId = ensureAssistantMsg({ isThinking: isThinkingActive })
          updateChat(chatId, prev => ({
            ...prev,
            isThinking: isThinkingActive,
            messages: prev.messages.map(m => m.id === aId ? { ...m, isThinking: isThinkingActive } : m)
          }))
        }
        if (data.type === 'search') {
          setChats(prev => {
            const curr = prev[chatId]
            if (!curr) return prev
            const steps = [...(curr.currentSearch || []), data]
            
            let aId = connState.assistantId
            let nextMessages = curr.messages
            
            if (!aId) {
              aId = `msg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
              connState.assistantId = aId
              nextMessages = [...curr.messages, {
                id: aId,
                role: 'assistant' as const,
                content: '',
                searchSteps: steps,
                citations: []
              }]
            } else {
              nextMessages = curr.messages.map(m => m.id === aId ? { ...m, searchSteps: steps } : m)
            }
            
            return {
              ...prev,
              [chatId]: {
                ...curr,
                currentSearch: steps,
                messages: nextMessages
              }
            }
          })
        }
      } catch (err) {
        console.error(`[ChatContext] Error parsing status event:`, err)
      }
    })

    eventSource.addEventListener('text', (e: MessageEvent) => {
      connState.lastUpdateTime = Date.now()
      try {
        const data = JSON.parse(e.data)
        if (data.content !== undefined && data.content !== null) {
          const aId = ensureAssistantMsg()
          if (data.replace) {
            connState.accumulatedText = String(data.content)
          } else {
            connState.accumulatedText += String(data.content)
          }
          scheduleUpdate()
          if (typeof window !== 'undefined' && aId) {
            window.dispatchEvent(new CustomEvent(`chat-token-${aId}`, {
              detail: { text: connState.accumulatedText }
            }))
          }
        }
      } catch (err) {
        console.error(`[ChatContext] Error parsing text event:`, err)
      }
    })

    eventSource.addEventListener('chatId', (e: MessageEvent) => {
      connState.lastUpdateTime = Date.now()
      try {
        const data = JSON.parse(e.data)
        if (data.id && chatId !== data.id) {
          console.log(`[ChatContext] Chat ID migration: ${chatId} -> ${data.id}`)
          const oldId = chatId
          const newId = data.id

          // BUG-005 FIX: 使用完整的 migrateChat，它会同步所有状态
          migrateChat(oldId, newId)

          chatId = newId
        }
      } catch (err) {
        console.error(`[ChatContext] Error parsing chatId event:`, err)
      }
    })

    eventSource.addEventListener('citations', (e: MessageEvent) => {
      connState.lastUpdateTime = Date.now()
      try {
        const data = JSON.parse(e.data)
        if (data.results) {
          const aId = connState.assistantId
          if (aId) {
            setChats(prev => {
              const curr = prev[chatId]
              if (!curr) return prev
              return {
                ...prev,
                [chatId]: {
                  ...curr,
                  messages: curr.messages.map(m => m.id === aId ? { ...m, citations: data.results } : m)
                }
              }
            })
          }
        }
      } catch (err) {
        console.error(`[ChatContext] Error parsing citations event:`, err)
      }
    })

    eventSource.addEventListener('done', () => {
      connState.lastUpdateTime = Date.now()
      console.log(`[ChatContext] Done event for chat ${chatId}, assistantId=${connState.assistantId}, textLen=${connState.accumulatedText.length}`)
      flushUpdate()
      const aId = connState.assistantId

      const cleanupDone = () => {
        try { eventSource.close() } catch {}
        delete activeSSEConnections.current[chatId]
        delete activeAbortControllers.current[chatId]
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('chat-task-finished', { detail: { chatId } }))
          window.dispatchEvent(new CustomEvent('chat-updated'))
        }
      }

      // 通过 window 事件桥接结果到当前活跃的 Provider（防止 Fast Refresh 导致 state 孤立）
      if (connState.accumulatedText && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('chat-done-result', {
          detail: { chatId, text: connState.accumulatedText, searchSteps: [], citations: [] }
        }))
      }

      // 正常路径：有累积文本
      if (aId && connState.accumulatedText) {
        setChats(prev => {
          const curr = prev[chatId]
          if (!curr) return prev
          return {
            ...prev,
            [chatId]: {
              ...curr,
              status: 'idle',
              isThinking: false,
              currentSearch: [],
              messages: curr.messages.map(m => m.id === aId ? { ...m, content: connState.accumulatedText, searchSteps: curr.currentSearch, isThinking: false } : m)
            }
          }
        })
        cleanupDone()
        return
      }

      // 回退路径：SSE流中断导致没有累积文本，从API获取结果
      console.log(`[ChatContext] No accumulated text for ${chatId}, fetching from API as fallback`)
      fetch(`/api/chat/task?taskId=${taskId}`)
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          const fallbackText = data?.result || ''
          if (fallbackText) {
            console.log(`[ChatContext] Recovered ${fallbackText.length} chars from API for ${chatId}`)
            const fallbackId = aId || `msg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
            setChats(prev => {
              const curr = prev[chatId]
              if (!curr) return prev
              const hasMsg = aId ? curr.messages.some(m => m.id === aId) : false
              const messages = hasMsg
                ? curr.messages.map(m => m.id === aId ? { ...m, content: fallbackText, isThinking: false } : m)
                : [...curr.messages, {
                    id: fallbackId,
                    role: 'assistant' as const,
                    content: fallbackText,
                    searchSteps: curr.currentSearch || [],
                    citations: [],
                    isThinking: false,
                  }]
              return {
                ...prev,
                [chatId]: { ...curr, status: 'idle', isThinking: false, currentSearch: [], messages }
              }
            })
          } else {
            updateChat(chatId, { status: 'idle', isThinking: false, currentSearch: [] })
          }
        })
        .catch(() => {
          updateChat(chatId, { status: 'idle', isThinking: false, currentSearch: [] })
        })
        .finally(cleanupDone)
    })

    eventSource.addEventListener('task_error', (e: MessageEvent) => {
      connState.lastUpdateTime = Date.now()
      try {
        let errorMessage = 'Unknown error'
        if (e.data && typeof e.data === 'string' && e.data !== 'undefined') {
          try {
            const data = JSON.parse(e.data)
            errorMessage = data.message || errorMessage
          } catch {
            errorMessage = e.data
          }
        }
        console.error(`[ChatContext] Task error event for chat ${chatId}:`, errorMessage)
        updateChat(chatId, { status: 'error', error: new Error(errorMessage), isThinking: false })
      } catch (err) {
        console.error(`[ChatContext] Error handling task_error event:`, err)
        updateChat(chatId, { status: 'error', error: new Error('连接错误'), isThinking: false })
      }
      try {
        eventSource.close()
      } catch {}
      delete activeSSEConnections.current[chatId]
      delete activeAbortControllers.current[chatId]
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('chat-task-error', { detail: { chatId } }))
      }
    })

    eventSource.addEventListener('heartbeat', () => {
      connState.lastUpdateTime = Date.now()
    })

    // BUG-003 FIX: onerror 时尝试重连
    eventSource.onerror = () => {
      console.log(`[ChatContext] SSE onerror for chat ${chatId}, retryCount=${connState.retryCount}`)
      flushUpdate()

      // 先检查是否是正常关闭
      const state = chatsRef.current[chatId]
      if (!state || state.status === 'idle') {
        try {
          eventSource.close()
        } catch {}
        delete activeSSEConnections.current[chatId]
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('chat-sse-disconnected', { detail: { chatId } }))
          window.dispatchEvent(new CustomEvent('chat-task-finished', { detail: { chatId } }))
        }
        return
      }

      // BUG-003 FIX: 尝试重连，但保留连接状态且标记为 isReconnecting 并更新 lastUpdateTime
      try {
        eventSource.close()
      } catch {}
      connState.isReconnecting = true
      connState.lastUpdateTime = Date.now()

      // 如果状态仍然是活跃的，尝试重连
      if (state.status === 'streaming' || state.status === 'submitted' || state.status === 'queued') {
        reconnectSSE(chatId, taskId, connState.retryCount + 1)
      } else {
        delete activeSSEConnections.current[chatId]
        updateChat(chatId, { status: 'idle', isThinking: false, currentSearch: [] })
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('chat-sse-disconnected', { detail: { chatId } }))
          window.dispatchEvent(new CustomEvent('chat-task-finished', { detail: { chatId } }))
        }
      }
    }
  }, [updateChat, migrateChat, reconnectSSE])

  // Update ref via useEffect to avoid accessing ref during render
  useEffect(() => {
    setupSSEConnectionRef.current = setupSSEConnection
  }, [setupSSEConnection])

  const subscribeToTask = useCallback((chatId: string, taskId: string) => {
    console.log(`[ChatContext] subscribeToTask called: chatId=${chatId}, taskId=${taskId}`)

    const oldController = activeAbortControllers.current[chatId]
    if (oldController) {
      oldController.abort()
      delete activeAbortControllers.current[chatId]
    }
    const oldConn = activeSSEConnections.current[chatId]
    if (oldConn) {
      oldConn.eventSource.close()
      delete activeSSEConnections.current[chatId]
    }

    const controller = new AbortController()
    activeAbortControllers.current[chatId] = controller
    console.log(`[ChatContext] Immediately establishing SSE connection for ${chatId}, taskId=${taskId}`)
    setupSSEConnection(chatId, taskId, 0)
  }, [setupSSEConnection])

  const actions = React.useMemo(() => ({
    registerChat, updateChat, migrateChat, getChat, getMigratedChatId, stopAll, abortChat, subscribeToTask
  }), [registerChat, updateChat, migrateChat, getChat, getMigratedChatId, stopAll, abortChat, subscribeToTask])

  return (
    <ChatStateContext.Provider value={chats}>
      <ChatActionsContext.Provider value={actions}>
        {children}
      </ChatActionsContext.Provider>
    </ChatStateContext.Provider>
  )
}

export function useChatState() {
  return useContext(ChatStateContext)
}

export function useChatActions() {
  const context = useContext(ChatActionsContext)
  if (!context) throw new Error('useChatActions must be used within ChatProvider')
  return context
}

export function useChatById(chatId: string | null) {
  const chats = useChatState()
  if (!chatId) return null
  return chats[chatId] || null
}

export function useChatContext() {
  const chats = useChatState()
  const actions = useChatActions()
  return { chats, ...actions }
}
