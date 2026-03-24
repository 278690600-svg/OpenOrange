"use client"

import { useEffect, useState, useRef, use } from "react"
import { Bot } from "lucide-react"
import { ChatPanel } from "@/components/chat-panel"
import { MessageRenderer } from "@/components/message-renderer"
import { SearchProgress } from "@/components/search-progress"
import { useSSEChat, type ChatMessage } from "@/hooks/use-sse-chat"

export default function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  const unwrappedParams = use(params)
  const [selectedModel, setSelectedModel] = useState("ollama::llama3")
  const [loadingHistory, setLoadingHistory] = useState(true)
  const [historyMessages, setHistoryMessages] = useState<ChatMessage[]>([])

  useEffect(() => {
    fetch(`/api/chats/${unwrappedParams.id}`)
      .then(res => res.json())
      .then(data => {
        if (data && data.messages) {
          setHistoryMessages(data.messages.map((m: any) => ({
            id: m.id,
            role: m.role as 'user' | 'assistant',
            content: m.content || '',
          })))
        }
        setLoadingHistory(false)
      })
      .catch((e) => {
        console.error(e)
        setLoadingHistory(false)
      })
  }, [unwrappedParams.id])

  return loadingHistory ? (
    <div className="flex h-full items-center justify-center text-zinc-500 bg-white dark:bg-zinc-950">
      <div className="flex flex-col items-center gap-3">
        <Bot className="size-8 animate-pulse text-indigo-500" />
        <span className="text-sm">正在加载聊天记录...</span>
      </div>
    </div>
  ) : (
    <ActiveChat
      initialMessages={historyMessages}
      chatId={unwrappedParams.id}
      selectedModel={selectedModel}
      setSelectedModel={setSelectedModel}
    />
  )
}

function ActiveChat({ initialMessages, chatId, selectedModel, setSelectedModel }: {
  initialMessages: ChatMessage[]
  chatId: string
  selectedModel: string
  setSelectedModel: (m: string) => void
}) {
  const [webSearch, setWebSearch] = useState<boolean | 'auto'>('auto')
  const [deepThink, setDeepThink] = useState(false)
  const [kbId, setKbId] = useState<string | null>(null)
  const [inputValue, setInputValue] = useState("")
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const {
    messages,
    status,
    error,
    isThinking,
    currentSearch,
    chatIdRef,
    sendMessage,
    stop,
    setMessages,
  } = useSSEChat()

  // Load initial messages
  useEffect(() => {
    if (initialMessages.length > 0) {
      setMessages(initialMessages)
    }
    chatIdRef.current = chatId
  }, [initialMessages, chatId, setMessages, chatIdRef])

  const isLoading = status === 'submitted' || status === 'streaming'

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading, currentSearch])

  const handleSendMessage = (e?: any) => {
    e?.preventDefault?.()
    const text = inputValue.trim()
    if (!text || isLoading) return
    sendMessage(text, {
      model: selectedModel,
      chatId: chatIdRef.current,
      webSearch,
      deepThink,
      kbId,
    })
    setInputValue("")
  }

  return (
    <div className="flex flex-col h-full bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
      <div className="flex-1 overflow-y-auto app-scrollbar">
        <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center mt-32 text-center text-zinc-500">
              <Bot className="size-16 mb-4 text-zinc-400" />
              <h2 className="text-2xl font-semibold mb-2 text-zinc-800 dark:text-zinc-200">聊天为空</h2>
            </div>
          ) : (
            messages.map((m) => (
              <div key={m.id} className={`group flex gap-4 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {m.role === 'assistant' && (
                  <div className="assistant-avatar">
                    <Bot className="size-5 text-indigo-500" />
                  </div>
                )}

                <div className={`flex flex-col w-full ${m.role === 'user' ? 'items-end' : 'max-w-[100%]'}`}>
                  {/* Search progress */}
                  {m.role === 'assistant' && (m.searchSteps?.length || 0) > 0 && (
                    <SearchProgress
                      steps={m.searchSteps || []}
                      citations={m.citations || []}
                      isActive={isLoading && m === messages[messages.length - 1]}
                    />
                  )}

                  <div className={`message-bubble ${
                    m.role === 'user' ? 'message-user' : 'message-assistant'
                  }`}>
                    <MessageRenderer
                      content={m.content}
                      role={m.role}
                      isStreaming={isLoading && m === messages[messages.length - 1] && m.role === 'assistant'}
                      isThinking={m.isThinking}
                    />
                  </div>
                </div>
              </div>
            ))
          )}
          {status === 'submitted' && (
            <div className="flex gap-4">
              <div className="assistant-avatar">
                <Bot className="size-5 text-indigo-500 animate-pulse" />
              </div>
              <div className="space-y-3 flex-1">
                {currentSearch.length > 0 && (
                  <SearchProgress
                    steps={currentSearch}
                    citations={[]}
                    isActive={true}
                  />
                )}
                <div className="loading-bubble">
                  <div className="loading-dots">
                    <div className="loading-dot" style={{ animationDelay: '-0.3s' }} />
                    <div className="loading-dot" style={{ animationDelay: '-0.15s' }} />
                    <div className="loading-dot" />
                  </div>
                </div>
              </div>
            </div>
          )}
          {error && (
            <div className="error-banner">
              <div className="size-1.5 rounded-full bg-red-500" />
              错误: {error.message || '连接失败'}
            </div>
          )}
          <div ref={messagesEndRef} className="h-4" />
        </div>
      </div>

      <div className="px-4 pb-6 pt-2">
        <div className="max-w-3xl mx-auto relative">
          <ChatPanel
            input={inputValue}
            setInput={setInputValue}
            onSubmit={handleSendMessage}
            isLoading={isLoading}
            stop={stop}
            selectedModel={selectedModel}
            setSelectedModel={setSelectedModel}
            webSearch={webSearch}
            setWebSearch={setWebSearch}
            deepThink={deepThink}
            setDeepThink={setDeepThink}
            kbId={kbId}
            setKbId={setKbId}
          />
        </div>
      </div>
    </div>
  )
}
