"use client"

import React, { useEffect, useState, useRef, use, useCallback, memo } from "react"
import { Copy, RotateCcw, Pencil, Check, FileDown, MessageSquareQuote, Trash2, Clock, Loader2, FileText } from "lucide-react"
import { asBlob } from 'html-docx-js-typescript'
import { saveAs } from 'file-saver'
import { ChatPanel, type ChatPanelHandle } from "@/components/chat-panel"
import { MessageRenderer } from "@/components/message-renderer"
import { SearchProgress } from "@/components/search-progress"
import { useSSEChat, type ChatMessage } from "@/hooks/use-sse-chat"
import { useChatById, useChatActions } from "@/lib/chat-context"
import { ArtifactProvider, useArtifact } from "@/lib/artifact-context"
import { ArtifactPanel } from "@/components/artifact-panel"
import { ArtifactsStudio, type ArtifactData } from "@/components/artifacts-studio"
import { ChatShareDialog } from "@/components/chat-share-dialog"
import { DeepResearchTimeline } from "@/components/deep-research-timeline"
import { useSearchParams } from "next/navigation"
import { useI18n } from "@/lib/i18n"
import { WelcomeHome } from "@/components/home-page"
import { Share2, Mic, Command, Eye, Sparkles as SparklesIcon } from "lucide-react"
import { cn } from "@/lib/utils"

