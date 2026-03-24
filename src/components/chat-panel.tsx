"use client"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { SendHorizonal, StopCircle, Globe, Brain, ChevronDown, Search, Database } from "lucide-react"
import { useEffect, useState } from "react"

type Model = { id: string; name: string; provider: string }

const PROVIDER_COLORS: Record<string, string> = {
  ollama: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  lmstudio: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  openai: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
}

interface ChatPanelProps {
  input: string;
  setInput: (v: string) => void;
  onSubmit: (e?: any) => void;
  isLoading: boolean;
  stop: () => void;
  selectedModel: string;
  setSelectedModel: (m: string) => void;
  webSearch: boolean | 'auto';
  setWebSearch: (v: boolean | 'auto') => void;
  deepThink: boolean;
  setDeepThink: (v: boolean) => void;
  kbId?: string | null;
  setKbId?: (v: string | null) => void;
}

export function ChatPanel({
  input, setInput, onSubmit, isLoading, stop,
  selectedModel, setSelectedModel,
  webSearch, setWebSearch,
  deepThink, setDeepThink,
  kbId, setKbId
}: ChatPanelProps) {
  const [models, setModels] = useState<Model[]>([])
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false)
  const [kbs, setKbs] = useState<any[]>([])
  const [kbDropdownOpen, setKbDropdownOpen] = useState(false)

  const refreshKbs = () => fetch('/api/kb').then(res => res.json()).then(data => { if(Array.isArray(data)) setKbs(data) }).catch(() => {})

  useEffect(() => {
    fetch('/api/models')
      .then(res => res.json())
      .then(data => { if (data.models) setModels(data.models) })
      .catch(console.error)
    refreshKbs()
  }, [])

  const refreshModels = () => {
    fetch('/api/models')
      .then(res => res.json())
      .then(data => { if (data.models) setModels(data.models) })
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
  const providerLabel: Record<string, string> = { ollama: 'Ollama', lmstudio: 'LM Studio', openai: 'OpenAI' }

  return (
    <div className="flex flex-col gap-2">
      {/* Toolbar Row */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {/* Model Picker - custom dropdown (no asChild) */}
        <div className="relative">
          <button
            type="button"
            onClick={() => { setModelDropdownOpen(!modelDropdownOpen); if (!modelDropdownOpen) refreshModels() }}
            className="flex items-center gap-2 h-8 px-2.5 rounded-full text-xs font-medium border border-zinc-200 dark:border-zinc-700 hover:border-zinc-400 bg-transparent transition-colors"
          >
            {currentModel ? (
              <>
                <span className={`inline-block rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${PROVIDER_COLORS[currentModel.provider] || 'bg-zinc-100'}`}>
                  {currentModel.provider === 'lmstudio' ? 'LMS' : currentModel.provider.toUpperCase()}
                </span>
                <span className="max-w-[140px] truncate">{currentModel.name}</span>
              </>
            ) : (
              <span className="text-zinc-400">Select model</span>
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
                          {m.provider === 'lmstudio' ? 'LMS' : m.provider.toUpperCase()}
                        </span>
                        <span className="truncate text-sm text-zinc-700 dark:text-zinc-300">{m.name}</span>
                        {m.id === selectedModel && <span className="ml-auto text-xs text-indigo-500">✓</span>}
                      </button>
                    ))}
                    <div className="border-b border-zinc-100 dark:border-zinc-800 my-0.5" />
                  </div>
                ))}
                {models.length === 0 && (
                  <div className="px-3 py-2 text-xs text-zinc-400">No models found. Start Ollama or LM Studio.</div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Web Search Toggle (Three-state: Auto, On, Off) */}
        <button
          type="button"
          onClick={() => {
            if (webSearch === 'auto') setWebSearch(true)
            else if (webSearch === true) setWebSearch(false)
            else setWebSearch('auto')
          }}
          title="Search Mode: Auto (AI Decides), On (Always), Off (Never)"
          className={`flex items-center gap-1.5 h-8 px-2.5 rounded-full text-xs border transition-all ${
            webSearch === 'auto'
              ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800'
              : webSearch === true
              ? 'bg-sky-100 text-sky-700 border-sky-300 dark:bg-sky-900/40 dark:text-sky-300 dark:border-sky-700'
              : 'border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400'
          }`}
        >
          <Search className="size-3" />
          <span>Search: {webSearch === 'auto' ? 'Auto' : webSearch ? 'On' : 'Off'}</span>
        </button>

        {/* KB Selection */}
        {setKbId && (
          <div className="relative">
            <button
              type="button"
              onClick={() => { setKbDropdownOpen(!kbDropdownOpen); if (!kbDropdownOpen) refreshKbs() }}
              className={`flex items-center gap-1.5 h-8 px-2.5 rounded-full text-xs border transition-all font-medium ${
                kbId
                  ? 'bg-indigo-100 text-indigo-700 border-indigo-300 dark:bg-indigo-900/40 dark:text-indigo-300 dark:border-indigo-700 shadow-sm'
                  : 'border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:border-zinc-300'
              }`}
            >
              <Database className={`size-3 ${kbId ? 'text-indigo-500' : 'text-zinc-400'}`} />
              {kbId ? (
                <span className="max-w-[120px] truncate">
                  {kbs.find(k => k.id === kbId)?.name}
                  {kbs.find(k => k.id === kbId)?.chunkCount ? (
                    <span className="opacity-60 ml-1 font-normal">· {kbs.find(k => k.id === kbId)?.chunkCount}</span>
                  ) : null}
                </span>
              ) : (
                <span>知识库</span>
              )}
            </button>
            {kbDropdownOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setKbDropdownOpen(false)} />
                <div className="absolute bottom-full left-0 mb-2 w-56 max-h-64 overflow-y-auto bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-xl z-50 py-1.5">
                  <div className="px-3 pb-1 pt-0.5">
                    <span className="text-[10px] uppercase tracking-wider font-semibold text-zinc-400">选择知识库</span>
                  </div>
                  <button
                    onClick={() => { setKbId(null); setKbDropdownOpen(false) }}
                    className={`w-full flex items-center justify-between px-3 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-left text-sm transition-colors ${!kbId ? 'text-indigo-600 dark:text-indigo-400 font-medium' : 'text-zinc-600 dark:text-zinc-400'}`}
                  >
                    <span>不使用知识库</span>
                    {!kbId && <span className="text-[11px] font-bold text-indigo-500">✓</span>}
                  </button>
                  {kbs.length > 0 && <div className="mx-3 my-1 border-t border-zinc-100 dark:border-zinc-800" />}
                  {kbs.map(kb => (
                    <button
                      key={kb.id}
                      onClick={() => { setKbId(kb.id); setKbDropdownOpen(false) }}
                      className={`w-full flex items-center justify-between px-3 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-800 text-left text-sm transition-colors ${kb.id === kbId ? 'text-indigo-600 dark:text-indigo-400 bg-indigo-50/50 dark:bg-indigo-900/20 font-medium' : 'text-zinc-700 dark:text-zinc-300'}`}
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm">{kb.name}</div>
                        {kb.chunkCount > 0 && (
                          <div className="text-[11px] text-zinc-400 font-normal">{kb.chunkCount} 个片段</div>
                        )}
                      </div>
                      {kb.id === kbId && <span className="text-[11px] font-bold text-indigo-500 shrink-0 ml-2">✓</span>}
                    </button>
                  ))}
                  {kbs.length === 0 && (
                    <div className="px-3 py-3 text-xs text-zinc-400 text-center">暂无知识库</div>
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
          title="Deep Think: Forces step-by-step reasoning"
          className={`flex items-center gap-1.5 h-8 px-2.5 rounded-full text-xs border transition-colors ${
            deepThink
              ? 'bg-violet-100 text-violet-700 border-violet-300 dark:bg-violet-900/40 dark:text-violet-300 dark:border-violet-700'
              : 'border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400'
          }`}
        >
          <Brain className="size-3.5" />
          Deep Think
        </button>
      </div>

      {/* Input Form */}
      <form
        onSubmit={(e) => { e.preventDefault(); onSubmit(e) }}
        className="relative flex w-full items-end overflow-hidden rounded-2xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 transition-all focus-within:ring-2 focus-within:ring-zinc-900 dark:focus-within:ring-zinc-400"
      >
        <Textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={`Message ${currentModel?.name || 'ClosedUI'}...`}
          className="min-h-[64px] max-h-64 w-full resize-none border-0 bg-transparent px-4 pt-4 pb-3 pr-14 focus-visible:ring-0 text-base leading-relaxed"
          rows={1}
        />
        <div className="absolute right-2 bottom-2">
          {isLoading ? (
            <Button
              size="icon" variant="ghost" type="button"
              className="rounded-full size-9 bg-zinc-200 dark:bg-zinc-700 hover:bg-zinc-300"
              onClick={stop}
            >
              <StopCircle className="size-5" />
            </Button>
          ) : (
            <Button
              type="submit" size="icon" variant="default"
              disabled={!input.trim()}
              className="rounded-full size-9 bg-zinc-900 text-white hover:bg-zinc-700 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200 disabled:opacity-30 transition-all"
            >
              <SendHorizonal className="size-4" />
            </Button>
          )}
        </div>
      </form>

      <p className="text-center text-[10px] text-zinc-400 mt-1 flex items-center justify-center gap-1.5 opacity-80">
        {webSearch !== false && <><Search className="size-2.5" />Search {webSearch === 'auto' ? 'Auto' : 'On'} · </>}
        {deepThink && <><Brain className="size-2.5" />Deep think On · </>}
        AI can make mistakes. Verify important information.
      </p>
    </div>
  )
}
