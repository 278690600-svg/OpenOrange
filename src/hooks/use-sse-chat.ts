"use client"

import { useState, useRef, useCallback, useEffect } from 'react'

export type SearchStage = 'intent' | 'skip' | 'rewrite' | 'rewrite_done' | 'searching' | 'found' | 'read_page' | 'reading' | 'done' | 'error' | 'loading' | 'call' | 'result' | 'compiling' | 'context' | 'ready'
export type ThinkingStage = 'start' | 'done'

export interface StatusEvent {
  type: 'search' | 'thinking' | 'mcp' | 'model_load'
  stage: SearchStage | ThinkingStage
  message: string
  results?: Array<{ title: string; url: string }>
  pageIndex?: number
  tool?: string
  args?: Record<string, unknown>
  url?: string
  result?: string
  rawResult?: string
  completedUrl?: string
  pageTitle?: string
  status?: string
  progress?: number
  modelName?: string
}

export interface Citation {
  title: string
  url: string
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  citations?: Citation[]
  thinkContent?: string
  searchSteps?: StatusEvent[]
  isThinking?: boolean
  attachments?: Array<{ name: string; type: string; dataUrl?: string }>
}

let messageIdCounter = 0
function generateId() {
  return `msg-${Date.now()}-${++messageIdCounter}`
}

import { useChatState, useChatActions } from '@/lib/chat-context'

