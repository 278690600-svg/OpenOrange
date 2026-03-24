"use client"

import { useState, useRef, useCallback, useEffect } from 'react'

export type SearchStage = 'intent' | 'skip' | 'rewrite' | 'rewrite_done' | 'searching' | 'found' | 'read_page' | 'reading' | 'done' | 'error'
export type ThinkingStage = 'start' | 'done'

export interface StatusEvent {
  type: 'search' | 'thinking'
  stage: SearchStage | ThinkingStage
  message: string
  results?: Array<{ title: string; url: string }>
  pageIndex?: number
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
}

let messageIdCounter = 0
function generateId() {
  return `msg-${Date.now()}-${++messageIdCounter}`
}

export function useSSEChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [status, setStatus] = useState<'idle' | 'submitted' | 'streaming'>('idle')
  const [error, setError] = useState<Error | null>(null)
  const [currentSearch, setCurrentSearch] = useState<StatusEvent[]>([])
  const [isThinking, setIsThinking] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const chatIdRef = useRef<string | null>(null)

  // --- Typewriter State ---
  const typewriterQueue = useRef<string>('')
  const isTypewriterRunning = useRef<boolean>(false)
  const assistantIdRef = useRef<string | null>(null)
  const currentTextRef = useRef<string>('')

  const startTypewriter = useCallback(() => {
    if (isTypewriterRunning.current) return
    isTypewriterRunning.current = true

    const pump = () => {
      if (!assistantIdRef.current) {
        isTypewriterRunning.current = false
        return
      }

      const queueLen = typewriterQueue.current.length
      if (queueLen === 0) {
        if (status === 'idle') {
          isTypewriterRunning.current = false
          return
        }
        // Wait for more tokens
        setTimeout(pump, 50)
        return
      }

      // Dynamic speed: if queue is large, drain faster
      let charsToTake = 2
      if (queueLen > 100) charsToTake = 12
      else if (queueLen > 50) charsToTake = 6
      else if (queueLen > 10) charsToTake = 3

      const nextChars = typewriterQueue.current.slice(0, charsToTake)
      typewriterQueue.current = typewriterQueue.current.slice(charsToTake)
      currentTextRef.current += nextChars

      setMessages(prev => prev.map(m =>
        m.id === assistantIdRef.current ? { ...m, content: currentTextRef.current } : m
      ))

      // Fixed interval for smooth visual flow
      // 33ms gives ~30fps which is smooth and saves massive CPU vs 15ms
      setTimeout(pump, 33)
    }

    pump()
  }, [status])

  useEffect(() => {
    if (status === 'streaming') {
      startTypewriter()
    }
  }, [status, startTypewriter])

  const stop = useCallback(() => {
    abortRef.current?.abort()
    setStatus('idle')
  }, [])

  const sendMessage = useCallback(async (
    text: string,
    options: {
      model: string
      chatId: string | null
      webSearch: boolean | 'auto'
      deepThink: boolean
      kbId?: string | null
    }
  ) => {
    const userMsg: ChatMessage = {
      id: generateId(),
      role: 'user',
      content: text,
    }

    setMessages(prev => [...prev, userMsg])
    setStatus('submitted')
    setError(null)
    setCurrentSearch([])
    setIsThinking(false)
    
    // Reset typewriter state
    typewriterQueue.current = ''
    currentTextRef.current = ''

    const assistantId = generateId()
    assistantIdRef.current = assistantId
    const assistantMsg: ChatMessage = {
      id: assistantId,
      role: 'assistant',
      content: '',
      searchSteps: [],
      citations: [],
    }

    setMessages(prev => [...prev, assistantMsg])

    const abortController = new AbortController()
    abortRef.current = abortController

    try {
      const allMessages = [...messages, userMsg].map(m => ({
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
        }),
        signal: abortController.signal,
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(errData.error || `HTTP ${res.status}`)
      }

      setStatus('streaming')

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
                  // Add to typewriter queue instead of updating messages directly
                  typewriterQueue.current += data.content
                  break
                }

                case 'status': {
                  const statusEvt = data as StatusEvent
                  if (statusEvt.type === 'search') {
                    accSearchSteps = [...accSearchSteps, statusEvt]
                    setCurrentSearch([...accSearchSteps])
                    setMessages(prev => prev.map(m =>
                      m.id === assistantId ? { ...m, searchSteps: [...accSearchSteps] } : m
                    ))
                  }
                  if (statusEvt.type === 'thinking') {
                    setIsThinking(statusEvt.stage === 'start')
                    setMessages(prev => prev.map(m =>
                      m.id === assistantId ? { ...m, isThinking: statusEvt.stage === 'start' } : m
                    ))
                  }
                  break
                }

                case 'citations': {
                  accCitations = data.results || []
                  setMessages(prev => prev.map(m =>
                    m.id === assistantId ? { ...m, citations: accCitations } : m
                  ))
                  break
                }

                case 'chatId': {
                  chatIdRef.current = data.id
                  break
                }

                case 'error': {
                  setError(new Error(data.message))
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
      if (e.name !== 'AbortError') {
        console.error('[useSSEChat] Error:', e)
        setError(e)
      }
    } finally {
      setStatus('idle')
      setIsThinking(false)
      setCurrentSearch([])
      abortRef.current = null
      // Assistant ID remains until next message to let typewriter finish the last bits
    }
  }, [messages, startTypewriter])

  const reset = useCallback(() => {
    setMessages([])
    setStatus('idle')
    setError(null)
    setCurrentSearch([])
    setIsThinking(false)
    chatIdRef.current = null
    typewriterQueue.current = ''
    currentTextRef.current = ''
    assistantIdRef.current = null
  }, [])

  return {
    messages,
    status,
    error,
    isThinking,
    currentSearch,
    chatIdRef,
    sendMessage,
    stop,
    reset,
    setMessages,
  }
}
