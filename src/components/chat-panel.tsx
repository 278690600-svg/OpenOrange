"use client"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { SendHorizonal, StopCircle, Globe, Brain, ChevronDown, Search, Database, Paperclip, X, FileText, Loader2, Square } from "lucide-react"
import { useEffect, useState, useRef } from "react"
import { useI18n } from "@/lib/i18n"

type Model = { id: string; name: string; provider: string }

const PROVIDER_COLORS: Record<string, string> = {
  ollama: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  lmstudio: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  openai: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  'local-gguf': 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
}

interface ChatPanelProps {
  input: string;
  setInput: (v: string) => void;
  onSubmit: (e?: any) => void;
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
}

export function ChatPanel({
  input, setInput, onSubmit, isLoading, stop,
  selectedModel, setSelectedModel,
  webSearch, setWebSearch,
  deepThink, setDeepThink,
  kbId, setKbId,
  uploadedFiles, setUploadedFiles
}: ChatPanelProps) {
  const { t } = useI18n()
  const [models, setModels] = useState<Model[]>([])
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false)
  const [kbs, setKbs] = useState<any[]>([])
  const [kbDropdownOpen, setKbDropdownOpen] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const refreshKbs = () => fetch('/api/kb').then(res => res.json()).then(data => { if(Array.isArray(data)) setKbs(data) }).catch(() => {})

  useEffect(() => {
    refreshKbs()
    refreshModels()
  }, [])

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
      onSubmit(e)
    }
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
    <div className="flex flex-col gap-2">
      {/* Toolbar Row */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {/* Model Picker - custom dropdown (no asChild) */}
        <div className="relative">
          <button 
            onClick={() => {
              setModelDropdownOpen(!modelDropdownOpen)
              if (!modelDropdownOpen) refreshModels()
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-all shadow-sm"
          >
            {currentModel ? (
              <>
                <span className={`inline-block rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${PROVIDER_COLORS[currentModel.provider] || 'bg-zinc-100'}`}>
                  {currentModel.provider === 'lmstudio' ? 'LMS' : currentModel.provider === 'local-gguf' ? 'GGUF' : currentModel.provider.toUpperCase()}
                </span>
                <span className="max-w-[140px] truncate">{currentModel.name}</span>
              </>
            ) : (
              <span className="text-zinc-400">{t("Select model")}</span>
            )}
            <ChevronDown className="size-3 text-zinc-400" />
          </button>

          {modelDropdownOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setModelDropdownOpen(false)} />
              <div className="absolute bottom-full left-0 mb-1 w-64 max-h-80 overflow-y-auto bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-lg z-50 py-1">
                {Object.entries(groupedModels).map(([provider, pModels]) => (
                  <div key={provider}>
                    <div className="px-3 py-1.5 text-xs uppercase tracking-wide text-zinc-400 font-medium">
                      {providerLabel[provider] || provider}
                    </div>
                    {pModels.map(m => (
                      <button
                        key={m.id}
                        onClick={() => { setSelectedModel(m.id); setModelDropdownOpen(false) }}
                        className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-left transition-colors"
                      >
                        <span className={`shrink-0 rounded px-1 py-0.5 text-[10px] font-bold ${PROVIDER_COLORS[m.provider] || ''}`}>
                          {m.provider === 'lmstudio' ? 'LMS' : m.provider === 'local-gguf' ? 'GGUF' : m.provider.toUpperCase()}
                        </span>
                        <span className="truncate text-sm text-zinc-700 dark:text-zinc-300">{m.name}</span>
                        {m.id === selectedModel && <span className="ml-auto text-xs text-primary font-bold">✓</span>}
                      </button>
                    ))}
                    <div className="border-b border-border my-0.5" />
                  </div>
                ))}
                {models.length === 0 && (
                   <div className="px-3 py-2 text-xs text-muted-foreground">
                     {t("No models found. Put .gguf files in /models folder or start Ollama/LM Studio.")}
                   </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Web Search Toggle (Four-state: Auto, Deep, On, Off) */}
        <button
          type="button"
          onClick={() => {
            if (webSearch === 'auto') setWebSearch('deep')
            else if (webSearch === 'deep') setWebSearch(true)
            else if (webSearch === true) setWebSearch(false)
            else setWebSearch('auto')
          }}
          title={t("Search Mode: Auto (AI Decides), Deep (Multiple Engines & Report), On (Always), Off (Never)")}
          className={`flex items-center gap-1.5 h-8 px-3 rounded-full text-xs border transition-all ${
            webSearch === 'auto'
              ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800'
              : webSearch === 'deep'
              ? 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-900/20 dark:text-purple-400 dark:border-purple-800 font-bold'
              : webSearch === true
              ? 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-900/20 dark:text-sky-300 dark:border-sky-800'
              : 'border-border text-muted-foreground'
          }`}
        >
          <Search className="size-3" />
          <span>{t("Search")}: {webSearch === 'auto' ? t('Auto') : webSearch === 'deep' ? 'Deep' : webSearch ? t('On') : t('Off')}</span>
        </button>

        {/* KB Selection */}
        {setKbId && (
          <div className="relative">
            <button
              type="button"
              onClick={() => { setKbDropdownOpen(!kbDropdownOpen); if (!kbDropdownOpen) refreshKbs() }}
              className={`flex items-center gap-1.5 h-8 px-3 rounded-full text-xs border transition-all font-medium ${
                kbId
                  ? 'bg-primary/10 text-primary border-primary/20 shadow-sm'
                  : 'border-border text-muted-foreground hover:border-zinc-300'
              }`}
            >
              <Database className={`size-3 ${kbId ? 'text-primary' : 'text-zinc-400'}`} />
              {kbId ? (
                <span className="max-w-[120px] truncate">
                  {kbs.find(k => k.id === kbId)?.name}
                  {kbs.find(k => k.id === kbId)?.chunkCount ? (
                    <span className="opacity-60 ml-1 font-normal">· {kbs.find(k => k.id === kbId)?.chunkCount}</span>
                  ) : null}
                </span>
              ) : (
                <span>{t("Knowledge Base")}</span>
              )}
            </button>
            {kbDropdownOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setKbDropdownOpen(false)} />
                <div className="absolute bottom-full left-0 mb-2 w-56 max-h-64 overflow-y-auto bg-white dark:bg-zinc-900 border border-border rounded-xl shadow-xl z-50 py-1.5">
                  <div className="px-3 pb-1 pt-0.5">
                    <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">{t("Select Knowledge Base")}</span>
                  </div>
                  <button
                    onClick={() => { setKbId(null); setKbDropdownOpen(false) }}
                    className={`w-full flex items-center justify-between px-3 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-left text-sm transition-colors ${!kbId ? 'text-primary font-bold' : 'text-muted-foreground'}`}
                  >
                    <span>{t("Do not use knowledge base")}</span>
                    {!kbId && <span className="text-[11px] font-bold text-primary">✓</span>}
                  </button>
                  {kbs.length > 0 && <div className="mx-3 my-1 border-t border-border" />}
                  {kbs.map(kb => (
                    <button
                      key={kb.id}
                      onClick={() => { setKbId(kb.id); setKbDropdownOpen(false) }}
                      className={`w-full flex items-center justify-between px-3 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-left text-sm transition-colors ${kb.id === kbId ? 'text-primary bg-primary/5 font-bold' : 'text-foreground'}`}
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm">{kb.name}</div>
                        {kb.chunkCount > 0 && (
                          <div className="text-[11px] text-muted-foreground font-normal">{kb.chunkCount} {t("segments")}</div>
                        )}
                      </div>
                      {kb.id === kbId && <span className="text-[11px] font-bold text-primary shrink-0 ml-2">✓</span>}
                    </button>
                  ))}
                  {kbs.length === 0 && (
                    <div className="px-3 py-3 text-xs text-muted-foreground text-center">{t("No knowledge base yet")}</div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* Deep Think Toggle */}
        <button
          type="button"
          onClick={() => setDeepThink(!deepThink)}
          title={t("Deep Think: Forces step-by-step reasoning")}
          className={`flex items-center gap-1.5 h-8 px-3 rounded-full text-xs border transition-colors ${
            deepThink
              ? 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-900/20 dark:text-purple-300 dark:border-purple-800'
              : 'border-border text-muted-foreground'
          }`}
        >
          <Brain className="size-3.5" />
          {t("Deep Think")}
        </button>
      </div>

      {/* File Chips */}
      {uploadedFiles.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2 px-1">
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

      {/* Input Form */}
      <div className="relative flex w-full flex-col overflow-hidden rounded-[1.5rem] bg-white dark:bg-zinc-900 border border-border transition-all focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary shadow-sm hover:shadow-md">
        <form
          onSubmit={(e) => { e.preventDefault(); onSubmit(e) }}
          className="relative flex items-end"
        >
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            multiple
            className="hidden"
          />
          <button
            type="button"
            disabled={isUploading}
            onClick={() => fileInputRef.current?.click()}
            className="ml-3 mb-3 p-2 rounded-xl text-muted-foreground hover:text-primary hover:bg-primary/5 transition-all disabled:opacity-50"
            title={t("Upload file")}
          >
            {isUploading ? <Loader2 className="size-5 animate-spin" /> : <Paperclip className="size-5" />}
          </button>
          
          <Textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={uploadedFiles.length > 0 ? t("Describe or ask questions about these files...") : t("Message {{modelName}}...", { modelName: currentModel?.name || 'OpenOrangeAI' })}
            className="min-h-[64px] max-h-64 w-full resize-none border-0 bg-transparent px-2 pt-5 pb-4 pr-16 focus-visible:ring-0 text-base leading-relaxed"
            rows={1}
          />
          <div className="absolute right-3 bottom-3">
            {isLoading ? (
              <Button
                size="icon" variant="ghost" type="button"
                className="rounded-full size-10 bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors shadow-sm"
                onClick={stop}
                title="停止生成"
              >
                <Square className="size-4 fill-current" />
              </Button>
            ) : (
              <Button
                type="submit" size="icon" variant="default"
                disabled={!input.trim() && uploadedFiles.length === 0}
                className="rounded-full size-10 bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-30 transition-all shadow-md active:scale-95"
              >
                <SendHorizonal className="size-5" />
              </Button>
            )}
          </div>
        </form>
      </div>

      <p className="text-center text-[10px] text-muted-foreground mt-2 flex items-center justify-center gap-1.5 opacity-70">
        {webSearch !== false && <><Search className="size-2.5" />Search {webSearch === 'auto' ? 'Auto' : webSearch === 'deep' ? 'Deep' : 'On'} · </>}
        {deepThink && <><Brain className="size-2.5" />Deep think On · </>}
        AI can make mistakes. Verify important information.
      </p>
    </div>
  )
}
