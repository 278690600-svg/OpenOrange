"use client"

import React, { createContext, useContext, useState, useRef, useCallback } from 'react'
import { ChatMessage, StatusEvent, Citation } from '@/hooks/use-sse-chat'

interface ChatState {
  messages: ChatMessage[]
  status: 'idle' | 'submitted' | 'streaming' | 'queued'
  error: Error | null
  currentSearch: StatusEvent[]
  isThinking: boolean
  chatId: string | null
  typewriterQueue: string
  currentText: string
  // For queueing
  pendingMessage?: {
    content: string
    options: any
  }
}

interface ChatContextType {
  chats: Record<string, ChatState>
  registerChat: (chatId: string, initialState: ChatState) => void
  updateChat: (chatId: string, update: Partial<ChatState> | ((prev: ChatState) => ChatState)) => void
  migrateChat: (oldId: string, newId: string) => void
  getChat: (chatId: string) => ChatState | undefined
  triggerTypewriter: (chatId: string, assistantId: string) => void
  watchChat: (chatId: string) => void
  unwatchChat: (chatId: string) => void
  stopAll: () => void
}

const ChatStateContext = createContext<Record<string, ChatState>>({})
const ChatActionsContext = createContext<{
  registerChat: (chatId: string, initialState: ChatState) => void
  updateChat: (chatId: string, update: Partial<ChatState> | ((prev: ChatState) => ChatState)) => void
  migrateChat: (oldId: string, newId: string) => void
  getChat: (chatId: string) => ChatState | undefined
  triggerTypewriter: (chatId: string, assistantId: string) => void
  watchChat: (chatId: string) => void
  unwatchChat: (chatId: string) => void
  stopAll: () => void
} | undefined>(undefined)

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const [chats, setChats] = useState<Record<string, ChatState>>({})

  const registerChat = useCallback((chatId: string, initialState: ChatState) => {
    setChats(prev => {
      if (prev[chatId]) return prev
      return { ...prev, [chatId]: initialState }
    })
  }, [])

  // Use a ref to keep actions stable even when chats change
  const chatsRef = useRef(chats)
  chatsRef.current = chats

  const updateChat = useCallback((chatId: string, update: Partial<ChatState> | ((prev: ChatState) => ChatState)) => {
    setChats(prev => {
      const current = prev[chatId]
      if (!current) return prev
      const next = typeof update === 'function' ? update(current) : { ...current, ...update }
      
      // Bailout if state is deep-equal
      let hasChanged = false
      for (const key in next) {
        if ((next as any)[key] !== (current as any)[key]) {
          hasChanged = true
          break
        }
      }
      if (!hasChanged) return prev

      return {
        ...prev,
        [chatId]: next
      }
    })
  }, [])

  const migrateChat = useCallback((oldId: string, newId: string) => {
    setChats(prev => {
      const state = prev[oldId]
      if (!state || prev[newId]) return prev
      const newChats = { ...prev }
      newChats[newId] = { ...state, chatId: newId }
      // Don't delete oldId immediately to prevent UI flicker during route transitions
      // delete newChats[oldId]
      return newChats
    })
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('chat-updated'))
    }
  }, [])

  const getChat = useCallback((chatId: string) => {
    return chatsRef.current[chatId]
  }, [])

  const globalTypewriters = useRef<Record<string, boolean>>({})

  const triggerTypewriter = useCallback((chatId: string, assistantId: string) => {
    if (globalTypewriters.current[chatId] || !chatId || !assistantId) return
    globalTypewriters.current[chatId] = true

    const pump = () => {
      let shouldContinue = true
      let isHighPressure = false

      setChats(prev => {
        const current = prev[chatId]
        if (!current) {
          shouldContinue = false
          return prev
        }

        const queueLen = current.typewriterQueue.length
        if (queueLen === 0) {
          if (current.status === 'idle') {
            shouldContinue = false
          }
          return prev
        }

        isHighPressure = queueLen > 100

        let charsToTake = 2
        if (queueLen > 1000) charsToTake = 100
        else if (queueLen > 500) charsToTake = 50
        else if (queueLen > 100) charsToTake = 20
        else if (queueLen > 50) charsToTake = 10
        else if (queueLen > 10) charsToTake = 4

        const nextChars = current.typewriterQueue.slice(0, charsToTake)
        const remainingQueue = current.typewriterQueue.slice(charsToTake)
        const nextText = current.currentText + nextChars

        return {
          ...prev,
          [chatId]: {
            ...current,
            typewriterQueue: remainingQueue,
            currentText: nextText,
            messages: current.messages.map(m =>
              m.id === assistantId ? { ...m, content: nextText } : m
            )
          }
        }
      })

      if (shouldContinue) {
        setTimeout(pump, isHighPressure ? 20 : 40)
      } else {
        globalTypewriters.current[chatId] = false
      }
    }

    pump()
  }, [])

  const activeWatchers = useRef<Record<string, boolean>>({})

  const watchChat = useCallback((chatId: string) => {
    if (!chatId) return
    activeWatchers.current[chatId] = true
  }, [])

  const unwatchChat = useCallback((chatId: string) => {
    if (!chatId) return
    activeWatchers.current[chatId] = false
  }, [])

  const stopAll = useCallback(() => {
    setChats(prev => {
      const next = { ...prev }
      Object.keys(next).forEach(id => {
        if (next[id].status !== 'idle') {
          next[id] = { ...next[id], status: 'idle', isThinking: false, currentSearch: [] }
        }
      })
      return next
    })
    // 触发一个全局事件，让所有的 useSSEChat 实例知道要停止
    window.dispatchEvent(new CustomEvent('stop-all-chats'))
  }, [])

  const lastLengths = useRef<Record<string, number>>({})

  React.useEffect(() => {
    const timer = setInterval(() => {
      const orphanChatIds = Object.keys(chatsRef.current).filter(id => {
        const isStreaming = chatsRef.current[id]?.status === 'streaming'
        const isWatched = !!activeWatchers.current[id]
        return isStreaming && !isWatched
      })

      // 也轮询那些在页面上但是 status 为 idle 的，可能后端还在跑
      const watchedIdleIds = Object.keys(chatsRef.current).filter(id => {
        const isIdle = chatsRef.current[id]?.status === 'idle'
        const isWatched = !!activeWatchers.current[id]
        return isIdle && isWatched
      })

      const idsToSync = [...orphanChatIds, ...watchedIdleIds].filter(id => !id.startsWith('new-'))
      if (idsToSync.length === 0) return

      idsToSync.forEach(id => {
        fetch(`/api/chats/${id}`)
          .then(res => res.json())
          .then(data => {
            if (data && data.messages) {
              const totalLen = data.messages.reduce((acc: number, m: any) => acc + (m.content || '').length, 0)
              const prevLen = lastLengths.current[id] || 0

              // 如果长度增加了，说明后端还在生成
              if (totalLen > prevLen) {
                setChats(prev => {
                  const curr = prev[id]
                  if (!curr) return prev
                  
                  // 如果后端还在跑，前端同步消息
                  return {
                    ...prev,
                    [id]: {
                      ...curr,
                      messages: data.messages.map((m: any) => ({
                        id: m.id,
                        role: m.role,
                        content: m.content || '',
                        searchSteps: m.searchSteps,
                        citations: m.citations,
                        isThinking: m.isThinking
                      }))
                    }
                  }
                })
                lastLengths.current[id] = totalLen
              } else if (totalLen > 0 && totalLen === prevLen && chatsRef.current[id]?.status === 'streaming') {
                // 如果长度没变且状态是 streaming，说明生成结束了
                setChats(prev => {
                  const curr = prev[id]
                  if (!curr || curr.status !== 'streaming') return prev
                  return { ...prev, [id]: { ...curr, status: 'idle' } }
                })
                delete lastLengths.current[id]
              }
            }
          })
          .catch(err => console.warn("Silent sync failed", err))
      })
    }, 3000) // 缩短轮询时间到 3s

    return () => clearInterval(timer)
  }, [])

  const actions = React.useMemo(() => ({ 
    registerChat, updateChat, migrateChat, getChat, triggerTypewriter, watchChat, unwatchChat, stopAll
  }), [registerChat, updateChat, migrateChat, getChat, triggerTypewriter, watchChat, unwatchChat, stopAll])

  // beforeunload logic removed for smoother multitasking transitions

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

// Legacy support
export function useChatContext() {
  const chats = useChatState()
  const actions = useChatActions()
  return { chats, ...actions }
}
