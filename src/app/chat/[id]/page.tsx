"use client"

import { useEffect, useState, useRef, use, useCallback } from "react"
import { Bot, Copy, RotateCcw, Pencil, Check, ShieldCheck, Globe, Brain, Search, Info, FileDown, MessageSquareQuote, Trash2, Clock, Loader2 } from "lucide-react"
import { asBlob } from 'html-docx-js-typescript'
import { saveAs } from 'file-saver'
import { ChatPanel } from "@/components/chat-panel"
import { MessageRenderer } from "@/components/message-renderer"
import { SearchProgress } from "@/components/search-progress"
import { useSSEChat, type ChatMessage } from "@/hooks/use-sse-chat"
import { useChatState } from "@/lib/chat-context"
import { ArtifactProvider } from "@/lib/artifact-context"
import { ArtifactPanel } from "@/components/artifact-panel"
import { useSearchParams } from "next/navigation"
import { useI18n } from "@/lib/i18n"
import { WelcomeHome } from "@/components/home-page"

export default function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  const unwrappedParams = use(params)
  const searchParams = useSearchParams()
  const chats = useChatState()
  const [selectedModel, setSelectedModel] = useState("")
  const handleSetSelectedModel = useCallback((model: string) => {
    setSelectedModel(model)
    if (typeof window !== 'undefined') {
      localStorage.setItem('preferred_model', model)
    }
  }, [])

  const [loadingHistory, setLoadingHistory] = useState(true)
  const [historyMessages, setHistoryMessages] = useState<ChatMessage[]>([])

  // Use timestamp param as key to force re-mount on "New Chat" clicks
  const chatKey = unwrappedParams.id === 'new' 
    ? `new-${searchParams.get('t') || '0'}` 
    : unwrappedParams.id

  // Load default model from settings or localStorage
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedModel = localStorage.getItem('preferred_model')
      if (savedModel) {
        setSelectedModel(savedModel)
        return
      }
    }
    fetch('/api/settings').then(r => r.json()).then(data => {
      if (data?.defaultModel) setSelectedModel(data.defaultModel)
      else setSelectedModel('ollama::llama3')
    }).catch(() => setSelectedModel('ollama::llama3'))
  }, [])

  useEffect(() => {
    if (unwrappedParams.id === 'new') {
      setHistoryMessages([])
      setLoadingHistory(false)
      return
    }

    // 截胡！如果内存状态中已存在当前对话的消息，说明是从新建对话平滑路由切换过来的
    if (chats && chats[unwrappedParams.id]) {
      setHistoryMessages(chats[unwrappedParams.id].messages)
      setLoadingHistory(false)
      return
    }

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
    <ArtifactProvider>
      <ActiveChat
        key={chatKey}
        initialMessages={historyMessages}
        chatId={chatKey}
        selectedModel={selectedModel}
        setSelectedModel={handleSetSelectedModel}
      />
    </ArtifactProvider>
  )
}

