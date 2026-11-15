'use client'

import { useState, useEffect, useCallback } from 'react'
import { GitBranch, GitMerge, ArrowRight, X, Trash2, Loader2, MessageSquare, ChevronRight, Plus } from 'lucide-react'

interface BranchInfo {
  id: string
  title: string
  messageCount: number
  createdAt: string
  firstMessagePreview: string
}

interface ChatBranchInfo {
  chat: {
    id: string
    title: string
    parentId: string | null
    parent: { id: string; title: string } | null
    forkFromMessageId: string | null
  }
  branches: BranchInfo[]
}

interface ChatBranchManagerProps {
  chatId: string
  onBranchSelect?: (branchId: string) => void
}

export function ChatBranchManager({ chatId, onBranchSelect }: ChatBranchManagerProps) {
  const [branchInfo, setBranchInfo] = useState<ChatBranchInfo | null>(null)
  const [loading, setLoading] = useState(false)
  const [forking, setForking] = useState(false)
  const [merging, setMerging] = useState<string | null>(null)
  const [forkMessageId, setForkMessageId] = useState<string | null>(null)
  const [showMergeDialog, setShowMergeDialog] = useState<string | null>(null)
  const [messages, setMessages] = useState<Array<{ id: string; role: string; content: string }>>([])
  const [loadingMessages, setLoadingMessages] = useState(false)

  const loadBranchInfo = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch(`/api/chats/branch?chatId=${chatId}`)
      if (res.ok) {
        const data = await res.json()
        setBranchInfo(data)
      }
    } catch (error) {
      console.error('Failed to load branch info:', error)
    } finally {
      setLoading(false)
    }
  }, [chatId])

  useEffect(() => {
    loadBranchInfo()
  }, [loadBranchInfo])

  const loadMessages = async () => {
    try {
      setLoadingMessages(true)
      const res = await fetch(`/api/chats?chatId=${chatId}`)
      if (res.ok) {
        const data = await res.json()
        if (Array.isArray(data) && data.length > 0) {
          setMessages(data[0].messages || [])
        }
      }
    } catch (error) {
      console.error('Failed to load messages:', error)
    } finally {
      setLoadingMessages(false)
    }
  }

  useEffect(() => {
    if (messages.length === 0) {
      loadMessages()
    }
  }, [])

  const forkChat = async (messageId?: string) => {
    try {
      setForking(true)
      const res = await fetch(`/api/chats/branch?action=fork`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chatId,
          messageId: messageId || forkMessageId
        })
      })

      if (res.ok) {
        const data = await res.json()
        loadBranchInfo()
        if (onBranchSelect && data.chat?.id) {
          onBranchSelect(data.chat.id)
        }
      }
    } catch (error) {
      console.error('Fork failed:', error)
    } finally {
      setForking(false)
      setForkMessageId(null)
    }
  }

  const mergeChat = async (sourceId: string, targetId: string) => {
    try {
      setMerging(sourceId)
      const res = await fetch(`/api/chats/branch?action=merge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceChatId: sourceId,
          targetChatId: targetId,
          strategy: 'append'
        })
      })

      if (res.ok) {
        loadBranchInfo()
        setShowMergeDialog(null)
      }
    } catch (error) {
      console.error('Merge failed:', error)
    } finally {
      setMerging(null)
    }
  }

  const deleteBranch = async (branchId: string) => {
    if (!confirm('Delete this branch? This cannot be undone.')) return
    try {
      const res = await fetch(`/api/chats/branch?branchId=${branchId}`, { method: 'DELETE' })
      if (res.ok) {
        loadBranchInfo()
      }
    } catch (error) {
      console.error('Delete failed:', error)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="size-5 text-zinc-400 animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {branchInfo?.chat.parent && (
        <div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
          <div className="flex items-center gap-2 text-sm">
            <GitBranch className="size-4 text-blue-500" />
            <span className="text-zinc-600 dark:text-zinc-400">Branched from:</span>
            <button
              onClick={() => onBranchSelect?.(branchInfo.chat.parent!.id)}
              className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
            >
              {branchInfo.chat.parent.title}
            </button>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Branches</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={() => forkChat()}
            disabled={forking}
            className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 rounded hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-colors disabled:opacity-50"
          >
            {forking ? <Loader2 className="size-3 animate-spin" /> : <Plus className="size-3" />}
            Fork from end
          </button>
        </div>
      </div>

      {branchInfo?.branches.length === 0 ? (
        <p className="text-xs text-zinc-400 dark:text-zinc-500 text-center py-4">No branches yet</p>
      ) : (
        <div className="space-y-2">
          {branchInfo?.branches.map((branch) => (
            <div
              key={branch.id}
              className="border border-zinc-200 dark:border-zinc-700 rounded-lg p-3 hover:border-zinc-300 dark:hover:border-zinc-600 transition-colors"
            >
              <div className="flex items-start gap-2">
                <button
                  onClick={() => onBranchSelect?.(branch.id)}
                  className="flex-1 text-left"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <GitBranch className="size-3.5 text-zinc-400" />
                    <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                      {branch.title}
                    </span>
                  </div>
                  <div className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-2">
                    {branch.firstMessagePreview}
                  </div>
                  <div className="flex items-center gap-3 mt-1.5 text-xs text-zinc-400 dark:text-zinc-500">
                    <span>{branch.messageCount} messages</span>
                    <span>{new Date(branch.createdAt).toLocaleString()}</span>
                  </div>
                </button>
              </div>

              <div className="flex items-center gap-1 mt-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                <button
                  onClick={() => onBranchSelect?.(branch.id)}
                  className="flex items-center gap-1 px-2 py-1 text-xs text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded transition-colors"
                >
                  <ChevronRight className="size-3" />
                  Open
                </button>
                <button
                  onClick={() => setShowMergeDialog(branch.id)}
                  disabled={merging === branch.id}
                  className="flex items-center gap-1 px-2 py-1 text-xs text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded transition-colors disabled:opacity-50"
                >
                  {merging === branch.id ? <Loader2 className="size-3 animate-spin" /> : <GitMerge className="size-3" />}
                  Merge
                </button>
                <button
                  onClick={() => deleteBranch(branch.id)}
                  className="flex items-center gap-1 px-2 py-1 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                >
                  <Trash2 className="size-3" />
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {messages.length > 0 && (
        <div className="pt-2 border-t border-zinc-200 dark:border-zinc-700">
          <h4 className="text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-2">Fork from specific message:</h4>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {messages.filter(m => m.role === 'user').map((msg) => (
              <button
                key={msg.id}
                onClick={() => setForkMessageId(msg.id === forkMessageId ? null : msg.id)}
                className={`w-full text-left px-2 py-1.5 text-xs rounded transition-colors ${
                  forkMessageId === msg.id 
                    ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' 
                    : 'hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-600 dark:text-zinc-400'
                }`}
              >
                <div className="line-clamp-1">{msg.content.substring(0, 80)}</div>
              </button>
            ))}
          </div>
          {forkMessageId && (
            <button
              onClick={() => forkChat(forkMessageId)}
              disabled={forking}
              className="mt-2 w-full flex items-center justify-center gap-1 px-2 py-1.5 text-xs font-medium text-white bg-emerald-600 rounded hover:bg-emerald-700 transition-colors disabled:opacity-50"
            >
              {forking ? <Loader2 className="size-3 animate-spin" /> : <GitBranch className="size-3" />}
              Fork from selected message
            </button>
          )}
        </div>
      )}

      {showMergeDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 p-6 w-full max-w-md shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Merge Branch</h3>
              <button
                onClick={() => setShowMergeDialog(null)}
                className="p-1 text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded transition-colors"
              >
                <X className="size-4" />
              </button>
            </div>
            <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4">
              This will merge the branch into the current chat. Messages from the branch will be appended to the current chat.
            </p>
            <div className="flex items-center gap-2 p-3 bg-zinc-50 dark:bg-zinc-900 rounded-lg mb-4">
              <MessageSquare className="size-4 text-zinc-400" />
              <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{branchInfo?.chat.title}</span>
              <ArrowRight className="size-4 text-zinc-400" />
              <GitMerge className="size-4 text-amber-500" />
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowMergeDialog(null)}
                className="px-4 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-800 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => mergeChat(showMergeDialog, chatId)}
                disabled={merging === showMergeDialog}
                className="px-4 py-2 text-sm font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-50"
              >
                {merging === showMergeDialog ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" />
                    Merging...
                  </>
                ) : (
                  <>
                    <GitMerge className="size-3.5" />
                    Merge & Delete Branch
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
