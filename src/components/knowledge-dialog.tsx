"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import {
  Database, FolderSearch, Loader2, Plus, RefreshCw, Trash2,
  CheckCircle2, AlertCircle, FileText, FileCode2, File, ChevronRight,
  X,
} from "lucide-react"

type KBStats = {
  documentCount?: number
  chunkCount?: number
  semanticIndexed?: boolean
}

type KB = {
  id: string
  name: string
  path: string
  status: string
  lastError: string
  stats: KBStats
  chunkCount: number
  lastIndexedAt?: string
}

type IndexProgress = {
  stage: 'scan' | 'file' | 'embed' | 'save' | 'done' | 'error'
  file?: string
  done?: number
  total?: number
  error?: string
  stats?: KBStats
}

// ── helpers ──────────────────────────────────────────────────────────────────

function getFileIcon(name: string) {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (['pdf', 'docx', 'doc', 'xlsx', 'xls'].includes(ext)) return <FileText className="size-3 text-orange-400" />
  if (['ts', 'tsx', 'js', 'jsx', 'py', 'java', 'go', 'rs', 'cpp', 'c'].includes(ext)) return <FileCode2 className="size-3 text-blue-400" />
  return <File className="size-3 text-zinc-400" />
}

function deriveNameFromPath(p: string): string {
  const clean = p.replace(/[/\\]+$/, '')
  return clean.split(/[/\\]/).pop() || clean
}

function formatDate(d?: string) {
  if (!d) return ''
  return new Date(d).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// ── ScanProgress component ────────────────────────────────────────────────────

function ScanProgress({ progress, onDone }: { progress: IndexProgress; onDone: () => void }) {
  const pct = progress.total && progress.done !== undefined
    ? Math.round((progress.done / progress.total) * 100)
    : null

  const isDone = progress.stage === 'done'
  const isError = progress.stage === 'error'

  useEffect(() => {
    if (isDone) {
      const t = setTimeout(onDone, 1200)
      return () => clearTimeout(t)
    }
  }, [isDone, onDone])

  return (
    <div className="p-4 rounded-xl border border-indigo-200/60 dark:border-indigo-800/60 bg-indigo-50/60 dark:bg-indigo-950/30 flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        {isDone
          ? <CheckCircle2 className="size-4 text-green-500 shrink-0" />
          : isError
          ? <AlertCircle className="size-4 text-red-500 shrink-0" />
          : <Loader2 className="size-4 text-indigo-500 shrink-0 animate-spin" />
        }
        <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
          {isDone ? '✅ 索引完成！' : isError ? '❌ 扫描出错' : progress.stage === 'scan' ? '正在扫描目录...' : progress.stage === 'embed' ? '正在生成向量索引...' : progress.stage === 'save' ? '正在写入数据库...' : '正在解析文件...'}
        </span>
        {pct !== null && !isDone && (
          <span className="ml-auto text-xs font-mono text-indigo-600 dark:text-indigo-400 tabular-nums">
            {progress.done}/{progress.total}
          </span>
        )}
      </div>

      {/* Progress bar */}
      {pct !== null && (
        <div className="h-1.5 rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-300"
            style={{ width: `${isDone ? 100 : pct}%` }}
          />
        </div>
      )}

      {/* Current file */}
      {progress.file && !isDone && !isError && (
        <div className="flex items-center gap-1.5 text-[11px] text-zinc-500 min-w-0">
          {getFileIcon(progress.file)}
          <span className="truncate font-mono">{progress.file}</span>
        </div>
      )}

      {/* Done stats */}
      {isDone && progress.stats && (
        <div className="flex items-center gap-3 text-xs text-green-700 dark:text-green-400">
          <span>{progress.stats.documentCount} 个文件</span>
          <span>·</span>
          <span>{progress.stats.chunkCount} 个索引片段</span>
        </div>
      )}

      {/* Error */}
      {isError && (
        <p className="text-xs text-red-600 dark:text-red-400">{progress.error}</p>
      )}
    </div>
  )
}

// ── AddForm component ─────────────────────────────────────────────────────────