function ActiveChat({ initialMessages, chatId, selectedModel, setSelectedModel }: {
  initialMessages: ChatMessage[]
  chatId: string
  selectedModel: string
  setSelectedModel: (m: string) => void
}) {
  const { t } = useI18n()
  const searchParams = useSearchParams()
  const [webSearch, setWebSearch] = useState<boolean | 'auto' | 'deep'>('auto')
  const [deepThink, setDeepThink] = useState(false)
  const [kbId, setKbId] = useState<string | null>(null)
  const [uploadedFiles, setUploadedFiles] = useState<any[]>([])
  const [selectedPrompt, setSelectedPrompt] = useState<any>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const chatPanelRef = useRef<any>(null)
  const autoSentRef = useRef(false)

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
    setMessages,
    deleteMessage,
  } = useSSEChat(chatId, initialMessages)

  const isLoading = status === 'submitted' || status === 'streaming' || status === 'queued'

  // Handle auto-send from query params
  useEffect(() => {
    if (chatId.startsWith('new') && !autoSentRef.current && messages.length === 0 && selectedModel) {
      const q = searchParams.get('q')
      const pId = searchParams.get('promptId')
      
      if (q) {
        autoSentRef.current = true
        const model = searchParams.get('model') || selectedModel
        const search = searchParams.get('search') || webSearch
        const thinking = searchParams.get('thinking') === 'true'
        
        if (searchParams.get('model')) setSelectedModel(searchParams.get('model')!)
        if (searchParams.get('search')) setWebSearch(searchParams.get('search') as any)
        if (searchParams.get('thinking')) setDeepThink(thinking)

        // If promptId is in URL, fetch prompts and select it
        if (pId) {
          fetch('/api/prompts').then(r => r.json()).then(data => {
            if (Array.isArray(data)) {
              const p = data.find(x => x.id === pId)
              if (p) setSelectedPrompt(p)
            }
          }).finally(() => {
            // Send message after attempting to set prompt
            sendMessage(q, {
              model,
              chatId: chatId,
              webSearch: search as any,
              deepThink: thinking,
              kbId: null,
              promptId: pId
            })
          })
        } else {
          sendMessage(q, {
            model,
            chatId: chatId,
            webSearch: search as any,
            deepThink: thinking,
            kbId: null,
            promptId: selectedPrompt?.id
          })
        }
      }
    }
  }, [chatId, searchParams, messages.length, sendMessage, selectedModel, webSearch])

  const [shouldAutoScroll, setShouldAutoScroll] = useState(true)
  const scrollContainerRef = useRef<HTMLDivElement>(null)

  // 处理滚动事件，判断是否处于底部
  const handleScroll = () => {
    if (!scrollContainerRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 150
    setShouldAutoScroll(isAtBottom)
  }

  // 消息更新时的智能置底
  useEffect(() => {
    if (shouldAutoScroll) {
        messagesEndRef.current?.scrollIntoView({ behavior: 'auto' })
    }
  }, [messages, isLoading, currentSearch, shouldAutoScroll])

  // 当生成开始时，如果就在底部，则锁定置底
  useEffect(() => {
    if (isLoading) {
        const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current || {}
        if (scrollTop !== undefined && scrollHeight !== undefined && clientHeight !== undefined) {
             const isAtBottom = scrollHeight - scrollTop - clientHeight < 150
             setShouldAutoScroll(isAtBottom)
        }
    }
  }, [isLoading])

  const handleSendMessage = (text: string) => {
    if ((!text.trim() && uploadedFiles.length === 0) || isLoading) return
    const finalText = text.trim() || (uploadedFiles.some((f: any) => f.dataUrl) ? '请分析这些图片' : '请分析这些文件')
    sendMessage(finalText, {
      model: selectedModel,
      chatId: chatIdRef.current,
      webSearch,
      deepThink,
      kbId,
      files: uploadedFiles,
      promptId: selectedPrompt?.id,
    })
    setUploadedFiles([])
  }

  const handleExportToWord = async (messageId: string, content: string) => {
    const safeId = (messageId || content.substring(0, 10)).replace(/[^a-zA-Z0-9]/g, '-')
    const container = document.getElementById(`msg-container-${safeId}`)
    const html = container?.innerHTML || ''
    
    const fullHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            body { font-family: 'Times New Roman', serif; line-height: 1.6; }
            table { border-collapse: collapse; width: 100%; border: 1px solid #ccc; margin-bottom: 20px; }
            th, td { border: 1px solid #ccc; padding: 8px; text-align: left; }
            th { background-color: #f2f2f2; }
            pre { background-color: #f4f4f4; padding: 10px; border: 1px solid #ddd; }
            code { font-family: Consolas, monospace; }
            h1, h2, h3 { color: #333; }
          </style>
        </head>
        <body>
          ${html}
        </body>
      </html>
    `
    
    const blob = await asBlob(fullHtml)
    saveAs(blob as Blob, `OpenOrangeAI_Export_${Date.now()}.docx`)
  }

  const handleQuote = (content: string) => {
    const quote = content.split('\n').map(line => `> ${line}`).join('\n')
    chatPanelRef.current?.setValue((prev: string) => prev ? `${quote}\n\n${prev}` : `${quote}\n\n`)
    chatPanelRef.current?.focus()
  }

  return (
    <div className="flex w-full h-full overflow-hidden bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 relative">
      <div className="flex-1 flex flex-col h-full overflow-hidden relative">

        <div 
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto app-scrollbar relative flex flex-col"
        >
          <div className={`max-w-5xl w-full mx-auto px-4 ${messages.length === 0 ? 'flex-1 flex flex-col justify-end pb-24' : 'py-12 space-y-8'}`}>
          {messages.length === 0 && status !== 'queued' ? (
            <WelcomeHome 
              onSelectPrompt={(p) => {
                chatPanelRef.current?.setValue(p);
                chatPanelRef.current?.focus();
              }} 
            />
          ) : messages.length === 0 && status === 'queued' ? (
            <div className="flex flex-col items-center justify-center py-32 gap-6 text-zinc-500 animate-in fade-in zoom-in duration-700">
               <div className="relative">
                 <Clock className="size-16 text-indigo-400/50 animate-[pulse_3s_ease-in-out_infinite]" />
                 <div className="absolute inset-0 flex items-center justify-center">
                    <Loader2 className="size-8 text-indigo-500 animate-spin" />
                 </div>
               </div>
               <div className="flex flex-col items-center gap-2 text-center">
                 <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">{t("Task Queued")}</h3>
                 <p className="text-sm text-zinc-500 max-w-xs">{t("Currently there are other tasks running. This task will start automatically once a slot is available.")}</p>
               </div>
               <button 
                 onClick={stop}
                 className="mt-4 px-6 py-2 rounded-full border border-zinc-200 dark:border-zinc-800 text-xs font-bold hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all"
               >
                 {t("Cancel Task")}
               </button>
            </div>
          ) : (
            messages.map((m) => (
              <div key={m.id} className={`group relative flex w-full ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {m.role === 'assistant' && (
                  <div className="absolute -left-12 top-1 assistant-avatar hidden 2xl:flex">
                    <Bot className="size-5 text-indigo-500" />
                  </div>
                )}

                <div className={`flex flex-col w-full ${m.role === 'user' ? 'items-end' : 'items-start max-w-full'}`}>
                  {/* Search progress */}
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
                              sendMessage(val, { model: selectedModel, chatId: chatIdRef.current, webSearch, deepThink, kbId, files: m.attachments, promptId: selectedPrompt?.id }, m.id)
                            }} 
                            className="px-3 py-1.5 text-xs rounded-md bg-indigo-600 hover:bg-indigo-700 text-white font-medium transition-colors shadow-sm"
                          >
                            发送
                          </button>
                        </div>
                      </div>
                    ) : (
                      <MessageRenderer
                        id={m.id}
                        content={m.content}
                        role={m.role}
                        isStreaming={isLoading && m === messages[messages.length - 1] && m.role === 'assistant'}
                        isThinking={m.isThinking}
                        citations={m.citations}
                        onDelete={() => deleteMessage(m.id)}
                        onQuote={() => handleQuote(m.content)}
                        onOptionClick={(val) => {
                          sendMessage(val, {
                            model: selectedModel,
                            chatId: chatIdRef.current,
                            webSearch,
                            deepThink,
                            kbId,
                            promptId: selectedPrompt?.id
                          })
                        }}
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

                    {/* Assistant Action Bar - Unified Pill */}
                    {m.role === 'assistant' && !isLoading && (
                      <div className="opacity-0 group-hover:opacity-100 transition-opacity absolute -bottom-8 left-0 flex items-center gap-1 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-md border border-zinc-200 dark:border-zinc-800 p-1 rounded-xl shadow-lg z-30 translate-y-1 group-hover:translate-y-0 transition-all duration-200">
                        <button 
                          onClick={() => {
                            navigator.clipboard.writeText(m.content)
                            setCopiedId(m.id)
                            setTimeout(() => setCopiedId(null), 2000)
                          }} 
                          className="p-1.5 rounded-lg text-zinc-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all" 
                          title={t('Copy Message')}
                        >
                          {copiedId === m.id ? <Check className="size-3.5 text-green-500" /> : <Copy className="size-3.5" />}
                        </button>
                        
                        <button 
                          onClick={() => handleQuote(m.content)}
                          className="p-1.5 rounded-lg text-zinc-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all" 
                          title={t('Quote Message')}
                        >
                          <MessageSquareQuote className="size-3.5" />
                        </button>

                        <button 
                          onClick={() => handleExportToWord(m.id, m.content)}
                          className="p-1.5 rounded-lg text-zinc-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all" 
                          title={t('Export to Word')}
                        >
                          <FileDown className="size-3.5" />
                        </button>

                        <div className="w-px h-3 bg-zinc-200 dark:bg-zinc-800 mx-0.5" />

                        {m === messages[messages.length - 1] && (
                          <button 
                            onClick={() => regenerate({ model: selectedModel, webSearch, deepThink, kbId, promptId: selectedPrompt?.id })} 
                            className="p-1.5 rounded-lg text-zinc-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all" 
                            title={t('Regenerate')}
                          >
                            <RotateCcw className="size-3.5" />
                          </button>
                        )}
                        
                        <button 
                          onClick={() => deleteMessage(m.id)} 
                          className="p-1.5 rounded-lg text-zinc-500 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all" 
                          title={t('Delete Message')}
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    )}
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
        <div className="max-w-4xl mx-auto relative">
          <ChatPanel
            ref={chatPanelRef}
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
            selectedPrompt={selectedPrompt}
            setSelectedPrompt={setSelectedPrompt}
          />
        </div>
      </div>
      </div>
      
      {/* Right side artifact panel */}
      <ArtifactPanel />
    </div>
  )
}
