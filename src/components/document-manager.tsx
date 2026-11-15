"use client"

import { useState, useEffect, useCallback } from "react"
import { DocumentEditor } from "@/components/document-editor"
import {
  FileText, Plus, Search, Grid, List, MoreVertical,
  Edit3, Trash2, Download, Copy, FolderOpen,
  Loader2, Check, X, ChevronLeft
} from "lucide-react"
import { useI18n } from "@/lib/i18n"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"

interface Document {
  id: string
  title: string
  wordCount: number
  status: string
  tags: string[]
  createdAt: string
  updatedAt: string
  content: string
}

export function DocumentManager() {
  const { t } = useI18n()
  const [documents, setDocuments] = useState<Document[]>([])
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [showNewDocDialog, setShowNewDocDialog] = useState(false)
  const [newDocTitle, setNewDocTitle] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadDocuments()
  }, [])

  const loadDocuments = async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/documents?action=list')
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`)
      }
      const data = await res.json()
      setDocuments(data)
    } catch (err) {
      console.error('Failed to load documents:', err)
      setDocuments([])
    } finally {
      setLoading(false)
    }
  }

  const handleCreateDoc = async () => {
    try {
      const res = await fetch('/api/documents?action=create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newDocTitle || t('Untitled Document'),
          content: ''
        })
      })
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(errorData.error || `HTTP ${res.status}`)
      }
      const doc = await res.json()
      setDocuments([doc, ...documents])
      setSelectedDoc(doc)
      setShowNewDocDialog(false)
      setNewDocTitle("")
    } catch (err) {
      console.error('Failed to create document:', err)
      alert(t('Failed to create document'))
    }
  }

  const handleSave = useCallback(async (content: string, wordCount: number) => {
    if (!selectedDoc) return
    setSaving(true)
    try {
      const res = await fetch('/api/documents?action=save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: selectedDoc.id,
          content,
          wordCount,
          title: selectedDoc.title
        })
      })
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(errorData.error || `HTTP ${res.status}`)
      }
      const updatedDoc = await res.json()
      setSelectedDoc(updatedDoc)
    } catch (err) {
      console.error('Failed to save:', err)
    } finally {
      setSaving(false)
    }
  }, [selectedDoc])

  const handleDelete = async (id: string) => {
    if (!confirm(t('Are you sure you want to delete this document?'))) return
    try {
      const res = await fetch(`/api/documents?id=${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: 'Unknown error' }))
        throw new Error(errorData.error || `HTTP ${res.status}`)
      }
      setDocuments(documents.filter(d => d.id !== id))
      if (selectedDoc?.id === id) setSelectedDoc(null)
    } catch (err) {
      console.error('Failed to delete:', err)
      alert(t('Failed to delete document'))
    }
  }

  const filteredDocs = documents.filter(d =>
    d.title.toLowerCase().includes(search.toLowerCase())
  )

  if (selectedDoc) {
    return (
      <div className="flex flex-col h-full">
        {/* Document header */}
        <div className="flex items-center justify-between pl-14 md:pl-16 pr-4 py-2.5 border-b border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSelectedDoc(null)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-700 text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors"
            >
              <ChevronLeft className="size-4" />
              <span>{t('Back')}</span>
            </button>
            <div className="w-px h-4 bg-zinc-200 dark:bg-zinc-700 mx-1" />
            <input
              value={selectedDoc.title}
              onChange={e => setSelectedDoc({ ...selectedDoc, title: e.target.value })}
              className="text-sm font-semibold bg-transparent border-none focus:outline-none focus:ring-0"
            />
            {saving && (
              <span className="flex items-center gap-1 text-[10px] text-zinc-400">
                <Loader2 className="size-3 animate-spin" /> {t('Saving...')}
              </span>
            )}
          </div>
        </div>

        {/* Editor */}
        <div className="flex-1 overflow-hidden">
          <DocumentEditor
            key={selectedDoc.id}
            initialContent={selectedDoc.content}
            onSave={handleSave}
            autoSave={true}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-zinc-50 dark:bg-zinc-900">
      {/* Header */}
      <div className="flex items-center justify-between pl-14 md:pl-16 pr-6 py-4 border-b border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl bg-indigo-100 dark:bg-indigo-500/20 flex items-center justify-center">
            <FileText className="size-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">{t('Documents')}</h1>
            <p className="text-xs text-zinc-500">{documents.length} {t('documents')}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-zinc-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={t('Search documents...')}
              className="pl-9 pr-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/40 w-64"
            />
          </div>

          {/* View toggle */}
          <div className="flex rounded-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 ${viewMode === 'grid' ? 'bg-indigo-50 dark:bg-indigo-500/20 text-indigo-600' : 'bg-white dark:bg-zinc-800 text-zinc-400'}`}
            >
              <Grid className="size-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 ${viewMode === 'list' ? 'bg-indigo-50 dark:bg-indigo-500/20 text-indigo-600' : 'bg-white dark:bg-zinc-800 text-zinc-400'}`}
            >
              <List className="size-4" />
            </button>
          </div>

          {/* New document */}
          <button
            onClick={() => setShowNewDocDialog(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium transition-colors"
          >
            <Plus className="size-4" /> {t('New Document')}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="size-8 animate-spin text-zinc-400" />
          </div>
        ) : filteredDocs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-zinc-400">
            <FileText className="size-16 mb-4" />
            <p className="text-sm">{search ? t('No documents found') : t('No documents yet')}</p>
            {!search && (
              <button
                onClick={() => setShowNewDocDialog(true)}
                className="mt-4 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium"
              >
                {t('Create your first document')}
              </button>
            )}
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredDocs.map(doc => (
              <div
                key={doc.id}
                className="group relative bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 p-4 hover:shadow-md hover:border-indigo-300 dark:hover:border-indigo-700 transition-all cursor-pointer"
                onClick={() => setSelectedDoc(doc)}
              >
                <div className="size-12 rounded-lg bg-indigo-50 dark:bg-indigo-500/20 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                  <FileText className="size-6 text-indigo-600 dark:text-indigo-400" />
                </div>
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-1 truncate">{doc.title}</h3>
                <p className="text-[10px] text-zinc-500 mb-2">
                  {doc.wordCount} {t('words')} · {new Date(doc.updatedAt).toLocaleDateString()}
                </p>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                    doc.status === 'draft' ? 'bg-yellow-50 dark:bg-yellow-500/20 text-yellow-600 dark:text-yellow-400' :
                    doc.status === 'published' ? 'bg-green-50 dark:bg-green-500/20 text-green-600 dark:text-green-400' :
                    'bg-zinc-50 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-400'
                  }`}>
                    {doc.status}
                  </span>
                </div>

                {/* Actions */}
                <div className="absolute top-2 right-2 hidden group-hover:flex gap-1">
                  <button
                    onClick={e => { e.stopPropagation(); handleDelete(doc.id) }}
                    className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-500/20 text-zinc-400 hover:text-red-500"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {filteredDocs.map(doc => (
              <div
                key={doc.id}
                className="flex items-center gap-4 bg-white dark:bg-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-700 px-4 py-3 hover:shadow-sm hover:border-indigo-300 dark:hover:border-indigo-700 transition-all cursor-pointer"
                onClick={() => setSelectedDoc(doc)}
              >
                <div className="size-10 rounded-lg bg-indigo-50 dark:bg-indigo-500/20 flex items-center justify-center flex-shrink-0">
                  <FileText className="size-5 text-indigo-600 dark:text-indigo-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">{doc.title}</h3>
                  <p className="text-[10px] text-zinc-500">
                    {doc.wordCount} {t('words')} · Updated {new Date(doc.updatedAt).toLocaleString()}
                  </p>
                </div>
                <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                  doc.status === 'draft' ? 'bg-yellow-50 dark:bg-yellow-500/20 text-yellow-600 dark:text-yellow-400' :
                  doc.status === 'published' ? 'bg-green-50 dark:bg-green-500/20 text-green-600 dark:text-green-400' :
                  'bg-zinc-50 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-400'
                }`}>
                  {doc.status}
                </span>
                <button
                  onClick={e => { e.stopPropagation(); handleDelete(doc.id) }}
                  className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-500/20 text-zinc-400 hover:text-red-500"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* New Document Dialog */}
      <Dialog open={showNewDocDialog} onOpenChange={setShowNewDocDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('New Document')}</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <input
              value={newDocTitle}
              onChange={e => setNewDocTitle(e.target.value)}
              placeholder={t('Enter document title...')}
              className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
              onKeyDown={e => e.key === 'Enter' && handleCreateDoc()}
              autoFocus
            />
          </div>
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setShowNewDocDialog(false)}
              className="px-4 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-700"
            >
              {t('Cancel')}
            </button>
            <button
              onClick={handleCreateDoc}
              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium"
            >
              {t('Create')}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