function AddForm({ onAdded, onCancel }: { onAdded: (kb: KB) => void; onCancel: () => void }) {
  const [pathVal, setPathVal] = useState("")
  const [nameVal, setNameVal] = useState("")
  const [nameTouched, setNameTouched] = useState(false)
  const [error, setError] = useState("")
  const [adding, setAdding] = useState(false)
  const [scanProgress, setScanProgress] = useState<IndexProgress | null>(null)
  const [createdId, setCreatedId] = useState<string | null>(null)
  const esRef = useRef<EventSource | null>(null)

  // Auto-derive name from path
  const derivedName = pathVal.trim() ? deriveNameFromPath(pathVal.trim()) : ""
  const displayName = nameTouched ? nameVal : derivedName

  const handleSubmit = async () => {
    const p = pathVal.trim()
    const n = (nameTouched ? nameVal : derivedName).trim()
    if (!p) { setError("请输入文件夹路径"); return }
    if (!n) { setError("请输入知识库名称"); return }
    setError("")
    setAdding(true)

    try {
      const res = await fetch('/api/kb', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: n, sourceType: 'local', path: p }),
      })
      if (!res.ok) {
        const err = await res.json()
        setError(err.error || '创建失败')
        setAdding(false)
        return
      }
      const kb = await res.json() as KB
      setCreatedId(kb.id)

      // Start streaming index
      setScanProgress({ stage: 'scan' })
      startStreaming(kb.id, kb)
    } catch (e: any) {
      setError(e.message)
      setAdding(false)
    }
  }

  const startStreaming = (id: string, kb: KB) => {
    esRef.current?.close()
    const es = new EventSource(`/api/kb/${id}/index?method=POST`, { withCredentials: false })

    // EventSource doesn't support POST, so we use fetch with streaming instead
    es.close()

    // Use fetch + ReadableStream
    fetch(`/api/kb/${id}/index`, { method: 'POST' }).then(async (res) => {
      if (!res.body) return
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() || ''
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const evt = JSON.parse(line.slice(6)) as IndexProgress
              setScanProgress(evt)
            } catch { /* ignore */ }
          }
        }
      }
    }).catch(() => {
      setScanProgress({ stage: 'error', error: '连接中断' })
    })
  }

  const handleDone = useCallback(() => {
    // Fetch final KB state
    if (createdId) {
      fetch(`/api/kb/${createdId}`)
        .then(r => r.json())
        .then(kb => { if (kb.id) onAdded(kb) })
        .catch(() => onAdded({ id: createdId!, name: displayName, path: pathVal, status: 'ready', lastError: '', stats: {}, chunkCount: 0 }))
    }
  }, [createdId, displayName, onAdded, pathVal])

  if (scanProgress) {
    return (
      <div className="flex flex-col gap-3">
        <div className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-2">
          <FolderSearch className="size-4 text-indigo-500" />
          <span className="truncate max-w-[300px]" title={pathVal}>{displayName}</span>
        </div>
        <ScanProgress progress={scanProgress} onDone={handleDone} />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h4 className="font-semibold text-sm flex items-center gap-2">
          <Plus className="size-4 text-indigo-500" /> 添加本地知识库
        </h4>
        <button onClick={onCancel} className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400">
          <X className="size-4" />
        </button>
      </div>

      {/* Path input */}
      <div>
        <label className="text-xs font-medium text-zinc-500 mb-1.5 block">
          本地文件夹路径 <span className="text-zinc-400 font-normal">（绝对路径，例如 D:\Docs）</span>
        </label>
        <input
          value={pathVal}
          onChange={e => { setPathVal(e.target.value); setError("") }}
          onKeyDown={e => e.key === 'Enter' && handleSubmit()}
          placeholder="C:\Users\jack\Documents  或  D:\projects\my-app"
          autoFocus
          className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2.5 text-sm font-mono placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-400 transition-all"
        />
      </div>

      {/* Name input — only show if path is non-empty */}
      {pathVal.trim() && (
        <div>
          <label className="text-xs font-medium text-zinc-500 mb-1.5 block">
            知识库名称 <span className="text-zinc-400 font-normal">（留空则自动推导）</span>
          </label>
          <input
            value={displayName}
            onChange={e => { setNameVal(e.target.value); setNameTouched(true) }}
            onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            placeholder={derivedName || "我的文档"}
            className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2.5 text-sm placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-400 transition-all"
          />
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">
          <AlertCircle className="size-3 shrink-0" /> {error}
        </div>
      )}

      <div className="flex items-center gap-2 mt-1">
        <button
          onClick={onCancel}
          className="flex-1 py-2 rounded-lg text-sm text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
        >
          取消
        </button>
        <button
          onClick={handleSubmit}
          disabled={adding || !pathVal.trim()}
          className="flex-1 py-2 rounded-lg text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-1.5"
        >
          {adding ? <Loader2 className="size-4 animate-spin" /> : <ChevronRight className="size-4" />}
          {adding ? '添加中...' : '确认添加'}
        </button>
      </div>

      {/* Tips */}
      <div className="rounded-lg bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 p-3">
        <p className="text-[11px] text-zinc-500 leading-relaxed">
          💡 <span className="font-medium text-zinc-600 dark:text-zinc-400">自动递归扫描所有子文件夹</span>，无需手动指定每一个目录。
          <br />支持格式：<span className="font-medium text-zinc-600 dark:text-zinc-400">PDF · Word · Excel · TXT · Markdown · JSON · CSV · 代码（TS/JS/Python/Go/Java/C++等）</span>
          <br />自动跳过 <code className="text-[10px] bg-zinc-200 dark:bg-zinc-700 px-1 rounded">node_modules</code>、<code className="text-[10px] bg-zinc-200 dark:bg-zinc-700 px-1 rounded">.git</code>、<code className="text-[10px] bg-zinc-200 dark:bg-zinc-700 px-1 rounded">dist</code> 等构建目录，单文件 &gt;8MB 跳过。
        </p>
      </div>
    </div>
  )
}

