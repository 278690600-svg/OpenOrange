'use client'

import { useState, useEffect } from 'react'
import { useI18n } from '@/lib/i18n'
import {
  Download, Upload, FileJson, Clock, Calendar, MessageSquare, CheckCircle2,
  AlertCircle, X, Trash2, Loader2, Package, Eye, ChevronDown, ChevronUp, RefreshCw
} from 'lucide-react'

interface Chat {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  messages: Array<{
    id: string
    role: string
    content: string
    createdAt: string
    citations: string
    searchSteps: string
  }>
}

interface ArchiveData {
  version: string
  exportedAt: string
  chatCount: number
  chats: Array<{
    id: string
    title: string
    createdAt: string
    updatedAt: string
    messageCount: number
    messages: Array<{
      id: string
      role: string
      content: string
      createdAt: string
      citations: string
      searchSteps: string
    }>
  }>
}

interface ImportResult {
  success: boolean
  restoredCount: number
  totalChats: number
  errors?: Array<{ chatId: string; chatTitle: string; error: string }>
  restoredChats: Array<{ id: string; title: string; messageCount: number }>
}

export function ChatArchiveManager() {
  const { t } = useI18n()
  const [chats, setChats] = useState<Chat[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedChats, setSelectedChats] = useState<Set<string>>(new Set())
  const [exporting, setExporting] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [expandedChats, setExpandedChats] = useState<Set<string>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    loadChats()
  }, [])

  const loadChats = async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/chats')
      if (res.ok) {
        const data = await res.json()
        setChats(data)
      }
    } catch (error) {
      console.error('Failed to load chats:', error)
    } finally {
      setLoading(false)
    }
  }

  const toggleChatSelection = (id: string) => {
    setSelectedChats(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectAll = () => {
    if (selectedChats.size === filteredChats.length) {
      setSelectedChats(new Set())
    } else {
      setSelectedChats(new Set(filteredChats.map(c => c.id)))
    }
  }

  const exportChats = async (chatIds?: string[]) => {
    try {
      setExporting(true)
      const res = await fetch('/api/chats/archive/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatIds: chatIds || Array.from(selectedChats) })
      })

      if (res.ok) {
        const blob = await res.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `closedui-chats-archive-${Date.now()}.json`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        window.URL.revokeObjectURL(url)
      }
    } catch (error) {
      console.error('Export failed:', error)
    } finally {
      setExporting(false)
    }
  }

  const importArchive = async (file: File) => {
    try {
      setImporting(true)
      setImportResult(null)
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch('/api/chats/archive/import', {
        method: 'POST',
        body: formData
      })

      if (res.ok) {
        const result = await res.json()
        setImportResult(result)
        loadChats()
      }
    } catch (error) {
      console.error('Import failed:', error)
      setImportResult({ success: false, restoredCount: 0, totalChats: 0, errors: [{ chatId: '', chatTitle: '', error: (error as Error).message }], restoredChats: [] })
    } finally {
      setImporting(false)
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      importArchive(file)
    }
  }

  const toggleChatExpanded = (id: string) => {
    setExpandedChats(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const filteredChats = chats.filter(c =>
    c.title.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const formatMessageCount = (count: number) => {
    return `${count} ${count === 1 ? 'message' : 'messages'}`
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString()
  }

  return (
    <div className="h-full flex flex-col bg-white dark:bg-zinc-900">
      <div className="border-b border-zinc-200 dark:border-zinc-800 pl-14 md:pl-16 pr-4 py-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Package className="size-5 text-amber-600" />
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Chat Archive</h2>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-colors cursor-pointer">
              {importing ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
              Import
              <input
                type="file"
                accept=".json"
                onChange={handleFileSelect}
                className="hidden"
                disabled={importing}
              />
            </label>
            <button
              onClick={() => exportChats()}
              disabled={exporting}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors disabled:opacity-50"
            >
              {exporting ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
              Export All
            </button>
            <button
              onClick={loadChats}
              className="p-1.5 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
            >
              <RefreshCw className="size-4" />
            </button>
          </div>
        </div>

        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              placeholder="Search chats to archive..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-3 py-1.5 text-sm bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 dark:text-zinc-100"
            />
          </div>
          {selectedChats.size > 0 && (
            <button
              onClick={() => exportChats()}
              disabled={exporting}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-50"
            >
              {exporting ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
              Export Selected ({selectedChats.size})
            </button>
          )}
        </div>
      </div>

      {importResult && (
        <div className={`mx-4 mt-4 p-3 rounded-lg border ${importResult.success ? 'bg-emerald-50 dark:bg-emerald-900/10 border-emerald-200 dark:border-emerald-800' : 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800'}`}>
          <div className="flex items-center gap-2 mb-1">
            {importResult.success ? <CheckCircle2 className="size-4 text-emerald-600" /> : <AlertCircle className="size-4 text-red-600" />}
            <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
              {importResult.success ? 'Import Successful' : 'Import Failed'}
            </span>
            <button
              onClick={() => setImportResult(null)}
              className="ml-auto p-0.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
            >
              <X className="size-3.5" />
            </button>
          </div>
          <p className="text-xs text-zinc-600 dark:text-zinc-400">
            Restored {importResult.restoredCount} of {importResult.totalChats} chats
          </p>
          {importResult.errors && importResult.errors.length > 0 && (
            <div className="mt-2 space-y-1">
              {importResult.errors.map((err, idx) => (
                <p key={idx} className="text-xs text-red-600 dark:text-red-400">
                  - {err.chatTitle || err.chatId}: {err.error}
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="size-6 text-zinc-400 animate-spin" />
          </div>
        ) : filteredChats.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <FileJson className="size-12 text-zinc-300 dark:text-zinc-600 mb-3" />
            <p className="text-sm text-zinc-500 dark:text-zinc-400">No chats found</p>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-2 px-2 mb-2">
              <button
                onClick={selectAll}
                className="text-xs text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
              >
                {selectedChats.size === filteredChats.length ? 'Deselect All' : 'Select All'}
              </button>
              <span className="text-xs text-zinc-400 dark:text-zinc-500">
                ({filteredChats.length} chats, {filteredChats.reduce((sum, c) => sum + c.messages.length, 0)} total messages)
              </span>
            </div>

            {filteredChats.map((chat) => {
              const isSelected = selectedChats.has(chat.id)
              const isExpanded = expandedChats.has(chat.id)
              return (
                <div
                  key={chat.id}
                  className={`border rounded-lg overflow-hidden transition-all ${isSelected ? 'border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-900/10' : 'border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800/50'}`}
                >
                  <div className="flex items-center gap-2 p-3">
                    <button
                      onClick={() => toggleChatSelection(chat.id)}
                      className={`size-4 rounded border flex items-center justify-center transition-colors ${isSelected ? 'bg-amber-500 border-amber-500' : 'border-zinc-300 dark:border-zinc-600'}`}
                    >
                      {isSelected && <CheckCircle2 className="size-3 text-white" />}
                    </button>

                    <button
                      onClick={() => toggleChatExpanded(chat.id)}
                      className="p-0.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
                    >
                      {isExpanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                    </button>

                    <MessageSquare className="size-4 text-zinc-400" />

                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate">
                        {chat.title}
                      </span>
                    </div>

                    <div className="flex items-center gap-3 text-xs text-zinc-400 dark:text-zinc-500">
                      <span className="flex items-center gap-1">
                        <MessageSquare className="size-3" />
                        {formatMessageCount(chat.messages.length)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="size-3" />
                        {formatDate(chat.updatedAt)}
                      </span>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="border-t border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900/50 max-h-64 overflow-y-auto">
                      {chat.messages.map((msg) => (
                        <div key={msg.id} className="px-3 py-2 border-b border-zinc-100 dark:border-zinc-800 last:border-b-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`text-xs font-medium ${msg.role === 'user' ? 'text-blue-600 dark:text-blue-400' : 'text-green-600 dark:text-green-400'}`}>
                              {msg.role === 'user' ? 'You' : 'Assistant'}
                            </span>
                            <span className="text-xs text-zinc-400 dark:text-zinc-500">
                              {formatDate(msg.createdAt)}
                            </span>
                          </div>
                          <p className="text-xs text-zinc-600 dark:text-zinc-400 line-clamp-3 whitespace-pre-wrap">
                            {msg.content.substring(0, 500)}{msg.content.length > 500 ? '...' : ''}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
