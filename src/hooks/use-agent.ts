import { useState, useRef, useCallback } from 'react'

export interface AgentEvent {
  type: 'agent-start' | 'agent-tool-call' | 'agent-tool-result' | 'text' | 'done' | 'error'
  tool?: string
  args?: any
  url?: string
  query?: string
  text?: string
  message?: string
  result?: string
  items?: { title: string; url: string; snippet: string }[]
  completedUrl?: string
  pageTitle?: string
  status?: string
  screenshot?: string
}

export interface AgentAction {
  id: string
  type: 'tool-call' | 'tool-result' | 'agent-message' | 'error'
  tool?: string
  message: string
  data?: any
  timestamp: number
}

export function useAgent() {
  const [actions, setActions] = useState<AgentAction[]>([])
  const [isRunning, setIsRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [inputValue, setInputValue] = useState('')
  const abortControllerRef = useRef<AbortController | null>(null)

  const send = useCallback(async (message: string, model: string, history?: any[]) => {
    if (isRunning) return
    
    setIsRunning(true)
    setError(null)
    
    // Add user message to actions
    setActions(prev => [...prev, {
      id: `user-${Date.now()}`,
      type: 'agent-message',
      message,
      data: { role: 'user' },
      timestamp: Date.now(),
    }])

    const controller = new AbortController()
    abortControllerRef.current = controller

    try {
      const res = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, model, history }),
        signal: controller.signal,
      })

      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      if (!res.body) throw new Error('No response body')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('event: ')) {
            const eventType = line.slice(7).trim()
            // Next line should be data
            const nextLineIdx = lines.indexOf(line) + 1
            if (nextLineIdx < lines.length && lines[nextLineIdx].startsWith('data: ')) {
              const data = JSON.parse(lines[nextLineIdx].slice(6))
              
              switch (eventType) {
                case 'agent-start':
                  break
                case 'agent-tool-call':
                  setActions(prev => [...prev, {
                    id: `call-${Date.now()}`,
                    type: 'tool-call',
                    tool: data.tool,
                    message: data.message || `调用工具: ${data.tool}`,
                    data,
                    timestamp: Date.now(),
                  }])
                  break
                case 'agent-tool-result':
                  setActions(prev => [...prev, {
                    id: `result-${Date.now()}`,
                    type: 'tool-result',
                    tool: data.tool,
                    message: data.message || `${data.tool} 执行完成`,
                    data,
                    timestamp: Date.now(),
                  }])
                  break
                case 'text':
                  // Update the last agent message or create one
                  setActions(prev => {
                    const last = prev[prev.length - 1]
                    if (last && last.type === 'agent-message' && last.data?.role === 'assistant' && last.data?.streaming) {
                      return [...prev.slice(0, -1), {
                        ...last,
                        message: last.message + data.text,
                        data: { ...last.data, text: (last.data.text || '') + data.text },
                      }]
                    }
                    return [...prev, {
                      id: `text-${Date.now()}`,
                      type: 'agent-message',
                      message: data.text,
                      data: { role: 'assistant', streaming: true, text: data.text },
                      timestamp: Date.now(),
                    }]
                  })
                  break
                case 'done':
                  setActions(prev => {
                    const last = prev[prev.length - 1]
                    if (last && last.type === 'agent-message' && last.data?.streaming) {
                      return [...prev.slice(0, -1), {
                        ...last,
                        data: { ...last.data, streaming: false },
                      }]
                    }
                    return [...prev, {
                      id: `done-${Date.now()}`,
                      type: 'agent-message',
                      message: data.text || '',
                      data: { role: 'assistant', streaming: false, text: data.text },
                      timestamp: Date.now(),
                    }]
                  })
                  break
                case 'error':
                  setError(data.message)
                  break
              }
            }
          }
        }
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error('[Agent] Error:', err)
        setError(err.message || 'Agent 执行失败')
      }
    } finally {
      setIsRunning(false)
      abortControllerRef.current = null
    }
  }, [isRunning])

  const stop = useCallback(() => {
    abortControllerRef.current?.abort()
    setIsRunning(false)
  }, [])

  const clear = useCallback(() => {
    setActions([])
    setError(null)
    setInputValue('')
  }, [])

  return {
    actions,
    isRunning,
    error,
    inputValue,
    setInputValue,
    send,
    stop,
    clear,
  }
}
