"use client"

import { useState, useRef, useEffect } from "react"
import {
  FileText, Upload, ArrowRightLeft, Download, Eye, Split,
  Loader2, ChevronLeft, ChevronRight, Check, X, Plus,
  Filter, Search, Sparkles, Layout, Copy
} from "lucide-react"
import { useI18n } from "@/lib/i18n"

interface DiffLine {
  type: 'added' | 'removed' | 'unchanged' | 'modified'
  oldLine?: number
  newLine?: number
  content: string
  highlighted?: string
}

interface DiffResult {
  oldTitle: string
  newTitle: string
  diffLines: DiffLine[]
  stats: {
    added: number
    removed: number
    modified: number
    unchanged: number
  }
  similarity: number
}

interface DocumentCompareProps {
  oldDocId?: string
  newDocId?: string
}

export function DocumentCompare({ oldDocId, newDocId }: DocumentCompareProps) {
  const { t } = useI18n()
  const [viewMode, setViewMode] = useState<'split' | 'unified'>('split')
  const [oldContent, setOldContent] = useState('')
  const [newContent, setNewContent] = useState('')
  const [oldTitle, setOldTitle] = useState('Document A')
  const [newTitle, setNewTitle] = useState('Document B')
  const [diffResult, setDiffResult] = useState<DiffResult | null>(null)
  const [comparing, setComparing] = useState(false)
  const [filterType, setFilterType] = useState<'all' | 'added' | 'removed' | 'modified'>('all')
  const [selectedLine, setSelectedLine] = useState<number | null>(null)
  const oldFileRef = useRef<HTMLInputElement>(null)
  const newFileRef = useRef<HTMLInputElement>(null)

  const handleFileUpload = async (file: File, isOld: boolean) => {
    const text = await file.text()
    if (isOld) {
      setOldContent(text)
      setOldTitle(file.name.replace(/\.[^/.]+$/, ''))
    } else {
      setNewContent(text)
      setNewTitle(file.name.replace(/\.[^/.]+$/, ''))
    }
  }

  const handleCompare = async () => {
    if (!oldContent || !newContent) return

    setComparing(true)
    try {
      const res = await fetch('/api/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'compare',
          oldContent,
          newContent
        })
      })
      const data = await res.json()
      setDiffResult(data.diff)
    } catch (err) {
      console.error('Comparison failed:', err)
    } finally {
      setComparing(false)
    }
  }

  const handleExport = async () => {
    if (!diffResult) return

    try {
      const res = await fetch('/api/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generate-report',
          diff: diffResult,
          format: 'html'
        })
      })
      
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `diff-report-${Date.now()}.html`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Export failed:', err)
    }
  }

  const filteredLines = diffResult?.diffLines.filter(line => {
    if (filterType === 'all') return true
    return line.type === filterType
  }) || []

  return (
    <div className="flex flex-col h-full bg-zinc-50 dark:bg-zinc-900">
      {/* Header */}
      <div className="flex items-center justify-between pl-14 md:pl-16 pr-6 py-4 border-b border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl bg-purple-100 dark:bg-purple-500/20 flex items-center justify-center">
            <Split className="size-5 text-purple-600 dark:text-purple-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">{t("Document Compare")}</h1>
            <p className="text-xs text-zinc-500">{t("Compare two document versions")}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-700 rounded-lg p-1">
            <button
              onClick={() => setViewMode('split')}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${viewMode === 'split' ? 'bg-white dark:bg-zinc-600 shadow-sm text-zinc-900 dark:text-zinc-100' : 'text-zinc-600 dark:text-zinc-400'}`}
            >
              {t("Split")}
            </button>
            <button
              onClick={() => setViewMode('unified')}
              className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${viewMode === 'unified' ? 'bg-white dark:bg-zinc-600 shadow-sm text-zinc-900 dark:text-zinc-100' : 'text-zinc-600 dark:text-zinc-400'}`}
            >
              {t("Unified")}
            </button>
          </div>

          <button
            onClick={handleCompare}
            disabled={comparing || !oldContent || !newContent}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 disabled:bg-zinc-400 text-white text-sm font-medium transition-colors"
          >
            {comparing ? <Loader2 className="size-4 animate-spin" /> : <ArrowRightLeft className="size-4" />}
            {t("Compare")}
          </button>

          {diffResult && (
            <button
              onClick={handleExport}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-700 text-sm transition-colors"
            >
              <Download className="size-4" />
              {t("Export")}
            </button>
          )}
        </div>
      </div>

      {/* Input Section */}
      {!diffResult && (
        <div className="flex-1 grid grid-cols-2 gap-6 p-6 overflow-y-auto">
          {/* Old Document */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <input
                value={oldTitle}
                onChange={e => setOldTitle(e.target.value)}
                className="text-sm font-semibold bg-transparent border-none outline-none text-zinc-900 dark:text-zinc-100 flex-1"
                placeholder="Document A name..."
              />
              <label className="cursor-pointer">
                <input
                  type="file"
                  accept=".txt,.md,.html,.docx"
                  className="hidden"
                  ref={oldFileRef}
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleFileUpload(f, true) }}
                />
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-700 text-xs transition-colors">
                  <Upload className="size-3.5" />
                  {t("Upload")}
                </div>
              </label>
            </div>
            <textarea
              value={oldContent}
              onChange={e => setOldContent(e.target.value)}
              className="w-full h-96 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 px-4 py-3 text-sm font-mono leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-purple-500/40"
              placeholder="Paste old document content here or upload a file..."
            />
            <p className="text-[10px] text-zinc-500">{oldContent.length} characters</p>
          </div>

          {/* New Document */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <input
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                className="text-sm font-semibold bg-transparent border-none outline-none text-zinc-900 dark:text-zinc-100 flex-1"
                placeholder="Document B name..."
              />
              <label className="cursor-pointer">
                <input
                  type="file"
                  accept=".txt,.md,.html,.docx"
                  className="hidden"
                  ref={newFileRef}
                  onChange={e => { const f = e.target.files?.[0]; if (f) handleFileUpload(f, false) }}
                />
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-700 text-xs transition-colors">
                  <Upload className="size-3.5" />
                  {t("Upload")}
                </div>
              </label>
            </div>
            <textarea
              value={newContent}
              onChange={e => setNewContent(e.target.value)}
              className="w-full h-96 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 px-4 py-3 text-sm font-mono leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-purple-500/40"
              placeholder="Paste new document content here or upload a file..."
            />
            <p className="text-[10px] text-zinc-500">{newContent.length} characters</p>
          </div>
        </div>
      )}

      {/* Results Section */}
      {diffResult && (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Stats Bar */}
          <div className="flex items-center gap-6 px-6 py-3 border-b border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div className="size-3 rounded-full bg-green-500" />
                <span className="text-xs text-zinc-700 dark:text-zinc-300">+{diffResult.stats.added} {t("added")}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="size-3 rounded-full bg-red-500" />
                <span className="text-xs text-zinc-700 dark:text-zinc-300">-{diffResult.stats.removed} {t("removed")}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="size-3 rounded-full bg-yellow-500" />
                <span className="text-xs text-zinc-700 dark:text-zinc-300">~{diffResult.stats.modified} {t("modified")}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="size-3 rounded-full bg-zinc-400" />
                <span className="text-xs text-zinc-700 dark:text-zinc-300">{diffResult.stats.unchanged} {t("unchanged")}</span>
              </div>
            </div>

            <div className="flex-1" />

            <div className="flex items-center gap-2">
              <span className="text-xs text-zinc-500">{t("Similarity")}:</span>
              <span className={`text-sm font-bold ${diffResult.similarity > 80 ? 'text-green-500' : diffResult.similarity > 50 ? 'text-yellow-500' : 'text-red-500'}`}>
                {diffResult.similarity.toFixed(1)}%
              </span>
            </div>

            <div className="flex items-center gap-1">
              <Filter className="size-3.5 text-zinc-500" />
              <select
                value={filterType}
                onChange={e => setFilterType(e.target.value as any)}
                className="rounded border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 px-2 py-1 text-xs"
              >
                <option value="all">{t("All changes")}</option>
                <option value="added">{t("Added only")}</option>
                <option value="removed">{t("Removed only")}</option>
                <option value="modified">{t("Modified only")}</option>
              </select>
            </div>
          </div>

          {/* Diff View */}
          <div className="flex-1 overflow-y-auto p-4">
            {viewMode === 'split' ? (
              <div className="grid grid-cols-2 gap-4">
                {/* Old Document */}
                <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 overflow-hidden">
                  <div className="px-4 py-2 border-b border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900">
                    <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">{diffResult.oldTitle}</span>
                  </div>
                  <div className="p-4 font-mono text-xs leading-relaxed">
                    {diffResult.diffLines.filter(line => line.type !== 'added').map((line, i) => (
                      <div
                        key={i}
                        className={`flex gap-2 py-0.5 ${line.type === 'removed' ? 'bg-red-50 dark:bg-red-500/10' : line.type === 'modified' ? 'bg-yellow-50 dark:bg-yellow-500/10' : ''}`}
                      >
                        <span className="w-8 text-zinc-400 select-none text-right">{line.oldLine || ''}</span>
                        <span className="flex-1">
                          {line.type === 'removed' && <span className="text-red-600 dark:text-red-400">- </span>}
                          {line.type === 'modified' && <span className="text-yellow-600 dark:text-yellow-400">~ </span>}
                          {line.content}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* New Document */}
                <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 overflow-hidden">
                  <div className="px-4 py-2 border-b border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900">
                    <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">{diffResult.newTitle}</span>
                  </div>
                  <div className="p-4 font-mono text-xs leading-relaxed">
                    {diffResult.diffLines.filter(line => line.type !== 'removed').map((line, i) => (
                      <div
                        key={i}
                        className={`flex gap-2 py-0.5 ${line.type === 'added' ? 'bg-green-50 dark:bg-green-500/10' : line.type === 'modified' ? 'bg-yellow-50 dark:bg-yellow-500/10' : ''}`}
                      >
                        <span className="w-8 text-zinc-400 select-none text-right">{line.newLine || ''}</span>
                        <span className="flex-1">
                          {line.type === 'added' && <span className="text-green-600 dark:text-green-400">+ </span>}
                          {line.type === 'modified' && <span className="text-yellow-600 dark:text-yellow-400">~ </span>}
                          <span dangerouslySetInnerHTML={{ __html: line.highlighted || line.content }} />
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 overflow-hidden">
                <div className="p-4 font-mono text-xs leading-relaxed">
                  {filteredLines.map((line, i) => (
                    <div
                      key={i}
                      className={`flex gap-2 py-0.5 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-700/50 ${line.type === 'added' ? 'bg-green-50 dark:bg-green-500/10' : line.type === 'removed' ? 'bg-red-50 dark:bg-red-500/10' : line.type === 'modified' ? 'bg-yellow-50 dark:bg-yellow-500/10' : ''}`}
                      onClick={() => setSelectedLine(selectedLine === i ? null : i)}
                    >
                      <span className="w-12 text-zinc-400 select-none text-right">
                        {line.oldLine}{line.newLine ? ` → ${line.newLine}` : ''}
                      </span>
                      <span className="w-4 select-none">
                        {line.type === 'added' && <span className="text-green-600 dark:text-green-400">+</span>}
                        {line.type === 'removed' && <span className="text-red-600 dark:text-red-400">-</span>}
                        {line.type === 'modified' && <span className="text-yellow-600 dark:text-yellow-400">~</span>}
                      </span>
                      <span className="flex-1" dangerouslySetInnerHTML={{ __html: line.highlighted || line.content }} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Reset Button */}
          <div className="flex justify-center py-3 border-t border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800">
            <button
              onClick={() => { setDiffResult(null); setOldContent(''); setNewContent('') }}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-700 text-sm transition-colors"
            >
              <Plus className="size-4" />
              {t("New Comparison")}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