// ── KBCard component ──────────────────────────────────────────────────────────

function KBCard({ kb, onDelete, onSync, onSyncing }: {
  kb: KB
  onDelete: () => void
  onSync: () => void
  onSyncing: boolean
}) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [syncProgress, setSyncProgress] = useState<IndexProgress | null>(null)

  const handleSyncClick = async () => {
    setSyncProgress({ stage: 'scan' })
    onSync()

    fetch(`/api/kb/${kb.id}/index`, { method: 'POST' }).then(async (res) => {
      if (!res.body) return
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() || ''
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const evt = JSON.parse(line.slice(6)) as IndexProgress
              setSyncProgress(evt)
            } catch { /* ignore */ }
          }
        }
      }
    }).catch(() => setSyncProgress({ stage: 'error', error: '连接中断' }))
  }

  const isIndexing = kb.status === 'indexing' || onSyncing

  return (
    <div className="group p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:border-indigo-200 dark:hover:border-indigo-800/60 transition-colors bg-white dark:bg-zinc-900/50">
      {/* Top row */}
      <div className="flex items-start gap-3">
        <div className="size-9 rounded-lg bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center shrink-0">
          <FolderSearch className="size-5 text-indigo-500 dark:text-indigo-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h4 className="font-bold text-sm text-zinc-800 dark:text-zinc-200 truncate">{kb.name}</h4>
            {kb.status === 'ready' && (
              <span className="shrink-0 text-[10px] font-semibold text-green-600 dark:text-green-500 bg-green-50 dark:bg-green-500/10 px-1.5 py-0.5 rounded-full">
                就绪
              </span>
            )}
            {(kb.status === 'indexing' || isIndexing) && (
              <span className="shrink-0 flex items-center gap-1 text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/10 px-1.5 py-0.5 rounded-full">
                <Loader2 className="size-2.5 animate-spin" /> 建索引中
              </span>
            )}
            {kb.status === 'error' && !isIndexing && (
              <span className="shrink-0 flex items-center gap-1 text-[10px] font-semibold text-red-600 bg-red-50 dark:bg-red-500/10 px-1.5 py-0.5 rounded-full">
                <AlertCircle className="size-2.5" /> 错误
              </span>
            )}
          </div>
          <p className="text-[11px] font-mono text-zinc-400 truncate mt-0.5" title={kb.path}>{kb.path}</p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={handleSyncClick}
            disabled={isIndexing || !!syncProgress}
            title="重新扫描"
            className="p-1.5 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-500/10 text-zinc-400 hover:text-indigo-500 transition-colors disabled:opacity-40"
          >
            <RefreshCw className={`size-3.5 ${isIndexing ? 'animate-spin text-indigo-500' : ''}`} />
          </button>
          {!confirmDelete ? (
            <button
              onClick={() => setConfirmDelete(true)}
              title="删除"
              className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10 text-zinc-400 hover:text-red-500 transition-colors"
            >
              <Trash2 className="size-3.5" />
            </button>
          ) : (
            <div className="flex items-center gap-1 bg-red-50 dark:bg-red-900/30 rounded-lg px-2 py-1">
              <span className="text-[11px] text-red-600 dark:text-red-400 font-medium">确认删除？</span>
              <button onClick={onDelete} className="text-[11px] font-bold text-red-600 dark:text-red-400 hover:underline">是</button>
              <button onClick={() => setConfirmDelete(false)} className="text-[11px] text-zinc-500 hover:underline">否</button>
            </div>
          )}
        </div>
      </div>

      {/* Sync progress */}
      {syncProgress && (
        <div className="mt-3">
          <ScanProgress
            progress={syncProgress}
            onDone={() => { setSyncProgress(null); onSync() }}
          />
        </div>
      )}

      {/* Stats row */}
      {!syncProgress && (
        <div className="flex items-center gap-3 mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-800">
          <div className="flex items-center gap-1 text-[11px] text-zinc-500">
            <Database className="size-3 text-zinc-400" />
            <span>{kb.stats?.documentCount ?? 0} 个文件</span>
          </div>
          <div className="text-[11px] text-zinc-400">·</div>
          <div className="text-[11px] text-zinc-500">{kb.chunkCount || 0} 个片段</div>
          {kb.lastIndexedAt && (
            <>
              <div className="text-[11px] text-zinc-400 ml-auto">更新于 {formatDate(kb.lastIndexedAt)}</div>
            </>
          )}
        </div>
      )}

      {/* Error detail */}
      {kb.status === 'error' && kb.lastError && !syncProgress && (
        <div className="mt-2 text-[11px] text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-2.5 py-1.5 flex items-start gap-1.5">
          <AlertCircle className="size-3 shrink-0 mt-0.5" />
          <span className="break-all">{kb.lastError}</span>
        </div>
      )}
    </div>
  )
}

