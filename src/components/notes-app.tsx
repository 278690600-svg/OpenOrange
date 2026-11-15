"use client"

import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import {
  Plus, Search, Trash2, Edit3, Calendar, Tag, Clock,
  ChevronRight, Star, Pin, MoreVertical, FolderOpen,
  Link2, ArrowRight, ExternalLink, Sparkles
} from "lucide-react"
import { useI18n } from "@/lib/i18n"
import {
  detectLinks, syncLinks, getBacklinks, getOutgoingLinks,
  getRelatedNotes, findNoteByTitle, NoteLinkRecord
} from "@/lib/note-links"

interface Note {
  id: string
  title: string
  content: string
  folder?: string
  tags: string[]
  pinned: boolean
  starred: boolean
  createdAt: string
  updatedAt: string
}

// --- Light-weight Front-end RAG TF-IDF Cosine Similarity Engine ---

const STOP_WORDS = new Set([
  "的", "了", "在", "是", "我", "你", "他", "她", "它", "们", "这", "那", "之", "与", "和", "或", "都", "有", "个", "上", "下", "里", "外", "以", "而", "及", "也", "就", "并", "去", "说", "会", "要", "到", "得", "着", "被", "让", "把", "给", "等",
  "the", "a", "an", "and", "or", "but", "if", "then", "else", "when", "at", "by", "for", "with", "about", "against", "between", "into", "through", "during", "before", "after", "above", "below", "to", "from", "up", "down", "in", "out", "on", "off", "over", "under", "again", "further", "once", "here", "there", "who", "what", "why", "how", "all", "any", "both", "each", "few", "more", "most", "other", "some", "such", "no", "nor", "not", "only", "own", "same", "so", "than", "too", "very", "can", "will", "just", "should", "now"
])

function tokenize(text: string): string[] {
  const normalized = text.toLowerCase()
  
  // English words split
  const englishWords = normalized.match(/[a-z0-9]+/g) || []
  
  // Chinese characters & Bigrams (double words) split for rich semantic features
  const chineseChars: string[] = []
  const chineseText = normalized.replace(/[^\u4e00-\u9fa5]/g, "")
  
  for (let i = 0; i < chineseText.length; i++) {
    const char = chineseText[i]
    if (!STOP_WORDS.has(char)) {
      chineseChars.push(char)
    }
    if (i < chineseText.length - 1) {
      const bigram = chineseText.slice(i, i + 2)
      if (!STOP_WORDS.has(bigram)) {
        chineseChars.push(bigram)
      }
    }
  }

  const filteredEnglish = englishWords.filter(w => w.length > 1 && !STOP_WORDS.has(w))
  return [...filteredEnglish, ...chineseChars]
}

interface TermFrequency {
  [term: string]: number
}

function getVector(tokens: string[]): TermFrequency {
  const tf: TermFrequency = {}
  for (const token of tokens) {
    tf[token] = (tf[token] || 0) + 1
  }
  return tf
}

function calculateCosineSimilarity(tf1: TermFrequency, tf2: TermFrequency): number {
  const allTerms = new Set([...Object.keys(tf1), ...Object.keys(tf2)])
  let dotProduct = 0
  let norm1 = 0
  let norm2 = 0
  
  for (const term of allTerms) {
    const val1 = tf1[term] || 0
    const val2 = tf2[term] || 0
    dotProduct += val1 * val2
    norm1 += val1 * val1
    norm2 += val2 * val2
  }
  
  if (norm1 === 0 || norm2 === 0) return 0
  return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2))
}

