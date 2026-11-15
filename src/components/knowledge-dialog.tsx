"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import {
  Database, FolderSearch, Loader2, Plus, RefreshCw, Trash2,
  CheckCircle2, AlertCircle, FileText, FileCode2, File, ChevronRight,
  X, Search, FolderOpen, Upload, Server, ChevronLeft, ChevronDown, Folder,
  HardDrive, TableProperties, Plug, Eye, EyeOff, Download, Pencil, Tag,
} from "lucide-react"
import { useI18n } from "@/lib/i18n"

// ── Types ─────────────────────────────────────────────────────────────────────

type KBStats = { documentCount?: number; chunkCount?: number; semanticIndexed?: boolean }
type KB = { id: string; name: string; path: string; sourceType?: string; status: string; lastError: string; stats: KBStats; chunkCount: number; lastIndexedAt?: string; tags?: string | null }
type IndexProgress = { stage: string; file?: string; table?: string; done?: number; total?: number; error?: string; stats?: KBStats }
type FsEntry = { name: string; path: string; type: 'directory' | 'file'; size?: number; ext?: string }
type DBTable = { name: string; rowCount?: number; columns?: string[] }
type SearchResult = { rank: number; title: string; content: string; sourceUri: string; score: number; snippet: string }

type AddMode = 'path' | 'browse' | 'upload' | 'database'

function getFileIcon(name: string) {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (['pdf', 'docx', 'doc', 'xlsx', 'xls'].includes(ext)) return <FileText className="size-3 text-orange-400" />
  if (['ts', 'tsx', 'js', 'jsx', 'py', 'java', 'go', 'rs', 'cpp', 'c'].includes(ext)) return <FileCode2 className="size-3 text-blue-400" />
  return <File className="size-3 text-zinc-400" />
}

function deriveNameFromPath(p: string) { return p.replace(/[/\\]+$/, '').split(/[/\\]/).pop() || p }
function formatDate(d?: string) { if (!d) return ''; return new Date(d).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) }

// ── ScanProgress ──────────────────────────────────────────────────────────────

function ScanProgress({ progress, onDone }: { progress: IndexProgress; onDone: () => void }) {
  const { t } = useI18n()
  const pct = progress.total && progress.done !== undefined ? Math.round((progress.done / progress.total) * 100) : null
  const isDone = progress.stage === 'done'
  const isError = progress.stage === 'error'

  useEffect(() => { if (isDone) { const timer = setTimeout(onDone, 1200); return () => clearTimeout(timer) } }, [isDone, onDone])

  const stageLabel = () => {
    switch (progress.stage) {
      case 'scan': return t('Scanning directory...')
      case 'connect': return t('Connecting to database...')
      case 'fetch_table': return t('Fetching tables...')
      case 'table': return `${t('Importing table:')} ${progress.table || ''}`
      case 'file': return t('Parsing file...')
      case 'embed': return t('Generating vector index...')
      case 'save': return t('Writing to database...')
      case 'done': return t('Indexing complete!')
      case 'error': return t('An error occurred')
      default: return t('Processing...')
    }
  }

  return (
    <div className="p-4 rounded-xl border border-indigo-200/60 dark:border-indigo-800/60 bg-indigo-50/60 dark:bg-indigo-950/30 flex flex-col gap-3">
      <div className="flex items-center gap-2">
        {isDone ? <CheckCircle2 className="size-4 text-green-500 shrink-0" />
          : isError ? <AlertCircle className="size-4 text-red-500 shrink-0" />
          : <Loader2 className="size-4 text-indigo-500 shrink-0 animate-spin" />}
        <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{stageLabel()}</span>
        {pct !== null && !isDone && (
          <span className="ml-auto text-xs font-mono text-indigo-600 dark:text-indigo-400 tabular-nums">{progress.done}/{progress.total}</span>
        )}
      </div>
      {pct !== null && (
        <div className="h-1.5 rounded-full bg-zinc-200 dark:bg-zinc-800 overflow-hidden">
          <div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-300" style={{ width: `${isDone ? 100 : pct}%` }} />
        </div>
      )}
      {progress.file && !isDone && !isError && (
        <div className="flex items-center gap-1.5 text-[11px] text-zinc-500 min-w-0">
          {getFileIcon(progress.file)}<span className="truncate font-mono">{progress.file}</span>
        </div>
      )}
      {isDone && progress.stats && (
        <div className="flex items-center gap-3 text-xs text-green-700 dark:text-green-400">
          <span>{t('{{count}} documents', { count: progress.stats.documentCount || 0 })}</span><span>·</span><span>{t('{{count}} fragments', { count: progress.stats.chunkCount || 0 })}</span>
        </div>
      )}
      {isError && <p className="text-xs text-red-600 dark:text-red-400">{progress.error}</p>}
    </div>
  )
}

// ── FileBrowser ───────────────────────────────────────────────────────────────

