import React, { useEffect, useState, useRef, useImperativeHandle, forwardRef } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { SendHorizonal, StopCircle, Globe, Brain, ChevronDown, Search, Database, Paperclip, X, FileText, Loader2, Square, Sparkles, AudioWaveform, Bot, ChevronRight } from "lucide-react"
import { useI18n } from "@/lib/i18n"

type Model = { id: string; name: string; provider: string }

const PROVIDER_COLORS: Record<string, string> = {
  ollama: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  lmstudio: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  openai: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  'local-gguf': 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
}

export interface ChatPanelHandle {
  setValue: (value: string | ((prev: string) => string)) => void;
  focus: () => void;
  getValue: () => string;
}

interface ChatPanelProps {
  onSubmit: (input: string) => void;
  isLoading: boolean;
  stop: () => void;
  selectedModel: string;
  setSelectedModel: (m: string) => void;
  webSearch: boolean | 'auto' | 'deep';
  setWebSearch: (v: boolean | 'auto' | 'deep') => void;
  deepThink: boolean;
  setDeepThink: (v: boolean) => void;
  kbId?: string | null;
  setKbId?: (v: string | null) => void;
  uploadedFiles: any[];
  setUploadedFiles: (files: any[]) => void;
  selectedPrompt?: any;
  setSelectedPrompt?: (p: any) => void;
}