function renderContentWithLinks(
  content: string,
  notes: Note[],
  onNavigate: (noteId: string) => void
) {
  const parts: React.ReactNode[] = []
  let lastIndex = 0
  const regex = /\[\[(.+?)\]\]/g
  let match

  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push(content.slice(lastIndex, match.index))
    }

    const innerTitle = match[1].trim()
    const targetNote = findNoteByTitle(notes, innerTitle)

    if (targetNote) {
      parts.push(
        <span
          key={`link-${match.index}`}
          onClick={() => onNavigate(targetNote.id)}
          className="text-blue-600 dark:text-blue-400 hover:underline cursor-pointer font-medium inline-flex items-center gap-0.5"
        >
          {targetNote.title}
          <ExternalLink className="size-2.5" />
        </span>
      )
    } else {
      parts.push(
        <span key={`missing-${match.index}`} className="text-zinc-400 italic">
          {innerTitle}
        </span>
      )
    }

    lastIndex = regex.lastIndex
  }

  if (lastIndex < content.length) {
    parts.push(content.slice(lastIndex))
  }

  return parts
}

export function NotesApp() {
  const { t } = useI18n()
  const [notes, setNotes] = useState<Note[]>([])
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedFolder, setSelectedFolder] = useState<string>('all')
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [showLinks, setShowLinks] = useState(false)
  const [linksLoaded, setLinksLoaded] = useState(false)
  const saveTimeoutRef = useRef<Record<string, NodeJS.Timeout>>({})

  // Load notes from SQLite API with automatic migration from localStorage
  useEffect(() => {
    const loadNotes = async () => {
      try {
        const res = await fetch('/api/notes')
        if (res.ok) {
          const data = await res.json()
          if (Array.isArray(data.notes) && data.notes.length > 0) {
            const parsedNotes: Note[] = data.notes.map((n: any) => ({
              ...n,
              tags: typeof n.tags === 'string' ? JSON.parse(n.tags || '[]') : (n.tags || []),
              createdAt: typeof n.createdAt === 'string' ? n.createdAt : new Date(n.createdAt).toISOString(),
              updatedAt: typeof n.updatedAt === 'string' ? n.updatedAt : new Date(n.updatedAt).toISOString()
            }))
            setNotes(parsedNotes)
            localStorage.setItem('notes', JSON.stringify(parsedNotes))
            setLinksLoaded(true)
            return
          }
        }

        // Auto-migration: If database is empty, check localStorage
        const saved = localStorage.getItem('notes')
        if (saved) {
          const localNotes: Note[] = JSON.parse(saved)
          setNotes(localNotes)
          // Migrate local notes to database in background
          for (const note of localNotes) {
            fetch('/api/notes', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                title: note.title,
                content: note.content,
                folder: note.folder,
                tags: note.tags,
                pinned: note.pinned,
                starred: note.starred
              })
            }).catch(() => {})
          }
        }
      } catch (e) {
        console.error('Failed to load notes from DB, using offline cache:', e)
        const saved = localStorage.getItem('notes')
        if (saved) setNotes(JSON.parse(saved))
      } finally {
        setLinksLoaded(true)
      }
    }

    loadNotes()
  }, [])

  // Sync cache to localStorage for offline readiness
  useEffect(() => {
    if (notes.length > 0) {
      localStorage.setItem('notes', JSON.stringify(notes))
    }
  }, [notes])

  // Re-index all links on initial load
  useEffect(() => {
    if (!linksLoaded || notes.length === 0) return
    for (const note of notes) {
      syncLinks(note.id, "", note.content, notes)
    }
  }, [linksLoaded, notes])

  const createNote = async () => {
    const tempId = `note-${Date.now()}`
    const newNote: Note = {
      id: tempId,
      title: 'Untitled Note',
      content: '',
      folder: selectedFolder === 'all' ? undefined : selectedFolder,
      tags: [],
      pinned: false,
      starred: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    setNotes([newNote, ...notes])
    setSelectedNoteId(newNote.id)

    try {
      const res = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newNote.title,
          content: newNote.content,
          folder: newNote.folder,
          tags: newNote.tags,
          pinned: newNote.pinned,
          starred: newNote.starred
        })
      })
      if (res.ok) {
        const data = await res.json()
        if (data.note?.id) {
          const realId = data.note.id
          setNotes(prev => prev.map(n => n.id === tempId ? { ...n, id: realId } : n))
          setSelectedNoteId(prev => prev === tempId ? realId : prev)
        }
      }
    } catch (e) {
      console.error('Failed to persist new note to SQLite:', e)
    }
  }

  const updateNote = (id: string, updates: Partial<Note>) => {
    // 1. Optimistic React state update
    setNotes(prev => prev.map(n => {
      if (n.id === id) {
        const merged = { ...n, ...updates, updatedAt: new Date().toISOString() }
        if (updates.content !== undefined) {
          syncLinks(id, n.content, updates.content, prev.map(p => p.id === id ? merged : p))
        }
        return merged
      }
      return n
    }))

    // 2. Debounced persistence to SQLite
    if (saveTimeoutRef.current[id]) {
      clearTimeout(saveTimeoutRef.current[id])
    }

    saveTimeoutRef.current[id] = setTimeout(async () => {
      try {
        await fetch(`/api/notes/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates)
        })
      } catch (e) {
        console.error(`Failed to sync note ${id} to SQLite:`, e)
      }
    }, 600)
  }

  const deleteNote = async (id: string) => {
    const allLinks: NoteLinkRecord[] = JSON.parse(localStorage.getItem('note-links') || '[]')
    const filtered = allLinks.filter(l => l.sourceNoteId !== id && l.targetNoteId !== id)
    localStorage.setItem('note-links', JSON.stringify(filtered))

    setNotes(notes.filter(n => n.id !== id))
    if (selectedNoteId === id) setSelectedNoteId(null)

    try {
      await fetch(`/api/notes/${id}`, { method: 'DELETE' })
    } catch (e) {
      console.error(`Failed to delete note ${id} from SQLite:`, e)
    }
  }

  const togglePin = (id: string) => {
    const note = notes.find(n => n.id === id)
    if (note) updateNote(id, { pinned: !note.pinned })
  }

  const toggleStar = (id: string) => {
    const note = notes.find(n => n.id === id)
    if (note) updateNote(id, { starred: !note.starred })
  }

  const folders = ['all', ...new Set(notes.map(n => n.folder).filter((f): f is string => Boolean(f)))]
  const filtered = notes.filter(n => {
    const matchFolder = selectedFolder === 'all' || n.folder === selectedFolder
    const matchSearch = !searchQuery ||
      n.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      n.content.toLowerCase().includes(searchQuery.toLowerCase())
    return matchFolder && matchSearch
  }).sort((a, b) => {
    if (a.pinned && !b.pinned) return -1
    if (!a.pinned && b.pinned) return 1
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  })

  const selectedNote = notes.find(n => n.id === selectedNoteId)

  const outgoingLinks = useMemo(() => {
    if (!selectedNoteId) return []
    return getOutgoingLinks(selectedNoteId).map(l => ({
      ...l,
      note: notes.find(n => n.id === l.targetNoteId)
    })).filter(l => l.note)
  }, [selectedNoteId, notes])

  const backlinks = useMemo(() => {
    if (!selectedNoteId) return []
    return getBacklinks(selectedNoteId).map(l => ({
      ...l,
      note: notes.find(n => n.id === l.sourceNoteId)
    })).filter(l => l.note)
  }, [selectedNoteId, notes])

  const relatedNotes = useMemo(() => {
    if (!selectedNoteId) return []
    return getRelatedNotes(selectedNoteId, notes)
  }, [selectedNoteId, notes])

  // --- Real-time Compute RAG Front-end Semantic Similarity Neighbors ---
  const semanticNeighbors = useMemo(() => {
    if (!selectedNoteId || notes.length <= 1) return []
    const current = notes.find(n => n.id === selectedNoteId)
    if (!current || !current.content.trim()) return []

    // Build vector for current note
    const currentTokens = tokenize(current.title + " " + current.content)
    const currentVector = getVector(currentTokens)

    return notes
      .filter(n => n.id !== selectedNoteId)
      .map(n => {
        const tokens = tokenize(n.title + " " + n.content)
        const vector = getVector(tokens)
        const similarity = calculateCosineSimilarity(currentVector, vector)
        return { note: n, similarity }
      })
      .filter(item => item.similarity > 0.08) // Minimum similarity threshold
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 5) // Show top 5 semantic neighbors
  }, [selectedNoteId, notes])

  const navigateToNote = useCallback((noteId: string) => {
    setSelectedNoteId(noteId)
  }, [])

  return (
    <div className="flex h-full bg-zinc-50 dark:bg-zinc-900">
      {/* Folders Sidebar */}
      {sidebarOpen && (
        <div className="w-52 border-r border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-4 pt-14 md:pt-16 space-y-1">
          <button onClick={createNote} className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium mb-4">
            <Plus className="size-4" />
            {t("New Note")}
          </button>
          {folders.map(folder => (
            <button
              key={folder}
              onClick={() => setSelectedFolder(folder)}
              className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${selectedFolder === folder ? 'bg-blue-50 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400' : 'hover:bg-zinc-50 dark:hover:bg-zinc-700'}`}
            >
              <FolderOpen className="size-4" />
              <span className="flex-1 text-left">{folder === 'all' ? t("All Notes") : folder}</span>
              <span className="text-xs text-zinc-400">{folder === 'all' ? notes.length : notes.filter(n => n.folder === folder).length}</span>
            </button>
          ))}
        </div>
      )}

      {/* Notes List */}
      <div className="w-72 border-r border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 flex flex-col">
        <div className="p-3 border-b border-zinc-200 dark:border-zinc-700">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-zinc-400" />
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder={t("Search notes...")}
              className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/40"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {filtered.map(note => (
            <div
              key={note.id}
              onClick={() => setSelectedNoteId(note.id)}
              className={`p-3 border-b border-zinc-100 dark:border-zinc-700/50 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-700/50 transition-colors ${selectedNoteId === note.id ? 'bg-blue-50 dark:bg-blue-500/10' : ''}`}
            >
              <div className="flex items-start justify-between mb-1">
                <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100 truncate flex-1">{note.title}</h3>
                <div className="flex items-center gap-1">
                  {note.pinned && <Pin className="size-2.5 text-blue-500" />}
                  {note.starred && <Star className="size-2.5 fill-yellow-400 text-yellow-400" />}
                </div>
              </div>
              <p className="text-[10px] text-zinc-500 line-clamp-2 mb-1">{note.content || t("No content")}</p>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1 text-[10px] text-zinc-400">
                  <Clock className="size-2.5" />
                  <span>{new Date(note.updatedAt).toLocaleDateString()}</span>
                </div>
                {detectLinks(note.content).length > 0 && (
                  <Link2 className="size-2.5 text-blue-400" />
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Note Editor */}
      <div className="flex-1 flex flex-col bg-white dark:bg-zinc-800">
        {selectedNote ? (
          <>
            <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-200 dark:border-zinc-700">
              <div className="flex items-center gap-2">
                <button onClick={() => togglePin(selectedNote.id)} className={`p-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-700 ${selectedNote.pinned ? 'text-blue-500' : ''}`}>
                  <Pin className="size-4" />
                </button>
                <button onClick={() => toggleStar(selectedNote.id)} className={`p-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-700 ${selectedNote.starred ? 'text-yellow-400' : ''}`}>
                  <Star className="size-4" />
                </button>
                <button onClick={() => deleteNote(selectedNote.id)} className="p-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-700 text-red-500">
                  <Trash2 className="size-4" />
                </button>
                <button
                  onClick={() => setShowLinks(!showLinks)}
                  className={`p-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors ${showLinks ? 'text-blue-500 bg-blue-50 dark:bg-blue-500/10' : ''}`}
                  title={t("Toggle links panel")}
                >
                  <Link2 className="size-4" />
                </button>
              </div>
              <div className="flex items-center gap-2">
                {selectedNote.tags.map(tag => (
                  <span key={tag} className="px-2 py-0.5 rounded bg-zinc-100 dark:bg-zinc-700 text-[10px] text-zinc-600 dark:text-zinc-400">
                    {tag}
                  </span>
                ))}
                <span className="text-[10px] text-zinc-400">
                  {selectedNote.content.length} {t("chars")}
                </span>
              </div>
            </div>
            <input
              value={selectedNote.title}
              onChange={e => updateNote(selectedNote.id, { title: e.target.value })}
              className="px-6 py-4 text-xl font-bold border-none outline-none bg-transparent text-zinc-900 dark:text-zinc-100"
              placeholder={t("Note title...")}
            />
            <textarea
              value={selectedNote.content}
              onChange={e => updateNote(selectedNote.id, { content: e.target.value })}
              className="flex-1 px-6 py-4 text-sm leading-relaxed border-none outline-none resize-none bg-transparent text-zinc-900 dark:text-zinc-100"
              placeholder={t("Start writing... Use [[Note Title]] to link to other notes.")}
            />

            {/* Links Panel */}
            {showLinks && (
              <div className="border-t border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 max-h-80 overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-4 p-4 scrollbar-thin">
                
                {/* Left Side: Traditional Bidirectional Links */}
                <div className="space-y-4">
                  {/* Outgoing Links */}
                  {outgoingLinks.length > 0 && (
                    <div className="bg-white dark:bg-zinc-800 p-3 rounded-xl border border-zinc-200/60 dark:border-zinc-700/60 shadow-sm">
                      <div className="flex items-center gap-2 mb-2">
                        <Link2 className="size-3.5 text-blue-500" />
                        <h4 className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Linked Notes</h4>
                        <span className="text-[10px] text-zinc-400 bg-zinc-100 dark:bg-zinc-700 px-1.5 rounded-full font-mono">{outgoingLinks.length}</span>
                      </div>
                      <div className="space-y-1">
                        {outgoingLinks.map(l => (
                          <button
                            key={l.id}
                            onClick={() => navigateToNote(l.note!.id)}
                            className="flex items-center gap-2 w-full text-left px-2 py-1 rounded hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors group"
                          >
                            <ChevronRight className="size-3 text-zinc-400" />
                            <span className="text-xs text-blue-600 dark:text-blue-400 group-hover:underline truncate">{l.note!.title}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Backlinks */}
                  {backlinks.length > 0 && (
                    <div className="bg-white dark:bg-zinc-800 p-3 rounded-xl border border-zinc-200/60 dark:border-zinc-700/60 shadow-sm">
                      <div className="flex items-center gap-2 mb-2">
                        <ArrowRight className="size-3.5 text-green-500" />
                        <h4 className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Backlinks</h4>
                        <span className="text-[10px] text-zinc-400 bg-zinc-100 dark:bg-zinc-700 px-1.5 rounded-full font-mono">{backlinks.length}</span>
                      </div>
                      <div className="space-y-1">
                        {backlinks.map(l => (
                          <button
                            key={l.id}
                            onClick={() => navigateToNote(l.note!.id)}
                            className="flex items-center gap-2 w-full text-left px-2 py-1 rounded hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors group"
                          >
                            <ChevronRight className="size-3 text-zinc-400" />
                            <span className="text-xs text-green-600 dark:text-green-400 group-hover:underline truncate">{l.note!.title}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Related Notes (By Tags) */}
                  {relatedNotes.length > 0 && (
                    <div className="bg-white dark:bg-zinc-800 p-3 rounded-xl border border-zinc-200/60 dark:border-zinc-700/60 shadow-sm">
                      <div className="flex items-center gap-2 mb-2">
                        <Tag className="size-3.5 text-amber-500" />
                        <h4 className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Co-Tagged Notes</h4>
                        <span className="text-[10px] text-zinc-400 bg-zinc-100 dark:bg-zinc-700 px-1.5 rounded-full font-mono">{relatedNotes.length}</span>
                      </div>
                      <div className="space-y-1">
                        {relatedNotes.map(n => (
                          <button
                            key={n.id}
                            onClick={() => navigateToNote(n.id)}
                            className="flex items-center gap-2 w-full text-left px-2 py-1 rounded hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors group"
                          >
                            <ChevronRight className="size-3 text-zinc-400" />
                            <span className="text-xs text-amber-600 dark:text-amber-500 group-hover:underline truncate">{n.title}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Right Side: RAG Deep Semantic Recommendation (Premium Violet Glow) */}
                <div className="space-y-4">
                  <div className="bg-gradient-to-br from-indigo-50/50 to-purple-50/50 dark:from-indigo-950/20 dark:to-purple-950/20 p-3.5 rounded-xl border border-purple-200/50 dark:border-purple-800/30 shadow-md relative overflow-hidden group">
                    {/* Glowing Aura Accent */}
                    <div className="absolute -right-8 -top-8 w-16 h-16 rounded-full bg-purple-500/10 dark:bg-purple-500/20 blur-xl group-hover:bg-purple-500/30 transition-all duration-700 pointer-events-none" />
                    
                    <div className="flex items-center gap-2 mb-3">
                      <Sparkles className="size-4 text-purple-600 dark:text-purple-400 animate-pulse" />
                      <h4 className="text-xs font-bold text-purple-800 dark:text-purple-300 uppercase tracking-wide">
                        Vector Neighbors (RAG Semantics)
                      </h4>
                      <span className="text-[10px] text-purple-700 dark:text-purple-300 bg-purple-100 dark:bg-purple-900/50 px-2 py-0.5 rounded-full font-mono font-semibold">
                        {semanticNeighbors.length}
                      </span>
                    </div>

                    {semanticNeighbors.length > 0 ? (
                      <div className="space-y-2">
                        {semanticNeighbors.map(({ note: n, similarity }) => (
                          <div
                            key={n.id}
                            onClick={() => navigateToNote(n.id)}
                            className="p-2 rounded-lg bg-white/70 dark:bg-zinc-800/60 border border-purple-100/40 dark:border-purple-900/20 hover:border-purple-400/50 hover:bg-white dark:hover:bg-zinc-800 transition-all duration-300 cursor-pointer shadow-sm flex flex-col gap-1 active:scale-[0.99] group/card"
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 group-hover/card:text-purple-600 dark:group-hover/card:text-purple-400 transition-colors truncate max-w-[140px]">
                                {n.title}
                              </span>
                              <span className="text-[10px] text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/80 px-1.5 py-0.5 rounded font-mono font-bold shrink-0">
                                {Math.round(similarity * 100)}% Match
                              </span>
                            </div>
                            <p className="text-[10px] text-zinc-500 dark:text-zinc-400 line-clamp-1 italic">
                              {n.content || "Empty content"}
                            </p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-6 text-zinc-400 dark:text-zinc-500 text-[10px] font-medium font-mono">
                        Write more context to unlock semantic matches...
                      </div>
                    )}
                  </div>
                </div>

                {outgoingLinks.length === 0 && backlinks.length === 0 && relatedNotes.length === 0 && semanticNeighbors.length === 0 && (
                  <div className="col-span-full py-6 text-center text-xs text-zinc-400">
                    Use [[Note Title]] in your content or write tags to link thoughts
                  </div>
                )}

              </div>
            )}
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-zinc-400">
            <div className="text-center animate-in fade-in zoom-in-95 duration-300">
              <Edit3 className="size-16 mx-auto mb-4" />
              <p className="text-sm mb-4">{t("Select or create a note")}</p>
              <button
                onClick={createNote}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors shadow-sm rounded-lg mx-auto"
              >
                <Plus className="size-4" />
                {t("New Note")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