export default function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { t } = useI18n()
  const unwrappedParams = use(params)
  const { getMigratedChatId } = useChatActions()

  const isNewChat = unwrappedParams.id === 'new' || unwrappedParams.id.startsWith('new-')
  const migratedId = !isNewChat ? undefined : getMigratedChatId(unwrappedParams.id)
  const effectiveId = migratedId || unwrappedParams.id

  const currentChatState = useChatById(isNewChat && !migratedId ? null : effectiveId)
  const [selectedModel, setSelectedModel] = useState("")
  const handleSetSelectedModel = useCallback((model: string) => {
    setSelectedModel(model)
    if (typeof window !== 'undefined') {
      localStorage.setItem('preferred_model', model)
    }
  }, [])

  const [loadingHistory, setLoadingHistory] = useState(!isNewChat)
  const [historyMessages, setHistoryMessages] = useState<ChatMessage[]>(() => {
    return isNewChat && !migratedId ? [] : []
  })
  const historyLoadedForIdRef = useRef<string | null>(null)
  const currentChatStateRef = useRef(currentChatState)

  useEffect(() => {
    currentChatStateRef.current = currentChatState
  }, [currentChatState])

  const chatKey = effectiveId

  useEffect(() => {
    async function initModel() {
      if (typeof window !== 'undefined') {
        const savedModel = localStorage.getItem('preferred_model')
        if (savedModel) {
          setSelectedModel(savedModel)
          return
        }
      }
      
      try {
        const r = await fetch('/api/settings')
        const data = await r.json()
        if (data?.defaultModel) {
          setSelectedModel(data.defaultModel)
        } else {
          setSelectedModel('ollama::llama3')
        }
      } catch {
        setSelectedModel('ollama::llama3')
      }
    }
    initModel()
  }, [])

  useEffect(() => {
    let controller: AbortController | null = null

    const loadHistory = async () => {
      if (isNewChat && !migratedId) {
        setLoadingHistory(false)
        historyLoadedForIdRef.current = null
        return
      }

      const loadId = migratedId || unwrappedParams.id

      const chatState = currentChatStateRef.current

      if (chatState && chatState.messages.length > 0) {
        setHistoryMessages(chatState.messages)
        setLoadingHistory(false)
        historyLoadedForIdRef.current = loadId
        return
      }

      if (historyLoadedForIdRef.current === loadId) {
        return
      }

      historyLoadedForIdRef.current = loadId
      setLoadingHistory(true)

      controller = new AbortController()

      try {
        const res = await fetch(`/api/chats/${loadId}`, { signal: controller.signal })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        if (data && data.messages && Array.isArray(data.messages)) {
          const apiMessages = data.messages.map((m: { id: string; role: string; content: string; citations?: unknown[]; searchSteps?: unknown[]; isThinking?: boolean }) => ({
            id: m.id,
            role: (m.role === 'user' ? 'user' : 'assistant') as 'user' | 'assistant',
            content: m.content || '',
            citations: m.citations || [],
            searchSteps: m.searchSteps || [],
            isThinking: m.isThinking || false,
          }))
          setHistoryMessages(apiMessages)
        } else {
          setHistoryMessages([])
        }
        setLoadingHistory(false)
      } catch (e) {
        const err = e as Error
        if (err.name === 'AbortError') {
          historyLoadedForIdRef.current = null
          return
        }
        console.error(`[ChatPage] Fetch error for ${loadId}:`, err)
        if (currentChatStateRef.current && currentChatStateRef.current.messages.length > 0) {
          setHistoryMessages(currentChatStateRef.current.messages)
        } else {
          setHistoryMessages([])
        }
        setLoadingHistory(false)
      }
    }

    void loadHistory()

    return () => {
      controller?.abort()
      historyLoadedForIdRef.current = null
    }
  }, [unwrappedParams.id, migratedId, isNewChat])

  return (loadingHistory && !isNewChat) ? (
    <div className="flex h-full items-center justify-center text-zinc-500 bg-white dark:bg-zinc-950">
      <div className="flex flex-col items-center gap-3">
        <img src="/brand/logo.png" alt="OpenOrangeAI" className="size-10 object-contain animate-[spin_3s_linear_infinite]" />
        <span className="text-sm">{t("Loading chat...")}</span>
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

const ChatMessageItem = memo(function ChatMessageItem({
  m, isLoading, isLast, editingMessageId, copiedId, selectedModel, chatIdRef, webSearch, deepThink, kbId, selectedPrompt,
  setEditingMessageId, setCopiedId, sendMessage, deleteMessage, regenerate, handleQuote, handleExportToWord, onSendToDocument, t,
}: {
  m: ChatMessage
  isLoading: boolean
  isLast: boolean
  editingMessageId: string | null
  copiedId: string | null
  selectedModel: string
  chatIdRef: React.MutableRefObject<string | null>
  webSearch: boolean | 'auto' | 'deep'
  deepThink: boolean
  kbId: string | null
  selectedPrompt: { id: string; name: string; description?: string; content?: string; isSystem?: boolean } | null
  setEditingMessageId: (id: string | null) => void
  setCopiedId: (id: string | null) => void
  sendMessage: (text: string, options: Record<string, unknown>, editMessageId?: string) => Promise<void> | void
  deleteMessage: (id: string) => void
  regenerate: (options: Record<string, unknown>) => void
  handleQuote: (content: string) => void
  handleExportToWord: (id: string, content: string) => void
  onSendToDocument: (content: string) => void
  t: (key: string) => string
}) {
  return (
    <div className={`group relative flex w-full ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
      {m.role === 'assistant' && (
        <div className="absolute -left-12 top-1 assistant-avatar hidden 2xl:flex overflow-hidden border border-orange-500/20 dark:border-orange-500/10 bg-white dark:bg-zinc-950 shadow-[0_2px_8px_rgba(249,115,22,0.15)] dark:shadow-[0_2px_8px_rgba(249,115,22,0.05)]">
          <img src="/brand/logo.png" alt="OpenOrangeAI" className="size-full object-contain p-1" />
        </div>
      )}

      <div className={`flex flex-col w-full ${m.role === 'user' ? 'items-end' : 'items-start max-w-full'}`}>
        {m.role === 'assistant' && (m.searchSteps?.length || 0) > 0 && (
          <SearchProgress
            steps={m.searchSteps || []}
            citations={m.citations || []}
            isActive={isLoading && isLast}
          />
        )}

        <div className={`message-bubble relative ${
          m.role === 'user' ? 'message-user' : 'message-assistant'
        }`}>
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
            <div className="flex flex-col gap-2 min-w-0 sm:min-w-[280px] w-full bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 p-3 rounded-lg shadow-sm">
              <textarea 
                id={`edit-input-${m.id}`}
                className="w-full bg-transparent resize-none outline-none text-sm text-zinc-800 dark:text-zinc-200" 
                defaultValue={m.content} 
                rows={Math.max(3, m.content.split('\n').length)}
                autoFocus
              />
              <div className="flex justify-end gap-2 mt-2">
                <button onClick={() => setEditingMessageId(null)} className="px-3 py-1.5 text-xs rounded-md bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-700 dark:hover:bg-zinc-600 text-zinc-600 dark:text-zinc-300 font-medium transition-colors">
                  {t("Cancel")}
                </button>
                <button 
                  onClick={() => {
                    const val = (document.getElementById(`edit-input-${m.id}`) as HTMLTextAreaElement).value
                    setEditingMessageId(null)
                    sendMessage(val, { model: selectedModel, chatId: chatIdRef.current ?? undefined, webSearch, deepThink, kbId, files: m.attachments, promptId: selectedPrompt?.id ?? undefined })
                  }} 
                  className="px-3 py-1.5 text-xs rounded-md bg-primary hover:bg-primary/90 text-primary-foreground font-medium transition-colors shadow-sm"
                >
                  {t("Send")}
                </button>
              </div>
            </div>
          ) : (
            <MessageRenderer
              id={m.id}
              content={m.content}
              role={m.role}
              isStreaming={isLoading && isLast && m.role === 'assistant'}
              isThinking={m.isThinking}
              citations={m.citations}
              onDelete={() => deleteMessage(m.id)}
              onQuote={() => handleQuote(m.content)}
              onOptionClick={(val) => {
                sendMessage(val, {
                  model: selectedModel,
                  chatId: chatIdRef.current ?? undefined,
                  webSearch,
                  deepThink,
                  kbId,
                  promptId: selectedPrompt?.id ?? undefined
                })
              }}
            />
          )}

          {m.role === 'user' && !m.isThinking && editingMessageId !== m.id && (
            <div className="sm:opacity-0 sm:group-hover:opacity-100 transition-opacity absolute top-1/2 -translate-y-1/2 -left-10 flex items-center">
              <button 
                onClick={() => setEditingMessageId(m.id)} 
                className="p-1.5 rounded-full text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 bg-white dark:bg-zinc-900 shadow-sm border border-zinc-200 dark:border-zinc-700 transition-colors"
                title={t("Edit Message")}
              >
                <Pencil className="size-3.5" />
              </button>
            </div>
          )}

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

              <button 
                onClick={() => onSendToDocument(m.content)}
                className="p-1.5 rounded-lg text-zinc-500 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all" 
                title={t('Send to Document')}
              >
                <FileText className="size-3.5" />
              </button>

              <div className="w-px h-3 bg-zinc-200 dark:bg-zinc-800 mx-0.5" />

              {isLast && (
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
  )
}, (prev, next) => {
  if (prev.m.id !== next.m.id) return false
  if (prev.m.content !== next.m.content) return false
  if (prev.m.role !== next.m.role) return false
  if (prev.m.isThinking !== next.m.isThinking) return false
  if (prev.m.searchSteps !== next.m.searchSteps) return false
  if (prev.m.citations !== next.m.citations) return false
  if (prev.m.attachments !== next.m.attachments) return false
  if (prev.isLoading !== next.isLoading) return false
  if (prev.isLast !== next.isLast) return false
  if (prev.editingMessageId === next.m.id || next.editingMessageId === next.m.id) return false
  if (prev.copiedId === next.m.id || next.copiedId === next.m.id) return false
  return true
})

const ActiveChat = memo(function ActiveChat({ initialMessages, chatId, selectedModel, setSelectedModel }: {
  initialMessages: ChatMessage[]
  chatId: string
  selectedModel: string
  setSelectedModel: (m: string) => void
}) {
  const { t } = useI18n()
  const searchParams = useSearchParams()
  const { activeArtifact, setActiveArtifact, updateArtifactCode } = useArtifact()
  const docFileInputRef = useRef<HTMLInputElement>(null)
  const [webSearch, setWebSearch] = useState<boolean | 'auto' | 'deep'>('auto')
  const [deepThink, setDeepThink] = useState(false)
  const [kbId, setKbId] = useState<string | null>(null)
  const [uploadedFiles, setUploadedFiles] = useState<Array<{ name: string; type: string; dataUrl?: string }>>([])
  const [selectedPrompt, setSelectedPrompt] = useState<{ id: string; name: string; description?: string; content?: string; isSystem?: boolean } | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const chatPanelRef = useRef<ChatPanelHandle>(null)
  const autoSentRef = useRef(false)

  const [editingMessageId, setEditingMessageId] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const [studioArtifact, setStudioArtifact] = useState<ArtifactData | null>(null)
  const [isStudioOpen, setIsStudioOpen] = useState(false)
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false)

  // Listen for open-artifacts-studio custom event from code blocks or tools
  useEffect(() => {
    const handleOpenStudio = (e: any) => {
      if (e.detail) {
        setStudioArtifact(e.detail)
        setIsStudioOpen(true)
      }
    }
    window.addEventListener('open-artifacts-studio', handleOpenStudio)
    return () => window.removeEventListener('open-artifacts-studio', handleOpenStudio)
  }, [])

  const {
    messages,
    status,
    error,
    currentSearch,
    chatIdRef,
    sendMessage,
    regenerate,
    stop,
    deleteMessage,
  } = useSSEChat(chatId, initialMessages)

  const isLoading = status === 'submitted' || status === 'streaming' || status === 'queued'

  const showLoadingBubble = status === 'submitted' || status === 'queued' || (
    status === 'streaming' && (
      !messages[messages.length - 1] ||
      messages[messages.length - 1].role === 'user' ||
      (
        messages[messages.length - 1].role === 'assistant' &&
        !messages[messages.length - 1].content &&
        !messages[messages.length - 1].searchSteps?.length &&
        !messages[messages.length - 1].isThinking
      )
    )
  )

  // Handle auto-send from query params
  useEffect(() => {
    if (chatId.startsWith('new') && !autoSentRef.current && messages.length === 0 && selectedModel && !isLoading) {
      const q = searchParams.get('q')
      const pId = searchParams.get('promptId')
      
      if (q) {
        autoSentRef.current = true
        
        const model = searchParams.get('model') || selectedModel
        const search = searchParams.get('search') || webSearch
        const thinking = searchParams.get('thinking') === 'true'
        
        // Use requestAnimationFrame to defer state updates outside of render cycle
        requestAnimationFrame(() => {
          if (searchParams.get('model')) setSelectedModel(searchParams.get('model')!)
          if (searchParams.get('search')) setWebSearch(searchParams.get('search') as boolean | 'auto' | 'deep')
          if (searchParams.get('thinking')) setDeepThink(thinking)
        })

        const sendWithPrompt = () => {
          sendMessage(q, {
            model,
            chatId: chatIdRef.current || chatId,
            webSearch: search as boolean | 'auto' | 'deep',
            deepThink: thinking,
            kbId: null,
            promptId: selectedPrompt?.id
          })
        }

        if (pId) {
          fetch('/api/prompts').then(r => r.json()).then(data => {
            if (Array.isArray(data)) {
              const p = data.find((x: { id: string }) => x.id === pId)
              if (p) setSelectedPrompt(p)
            }
          }).then(() => {
            setTimeout(sendWithPrompt, 100)
          })
        } else {
          setTimeout(sendWithPrompt, 50)
        }
      }
    }
  }, [chatId, searchParams, messages.length, sendMessage, selectedModel, setSelectedModel, webSearch, isLoading, chatIdRef, selectedPrompt?.id])

  const [shouldAutoScroll, setShouldAutoScroll] = useState(true)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const scrollRafRef = useRef<number>(0)

  const handleScroll = useCallback(() => {
    if (scrollRafRef.current) return
    scrollRafRef.current = requestAnimationFrame(() => {
      scrollRafRef.current = 0
      if (!scrollContainerRef.current) return
      const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current
      setShouldAutoScroll(scrollHeight - scrollTop - clientHeight < 150)
    })
  }, [])

  useEffect(() => {
    if (!shouldAutoScroll) return
    const raf = requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'auto' })
    })
    return () => cancelAnimationFrame(raf)
  }, [messages, isLoading, currentSearch, shouldAutoScroll])

  // 当生成开始时，如果就在底部，则锁定置底
  useEffect(() => {
    if (!isLoading) return
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current || {}
    if (scrollTop !== undefined && scrollHeight !== undefined && clientHeight !== undefined) {
         const isAtBottom = scrollHeight - scrollTop - clientHeight < 150
         requestAnimationFrame(() => {
           setShouldAutoScroll(isAtBottom)
         })
    }
  }, [isLoading])

  const handleSendMessage = useCallback((text: string, docOptions?: { docType: 'none' | 'ppt' | 'docx' | 'xlsx'; docStyle: string; docTheme: string }) => {
    if ((!text.trim() && uploadedFiles.length === 0) || isLoading) return
    const finalText = text.trim() || (uploadedFiles.some((f) => f.dataUrl) ? t("Analyze these images") : t("Analyze these files"))
    
    // Safety check for model
    const modelToUse = selectedModel || 'ollama::llama3'
    if (!selectedModel) setSelectedModel(modelToUse)

    const effectiveChatId = chatIdRef.current || (chatId.startsWith('new') ? chatId : chatId)
    console.log(`[Chat] Sending message to ${modelToUse} for chat ${effectiveChatId}`)

    sendMessage(finalText, {
      model: modelToUse,
      chatId: effectiveChatId,
      webSearch,
      deepThink,
      kbId,
      files: uploadedFiles,
      promptId: selectedPrompt?.id,
      docOptions,
    })
    setUploadedFiles([])
  }, [uploadedFiles, isLoading, selectedModel, setSelectedModel, sendMessage, webSearch, deepThink, kbId, selectedPrompt, chatId, chatIdRef, t])

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
  const handleSelectPrompt = useCallback((p: string) => {
    chatPanelRef.current?.setValue(p);
    chatPanelRef.current?.focus();
  }, [])

  const handleQuote = useCallback((content: string) => {
    const quote = content.split('\n').map(line => `> ${line}`).join('\n')
    chatPanelRef.current?.setValue((prev: string) => prev ? `${quote}\n\n${prev}` : `${quote}\n\n`)
    chatPanelRef.current?.focus()
  }, [])

  const handleDocAction = useCallback((action: 'new-word' | 'new-excel' | 'upload-doc' | 'ai-generate') => {
    if (action === 'new-word') {
      setActiveArtifact({
        id: `doc-${Date.now()}`,
        language: 'docx',
        code: '<h1>新文档</h1><p>在此开始编辑...</p>',
        title: '新 Word 文档'
      })
    } else if (action === 'new-excel') {
      setActiveArtifact({
        id: `xls-${Date.now()}`,
        language: 'xlsx',
        code: JSON.stringify({
          sheets: [{ name: 'Sheet1', headers: ['A', 'B', 'C'], rows: [['', '', '']] }]
        }),
        title: '新 Excel 表格'
      })
    } else if (action === 'upload-doc') {
      docFileInputRef.current?.click()
    } else if (action === 'ai-generate') {
      setActiveArtifact({
        id: `doc-ai-${Date.now()}`,
        language: 'docx',
        code: '<h1>AI 生成文档</h1><p>请在下方输入框中描述您需要的文档内容，AI 将为您生成...</p>',
        title: 'AI 生成文档'
      })
      setTimeout(() => {
        chatPanelRef.current?.setValue('请帮我生成一份文档，内容关于：')
        chatPanelRef.current?.focus()
      }, 100)
    }
  }, [setActiveArtifact])

  const handleDocFileUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const buffer = await file.arrayBuffer()
    const ext = file.name.split('.').pop()?.toLowerCase()

    if (ext === 'docx') {
      setActiveArtifact({
        id: `doc-${Date.now()}`,
        language: 'docx',
        code: new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), ''),
        title: file.name
      })
    } else if (ext === 'xlsx') {
      setActiveArtifact({
        id: `xls-${Date.now()}`,
        language: 'xlsx',
        code: new Uint8Array(buffer).reduce((data, byte) => data + String.fromCharCode(byte), ''),
        title: file.name
      })
    }

    if (docFileInputRef.current) docFileInputRef.current.value = ''
  }, [setActiveArtifact])

  const handleSendToDocument = useCallback((content: string) => {
    const htmlContent = content
      .replace(/^# (.*$)/gim, '<h1>$1</h1>')
      .replace(/^## (.*$)/gim, '<h2>$1</h2>')
      .replace(/^### (.*$)/gim, '<h3>$1</h3>')
      .replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/gim, '<em>$1</em>')
      .replace(/`(.*?)`/gim, '<code>$1</code>')
      .replace(/^- (.*$)/gim, '<li>$1</li>')
      .replace(/(<li>[\s\S]*<\/li>)/, '<ul>$1</ul>')
      .split('\n')
      .map(line => {
        if (line.trim() === '') return ''
        if (line.startsWith('<h') || line.startsWith('<ul') || line.startsWith('<li') || line.startsWith('</')) return line
        return `<p>${line}</p>`
      })
      .join('')

    if (activeArtifact?.language === 'docx') {
      updateArtifactCode(htmlContent)
    } else {
      setActiveArtifact({
        id: `doc-${Date.now()}`,
        language: 'docx',
        code: htmlContent,
        title: t("AI Generated Document") || 'AI 生成文档'
      })
    }
  }, [activeArtifact, setActiveArtifact, updateArtifactCode, t])

  return (
    <div className="flex w-full h-full overflow-hidden bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 relative">
      <div className="flex-1 flex flex-col h-full overflow-hidden relative">

        {/* Top-Right Next-Gen Quick Actions Bar */}
        <div className="absolute top-3 right-4 z-30 flex items-center gap-1.5 bg-background/80 backdrop-blur-md p-1 rounded-xl border border-border/80 shadow-sm">
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('open-voice-studio'))}
            title={t("Realtime Voice Studio") || "开启实时语音通话"}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium text-muted-foreground hover:text-orange-500 hover:bg-orange-500/10 transition-colors"
          >
            <Mic className="size-3.5 text-orange-500" />
            <span className="hidden sm:inline">{t("Voice Studio") || "实时语音"}</span>
          </button>
          <button
            onClick={() => setIsShareDialogOpen(true)}
            disabled={messages.length === 0}
            title={t("Export Chat Long Image") || "导出对话长图分享"}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-40"
          >
            <Share2 className="size-3.5" />
            <span className="hidden sm:inline">{t("Export Image") || "导出长图"}</span>
          </button>
          <button
            onClick={() => {
              if (studioArtifact) {
                setIsStudioOpen(!isStudioOpen)
              } else {
                setStudioArtifact({
                  id: `art-${Date.now()}`,
                  title: t("Live Canvas Studio") || '实时渲染画布 (Live Artifacts)',
                  type: 'html',
                  content: `<div class="p-8 text-center space-y-4">
                    <h1 class="text-2xl font-bold text-orange-500">Live Artifacts 2.0 Studio</h1>
                    <p class="text-zinc-500">${t("In chat, when generating HTML, React, SVG, Mermaid code, interact with live prototype here.") || "在对话中生成 HTML、React、SVG、Mermaid 代码时，可在本画布中实时热渲染交互原型。"}</p>
                    <div class="flex justify-center gap-2">
                      <button class="px-4 py-2 bg-orange-500 text-white rounded-lg font-medium shadow-md hover:bg-orange-600">${t("Sample Interactive Button") || "交互按钮示例"}</button>
                    </div>
                  </div>`
                })
                setIsStudioOpen(true)
              }
            }}
            title={t("Toggle Live Canvas Studio") || "切换实时双栏画布"}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors",
              isStudioOpen ? "bg-orange-500 text-white shadow-sm" : "text-muted-foreground hover:text-foreground hover:bg-muted"
            )}
          >
            <Eye className="size-3.5" />
            <span className="hidden sm:inline">{t("Live Canvas") || "实时画布"}</span>
          </button>
        </div>

        <div 
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto app-scrollbar relative flex flex-col"
        >
          <div className={`max-w-5xl w-full mx-auto px-4 ${messages.length === 0 ? 'flex-1 flex flex-col justify-center' : 'py-12 space-y-8'}`}>
          {messages.length === 0 && status !== 'queued' ? (
            <WelcomeHome 
              onSelectPrompt={handleSelectPrompt} 
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
            messages.map((m, idx) => (
              <ChatMessageItem
                key={m.id}
                m={m}
                isLoading={isLoading}
                isLast={idx === messages.length - 1}
                editingMessageId={editingMessageId}
                copiedId={copiedId}
                selectedModel={selectedModel}
                chatIdRef={chatIdRef}
                webSearch={webSearch}
                deepThink={deepThink}
                kbId={kbId}
                selectedPrompt={selectedPrompt}
                setEditingMessageId={setEditingMessageId}
                setCopiedId={setCopiedId}
                sendMessage={sendMessage as unknown as (text: string, options: Record<string, unknown>, editMessageId?: string) => void}
                deleteMessage={deleteMessage}
                regenerate={regenerate as unknown as (options: Record<string, unknown>) => void}
                handleQuote={handleQuote}
                handleExportToWord={handleExportToWord}
                onSendToDocument={handleSendToDocument}
                t={t}
              />
            ))
          )}
          {showLoadingBubble && (
            <div className="flex gap-4">
              <div className="assistant-avatar overflow-hidden border border-orange-500/20 dark:border-orange-500/10 bg-white dark:bg-zinc-950 shadow-[0_2px_8px_rgba(249,115,22,0.15)] dark:shadow-[0_2px_8px_rgba(249,115,22,0.05)] animate-pulse">
                <img src="/brand/logo.png" alt="OpenOrangeAI" className="size-full object-contain p-1" />
              </div>
              <div className="space-y-3 flex-1">
                {currentSearch.length > 0 && (
                  <SearchProgress
                    steps={currentSearch}
                    citations={[]}
                    isActive={true}
                  />
                )}
                {status === 'queued' ? (
                  <div className="flex flex-col gap-2 p-4 rounded-2xl bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-800/30 w-full max-w-sm animate-in fade-in slide-in-from-left-4">
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <Clock className="size-4 text-amber-600 animate-pulse" />
                        <div className="absolute -top-1 -right-1 size-2 bg-amber-400 rounded-full animate-ping" />
                      </div>
                      <span className="text-sm font-semibold text-amber-900 dark:text-amber-200">{t("Task queued...")}</span>
                    </div>
                    <p className="text-xs text-amber-700/80 dark:text-amber-400/80">
                      {t("Your task is queued and will start automatically when a slot is available.")}
                    </p>
                  </div>
                ) : (
                  <div className="loading-bubble">
                    <div className="loading-dots">
                      <div className="loading-dot" style={{ animationDelay: '-0.3s' }} />
                      <div className="loading-dot" style={{ animationDelay: '-0.15s' }} />
                      <div className="loading-dot" />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
          {error && (
            <div className="error-banner">
              <div className="size-1.5 rounded-full bg-red-500" />
              <span className="flex-1">{t("Error")}: {error.message || t("Connection failed")}</span>
              <button 
                onClick={() => {
                  const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')
                  if (lastUserMsg) {
                    regenerate({ model: selectedModel, webSearch, deepThink, kbId, promptId: selectedPrompt?.id })
                  }
                }}
                className="ml-2 px-3 py-1 text-xs rounded-md bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-500/20 transition-colors font-medium"
              >
                {t("Retry")}
              </button>
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
            onDocAction={handleDocAction}
          />
        </div>
      </div>
      </div>
      
      {/* Right side live artifacts studio and legacy doc panel */}
      <ArtifactsStudio
        artifact={studioArtifact}
        isOpen={isStudioOpen}
        onClose={() => setIsStudioOpen(false)}
      />

      <ChatShareDialog
        isOpen={isShareDialogOpen}
        onClose={() => setIsShareDialogOpen(false)}
        chatTitle={messages[0]?.content ? messages[0].content.slice(0, 30) : "OpenOrangeAI 智能对话"}
        messages={messages}
      />

      <input
        type="file"
        ref={docFileInputRef}
        onChange={handleDocFileUpload}
        accept=".docx,.xlsx"
        className="hidden"
      />
      <ArtifactPanel />
    </div>
  )
})