export const ChatPanel = forwardRef<ChatPanelHandle, ChatPanelProps>(({
  onSubmit, isLoading, stop,
  selectedModel, setSelectedModel,
  webSearch, setWebSearch,
  deepThink, setDeepThink,
  kbId, setKbId,
  uploadedFiles, setUploadedFiles,
  selectedPrompt, setSelectedPrompt
}, ref) => {
  const { t } = useI18n()
  const [input, setInput] = useState("")
  const [models, setModels] = useState<Model[]>([])
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false)
  const [kbs, setKbs] = useState<any[]>([])
  const [kbDropdownOpen, setKbDropdownOpen] = useState(false)
  const [prompts, setPrompts] = useState<any[]>([])
  const [promptDropdownOpen, setPromptDropdownOpen] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useImperativeHandle(ref, () => ({
    setValue: (val) => {
      if (typeof val === 'function') {
        setInput(val)
      } else {
        setInput(val)
      }
    },
    focus: () => {
      textareaRef.current?.focus()
    },
    getValue: () => input
  }))

  const refreshKbs = () => fetch('/api/kb').then(res => res.json()).then(data => { if(Array.isArray(data)) setKbs(data) }).catch(() => {})

  useEffect(() => {
    refreshKbs()
    refreshModels()
    refreshPrompts()
  }, [])

  const refreshPrompts = () => fetch('/api/prompts').then(res => res.json()).then(data => { if(Array.isArray(data)) setPrompts(data) }).catch(() => {})

  const refreshModels = () => {
    fetch('/api/models?refresh=true')
      .then(res => res.json())
      .then(data => {
        const fetchedModels = Array.isArray(data) ? data : (data.models || [])
        setModels(fetchedModels)
        if (fetchedModels.length > 0 && !fetchedModels.find((m: { id: string }) => m.id === selectedModel)) {
          setSelectedModel(fetchedModels[0].id)
        }
      })
      .catch(console.error)
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  const handleSubmit = (e?: any) => {
    e?.preventDefault()
    if (!input.trim() && uploadedFiles.length === 0) return
    onSubmit(input)
    setInput("")
  }

  const currentModel = models.find(m => m.id === selectedModel)
  const groupedModels = models.reduce((acc, m) => {
    if (!acc[m.provider]) acc[m.provider] = []
    acc[m.provider].push(m)
    return acc
  }, {} as Record<string, Model[]>)
  
  const providerLabel: Record<string, string> = { 
    ollama: 'Ollama', 
    lmstudio: 'LM Studio', 
    openai: 'OpenAI',
    'local-gguf': 'Local GGUF'
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    setIsUploading(true)
    const formData = new FormData()
    for (let i = 0; i < files.length; i++) {
      formData.append('files', files[i])
    }

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      })
      const data = await res.json()
      if (data.files) {
        setUploadedFiles([...uploadedFiles, ...data.files])
      }
    } catch (err) {
      console.error('Upload failed', err)
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const removeFile = (index: number) => {
    setUploadedFiles(uploadedFiles.filter((_, i) => i !== index))
  }

  return (
    <div className="w-full flex flex-col gap-4">
      {/* File Chips */}
      {uploadedFiles.length > 0 && (
        <div className="flex flex-wrap gap-2 px-1">
          {uploadedFiles.map((file, i) => (
            <div 
              key={i} 
              className="group flex items-center gap-1.5 pl-1.5 pr-1 py-1 rounded-xl bg-white dark:bg-zinc-900 border border-border text-xs animate-in fade-in slide-in-from-bottom-1 shadow-sm"
            >
              {file.dataUrl ? (
                <div className="size-5 rounded-md overflow-hidden border border-border">
                  <img src={file.dataUrl} alt="" className="size-full object-cover" />
                </div>
              ) : (
                <FileText className="size-3 text-muted-foreground ml-0.5" />
              )}
              <span className="max-w-[120px] truncate text-foreground font-medium">
                {file.name}
              </span>
              <button
                type="button"
                onClick={() => removeFile(i)}
                className="p-0.5 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-800 text-muted-foreground hover:text-destructive transition-colors"
              >
                <X className="size-3" />
              </button>
            </div>
          ))}
          {isUploading && (
            <div className="flex items-center gap-2 px-3 py-1 rounded-xl bg-white/50 dark:bg-zinc-900/50 border border-dashed border-border text-[10px] text-muted-foreground">
              <Loader2 className="size-3 animate-spin" />
              {t("Parsing...")}
            </div>
          )}
        </div>
      )}

      {/* Main Integrated Container */}
      <div className="relative flex w-full flex-col rounded-[2rem] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-xl transition-all focus-within:ring-4 focus-within:ring-primary/5 focus-within:border-primary/40">
        <form
          onSubmit={handleSubmit}
          className="relative flex flex-col"
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            multiple
            className="hidden"
          />

          {/* Textarea Row */}
          <div className="flex items-start px-2">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={uploadedFiles.length > 0 ? t("Describe or ask questions about these files...") : t("Message {{modelName}}...", { modelName: currentModel?.name || 'OpenOrangeAI' })}
              className="min-h-[80px] max-h-64 w-full resize-none border-0 bg-transparent px-4 pt-6 pb-2 focus-visible:ring-0 text-lg leading-relaxed placeholder:text-zinc-400"
              rows={1}
            />
          </div>

          {/* Integrated Toolbar & Actions row */}
          <div className="flex items-center justify-between px-3 pb-3 pt-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              {/* Upload Pill */}
              <button
                type="button"
                disabled={isUploading}
                onClick={() => fileInputRef.current?.click()}
                className="p-2 rounded-full text-zinc-500 hover:text-primary hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all disabled:opacity-50"
              >
                {isUploading ? <Loader2 className="size-5 animate-spin" /> : <Paperclip className="size-5" />}
              </button>

              {/* Model Picker Pill */}
              <div className="relative">
                <button 
                  type="button"
                  onClick={() => {
                    setModelDropdownOpen(!modelDropdownOpen)
                    if (!modelDropdownOpen) refreshModels()
                  }}
                  className="flex items-center gap-1.5 h-9 px-3 rounded-full border border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all text-xs font-medium text-zinc-600 dark:text-zinc-300 shadow-sm"
                >
                  {currentModel && <Sparkles className="size-3 text-purple-500" />}
                  <span className="max-w-[120px] truncate">{currentModel?.name || t("Select model")}</span>
                  <ChevronDown className="size-3 text-zinc-400" />
                </button>

                {modelDropdownOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setModelDropdownOpen(false)} />
                    <div className="absolute bottom-full left-0 mb-2 w-64 max-h-80 overflow-y-auto bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-2xl shadow-2xl z-50 py-2">
                      {Object.entries(groupedModels).map(([provider, pModels]) => (
                        <div key={provider}>
                          <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-zinc-400 font-bold">
                            {providerLabel[provider] || provider}
                          </div>
                          {pModels.map(m => (
                            <button
                              key={m.id}
                              onClick={() => { setSelectedModel(m.id); setModelDropdownOpen(false) }}
                              className="w-full flex items-center gap-2 px-3 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-left transition-colors"
                            >
                              <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${PROVIDER_COLORS[m.provider] || ''}`}>
                                {m.provider === 'lmstudio' ? 'LMS' : m.provider === 'local-gguf' ? 'GGUF' : m.provider.toUpperCase()}
                              </span>
                              <span className="truncate text-sm text-zinc-700 dark:text-zinc-300">{m.name}</span>
                              {m.id === selectedModel && <span className="ml-auto text-xs text-primary font-bold">✓</span>}
                            </button>
                          ))}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* Web Search Pill */}
              <button
                type="button"
                onClick={() => {
                  if (webSearch === 'auto') setWebSearch('deep')
                  else if (webSearch === 'deep') setWebSearch(true)
                  else if (webSearch === true) setWebSearch(false)
                  else setWebSearch('auto')
                }}
                className={`flex items-center gap-1.5 h-9 px-4 rounded-full border transition-all text-xs font-semibold ${
                  webSearch === 'auto'
                    ? 'bg-amber-50/50 text-amber-700 border-amber-200/50'
                    : webSearch === 'deep'
                    ? 'bg-purple-50/50 text-purple-700 border-purple-200/50'
                    : webSearch === true
                    ? 'bg-sky-50/50 text-sky-700 border-sky-200/50'
                    : 'bg-zinc-50/50 text-zinc-500 border-zinc-100 dark:bg-zinc-900/50 dark:border-zinc-800'
                }`}
              >
                <Search className="size-3.5" />
                <span>{webSearch === 'auto' ? t('Auto') : webSearch === 'deep' ? 'Deep' : webSearch ? t('On') : t('Off')}</span>
              </button>

              {/* KB Pill */}
              {setKbId && (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => { setKbDropdownOpen(!kbDropdownOpen); if (!kbDropdownOpen) refreshKbs() }}
                    className={`flex items-center gap-1.5 h-9 px-4 rounded-full border transition-all text-xs font-semibold ${
                      kbId ? 'bg-primary/5 text-primary border-primary/20' : 'bg-zinc-50/50 text-zinc-500 border-zinc-100 dark:bg-zinc-900/50 dark:border-zinc-800'
                    }`}
                  >
                    <Database className="size-3.5" />
                    <span className="max-w-[100px] truncate">{kbId ? kbs.find(k => k.id === kbId)?.name : t("Knowledge")}</span>
                  </button>
                  {kbDropdownOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setKbDropdownOpen(false)} />
                      <div className="absolute bottom-full left-0 mb-2 w-56 max-h-64 overflow-y-auto bg-white dark:bg-zinc-900 border border-border rounded-2xl shadow-2xl z-50 py-2">
                        <button
                          onClick={() => { setKbId(null); setKbDropdownOpen(false) }}
                          className={`w-full px-4 py-2 hover:bg-zinc-50 text-left text-sm ${!kbId ? 'text-primary font-bold' : 'text-muted-foreground'}`}
                        >
                          {t("None")}
                        </button>
                        {kbs.map(kb => (
                          <button
                            key={kb.id}
                            onClick={() => { setKbId(kb.id); setKbDropdownOpen(false) }}
                            className={`w-full px-4 py-2 hover:bg-zinc-50 text-left text-sm ${kb.id === kbId ? 'text-primary font-bold' : ''}`}
                          >
                            {kb.name}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Deep Think Pill */}
              <button
                type="button"
                onClick={() => setDeepThink(!deepThink)}
                className={`flex items-center gap-1.5 h-9 px-4 rounded-full border transition-all text-xs font-semibold ${
                  deepThink ? 'bg-indigo-50/50 text-indigo-700 border-indigo-200/50' : 'bg-zinc-50/50 text-zinc-500 border-zinc-100 dark:bg-zinc-900/50 dark:border-zinc-800'
                }`}
              >
                <Brain className="size-3.5" />
                <span>{t("Thinking")}</span>
              </button>

              {/* Prompt Hub Pill */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => { setPromptDropdownOpen(!promptDropdownOpen); if (!promptDropdownOpen) refreshPrompts() }}
                  className={`flex items-center gap-1.5 h-9 px-4 rounded-full border transition-all text-xs font-semibold ${
                    selectedPrompt ? 'bg-amber-50/50 text-amber-700 border-amber-200/50' : 'bg-zinc-50/50 text-zinc-500 border-zinc-100 dark:bg-zinc-900/50 dark:border-zinc-800'
                  }`}
                >
                  <Sparkles className={`size-3.5 ${selectedPrompt ? 'text-amber-500' : 'text-zinc-400'}`} />
                  <span className="max-w-[100px] truncate">{selectedPrompt ? selectedPrompt.name : t("Default Role")}</span>
                </button>
                {promptDropdownOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setPromptDropdownOpen(false)} />
                    <div className="absolute bottom-full left-0 mb-2 w-64 max-h-80 overflow-y-auto bg-white dark:bg-zinc-900 border border-border rounded-2xl shadow-2xl z-50 py-2">
                      <button
                        onClick={() => { setSelectedPrompt?.(null); setPromptDropdownOpen(false) }}
                        className={`w-full px-4 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-left text-sm flex items-center gap-2 ${!selectedPrompt ? 'text-primary font-bold bg-primary/5' : 'text-zinc-600 dark:text-zinc-400'}`}
                      >
                         <Bot className="size-3.5" />
                         <span>{t("Default General Assistant")}</span>
                      </button>
                      <div className="h-px bg-zinc-100 dark:bg-zinc-800 my-1" />
                      {prompts.map(p => (
                        <button
                          key={p.id}
                          onClick={() => { setSelectedPrompt?.(p); setPromptDropdownOpen(false) }}
                          className={`w-full px-4 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-left transition-colors flex flex-col gap-0.5 ${p.id === selectedPrompt?.id ? 'bg-primary/5 border-l-2 border-primary' : ''}`}
                        >
                          <div className="flex items-center gap-2">
                             <Sparkles className="size-3 text-amber-500" />
                             <span className={`text-sm ${p.id === selectedPrompt?.id ? 'text-primary font-bold' : 'text-zinc-700 dark:text-zinc-200 font-medium'}`}>{p.name}</span>
                          </div>
                          {p.description && <span className="text-[10px] text-zinc-400 truncate pl-5">{p.description}</span>}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Action Buttons (Far Right) */}
            <div className="flex items-center ml-auto pr-1">
              {isLoading ? (
                <Button
                  size="icon" variant="ghost" type="button"
                  className="rounded-full size-10 bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors shadow-sm"
                  onClick={stop}
                >
                  <Square className="size-4 fill-current" />
                </Button>
              ) : (
                <Button
                  type="submit"
                  size="icon"
                  disabled={!input.trim() && uploadedFiles.length === 0}
                  className="rounded-full h-10 w-14 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 hover:opacity-90 disabled:opacity-30 transition-all shadow-lg active:scale-95 flex items-center justify-center p-0"
                >
                  <AudioWaveform className="size-5" />
                </Button>
              )}
            </div>
          </div>
        </form>
      </div>

      <p className="text-center text-[10px] text-muted-foreground mt-2 flex items-center justify-center gap-1.5 opacity-60">
        AI can make mistakes. Verify important information.
      </p>
    </div>
  )
})
