"use client"

import { useState, useRef, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'

export type SearchStage = 'intent' | 'skip' | 'rewrite' | 'rewrite_done' | 'searching' | 'found' | 'read_page' | 'reading' | 'done' | 'error' | 'loading' | 'call' | 'result' | 'compiling' | 'context' | 'ready'
export type ThinkingStage = 'start' | 'done'

export interface StatusEvent {
  type: 'search' | 'thinking' | 'mcp' | 'model_load'
  stage: SearchStage | ThinkingStage
  message: string
  results?: Array<{ title: string; url: string }>
  pageIndex?: number
  tool?: string
  args?: any
  url?: string
  result?: string
  rawResult?: string
  completedUrl?: string
  pageTitle?: string
  status?: string
  // model_load fields
  progress?: number
  modelName?: string
}

// ... unchanged until handle status event

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
import { useEffect as useLayoutEffect } from 'react'

export function useSSEChat(initialChatId?: string | null, initialMessages: ChatMessage[] = []) {
  const chats = useChatState()
  const { registerChat, updateChat, migrateChat, triggerTypewriter, watchChat, unwatchChat } = useChatActions()
  const router = useRouter()
  
  // Local active chat ID being viewed
  const [activeChatId, setActiveChatId] = useState<string | null>(initialChatId || null)

  // Register chat on mount if ID is provided
  useLayoutEffect(() => {
    if (initialChatId) {
      setActiveChatId(initialChatId)
      registerChat(initialChatId, {
        messages: initialMessages,
        status: 'idle',
        error: null,
        currentSearch: [],
        isThinking: false,
        chatId: initialChatId,
        typewriterQueue: '',
        currentText: ''
      })
    }
  }, [initialChatId, registerChat]) // initialMessages purposefully excluded to avoid reset on every change

  useEffect(() => {
    if (activeChatId) {
      watchChat(activeChatId)
      return () => {
        unwatchChat(activeChatId)
      }
    }
  }, [activeChatId, watchChat, unwatchChat])


  // Get current state from context or default
  const currentState = activeChatId ? chats[activeChatId] : null
  
  const messages = currentState?.messages || []
  const status = currentState?.status || 'idle'
  const error = currentState?.error || null
  const currentSearch = currentState?.currentSearch || []
  const isThinking = currentState?.isThinking || false

  const abortRef = useRef<AbortController | null>(null)
  const chatIdRef = useRef<string | null>(activeChatId || null)

  // Synchronize chatIdRef with initialChatId
  useLayoutEffect(() => {
    if (initialChatId) chatIdRef.current = initialChatId
  }, [initialChatId])

  // --- Helper Setters (Atomic updates to global context) ---
  const setMessages = useCallback((updater: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => {
    const currentId = chatIdRef.current
    if (!currentId) return
    updateChat(currentId, (current) => ({
      ...current,
      messages: typeof updater === 'function' ? updater(current.messages) : updater
    }))
  }, [updateChat])

  const setStatus = useCallback((s: 'idle' | 'submitted' | 'streaming' | 'queued') => {
    const currentId = chatIdRef.current
    if (currentId) updateChat(currentId, { status: s })
  }, [updateChat])

  const setError = useCallback((e: Error | null) => {
    const currentId = chatIdRef.current
    if (currentId) updateChat(currentId, { error: e })
  }, [updateChat])

  const setCurrentSearch = useCallback((s: StatusEvent[]) => {
    const currentId = chatIdRef.current
    if (currentId) updateChat(currentId, { currentSearch: s })
  }, [updateChat])

  const setIsThinking = useCallback((t: boolean) => {
    const currentId = chatIdRef.current
    if (currentId) updateChat(currentId, { isThinking: t })
  }, [updateChat])

  // Typewriter state updates
  const setTypewriterQueue = useCallback((q: string | ((prev: string) => string)) => {
    const currentId = chatIdRef.current
    if (currentId) {
      updateChat(currentId, (prev) => ({
        ...prev,
        typewriterQueue: typeof q === 'function' ? q(prev.typewriterQueue) : q
      }))
    }
  }, [updateChat])

  const setCurrentText = useCallback((t: string | ((prev: string) => string)) => {
    const currentId = chatIdRef.current
    if (currentId) {
      updateChat(currentId, (prev) => ({
        ...prev,
        currentText: typeof t === 'function' ? t(prev.currentText) : t
      }))
    }
  }, [updateChat])

  const deleteMessage = useCallback((messageId: string) => {
    setMessages(prev => prev.filter(m => m.id !== messageId))
  }, [setMessages])


  // Global typewriter triggered via actions.triggerTypewriter
  useEffect(() => {
    if (activeChatId && chats[activeChatId]?.status === 'streaming') {
      const assistantMsg = [...(chats[activeChatId]?.messages || [])].reverse().find(m => m.role === 'assistant')
      if (assistantMsg) {
        triggerTypewriter(activeChatId, assistantMsg.id)
      }
    }
  }, [activeChatId, chats, triggerTypewriter])

  const stop = useCallback(() => {
    abortRef.current?.abort()
    setStatus('idle')
  }, [setStatus])

  // Listen for global stop event
  useEffect(() => {
    const handleStopAll = () => {
      stop()
    }
    window.addEventListener('stop-all-chats', handleStopAll)
    return () => window.removeEventListener('stop-all-chats', handleStopAll)
  }, [stop])

  const sendMessage = useCallback(async (
    text: string,
    options: {
      model: string
      chatId: string | null
      webSearch: boolean | 'auto' | 'deep'
      deepThink: boolean
      kbId?: string | null
      files?: any[]
      promptId?: string | null
    },
    editMessageId?: string
  ) => {
    
    const targetIdx = editMessageId ? messages.findIndex(m => m.id === editMessageId) : -1
    const baseMessages = targetIdx !== -1 ? messages.slice(0, targetIdx) : messages

    const targetChatId = options.chatId || activeChatId
    if (!targetChatId) return

    const userMsg: ChatMessage = {
      id: generateId(),
      role: 'user',
      content: text,
      attachments: options.files?.map(f => ({ name: f.name, type: f.type, dataUrl: f.dataUrl })),
    }

    const activeTasks = Object.values(chats).filter(c => c.status === 'streaming' || c.status === 'submitted')
    const MAX_CONCURRENT = 2 

    if (activeTasks.length >= MAX_CONCURRENT && chats[targetChatId]?.status !== 'submitted') {
       updateChat(targetChatId, {
         status: 'queued',
         pendingMessage: { content: text, options }
       })
       return
    }

    updateChat(targetChatId, {
      messages: [...baseMessages, userMsg],
      status: 'submitted',
      error: null,
      currentSearch: [],
      isThinking: false,
      typewriterQueue: '',
      currentText: ''
    })

    const assistantId = generateId()
    const assistantMsg: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      searchSteps: [],
      citations: [],
    }

    updateChat(targetChatId, {
      messages: [...baseMessages, userMsg, assistantMsg]
    })

    const abortController = new AbortController()
    abortRef.current = abortController

    // Add timeout to prevent hanging (10 minutes for MCP tool loading)
    const timeoutId = setTimeout(() => {
      abortController.abort()
    }, 600000) // 10 minute timeout

    let currentStreamChatId = targetChatId

    try {
      const allMessages = [...baseMessages, userMsg].map(m => ({
        role: m.role,
        content: m.content,
      }))

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: allMessages,
          model: options.model,
          chatId: options.chatId,
          webSearch: options.webSearch,
          deepThink: options.deepThink,
          kbId: options.kbId,
          files: options.files,
          promptId: options.promptId,
        }),
        signal: abortController.signal,
      })

      clearTimeout(timeoutId)

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(errData.error || `HTTP ${res.status}`)
      }


      updateChat(currentStreamChatId, { status: 'streaming' })
      triggerTypewriter(currentStreamChatId, assistantId)

      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let accSearchSteps: StatusEvent[] = []
      let accCitations: Citation[] = []

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        let eventType = ''
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            eventType = line.slice(7).trim()
          } else if (line.startsWith('data: ')) {
            const dataStr = line.slice(6)
            try {
              const data = JSON.parse(dataStr)

              switch (eventType) {
                case 'text': {
                  updateChat(currentStreamChatId, prev => ({ 
                    ...prev, 
                    typewriterQueue: prev.typewriterQueue + data.content 
                  }))
                  triggerTypewriter(currentStreamChatId, assistantId)
                  break
                }

                case 'status': {
                  const statusEvt = data as StatusEvent
                  if (statusEvt.type === 'search' || statusEvt.type === 'mcp' || statusEvt.type === 'model_load') {
                    accSearchSteps = [...accSearchSteps, statusEvt]
                    updateChat(currentStreamChatId, prev => ({
                      ...prev,
                      currentSearch: [...accSearchSteps],
                      messages: prev.messages.map(m =>
                        m.id === assistantId ? { ...m, searchSteps: [...accSearchSteps] } : m
                      )
                    }))
                  }
                  if (statusEvt.type === 'thinking') {
                    updateChat(currentStreamChatId, prev => ({
                      ...prev,
                      isThinking: statusEvt.stage === 'start',
                      messages: prev.messages.map(m =>
                        m.id === assistantId ? { ...m, isThinking: statusEvt.stage === 'start' } : m
                      )
                    }))
                  }
                  break
                }

                case 'citations': {
                  accCitations = data.results || []
                  updateChat(currentStreamChatId, prev => ({
                    ...prev,
                    messages: prev.messages.map(m =>
                      m.id === assistantId ? { ...m, citations: accCitations } : m
                    )
                  }))
                  break
                }

                case 'chatId': {
                  const newId = data.id
                  if (currentStreamChatId.startsWith('new') && newId && currentStreamChatId !== newId) {
                    migrateChat(currentStreamChatId, newId)
                    currentStreamChatId = newId
                    
                    // 迁移后也需要触发打字机，确保在新的 ID 下继续输出
                    triggerTypewriter(newId, assistantId)

                    // 通知当前组件更新它所展示的 activeChatId，从而拉取全局的 chats[newId]
                    setActiveChatId(newId)
                    chatIdRef.current = newId

                    // 使用 router.replace 替换地址栏 URL，确保 Next.js 路由状态同步
                    router.replace(`/chat/${newId}`, { scroll: false })
                  } else {
                    chatIdRef.current = newId
                  }
                  break
                }

                case 'error': {
                  updateChat(currentStreamChatId, { error: new Error(data.message) })
                  break
                }

                case 'done': {
                  break
                }
              }
            } catch (e) {
              // ignore parse errors
            }
            eventType = ''
          }
        }
      }
    } catch (e: any) {
      clearTimeout(timeoutId)
      if (e.name !== 'AbortError') {
        console.error('[useSSEChat] Error:', e)
        updateChat(currentStreamChatId, { error: e })
      } else if (status === 'streaming') {
        console.warn('[useSSEChat] Request aborted during streaming')
        updateChat(currentStreamChatId, { error: new Error('Connection interrupted. Please try again.') })
      }
    } finally {
      clearTimeout(timeoutId)
      updateChat(currentStreamChatId, {
        status: 'idle',
        isThinking: false,
        currentSearch: []
      })
      abortRef.current = null
      // Assistant ID remains until next message to let typewriter finish the last bits
    }
  }, [triggerTypewriter])

  const reset = useCallback(() => {
    setMessages([])
    setStatus('idle')
    setError(null)
    setCurrentSearch([])
    setIsThinking(false)
    chatIdRef.current = null
    setTypewriterQueue('')
    setCurrentText('')
  }, [])

  const regenerate = useCallback(async (options: Omit<Parameters<typeof sendMessage>[1], 'files' | 'chatId'>) => {
    if (status === 'submitted' || status === 'streaming') return
    const lastUserIdx = [...messages].reverse().findIndex(m => m.role === 'user')
    if (lastUserIdx === -1) return
    const trueIdx = messages.length - 1 - lastUserIdx
    const userMsg = messages[trueIdx]
    
    // Copy attachments for resend
    const files = userMsg.attachments?.map(a => ({ name: a.name, type: a.type, dataUrl: a.dataUrl }))
    
    await sendMessage(userMsg.content, {
      ...options,
      chatId: chatIdRef.current,
      files
    }, userMsg.id)
  }, [messages, status, sendMessage])

  // Removed auto-abort on unmount to allow background execution

  // Queue processor
  useEffect(() => {
    if (!activeChatId) return
    const chat = chats[activeChatId]
    if (chat?.status === 'queued') {
      const activeCount = Object.values(chats).filter(c => c.status === 'streaming' || c.status === 'submitted').length
      const MAX_CONCURRENT = 2
      if (activeCount < MAX_CONCURRENT) {
        if (chat.pendingMessage) {
          sendMessage(chat.pendingMessage.content, chat.pendingMessage.options)
        }
      }
    }
  }, [chats, activeChatId, sendMessage])

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