export function useSSEChat(initialChatId?: string | null, initialMessages: ChatMessage[] = []) {
  const chats = useChatState()
  const { registerChat, updateChat, abortChat, subscribeToTask } = useChatActions()

  const [activeChatId, setActiveChatId] = useState<string | null>(initialChatId || null)
  const sendingRef = useRef(false)
  const chatIdRef = useRef<string | null>(initialChatId || null)
  const lastInitialChatIdRef = useRef<string | null>(null)
  const lastActiveChatIdRef = useRef<string | null>(null)

  if (initialChatId && lastInitialChatIdRef.current !== initialChatId) {
    lastInitialChatIdRef.current = initialChatId
    chatIdRef.current = initialChatId
  }

  const chatsRef = useRef(chats)
  chatsRef.current = chats

  useEffect(() => {
    if (initialChatId && initialChatId !== lastActiveChatIdRef.current) {
      lastActiveChatIdRef.current = initialChatId
      setActiveChatId(initialChatId)
      chatIdRef.current = initialChatId

      if (!chatsRef.current[initialChatId]) {
        registerChat(initialChatId, {
          messages: initialMessages,
          status: 'idle',
          error: null,
          currentSearch: [],
          isThinking: false,
          chatId: initialChatId,
          taskId: null,
        })
      } else if (initialMessages.length > 0) {
        const existing = chatsRef.current[initialChatId]
        if (existing.status === 'idle' && initialMessages.length > existing.messages.length) {
          updateChat(initialChatId, { messages: initialMessages })
        }
      }

      sendingRef.current = false
    } else if (initialChatId && initialMessages.length > 0) {
      const existing = chatsRef.current[initialChatId]
      if (existing && existing.status === 'idle') {
        if (initialMessages.length > existing.messages.length) {
          updateChat(initialChatId, { messages: initialMessages })
        } else if (initialMessages.length === existing.messages.length && existing.messages.length > 0) {
          const lastExisting = existing.messages[existing.messages.length - 1]
          const lastNew = initialMessages[initialMessages.length - 1]
          if (lastNew && lastExisting && lastNew.content.length > lastExisting.content.length) {
            updateChat(initialChatId, { messages: initialMessages })
          }
        } else if (existing.messages.length === 0 && initialMessages.length > 0) {
          updateChat(initialChatId, { messages: initialMessages })
        }
      }
    }
  }, [initialChatId, registerChat, updateChat, initialMessages])

  const effectiveId = chatIdRef.current || activeChatId || initialChatId

  const currentState = effectiveId ? chats[effectiveId] : null

  const globalMessages = currentState?.messages
  const messages = (globalMessages && globalMessages.length >= initialMessages.length)
    ? globalMessages
    : initialMessages
  const status = currentState?.status || 'idle'
  const error = currentState?.error || null
  const currentSearch = currentState?.currentSearch || []
  const isThinking = currentState?.isThinking || false

  const messagesRef = useRef(messages)
  messagesRef.current = messages

  const setMessages = useCallback((updater: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => {
    const currentId = chatIdRef.current
    if (!currentId) return
    updateChat(currentId, (current) => ({
      ...current,
      messages: typeof updater === 'function' ? updater(current.messages) : updater
    }))
  }, [updateChat])

  const deleteMessage = useCallback((messageId: string) => {
    setMessages(prev => prev.filter(m => m.id !== messageId))
  }, [setMessages])

  const stop = useCallback(() => {
    const currentId = chatIdRef.current
    if (currentId) {
      abortChat(currentId)
    }
    sendingRef.current = false
  }, [abortChat])

  // BUG-001 FIX: 监听 chat-task-finished 事件来可靠重置 sendingRef
  useEffect(() => {
    const handleStopAll = () => {
      sendingRef.current = false
    }
    const handleChatUpdated = () => {
      const id = chatIdRef.current
      if (id) {
        const state = chatsRef.current[id]
        if (state && state.status === 'idle') {
          sendingRef.current = false
        }
      }
    }
    // BUG-001 FIX: 监听任务完成事件，无论哪个组件触发的
    const handleTaskFinished = (e: Event) => {
      const detail = (e as CustomEvent).detail
      const chatId = detail?.chatId
      if (chatId === chatIdRef.current || chatId === activeChatId) {
        sendingRef.current = false
      }
    }
    // BUG-006 FIX: 监听任务错误事件
    const handleTaskError = (e: Event) => {
      const detail = (e as CustomEvent).detail
      const chatId = detail?.chatId
      if (chatId === chatIdRef.current || chatId === activeChatId) {
        sendingRef.current = false
      }
    }
    // BUG-001 FIX: 监听SSE连接断开事件
    const handleSSEDisconnected = (e: Event) => {
      const detail = (e as CustomEvent).detail
      const chatId = detail?.chatId
      if (chatId === chatIdRef.current || chatId === activeChatId) {
        const state = chatsRef.current[chatId]
        // 只有在非活跃状态时才重置，避免中断正在进行的流
        if (!state || state.status === 'idle' || state.status === 'error') {
          sendingRef.current = false
        }
      }
    }

    window.addEventListener('stop-all-chats', handleStopAll)
    window.addEventListener('chat-updated', handleChatUpdated)
    window.addEventListener('chat-task-finished', handleTaskFinished)
    window.addEventListener('chat-task-error', handleTaskError)
    window.addEventListener('chat-sse-disconnected', handleSSEDisconnected)
    return () => {
      window.removeEventListener('stop-all-chats', handleStopAll)
      window.removeEventListener('chat-updated', handleChatUpdated)
      window.removeEventListener('chat-task-finished', handleTaskFinished)
      window.removeEventListener('chat-task-error', handleTaskError)
      window.removeEventListener('chat-sse-disconnected', handleSSEDisconnected)
    }
  }, [activeChatId])

  useEffect(() => {
    const handleMigration = (e: Event) => {
      const { oldId, newId } = (e as CustomEvent).detail
      if (chatIdRef.current === oldId || activeChatId === oldId) {
        setActiveChatId(newId)
        chatIdRef.current = newId
        if (typeof window !== 'undefined') {
          window.history.replaceState(null, '', `/chat/${newId}`)
        }
      }
    }
    window.addEventListener('chat-id-migrated', handleMigration)
    return () => {
      window.removeEventListener('chat-id-migrated', handleMigration)
    }
  }, [activeChatId])

  // BUG-006 FIX: 添加超时保护，防止sendingRef永久锁定
  useEffect(() => {
    if (!sendingRef.current) return
    const timeout = setTimeout(() => {
      if (sendingRef.current) {
        const id = chatIdRef.current
        if (id) {
          const state = chatsRef.current[id]
          if (!state || state.status === 'idle' || state.status === 'error') {
            console.warn('[Chat] sendingRef timeout, force resetting')
            sendingRef.current = false
          }
        }
      }
    }, 120000) // 2分钟超时
    return () => clearTimeout(timeout)
  }, [chats])

  const sendMessage = useCallback(async (
    text: string,
    options: {
      model: string
      chatId: string | null
      webSearch: boolean | 'auto' | 'deep'
      deepThink: boolean
      kbId?: string | null
      files?: Array<{ name: string; type: string; dataUrl?: string }>
      promptId?: string | null
      docOptions?: { docType: 'none' | 'ppt' | 'docx' | 'xlsx'; docStyle: string; docTheme: string }
    },
    editMessageId?: string
  ) => {
    if (sendingRef.current) {
      console.warn('[Chat] Already sending, skipping duplicate send')
      return
    }
    sendingRef.current = true

    console.log(`[Chat] sendMessage called: text="${text.substring(0, 50)}...", chatId=${options.chatId}`)

    try {
      const currentMessages = messagesRef.current
      const targetIdx = editMessageId ? currentMessages.findIndex(m => m.id === editMessageId) : -1
      const baseMessages = targetIdx !== -1 ? currentMessages.slice(0, targetIdx) : currentMessages

      const targetChatId = chatIdRef.current || options.chatId || activeChatId
      if (!targetChatId) {
        console.error('[Chat] No target chat ID available')
        sendingRef.current = false
        return
      }

      console.log(`[Chat] Target chat ID: ${targetChatId}`)

      const userMsg: ChatMessage = {
        id: generateId(),
        role: 'user',
        content: text,
        attachments: options.files?.map(f => ({ name: f.name, type: f.type, dataUrl: f.dataUrl })),
      }

      const newMessages = [...baseMessages, userMsg]

      console.log(`[Chat] Updating chat state to submitted`)
      updateChat(targetChatId, {
        messages: newMessages,
        status: 'submitted',
        error: null,
        currentSearch: [],
        isThinking: false,
      })

      chatIdRef.current = targetChatId

      const messagesForApi = newMessages
        .filter(m => m.role === 'user' || (m.role === 'assistant' && m.content && m.content.trim().length > 0))
        .map(m => ({
          role: m.role,
          content: m.content,
        }))

      console.log(`[Chat] Creating task via API`)
      const taskRes = await fetch('/api/chat/task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: messagesForApi,
          model: options.model,
          chatId: targetChatId,
          webSearch: options.webSearch,
          deepThink: options.deepThink,
          kbId: options.kbId,
          files: options.files,
          promptId: options.promptId,
          docType: options.docOptions?.docType,
          docStyle: options.docOptions?.docStyle,
          docTheme: options.docOptions?.docTheme,
        }),
      })

      if (!taskRes.ok) {
        const errData = await taskRes.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(errData.error || `HTTP ${taskRes.status}`)
      }

      const taskData = await taskRes.json()
      const taskId = taskData.taskId

      console.log(`[Chat] Task created: ${taskId}`)

      // BUG: 不要立即设置为 queued，等待后端 SSE 事件决定是否排队
      updateChat(targetChatId, { taskId, status: 'submitted' })

      console.log(`[Chat] Subscribing to task ${taskId}`)
      subscribeToTask(targetChatId, taskId)

    } catch (error) {
      console.error('[Chat] sendMessage error:', error)
      const currentId = chatIdRef.current
      if (currentId) {
        updateChat(currentId, { status: 'error', error: error as Error })
      }
      sendingRef.current = false
      // BUG-006 FIX: 发送错误事件通知其他组件
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('chat-task-error', {
          detail: { chatId: chatIdRef.current || options.chatId }
        }))
      }
    }
  }, [updateChat, activeChatId, subscribeToTask])

  const reset = useCallback(() => {
    const currentId = chatIdRef.current
    if (currentId) {
      updateChat(currentId, {
        messages: [],
        status: 'idle',
        error: null,
        currentSearch: [],
        isThinking: false,
      })
    }
    chatIdRef.current = null
  }, [updateChat])

  const regenerate = useCallback(async (options: Omit<Parameters<typeof sendMessage>[1], 'files' | 'chatId'>) => {
    if (status === 'submitted' || status === 'streaming') return
    const lastUserIdx = [...messagesRef.current].reverse().findIndex(m => m.role === 'user')
    if (lastUserIdx === -1) return
    const trueIdx = messagesRef.current.length - 1 - lastUserIdx
    const userMsg = messagesRef.current[trueIdx]

    const files = userMsg.attachments?.map(a => ({ name: a.name, type: a.type, dataUrl: a.dataUrl }))

    await sendMessage(userMsg.content, {
      ...options,
      chatId: chatIdRef.current,
      files
    }, userMsg.id)
  }, [status, sendMessage])

  return {
    messages,
    status,
    error,
    isThinking,
    currentSearch,
    chatIdRef,
    sendMessage,
    regenerate,
    stop,
    reset,
    setMessages,
    deleteMessage,
  }
}
