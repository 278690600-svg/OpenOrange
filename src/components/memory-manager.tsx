'use client'

import { useState, useEffect } from 'react'
import { useI18n } from '@/lib/i18n'
import { Brain, Trash2, RefreshCw, Search, Filter, X, Plus, Edit2, ChevronDown, Calendar, Target, Zap } from 'lucide-react'

interface Memory {
  id: string
  category: string
  key: string
  value: string
  confidence: number
  source: string
  chatId: string | null
  createdAt: string
  updatedAt: string
  expiresAt: string | null
}

const CATEGORY_LABELS: Record<string, string> = {
  user_profile: 'User Profile',
  preference: 'Preferences',
  context: 'Context',
  fact: 'Facts',
  task: 'Tasks',
}

const CATEGORY_ICONS: Record<string, typeof Brain> = {
  user_profile: Target,
  preference: Zap,
  context: Brain,
  fact: Brain,
  task: Calendar,
}

const CATEGORY_COLORS: Record<string, string> = {
  user_profile: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  preference: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  context: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  fact: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  task: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400',
}

const SOURCE_LABELS: Record<string, string> = {
  chat: 'Chat',
  user_input: 'User Input',
  inference: 'Inference',
}

export function MemoryManager() {
  const { t } = useI18n()
  const [memories, setMemories] = useState<Memory[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterCategory, setFilterCategory] = useState<string>('all')
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [newMemory, setNewMemory] = useState({ category: 'fact', key: '', value: '', confidence: 0.8 })
  const [editingMemory, setEditingMemory] = useState<Memory | null>(null)
  const [editValue, setEditValue] = useState('')

  useEffect(() => {
    loadMemories()
  }, [])

  const loadMemories = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filterCategory !== 'all') {
        params.set('category', filterCategory)
      }
      params.set('limit', '200')
      const res = await fetch(`/api/memory?${params.toString()}`)
      if (res.ok) {
        const data = await res.json()
        setMemories(data)
      }
    } catch (error) {
      console.error('Failed to load memories:', error)
    } finally {
      setLoading(false)
    }
  }

  const deleteMemory = async (category: string, key: string) => {
    try {
      const res = await fetch(`/api/memory?category=${encodeURIComponent(category)}&key=${encodeURIComponent(key)}`, {
        method: 'DELETE'
      })
      if (res.ok) {
        setMemories(prev => prev.filter(m => !(m.category === category && m.key === key)))
      }
    } catch (error) {
      console.error('Failed to delete memory:', error)
    }
  }

  const clearAllMemories = async () => {
    if (!confirm('Clear all memories? This cannot be undone.')) return
    try {
      const res = await fetch('/api/memory', { method: 'DELETE' })
      if (res.ok) {
        setMemories([])
      }
    } catch (error) {
      console.error('Failed to clear memories:', error)
    }
  }

  const addMemory = async () => {
    if (!newMemory.key || !newMemory.value) return
    try {
      const res = await fetch('/api/memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newMemory)
      })
      if (res.ok) {
        setShowAddDialog(false)
        setNewMemory({ category: 'fact', key: '', value: '', confidence: 0.8 })
        loadMemories()
      }
    } catch (error) {
      console.error('Failed to add memory:', error)
    }
  }

  const updateMemory = async () => {
    if (!editingMemory) return
    try {
      const res = await fetch('/api/memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: editingMemory.category,
          key: editingMemory.key,
          value: editValue,
          confidence: editingMemory.confidence,
          source: editingMemory.source
        })
      })
      if (res.ok) {
        setEditingMemory(null)
        loadMemories()
      }
    } catch (error) {
      console.error('Failed to update memory:', error)
    }
  }

  const filteredMemories = memories.filter(m => {
    const matchesSearch = searchQuery === '' || 
      m.key.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.value.toLowerCase().includes(searchQuery.toLowerCase())
    const matchesCategory = filterCategory === 'all' || m.category === filterCategory
    return matchesSearch && matchesCategory
  })

  const stats = {
    total: memories.length,
    categories: new Set(memories.map(m => m.category)).size,
    avgConfidence: memories.length > 0 ? (memories.reduce((sum, m) => sum + m.confidence, 0) / memories.length).toFixed(2) : '0.00',
    expiring: memories.filter(m => m.expiresAt && new Date(m.expiresAt) < new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)).length
  }

  const parseJsonValue = (value: string): string => {
    try {
      const parsed = JSON.parse(value)
      return typeof parsed === 'object' ? JSON.stringify(parsed, null, 2) : String(parsed)
    } catch {
      return value
    }
  }

  return (
    <div className="h-full flex flex-col bg-white dark:bg-zinc-900">
      <div className="border-b border-zinc-200 dark:border-zinc-800 pl-14 md:pl-16 pr-4 py-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain className="size-5 text-purple-600" />
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Agent Memory</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAddDialog(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
            >
              <Plus className="size-3.5" />
              Add
            </button>
            <button
              onClick={clearAllMemories}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
            >
              <Trash2 className="size-3.5" />
              Clear All
            </button>
            <button
              onClick={loadMemories}
              className="p-1.5 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
            >
              <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2">
          <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-lg p-2 text-center">
            <div className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">{stats.total}</div>
            <div className="text-xs text-zinc-500 dark:text-zinc-400">Total</div>
          </div>
          <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-lg p-2 text-center">
            <div className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">{stats.categories}</div>
            <div className="text-xs text-zinc-500 dark:text-zinc-400">Categories</div>
          </div>
          <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-lg p-2 text-center">
            <div className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">{stats.avgConfidence}</div>
            <div className="text-xs text-zinc-500 dark:text-zinc-400">Avg Confidence</div>
          </div>
          <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-lg p-2 text-center">
            <div className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">{stats.expiring}</div>
            <div className="text-xs text-zinc-500 dark:text-zinc-400">Expiring Soon</div>
          </div>
        </div>

        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-zinc-400" />
            <input
              type="text"
              placeholder="Search memories..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-sm bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 dark:text-zinc-100"
            />
          </div>
          <div className="relative">
            <Filter className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-zinc-400" />
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="pl-8 pr-6 py-1.5 text-sm bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 dark:text-zinc-100 appearance-none cursor-pointer"
            >
              <option value="all">All Categories</option>
              {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="size-6 text-zinc-400 animate-spin" />
          </div>
        ) : filteredMemories.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Brain className="size-12 text-zinc-300 dark:text-zinc-600 mb-3 animate-pulse" style={{ animationDuration: '3s' }} />
            <p className="text-sm text-zinc-500 dark:text-zinc-400">No memories found</p>
            <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1 mb-4">Memories are automatically extracted from conversations</p>
            <button
              onClick={() => setShowAddDialog(true)}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-purple-600 rounded-lg hover:bg-purple-700 transition-colors shadow-sm"
            >
              <Plus className="size-4" />
              Add Memory
            </button>
          </div>
        ) : (
          filteredMemories.map((memory) => {
            const CategoryIcon = CATEGORY_ICONS[memory.category] || Brain
            return (
              <div
                key={`${memory.category}-${memory.key}`}
                className="group bg-white dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700 rounded-xl p-4 hover:border-zinc-300 dark:hover:border-zinc-600 hover:shadow-sm transition-all"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <CategoryIcon className="size-4 text-zinc-500" />
                    <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{memory.key}</span>
                  </div>
                  <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => {
                        setEditingMemory(memory)
                        setEditValue(parseJsonValue(memory.value))
                      }}
                      className="p-1 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded transition-colors"
                    >
                      <Edit2 className="size-3" />
                    </button>
                    <button
                      onClick={() => deleteMemory(memory.category, memory.key)}
                      className="p-1 text-zinc-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                    >
                      <Trash2 className="size-3" />
                    </button>
                  </div>
                </div>

                <div className="text-sm text-zinc-600 dark:text-zinc-400 mb-3 line-clamp-3 whitespace-pre-wrap">
                  {parseJsonValue(memory.value)}
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full ${CATEGORY_COLORS[memory.category]}`}>
                    {CATEGORY_LABELS[memory.category] || memory.category}
                  </span>
                  <span className="text-xs text-zinc-400 dark:text-zinc-500">
                    Source: {SOURCE_LABELS[memory.source] || memory.source}
                  </span>
                  <div className="flex items-center gap-1 ml-auto">
                    <div className="w-12 h-1.5 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${memory.confidence >= 0.8 ? 'bg-green-500' : memory.confidence >= 0.5 ? 'bg-amber-500' : 'bg-red-500'}`}
                        style={{ width: `${memory.confidence * 100}%` }}
                      />
                    </div>
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">{(memory.confidence * 100).toFixed(0)}%</span>
                  </div>
                </div>

                {memory.expiresAt && (
                  <div className="mt-2 text-xs text-zinc-400 dark:text-zinc-500">
                    Expires: {new Date(memory.expiresAt).toLocaleDateString()}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {showAddDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 p-6 w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Add Memory</h3>
              <button
                onClick={() => setShowAddDialog(false)}
                className="p-1 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded transition-colors"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Category</label>
                <select
                  value={newMemory.category}
                  onChange={(e) => setNewMemory(prev => ({ ...prev, category: e.target.value }))}
                  className="w-full px-3 py-2 text-sm bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 dark:text-zinc-100"
                >
                  {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Key</label>
                <input
                  type="text"
                  value={newMemory.key}
                  onChange={(e) => setNewMemory(prev => ({ ...prev, key: e.target.value }))}
                  placeholder="e.g., name, preference, fact"
                  className="w-full px-3 py-2 text-sm bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 dark:text-zinc-100"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Value</label>
                <textarea
                  value={newMemory.value}
                  onChange={(e) => setNewMemory(prev => ({ ...prev, value: e.target.value }))}
                  placeholder="Memory value..."
                  rows={3}
                  className="w-full px-3 py-2 text-sm bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 dark:text-zinc-100 resize-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Confidence: {newMemory.confidence.toFixed(1)}</label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={newMemory.confidence}
                  onChange={(e) => setNewMemory(prev => ({ ...prev, confidence: parseFloat(e.target.value) }))}
                  className="w-full"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => setShowAddDialog(false)}
                className="px-4 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={addMemory}
                disabled={!newMemory.key || !newMemory.value}
                className="px-4 py-2 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Add Memory
              </button>
            </div>
          </div>
        </div>
      )}

      {editingMemory && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 p-6 w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Edit Memory</h3>
              <button
                onClick={() => setEditingMemory(null)}
                className="p-1 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded transition-colors"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Key</label>
                <input
                  type="text"
                  value={editingMemory.key}
                  readOnly
                  className="w-full px-3 py-2 text-sm bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg text-zinc-500 cursor-not-allowed"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Value</label>
                <textarea
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  rows={4}
                  className="w-full px-3 py-2 text-sm bg-zinc-50 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 dark:text-zinc-100 resize-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Confidence: {editingMemory.confidence.toFixed(1)}</label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={editingMemory.confidence}
                  onChange={(e) => setEditingMemory(prev => prev ? { ...prev, confidence: parseFloat(e.target.value) } : prev)}
                  className="w-full"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => setEditingMemory(null)}
                className="px-4 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={updateMemory}
                disabled={!editValue}
                className="px-4 py-2 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
