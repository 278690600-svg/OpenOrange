"use client"

import { useState, useRef, useEffect } from "react"
import { Bot, Globe, Brain, Sparkles, Code2, PenLine, Calculator, Languages, Search, Copy, RotateCcw, Pencil, Check } from "lucide-react"
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
  const [webSearch, setWebSearch] = useState<boolean | 'auto' | 'deep'>('auto')
  const [deepThink, setDeepThink] = useState(false)
  const [kbId, setKbId] = useState<string | null>(null)
  const [inputValue, setInputValue] = useState("")
  const [uploadedFiles, setUploadedFiles] = useState<any[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const [editingMessageId, setEditingMessageId] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const {
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
  } = useSSEChat()

  const isLoading = status === 'submitted' || status === 'streaming'

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading, currentSearch])

  const handleSendMessage = (e?: any) => {
    e?.preventDefault?.()
    const text = inputValue.trim()
    // Allow sending if there's text OR uploaded files
    if ((!text && uploadedFiles.length === 0) || isLoading) return
    const finalText = text || (uploadedFiles.some(f => f.dataUrl) ? '请分析这些图片' : '请分析这些文件')
    sendMessage(finalText, {
      model: selectedModel,
      chatId: chatIdRef.current,
      webSearch,
      deepThink,
      kbId,
      files: uploadedFiles,
    })
    setInputValue("")
    setUploadedFiles([])
  }

  return (
    <div className="flex flex-col h-full bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto app-scrollbar">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center min-h-full px-4 py-16">
            <div className="welcome-icon">
              <img src="/logo.png" alt="OpenOrangeAI" className="size-full object-contain" />
            </div>
            <h1 className="text-4xl font-extrabold tracking-tight mb-3">OpenOrangeAI</h1>
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
                    <Bot className="size-5 text-primary" />
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

                  <div className={`message-bubble relative ${
                    m.role === 'user' ? 'message-user' : 'message-assistant'
                  }`}>
                    {/* Show attachments in user message */}
                    {m.role === 'user' && m.attachments && m.attachments.length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-2">
                        {m.attachments.map((a, i) => a.dataUrl ? (
                          <img key={i} src={a.dataUrl} alt={a.name} title={a.name}
                            className="max-h-36 max-w-[240px] rounded-lg border border-zinc-200 dark:border-zinc-700 object-contain"
                          />
                        ) : (
                          <div key={i} className="flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-md bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300">
                            📎 {a.name}
                          </div>
                        ))}
                      </div>
                    )}
                    {editingMessageId === m.id ? (
                      <div className="flex flex-col gap-2 min-w-[280px] w-full bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 p-3 rounded-lg shadow-sm">
                        <textarea 
                          id={`edit-input-${m.id}`}
                          className="w-full bg-transparent resize-none outline-none text-sm text-zinc-800 dark:text-zinc-200" 
                          defaultValue={m.content} 
                          rows={Math.max(3, m.content.split('\n').length)}
                          autoFocus
                        />
                        <div className="flex justify-end gap-2 mt-2">
                          <button onClick={() => setEditingMessageId(null)} className="px-3 py-1.5 text-xs rounded-md bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-700 dark:hover:bg-zinc-600 text-zinc-600 dark:text-zinc-300 font-medium transition-colors">
                            取消
                          </button>
                          <button 
                            onClick={() => {
                              const val = (document.getElementById(`edit-input-${m.id}`) as HTMLTextAreaElement).value
                              setEditingMessageId(null)
                              sendMessage(val, { model: selectedModel, chatId: chatIdRef.current, webSearch, deepThink, kbId, files: m.attachments }, m.id)
                            }} 
                            className="px-4 py-2 text-xs rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-semibold transition-all shadow-md shadow-primary/20"
                          >
                            发送
                          </button>
                        </div>
                      </div>
                    ) : (
                      <MessageRenderer
                        content={m.content}
                        role={m.role}
                        isStreaming={isLoading && m === messages[messages.length - 1] && m.role === 'assistant'}
                        isThinking={m.isThinking}
                      />
                    )}

                    {/* User Edit Button */}
                    {m.role === 'user' && !m.isThinking && editingMessageId !== m.id && (
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute top-1/2 -translate-y-1/2 -left-10 flex items-center">
                        <button 
                          onClick={() => setEditingMessageId(m.id)} 
                          className="p-1.5 rounded-full text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 bg-white dark:bg-zinc-900 shadow-sm border border-zinc-200 dark:border-zinc-700 transition-colors"
                          title="编辑消息"
                        >
                          <Pencil className="size-3.5" />
                        </button>
                      </div>
                    )}

                    {/* Assistant Action Bar */}
                    {m.role === 'assistant' && (
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute -bottom-7 left-1 flex items-center gap-1">
                        <button 
                          onClick={() => {
                            navigator.clipboard.writeText(m.content)
                            setCopiedId(m.id)
                            setTimeout(() => setCopiedId(null), 2000)
                          }} 
                          className="p-1 rounded text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors" 
                          title="复制回答"
                        >
                          {copiedId === m.id ? <Check className="size-3.5 text-green-500" /> : <Copy className="size-3.5" />}
                        </button>
                        {m === messages[messages.length - 1] && !isLoading && (
                          <button 
                            onClick={() => regenerate({ model: selectedModel, webSearch, deepThink, kbId })} 
                            className="p-1 rounded text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors" 
                            title="重新生成"
                          >
                            <RotateCcw className="size-3.5" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {/* Loading indicator when submitted but no assistant message content yet */}
            {status === 'submitted' && (
              <div className="flex gap-4">
                <div className="assistant-avatar">
                  <Bot className="size-5 text-primary animate-pulse" />
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
            kbId={kbId}
            setKbId={setKbId}
            uploadedFiles={uploadedFiles}
            setUploadedFiles={setUploadedFiles}
          />
        </div>
      </div>
    </div>
  )
}