function FileBrowser({ onSelect }: { onSelect: (path: string) => void }) {
  const { t } = useI18n()
  const [currentPath, setCurrentPath] = useState('')
  const [entries, setEntries] = useState<FsEntry[]>([])
  const [parentPath, setParentPath] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [selectedPath, setSelectedPath] = useState('')
  const [selectedType, setSelectedType] = useState<'directory' | 'file'>('directory')

  const browse = useCallback(async (p: string) => {
    setLoading(true); setError(''); setSelectedPath(''); setSelectedType('directory')
    try {
      const res = await fetch(`/api/files/browse?path=${encodeURIComponent(p)}&mode=all`)
      const data = await res.json()
      if (!res.ok) { setError(data.error || t('Failed to read directory')); setLoading(false); return }
      setEntries(data.entries || [])
      setCurrentPath(data.currentPath || p)
      setSelectedPath(data.currentPath || p)
      setSelectedType('directory')
      setParentPath(data.parent || null)
    } catch { setError(t('Network Error')) }
    setLoading(false)
  }, [t])

  useEffect(() => {
    const timer = setTimeout(() => browse(''), 0)
    return () => clearTimeout(timer)
  }, [browse])

  return (
    <div className="flex flex-col gap-2">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 flex-wrap text-xs text-zinc-500 min-h-[24px]">
        <button onClick={() => browse('')} className="hover:text-indigo-500 transition-colors flex items-center gap-1"><HardDrive className="size-3" /> {t('Root Directory')}</button>
        {currentPath && currentPath.split(/[/\\]/).filter(Boolean).map((seg, i, arr) => (
          <span key={i} className="flex items-center gap-1">
            <ChevronRight className="size-3" />
            <button
              onClick={() => {
                const parts = currentPath.split(/[/\\]/)
                const upTo = Math.max(0, parts.findIndex((_, pi) => pi >= parts.length - arr.length + i + (currentPath.match(/^[A-Z]:[/\\]/i) ? 1 : 0)))
                browse(parts.slice(0, upTo + 1).join('\\') || currentPath)
              }}
              className="hover:text-indigo-500 transition-colors truncate max-w-[80px]"
            >{seg}</button>
          </span>
        ))}
      </div>

      {/* Dir list */}
      <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden max-h-52 overflow-y-auto app-scrollbar bg-white dark:bg-zinc-900">
        {loading && <div className="flex items-center justify-center gap-2 py-8 text-zinc-400"><Loader2 className="size-4 animate-spin" /> {t('Loading conversations...')}</div>}
        {error && <div className="p-3 text-xs text-red-500">{error}</div>}
        {!loading && !error && entries.length === 0 && <div className="py-8 text-center text-xs text-zinc-400">{t('Empty Directory')}</div>}
        {parentPath && !loading && (
          <button onClick={() => browse(parentPath)} className="w-full flex items-center gap-2 px-3 py-2 text-xs text-zinc-500 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors border-b border-zinc-100 dark:border-zinc-800">
            <ChevronLeft className="size-3" /> {t('Go to parent')}
          </button>
        )}
        {entries.map(e => {
          const isSelected = selectedPath === e.path
          return (
            <div
              key={e.path}
              onClick={() => {
                setSelectedPath(e.path)
                setSelectedType(e.type)
              }}
              onDoubleClick={() => {
                if (e.type === 'directory') {
                  browse(e.path)
                }
              }}
              className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors text-left border-b border-zinc-50 dark:border-zinc-800/50 last:border-0 cursor-pointer select-none ${
                isSelected ? 'bg-indigo-50/70 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 font-medium' : 'text-zinc-700 dark:text-zinc-300'
              }`}
            >
              {e.type === 'directory' ? (
                <Folder className="size-4 text-amber-400 shrink-0" />
              ) : (
                getFileIcon(e.name)
              )}
              <span className="flex-1 truncate">{e.name}</span>
              {e.type === 'directory' && (
                <button
                  onClick={(event) => {
                    event.stopPropagation()
                    browse(e.path)
                  }}
                  className="p-1 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded text-zinc-400 hover:text-zinc-600 shrink-0"
                  title={t("Enter directory")}
                >
                  <ChevronRight className="size-3.5" />
                </button>
              )}
            </div>
          )
        })}
      </div>

      {selectedPath && (
        <button
          onClick={() => onSelect(selectedPath)}
          className="flex items-center justify-center gap-2 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-colors shadow-sm"
        >
          {selectedType === 'file' ? (
            <>
              <File className="size-4" /> {t('Select this file')}
            </>
          ) : (
            <>
              <FolderOpen className="size-4" /> {t('Select this folder')}
            </>
          )}
        </button>
      )}
    </div>
  )
}

// ── DatabaseForm ──────────────────────────────────────────────────────────────

function DatabaseForm({ onConfig }: { onConfig: (cfg: Record<string, unknown>) => void }) {
  const { t } = useI18n()
  const [dbType, setDbType] = useState<'mysql' | 'postgresql' | 'sqlite' | 'sqlserver' | 'mongodb' | 'redis'>('mysql')
  const [connMode, setConnMode] = useState<'fields' | 'string'>('fields')
  const [host, setHost] = useState('localhost')
  const [port, setPort] = useState('3306')
  const [user, setUser] = useState('')
  const [password, setPassword] = useState('')
  const [database, setDatabase] = useState('')
  const [connStr, setConnStr] = useState('')
  const [filePath, setFilePath] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; version?: string; error?: string } | null>(null)
  const [tables, setTables] = useState<DBTable[]>([])
  const [selectedTables, setSelectedTables] = useState<string[]>([])
  const [fetchingTables, setFetchingTables] = useState(false)

  const getConfig = () => ({
    type: dbType,
    ...(dbType === 'sqlite' ? { filePath } : connMode === 'string' ? { connectionString: connStr } : { host, port: port ? Number(port) : undefined, user, password, database })
  })

  const handleTest = async () => {
    setTesting(true); setTestResult(null); setTables([])
    const res = await fetch('/api/kb/db-source?action=test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(getConfig()) })
    const data = await res.json()
    setTestResult(data)
    setTesting(false)
    if (data.ok) {
      setFetchingTables(true)
      const res2 = await fetch('/api/kb/db-source?action=tables', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(getConfig()) })
      const data2 = await res2.json()
      setTables(data2.tables || [])
      setFetchingTables(false)
    }
  }

  const handleConfirm = () => {
    onConfig({ ...getConfig(), tables: selectedTables })
  }

  const inputCls = "w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all"
  const defaultPorts: Record<string, string> = { mysql: '3306', postgresql: '5432', sqlite: '', sqlserver: '1433', mongodb: '27017', redis: '6379' }

  return (
    <div className="flex flex-col gap-3">
      {/* DB type selector */}
      <div className="flex gap-2 flex-wrap">
        {(['mysql', 'postgresql', 'sqlite', 'sqlserver', 'mongodb', 'redis'] as const).map(t => (
          <button key={t} onClick={() => { setDbType(t); setPort(defaultPorts[t]) }}
            className={`flex-1 min-w-[70px] py-1.5 px-2 rounded-lg text-xs font-bold border transition-all ${dbType === t ? 'bg-indigo-600 text-white border-indigo-600' : 'border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:border-indigo-300'}`}>
            {t === 'mysql' ? 'MySQL' : t === 'postgresql' ? 'PostgreSQL' : t === 'sqlite' ? 'SQLite' : t === 'sqlserver' ? 'SQL Server' : t === 'mongodb' ? 'MongoDB' : 'Redis'}
          </button>
        ))}
      </div>

      {dbType === 'sqlite' ? (
        <input value={filePath} onChange={e => setFilePath(e.target.value)} placeholder="/path/to/database.db" className={inputCls} />
      ) : (
        <>
          <div className="flex gap-2">
            {(['fields', 'string'] as const).map(m => (
              <button key={m} onClick={() => setConnMode(m)}
                className={`flex-1 py-1 rounded-lg text-xs border transition-all ${connMode === m ? 'bg-zinc-100 dark:bg-zinc-800 border-zinc-300 dark:border-zinc-600 font-semibold' : 'border-zinc-200 dark:border-zinc-700 text-zinc-500'}`}>
                {m === 'fields' ? t('Fill by fields') : t('Connection string')}
              </button>
            ))}
          </div>
          {connMode === 'string' ? (
            <input value={connStr} onChange={e => setConnStr(e.target.value)} placeholder={`${dbType}://user:pass@host:port/dbname`} className={inputCls + " font-mono text-xs"} />
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <input value={host} onChange={e => setHost(e.target.value)} placeholder={t('Host')} className={inputCls} />
              <input value={port} onChange={e => setPort(e.target.value)} placeholder={t('Port')} className={inputCls} />
              <input value={user} onChange={e => setUser(e.target.value)} placeholder={t('Username')} className={inputCls} />
              <div className="relative">
                <input type={showPw ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder={t('Password')} className={inputCls + " pr-8"} />
                <button onClick={() => setShowPw(!showPw)} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600">
                  {showPw ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                </button>
              </div>
              <input value={database} onChange={e => setDatabase(e.target.value)} placeholder={t('Database Name')} className={inputCls + " col-span-2"} />
            </div>
          )}
        </>
      )}

      {/* Test connection */}
      <button onClick={handleTest} disabled={testing}
        className="flex items-center justify-center gap-2 py-2 rounded-lg border border-indigo-300 dark:border-indigo-700 text-indigo-600 dark:text-indigo-400 text-sm font-medium hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors disabled:opacity-50">
        {testing ? <Loader2 className="size-4 animate-spin" /> : <Plug className="size-4" />}
        {testing ? t('Testing connection...') : t('Test Connection')}
      </button>

      {testResult && (
        <div className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg ${testResult.ok ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400' : 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400'}`}>
          {testResult.ok ? `${t('Connection successful!')}${testResult.version ? ` (${t('Version:')} ${testResult.version})` : ''}` : testResult.error}
        </div>
      )}

      {/* Table selection */}
      {(tables.length > 0 || fetchingTables) && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 flex items-center gap-1.5">
              <TableProperties className="size-3.5" /> {t('Select tables to import')} {fetchingTables && <Loader2 className="size-3 animate-spin" />}
            </span>
            {tables.length > 0 && (
              <button onClick={() => setSelectedTables(selectedTables.length === tables.length ? [] : tables.map(tbl => tbl.name))}
                className="text-[11px] text-indigo-500 hover:underline">
                {selectedTables.length === tables.length ? t('Deselect All') : t('Select All')}
              </button>
            )}
          </div>
          <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden max-h-40 overflow-y-auto app-scrollbar bg-white dark:bg-zinc-900">
            {tables.map(tbl => (
              <label key={tbl.name} className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors border-b border-zinc-50 dark:border-zinc-800/50 last:border-0">
                <input type="checkbox" checked={selectedTables.includes(tbl.name)} onChange={e => setSelectedTables(prev => e.target.checked ? [...prev, tbl.name] : prev.filter(n => n !== tbl.name))} className="rounded text-indigo-600" />
                <span className="text-sm text-zinc-700 dark:text-zinc-300 flex-1 truncate">{tbl.name}</span>
                {tbl.rowCount !== undefined && <span className="text-[10px] text-zinc-400 tabular-nums">{tbl.rowCount.toLocaleString()} {t('rows')}</span>}
              </label>
            ))}
          </div>
          <button onClick={handleConfirm} disabled={tables.length > 0 && selectedTables.length === 0}
            className="py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-colors disabled:opacity-40 flex items-center justify-center gap-2">
            <Database className="size-4" /> {t('Confirm Configuration')} {selectedTables.length > 0 ? `(${selectedTables.length} ${t('tables')})` : `(${t('Import All')})`}
          </button>
        </div>
      )}

      {testResult?.ok && tables.length === 0 && !fetchingTables && (
        <button onClick={handleConfirm} className="py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-colors flex items-center justify-center gap-2">
          <Database className="size-4" /> {t('Confirm Configuration (Import All Tables)')}
        </button>
      )}
    </div>
  )
}

// ── AddForm ───────────────────────────────────────────────────────────────────

function AddForm({ onAdded, onCancel }: { onAdded: (kb: KB) => void; onCancel: () => void }) {
  const { t } = useI18n()
  const [mode, setMode] = useState<AddMode>('path')
  const [pathVal, setPathVal] = useState("")
  const [nameVal, setNameVal] = useState("")
  const [nameTouched, setNameTouched] = useState(false)
  const [error, setError] = useState("")
  const [adding, setAdding] = useState(false)
  const [scanProgress, setScanProgress] = useState<IndexProgress | null>(null)
  const [createdId, setCreatedId] = useState<string | null>(null)
  const [uploadFiles, setUploadFiles] = useState<FileList | null>(null)
  const [uploading, setUploading] = useState(false)
  const [dbConfig, setDbConfig] = useState<Record<string, unknown> | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const derivedName = pathVal.trim() ? deriveNameFromPath(pathVal.trim()) : ""
  const displayName = nameTouched ? nameVal : derivedName

  const tabCls = (t: AddMode) => `flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${mode === t ? 'bg-indigo-100 dark:bg-indigo-500/20 text-indigo-700 dark:text-indigo-300' : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800'}`

  const startIndexing = (id: string) => {
    setCreatedId(id)
    setScanProgress({ stage: 'scan' })
    fetch(`/api/kb/${id}/index`, { method: 'POST' }).then(async (res) => {
      if (!res.body) return
      const reader = res.body.getReader(); const decoder = new TextDecoder(); let buf = ''
      while (true) {
        const { done, value } = await reader.read(); if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n'); buf = lines.pop() || ''
        for (const line of lines) {
          if (line.startsWith('data: ')) try { setScanProgress(JSON.parse(line.slice(6))) } catch { }
        }
      }
    }).catch(() => setScanProgress({ stage: 'error', error: t('Connection interrupted') }))
  }

  const handleSubmitPath = async () => {
    const p = pathVal.trim(); const n = (nameTouched ? nameVal : derivedName).trim()
    if (!p) { setError(t("Please enter a folder path")); return }
    if (!n) { setError(t("Please enter a knowledge base name")); return }
    setError(""); setAdding(true)
    try {
      const res = await fetch('/api/kb', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: n, sourceType: 'local', path: p }) })
      if (!res.ok) { const e = await res.json(); setError(e.error || t('Creation failed')); setAdding(false); return }
      startIndexing((await res.json()).id)
    } catch (e: unknown) { setError(e instanceof Error ? e.message : String(e)); setAdding(false) }
  }

  const handleUpload = async () => {
    if (!uploadFiles || uploadFiles.length === 0) { setError(t("Please select files")); return }
    const n = nameVal.trim() || t('Uploaded Files')
    setUploading(true); setError("")
    try {
      const formData = new FormData()
      Array.from(uploadFiles).forEach(f => formData.append('files', f))
      formData.append('name', n)
      const res = await fetch('/api/kb/upload', { method: 'POST', body: formData })
      if (!res.ok) { const e = await res.json(); setError(e.error || t('Upload failed')); setUploading(false); return }
      const kb = await res.json()
      startIndexing(kb.id)
    } catch (e: unknown) { setError(e instanceof Error ? e.message : String(e)); setUploading(false) }
  }

  const handleDatabaseSubmit = async () => {
    if (!dbConfig) { setError(t("Please configure and test the database connection first")); return }
    const n = nameVal.trim() || `${String(dbConfig.dbType || 'DB').toUpperCase()} ${t('Database')}`
    setError(""); setAdding(true)
    try {
      const res = await fetch('/api/kb', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: n, sourceType: 'database', config: dbConfig }) })
      if (!res.ok) { const e = await res.json(); setError(e.error || t('Creation failed')); setAdding(false); return }
      startIndexing((await res.json()).id)
    } catch (e: unknown) { setError(e instanceof Error ? e.message : String(e)); setAdding(false) }
  }

  const handleDone = useCallback(() => {
    if (createdId) fetch(`/api/kb/${createdId}`).then(r => r.json()).then(kb => { if (kb.id) onAdded(kb) }).catch(() => onAdded({ id: createdId!, name: displayName, path: pathVal, status: 'ready', lastError: '', stats: {}, chunkCount: 0 }))
  }, [createdId, displayName, onAdded, pathVal])

  if (scanProgress) {
    return (
      <div className="flex flex-col gap-3">
        <div className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 flex items-center gap-2">
          <FolderSearch className="size-4 text-indigo-500" />
          <span className="truncate max-w-[300px]">{displayName || nameVal || t('Knowledge Base')}</span>
        </div>
        <ScanProgress progress={scanProgress} onDone={handleDone} />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h4 className="font-semibold text-sm flex items-center gap-2"><Plus className="size-4 text-indigo-500" /> {t('Add Knowledge Base')}</h4>
        <button onClick={onCancel} className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400"><X className="size-4" /></button>
      </div>

      {/* Mode tabs */}
      <div className="flex gap-1 p-1 bg-zinc-100 dark:bg-zinc-800/60 rounded-xl">
        <button className={tabCls('path')} onClick={() => setMode('path')}><FolderSearch className="size-3.5" /> {t('Path')}</button>
        <button className={tabCls('browse')} onClick={() => setMode('browse')}><FolderOpen className="size-3.5" /> {t('Browse')}</button>
        <button className={tabCls('upload')} onClick={() => setMode('upload')}><Upload className="size-3.5" /> {t('Upload')}</button>
        <button className={tabCls('database')} onClick={() => setMode('database')}><Server className="size-3.5" /> {t('Database')}</button>
      </div>

      {/* Path */}
      {mode === 'path' && (
        <div className="flex flex-col gap-3">
          <input value={pathVal} onChange={e => { setPathVal(e.target.value); setError("") }} onKeyDown={e => e.key === 'Enter' && handleSubmitPath()} placeholder="C:\Users\jack\Documents" autoFocus
            className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2.5 text-sm font-mono placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-400 transition-all" />
          {pathVal.trim() && (
            <input value={displayName} onChange={e => { setNameVal(e.target.value); setNameTouched(true) }} placeholder={derivedName || t("Knowledge Base Name")} className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2.5 text-sm placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all" />
          )}
          {error && <p className="text-xs text-red-500 flex items-center gap-1.5"><AlertCircle className="size-3 shrink-0" /> {error}</p>}
          <button onClick={handleSubmitPath} disabled={adding || !pathVal.trim()} className="py-2.5 rounded-xl text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 transition-colors flex items-center justify-center gap-2">
            {adding ? <Loader2 className="size-4 animate-spin" /> : <ChevronRight className="size-4" />} {adding ? t('Adding...') : t('Confirm Add')}
          </button>
        </div>
      )}

      {/* Browse */}
      {mode === 'browse' && (
        <div className="flex flex-col gap-3">
          <FileBrowser onSelect={(p) => { setPathVal(p); setMode('path') }} />
        </div>
      )}

      {/* Upload */}
      {mode === 'upload' && (
        <div className="flex flex-col gap-3">
          <input ref={fileInputRef} type="file" multiple className="hidden" onChange={e => setUploadFiles(e.target.files)} />
          <button onClick={() => fileInputRef.current?.click()}
            className="flex flex-col items-center justify-center gap-2 py-8 rounded-xl border-2 border-dashed border-zinc-200 dark:border-zinc-700 hover:border-indigo-400 dark:hover:border-indigo-600 transition-colors text-zinc-500 hover:text-indigo-500">
            <Upload className="size-8" />
            <span className="text-sm font-medium">{t('Click to select files or folders')}</span>
            <span className="text-xs text-zinc-400">{t('Supports PDF · Word · Excel · Markdown · Code, etc.')}</span>
          </button>
          {uploadFiles && uploadFiles.length > 0 && (
            <div className="text-xs text-zinc-600 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg px-3 py-2">
              {t('Selected {{count}} files', { count: uploadFiles.length })}
            </div>
          )}
          <input value={nameVal} onChange={e => setNameVal(e.target.value)} placeholder={t('Knowledge Base Name (auto-generated if empty)')} className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2.5 text-sm placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all" />
          {error && <p className="text-xs text-red-500 flex items-center gap-1.5"><AlertCircle className="size-3 shrink-0" /> {error}</p>}
          <button onClick={handleUpload} disabled={uploading || !uploadFiles || uploadFiles.length === 0} className="py-2.5 rounded-xl text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 transition-colors flex items-center justify-center gap-2">
            {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />} {uploading ? t('Uploading...') : t('Upload and Index')}
          </button>
        </div>
      )}

      {/* Database */}
      {mode === 'database' && (
        <div className="flex flex-col gap-3">
          <DatabaseForm onConfig={(cfg) => setDbConfig(cfg)} />
          {dbConfig && (
            <>
              <input value={nameVal} onChange={e => setNameVal(e.target.value)} placeholder={`${String(dbConfig.dbType || 'DB').toUpperCase()} ${t('Database')}`} className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2.5 text-sm placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all" />
              {error && <p className="text-xs text-red-500 flex items-center gap-1.5"><AlertCircle className="size-3 shrink-0" /> {error}</p>}
              <button onClick={handleDatabaseSubmit} disabled={adding} className="py-2.5 rounded-xl text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 transition-colors flex items-center justify-center gap-2">
                {adding ? <Loader2 className="size-4 animate-spin" /> : <Database className="size-4" />} {adding ? t('Creating...') : t('Create Database Knowledge Base')}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ── SearchPanel ───────────────────────────────────────────────────────────────

function SearchPanel({ kbId }: { kbId: string }) {
  const { t } = useI18n()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [total, setTotal] = useState(0)
  const [expanded, setExpanded] = useState<number | null>(null)

  const handleSearch = async () => {
    if (!query.trim()) return
    setLoading(true)
    try {
      const res = await fetch(`/api/kb/${kbId}/search`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query, limit: 10 }) })
      const data = await res.json()
      if (res.ok) { setResults(data.results || []); setTotal(data.total || 0) }
    } catch { }
    setLoading(false)
  }

  function highlightText(text: string, query: string) {
    if (!query.trim()) return text
    // HTML entity escape first to prevent XSS
    const escaped = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
    const words = query.trim().split(/\s+/).filter(Boolean)
    const pattern = new RegExp(`(${words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi')
    return escaped.replace(pattern, '<mark class="bg-yellow-200 dark:bg-yellow-800 text-zinc-900 dark:text-zinc-100 rounded px-0.5">$1</mark>')
  }

  return (
    <div className="flex flex-col gap-3 mt-2">
      <div className="flex gap-2">
        <input value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSearch()}
          placeholder={t("Search this knowledge base...")} autoFocus
          className="flex-1 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 transition-all" />
        <button onClick={handleSearch} disabled={loading || !query.trim()}
          className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-colors disabled:opacity-40 flex items-center gap-1.5">
          {loading ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
        </button>
      </div>

      {results.length > 0 && (
        <div className="text-[11px] text-zinc-400">{t('Found {{total}} relevant fragments, showing top {{count}}', { total: total, count: results.length })}</div>
      )}

      <div className="flex flex-col gap-2 max-h-72 overflow-y-auto app-scrollbar">
        {results.map((r, i) => (
          <div key={i} className="rounded-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden">
            <button onClick={() => setExpanded(expanded === i ? null : i)}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors">
              <span className="shrink-0 size-5 rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 text-[10px] font-bold flex items-center justify-center">{r.rank}</span>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-zinc-700 dark:text-zinc-300 truncate">{r.title}</div>
                <div className="text-[11px] text-zinc-400 truncate" dangerouslySetInnerHTML={{ __html: highlightText(r.snippet, query) }} />
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[10px] font-mono text-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 px-1.5 py-0.5 rounded">{r.score.toFixed(1)}</span>
                {expanded === i ? <ChevronDown className="size-3 text-zinc-400" /> : <ChevronRight className="size-3 text-zinc-400" />}
              </div>
            </button>
            {expanded === i && (
              <div className="px-3 pb-3 pt-1 border-t border-zinc-100 dark:border-zinc-800">
                <p className="text-xs text-zinc-600 dark:text-zinc-400 font-mono whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto app-scrollbar" dangerouslySetInnerHTML={{ __html: highlightText(r.content, query) }} />
              </div>
            )}
          </div>
        ))}
        {results.length === 0 && query && !loading && (
          <div className="py-6 text-center text-xs text-zinc-400">{t('No relevant content found')}</div>
        )}
      </div>
    </div>
  )
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function parseTags(tags: string | null | undefined): string[] {
  if (!tags) return []
  try { const arr = JSON.parse(tags); return Array.isArray(arr) ? arr.filter((t: unknown) => typeof t === 'string') : [] } catch { return [] }
}

// ── EditKBDlg ─────────────────────────────────────────────────────────────────

function EditKBDlg({ kb, onDone, onCancel }: { kb: KB; onDone: () => void; onCancel: () => void }) {
  const { t } = useI18n()
  const [name, setName] = useState(kb.name)
  const [tagInput, setTagInput] = useState('')
  const [tags, setTags] = useState<string[]>(parseTags(kb.tags))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const addTag = () => {
    const v = tagInput.trim()
    if (v && !tags.includes(v)) { setTags([...tags, v]); setTagInput('') }
  }

  const removeTag = (tag: string) => { setTags(tags.filter(t => t !== tag)) }

  const handleSave = async () => {
    if (!name.trim()) { setError(t('Name is required')); return }
    setSaving(true); setError('')
    try {
      const res = await fetch(`/api/kb/${kb.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name.trim(), tags }) })
      if (!res.ok) { const e = await res.json(); setError(e.error || t('Update failed')); setSaving(false); return }
      onDone()
    } catch (e: unknown) { setError(e instanceof Error ? e.message : String(e)); setSaving(false) }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h4 className="font-semibold text-sm flex items-center gap-2"><Pencil className="size-4 text-indigo-500" /> {t('Edit Knowledge Base')}</h4>
        <button onClick={onCancel} className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400"><X className="size-4" /></button>
      </div>
      <input value={name} onChange={e => setName(e.target.value)} placeholder={t('Knowledge Base Name')}
        className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2.5 text-sm placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all" />
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-600 dark:text-zinc-400"><Tag className="size-3" /> {t('Tags')}</div>
        <div className="flex flex-wrap gap-1.5">
          {tags.map(tag => (
            <span key={tag} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-xs font-medium">
              {tag}
              <button onClick={() => removeTag(tag)} className="hover:text-red-500 transition-colors"><X className="size-3" /></button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input value={tagInput} onChange={e => setTagInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addTag())} placeholder={t('Add tag...')}
            className="flex-1 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all" />
          <button onClick={addTag} disabled={!tagInput.trim()} className="px-3 py-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 text-sm font-medium hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors disabled:opacity-40">{t('Add')}</button>
        </div>
      </div>
      {error && <p className="text-xs text-red-500 flex items-center gap-1.5"><AlertCircle className="size-3 shrink-0" /> {error}</p>}
      <button onClick={handleSave} disabled={saving} className="py-2.5 rounded-xl text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 transition-colors flex items-center justify-center gap-2">
        {saving ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />} {saving ? t('Saving...') : t('Save')}
      </button>
    </div>
  )
}

// ── KBCard ────────────────────────────────────────────────────────────────────

function KBCard({ kb, onDelete, onSync, onSyncing, onEdit, onExport }: { kb: KB; onDelete: () => void; onSync: () => void; onSyncing: boolean; onEdit: () => void; onExport: () => void }) {
  const { t } = useI18n()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [syncProgress, setSyncProgress] = useState<IndexProgress | null>(null)
  const [panel, setPanel] = useState<'search' | null>(null)

  const handleSyncClick = () => {
    setSyncProgress({ stage: 'scan' }); onSync()
    fetch(`/api/kb/${kb.id}/index`, { method: 'POST' }).then(async (res) => {
      if (!res.body) return
      const reader = res.body.getReader(); const decoder = new TextDecoder(); let buf = ''
      while (true) {
        const { done, value } = await reader.read(); if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n'); buf = lines.pop() || ''
        for (const line of lines) if (line.startsWith('data: ')) try { setSyncProgress(JSON.parse(line.slice(6))) } catch { }
      }
    }).catch(() => setSyncProgress({ stage: 'error', error: t('Connection interrupted') }))
  }

  const isIndexing = kb.status === 'indexing' || onSyncing
  
  const getKBFileIcon = (pathStr: string) => {
    if (!pathStr) return <FolderSearch className="size-5 text-indigo-500" />
    const ext = pathStr.split('.').pop()?.toLowerCase() || ''
    if (pathStr.includes('.') && !pathStr.endsWith('/') && !pathStr.endsWith('\\')) {
      if (ext === 'pdf') return <FileText className="size-5 text-rose-500" />
      if (['docx', 'doc'].includes(ext)) return <FileText className="size-5 text-blue-500" />
      if (['xlsx', 'xls', 'csv', 'tsv'].includes(ext)) return <FileText className="size-5 text-emerald-500" />
      if (['md', 'txt', 'rtf'].includes(ext)) return <FileText className="size-5 text-amber-500" />
      if (['js', 'ts', 'tsx', 'jsx', 'py', 'java', 'go', 'rs', 'cpp', 'c', 'sql', 'json'].includes(ext)) return <FileCode2 className="size-5 text-purple-500" />
      return <File className="size-5 text-zinc-500" />
    }
    return <FolderSearch className="size-5 text-indigo-500" />
  }

  const sourceIcon = kb.sourceType === 'database' 
    ? <Server className="size-5 text-indigo-500" /> 
    : getKBFileIcon(kb.path || '')

  const statusLabel =
    kb.status === 'ready' ? t("Ready") :
    kb.status === 'indexing' ? t("Indexing") :
    kb.status === 'error' ? t("Error") : kb.status
  const statusColor =
    kb.status === 'ready' ? 'bg-green-50 dark:bg-green-500/10 text-green-600 dark:text-green-500' :
    kb.status === 'indexing' ? 'bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400' :
    kb.status === 'error' ? 'bg-red-50 dark:bg-red-500/10 text-red-600' :
    'bg-zinc-50 dark:bg-zinc-800/50 text-zinc-600 dark:text-zinc-400'

  return (
    <div className="group p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:border-indigo-200/80 dark:hover:border-indigo-800/60 transition-colors bg-white dark:bg-zinc-900/50 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start gap-3">
        <div className="size-9 rounded-lg bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center shrink-0">{sourceIcon}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h4 className="font-bold text-sm text-zinc-800 dark:text-zinc-200 truncate">{kb.name}</h4>
            {kb.sourceType === 'database' && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-purple-50 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400">{t('Database')}</span>}
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex items-center gap-1 ${statusColor}`}>
              {isIndexing && <Loader2 className="size-2.5 animate-spin" />} {statusLabel}
            </span>
          </div>
          {kb.path && <p className="text-[11px] font-mono text-zinc-400 truncate mt-0.5" title={kb.path}>{kb.path}</p>}
          {parseTags(kb.tags).length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
              {parseTags(kb.tags).map(tag => (
                <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400">{tag}</span>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          {kb.status === 'ready' && (
            <button onClick={() => setPanel(panel === 'search' ? null : 'search')} title={t("Search Knowledge Base")}
              className={`p-1.5 rounded-lg transition-colors ${panel === 'search' ? 'bg-indigo-100 dark:bg-indigo-500/20 text-indigo-500' : 'hover:bg-indigo-50 dark:hover:bg-indigo-500/10 text-zinc-400 hover:text-indigo-500'}`}>
              <Search className="size-3.5" />
            </button>
          )}
          <button onClick={onExport} title={t("Export")} className="p-1.5 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-500/10 text-zinc-400 hover:text-indigo-500 transition-colors">
            <Download className="size-3.5" />
          </button>
          <button onClick={onEdit} title={t("Edit")} className="p-1.5 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-500/10 text-zinc-400 hover:text-indigo-500 transition-colors">
            <Pencil className="size-3.5" />
          </button>
          <button onClick={handleSyncClick} disabled={isIndexing || !!syncProgress} title={t("Re-index")}
            className="p-1.5 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-500/10 text-zinc-400 hover:text-indigo-500 transition-colors disabled:opacity-40">
            <RefreshCw className={`size-3.5 ${isIndexing ? 'animate-spin text-indigo-500' : ''}`} />
          </button>
          {!confirmDelete ? (
            <button onClick={() => setConfirmDelete(true)} title={t("Delete")} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10 text-zinc-400 hover:text-red-500 transition-colors"><Trash2 className="size-3.5" /></button>
          ) : (
            <div className="flex items-center gap-1 bg-red-50 dark:bg-red-900/30 rounded-lg px-2 py-1">
              <span className="text-[11px] text-red-600 font-medium">{t('Confirm delete?')}</span>
              <button onClick={onDelete} className="text-[11px] font-bold text-red-600 hover:underline">{t('Yes')}</button>
              <button onClick={() => setConfirmDelete(false)} className="text-[11px] text-zinc-500 hover:underline">{t('No')}</button>
            </div>
          )}
        </div>
      </div>

      {syncProgress && (
        <div className="mt-3"><ScanProgress progress={syncProgress} onDone={() => { setSyncProgress(null); onSync() }} /></div>
      )}

      {!syncProgress && (
        <div className="flex items-center gap-3 mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-800">
          <div className="flex items-center gap-1 text-[11px] text-zinc-500"><Database className="size-3 text-zinc-400" /><span>{kb.stats?.documentCount ?? 0} {t('sources')}</span></div>
          <div className="text-[11px] text-zinc-400">·</div>
          <div className="text-[11px] text-zinc-500">{kb.chunkCount || 0} {t('fragments')}</div>
          {kb.lastIndexedAt && <div className="text-[11px] text-zinc-400 ml-auto">{t('Updated on')} {formatDate(kb.lastIndexedAt)}</div>}
        </div>
      )}

      {kb.status === 'error' && kb.lastError && !syncProgress && (
        <div className="mt-2 text-[11px] text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-2.5 py-1.5 flex items-start gap-1.5">
          <AlertCircle className="size-3 shrink-0 mt-0.5" /><span className="break-all">{kb.lastError}</span>
        </div>
      )}

      {panel === 'search' && (
        <div className="mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-800">
          <SearchPanel kbId={kb.id} />
        </div>
      )}
    </div>
  )
}

// ── Main Dialog ───────────────────────────────────────────────────────────────

export function KnowledgeDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useI18n()
  const [kbs, setKbs] = useState<KB[]>([])
  const [adding, setAdding] = useState(false)
  const [syncingId, setSyncingId] = useState<string | null>(null)
  const [editingKb, setEditingKb] = useState<KB | null>(null)
  const [activeTag, setActiveTag] = useState<string | null>(null)

  const fetchKbs = useCallback(() => {
    fetch('/api/kb').then(r => r.json()).then(d => { if (Array.isArray(d)) setKbs(d) }).catch(console.error)
  }, [])

  useEffect(() => { 
    if (open) { 
      fetchKbs()
      setTimeout(() => { setAdding(false); setEditingKb(null) }, 0)
    } 
  }, [open, fetchKbs])

  const handleAdded = () => { setAdding(false); fetchKbs() }
  const handleDelete = async (id: string) => { await fetch(`/api/kb/${id}`, { method: 'DELETE' }); fetchKbs() }
  const handleSync = (id: string) => { setSyncingId(id); setTimeout(() => { setSyncingId(null); fetchKbs() }, 500) }
  const handleExport = (kb: KB) => {
    const a = document.createElement('a')
    a.href = `/api/kb/${kb.id}/export`
    a.download = `${kb.name}-export.json`
    a.click()
  }

  // Collect all unique tags from all knowledge bases
  const allTags = Array.from(new Set(kbs.flatMap(kb => parseTags(kb.tags)))).sort()

  // Filter knowledge bases by active tag
  const filteredKbs = activeTag ? kbs.filter(kb => parseTags(kb.tags).includes(activeTag)) : kbs

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[680px] max-h-[90vh] flex flex-col border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-zinc-100 dark:border-zinc-800">
          <DialogTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="size-8 rounded-lg bg-indigo-100 dark:bg-indigo-500/20 flex items-center justify-center">
                <Database className="size-4 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div>
                <div className="font-bold text-base text-zinc-900 dark:text-zinc-100">{t("Knowledge Base Management")}</div>
                <div className="text-xs text-zinc-500 font-normal">{t("Local folders, files, DBs · Unified AI Search")}</div>
              </div>
            </div>
            {!adding && (
              <button onClick={() => setAdding(true)} className="flex items-center gap-1.5 h-8 px-3 rounded-full text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors shadow-sm">
                <Plus className="size-3.5" /> {t("Add")}
              </button>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-6 space-y-4 app-scrollbar">
          {adding && (
            <div className="p-4 rounded-xl border border-indigo-200 dark:border-indigo-800/60 bg-indigo-50/40 dark:bg-indigo-950/20">
              <AddForm onAdded={handleAdded} onCancel={() => setAdding(false)} />
            </div>
          )}

          {editingKb && (
            <div className="p-4 rounded-xl border border-indigo-200 dark:border-indigo-800/60 bg-indigo-50/40 dark:bg-indigo-950/20">
              <EditKBDlg kb={editingKb} onDone={() => { setEditingKb(null); fetchKbs() }} onCancel={() => setEditingKb(null)} />
            </div>
          )}

          {allTags.length > 0 && !adding && !editingKb && (
            <div className="flex flex-wrap gap-1.5">
              <button onClick={() => setActiveTag(null)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${!activeTag ? 'bg-indigo-600 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'}`}>
                {t('All')}
              </button>
              {allTags.map(tag => (
                <button key={tag} onClick={() => setActiveTag(activeTag === tag ? null : tag)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${activeTag === tag ? 'bg-indigo-600 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-200 dark:hover:bg-zinc-700'}`}>
                  {tag}
                </button>
              ))}
            </div>
          )}

          {filteredKbs.map(kb => (
            <KBCard key={kb.id} kb={kb} onDelete={() => handleDelete(kb.id)} onSync={() => handleSync(kb.id)} onSyncing={syncingId === kb.id} onEdit={() => setEditingKb(kb)} onExport={() => handleExport(kb)} />
          ))}

          {kbs.length === 0 && !adding && (
            <div className="text-center py-14">
              <div className="size-16 rounded-2xl bg-gradient-to-br from-indigo-50 to-violet-50 dark:from-indigo-900/20 dark:to-violet-900/20 flex items-center justify-center mx-auto mb-4 border border-indigo-100 dark:border-indigo-800/40">
                <Database className="size-8 text-indigo-400" />
              </div>
              <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-1">{t("No knowledge bases yet")}</p>
              <p className="text-xs text-zinc-500 mb-5">{t("Supports local folders, file uploads, or database access")}</p>
              <button onClick={() => setAdding(true)} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors shadow-sm">
                <Plus className="size-4" /> {t("Add your first knowledge base")}
              </button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
