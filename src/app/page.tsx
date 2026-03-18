"use client"

import { useState, useRef, useEffect } from "react"
import { Bot, Globe, Brain, Sparkles, Code2, PenLine, Calculator, Languages, Search } from "lucide-react"
import { ChatPanel } from "@/components/chat-panel"
import { MessageRenderer } from "@/components/message-renderer"
import { SearchProgress } from "@/components/search-progress"
import { useSSEChat } from "@/hooks/use-sse-chat"

const SUGGESTIONS = [
  { icon: Sparkles, label: "解释量子计算", prompt: "用通俗易懂的方式解释量子计算，并用一个现实生活中的类比。" },
  { icon: Code2, label: "写一段 Python 脚本", prompt: "写一个 Python 脚本，读取 CSV 文件并生成汇总报告。" },
  { icon: PenLine, label: "撰写邮件", prompt: "帮我写一封专业的邮件，礼貌地拒绝一个会议邀请。" },
  { icon: Globe, label: "搜索最新 AI 新闻", prompt: "本月有哪些 AI 领域的最新突破？" },
  { icon: Calculator, label: "数学问题", prompt: "求解并解释：一列火车以80km/h行驶120km，再以90km/h行驶180km，整个行程的平均速度是多少？" },
  { icon: Languages, label: "翻译文本", prompt: "将以下内容翻译成英文、日文和西班牙文：'未来属于那些相信梦想之美的人。'" },
]

export default function Home() {
  const [selectedModel, setSelectedModel] = useState("ollama::llama3")
  const [webSearch, setWebSearch] = useState<boolean | 'auto'>('auto')
  const [deepThink, setDeepThink] = useState(false)
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
  } = useSSEChat()

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
    })
    setInputValue("")
  }

  return (
    <div className="flex flex-col h-full bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto app-scrollbar">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center min-h-full px-4 py-16">
            <div className="welcome-icon">
              <Sparkles className="size-8 text-white" />
            </div>
            <h1 className="text-4xl font-extrabold tracking-tight mb-3">ClosedUI</h1>
            <p className="text-zinc-500 dark:text-zinc-400 mb-12 text-center max-w-sm">
              强大的私有智能。本地优先的搜索与推理。
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-w-3xl w-full">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s.label}
                  onClick={() => {
                    setInputValue(s.prompt)
                    setWebSearch(true)
                  }}
                  className="suggestion-card"
                >
                  <div className="suggestion-icon">
                    <s.icon className="size-4" />
                  </div>
                  <span className="text-sm font-medium">{s.label}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
            {messages.map((m) => (
              <div key={m.id} className={`group flex gap-4 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {m.role === 'assistant' && (
                  <div className="assistant-avatar">
                    <Bot className="size-5 text-indigo-500" />
                  </div>
                )}

                <div className={`flex flex-col w-full ${m.role === 'user' ? 'items-end' : 'max-w-[100%]'}`}>
                  {/* Search progress display */}
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
            ))}

            {/* Loading indicator when submitted but no assistant message content yet */}
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
        )}
      </div>

      <div className="h-2" />

      {/* Input Area */}
      <div className="px-4 pb-6 pt-2">
        <div className="max-w-3xl mx-auto">
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
          />
        </div>
      </div>
    </div>
  )
}