// ── Main dialog ───────────────────────────────────────────────────────────────

export function KnowledgeDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [kbs, setKbs] = useState<KB[]>([])
  const [adding, setAdding] = useState(false)
  const [syncingId, setSyncingId] = useState<string | null>(null)

  const fetchKbs = useCallback(() => {
    fetch('/api/kb')
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setKbs(d) })
      .catch(console.error)
  }, [])

  useEffect(() => {
    if (open) { fetchKbs(); setAdding(false) }
  }, [open, fetchKbs])

  const handleAdded = (kb: KB) => {
    setAdding(false)
    fetchKbs()
  }

  const handleDelete = async (id: string) => {
    await fetch(`/api/kb/${id}`, { method: 'DELETE' })
    fetchKbs()
  }

  const handleSync = (id: string) => {
    setSyncingId(id)
    setTimeout(() => { setSyncingId(null); fetchKbs() }, 500)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[580px] max-h-[90vh] flex flex-col border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-0 gap-0 overflow-hidden">
        {/* Header */}
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-zinc-100 dark:border-zinc-800">
          <DialogTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="size-8 rounded-lg bg-indigo-100 dark:bg-indigo-500/20 flex items-center justify-center">
                <Database className="size-4 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div>
                <div className="font-bold text-base text-zinc-900 dark:text-zinc-100">本地知识库</div>
                <div className="text-xs text-zinc-500 font-normal">让 AI 读懂你的本地文件</div>
              </div>
            </div>
            {!adding && (
              <button
                onClick={() => setAdding(true)}
                className="flex items-center gap-1.5 h-8 px-3 rounded-full text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors"
              >
                <Plus className="size-3.5" /> 添加
              </button>
            )}
          </DialogTitle>
        </DialogHeader>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 app-scrollbar">
          {/* Add Form */}
          {adding && (
            <div className="p-4 rounded-xl border border-indigo-200 dark:border-indigo-800/60 bg-indigo-50/40 dark:bg-indigo-950/20">
              <AddForm
                onAdded={handleAdded}
                onCancel={() => setAdding(false)}
              />
            </div>
          )}

          {/* KB List */}
          {kbs.map(kb => (
            <KBCard
              key={kb.id}
              kb={kb}
              onDelete={() => handleDelete(kb.id)}
              onSync={() => handleSync(kb.id)}
              onSyncing={syncingId === kb.id}
            />
          ))}

          {kbs.length === 0 && !adding && (
            <div className="text-center py-12">
              <div className="size-16 rounded-2xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mx-auto mb-4">
                <Database className="size-8 text-zinc-400" />
              </div>
              <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">还没有知识库</p>
              <p className="text-xs text-zinc-500 mb-5">添加一个本地文件夹，让 AI 帮你检索其中的内容。</p>
              <button
                onClick={() => setAdding(true)}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors"
              >
                <Plus className="size-4" /> 添加第一个知识库
              </button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
