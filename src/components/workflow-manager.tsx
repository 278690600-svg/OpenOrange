'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Workflow, Plus, Play, Trash2, X, ArrowRight, ChevronDown, ChevronUp,
  Loader2, Zap, FileText, Search, Copy, Sparkles,
  Clock, LayoutGrid, History, Eye, Filter, AlertCircle, CheckCircle2,
  CircleDot, Layers
} from 'lucide-react'
import { WorkflowVisualEditor } from './workflow-visual-editor'
import { STEP_TYPE_CONFIG } from '@/lib/workflow-config'
import { WORKFLOW_TEMPLATES, getTemplateCategories } from '@/lib/workflow-templates'
import { cn } from '@/lib/utils'
import type {
  WorkflowData,
  ExecutionData, ExecutionRecord,
  ErrorStrategy, StepType
} from '@/types/workflow'

// ─── Status Badge ────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    draft: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800',
    active: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800',
    archived: 'bg-zinc-100 text-zinc-500 border-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700',
  }
  return (
    <span className={cn(
      'inline-flex items-center px-2 py-0.5 text-[11px] font-medium rounded-full border capitalize',
      styles[status] || styles.draft
    )}>
      {status}
    </span>
  )
}

// ─── Execution Status Icon ───────────────────────────────────
function ExecutionStatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'success':
      return <CheckCircle2 className="size-4 text-emerald-500" />
    case 'partial':
      return <AlertCircle className="size-4 text-amber-500" />
    case 'failed':
      return <AlertCircle className="size-4 text-red-500" />
    default:
      return <Clock className="size-4 text-zinc-400" />
  }
}

function ExecutionStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    success: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-800',
    partial: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800',
    failed: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800',
    running: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800',
  }
  return (
    <span className={cn(
      'inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-full border capitalize',
      styles[status] || styles.running
    )}>
      <ExecutionStatusIcon status={status} />
      {status}
    </span>
  )
}

// ─── Step Status Icon ────────────────────────────────────────
function StepStatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'success':
      return <CheckCircle2 className="size-3.5 text-emerald-500" />
    case 'error':
      return <AlertCircle className="size-3.5 text-red-500" />
    case 'skipped':
      return <Clock className="size-3.5 text-amber-500" />
    default:
      return <CircleDot className="size-3.5 text-zinc-400" />
  }
}

// ─── Toast ───────────────────────────────────────────────────
interface ToastData {
  id: number
  message: string
  type: 'success' | 'error' | 'info'
}

function ToastContainer({ toasts }: { toasts: ToastData[] }) {
  return (
    <div className="fixed bottom-4 right-4 z-[70] flex flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cn(
            'flex items-center gap-2 px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium',
            'animate-in slide-in-from-right-full duration-300',
            toast.type === 'success' && 'bg-emerald-600 text-white',
            toast.type === 'error' && 'bg-red-600 text-white',
            toast.type === 'info' && 'bg-blue-600 text-white',
          )}
        >
          {toast.type === 'success' && <CheckCircle2 className="size-4" />}
          {toast.type === 'error' && <AlertCircle className="size-4" />}
          {toast.type === 'info' && <Loader2 className="size-4 animate-spin" />}
          {toast.message}
        </div>
      ))}
    </div>
  )
}

// ─── Utility ─────────────────────────────────────────────────
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  const mins = Math.floor(ms / 60000)
  const secs = Math.floor((ms % 60000) / 1000)
  return `${mins}m ${secs}s`
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString()
}

// ─── Main Component ──────────────────────────────────────────
export default function WorkflowManager() {
  // Data
  const [workflows, setWorkflows] = useState<WorkflowData[]>([])
  const [executionCounts, setExecutionCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)

  // UI state
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [showStatusFilter, setShowStatusFilter] = useState(false)

  // Per-workflow executing state
  const [executingIds, setExecutingIds] = useState<Set<string>>(new Set())

  // Dialogs
  const [showTemplateGallery, setShowTemplateGallery] = useState(false)
  const [templateCategory, setTemplateCategory] = useState<string>('All')
  const [showHistoryFor, setShowHistoryFor] = useState<string | null>(null)
  const [executionHistory, setExecutionHistory] = useState<ExecutionRecord[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [showExecutionResult, setShowExecutionResult] = useState<ExecutionData | null>(null)
  const [expandedOutputStep, setExpandedOutputStep] = useState<string | null>(null)

  // Visual editor
  const [visualEditingWorkflow, setVisualEditingWorkflow] = useState<WorkflowData | null>(null)

  // Delete confirmation
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  // Toasts
  const [toasts, setToasts] = useState<ToastData[]>([])

  const addToast = useCallback((message: string, type: ToastData['type'] = 'success') => {
    const id = Date.now() + Math.random()
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, 3500)
  }, [])

  // ─── Load workflows ──────────────────────────────────────
  const loadWorkflows = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/workflows')
      if (res.ok) {
        const data = await res.json()
        setWorkflows(Array.isArray(data) ? data : [])
        // Extract execution counts if available
        const counts: Record<string, number> = {}
        if (Array.isArray(data)) {
          for (const w of data) {
            const wObj = w as WorkflowData & { _count?: { executions?: number } }
            counts[w.id] = wObj._count?.executions ?? 0
          }
        }
        setExecutionCounts(counts)
      }
    } catch {
      addToast('Failed to load workflows', 'error')
    } finally {
      setLoading(false)
    }
  }, [addToast])

  useEffect(() => {
    loadWorkflows()
  }, [loadWorkflows])

  // ─── Delete workflow ─────────────────────────────────────
  const deleteWorkflow = async (id: string) => {
    try {
      const res = await fetch(`/api/workflows?workflowId=${id}`, { method: 'DELETE' })
      if (res.ok) {
        setWorkflows(prev => prev.filter(w => w.id !== id))
        addToast('Workflow deleted', 'success')
      } else {
        addToast('Failed to delete workflow', 'error')
      }
    } catch {
      addToast('Failed to delete workflow', 'error')
    } finally {
      setDeleteConfirmId(null)
    }
  }

  // ─── Execute workflow ────────────────────────────────────
  const executeWorkflow = async (workflowId: string) => {
    try {
      setExecutingIds(prev => new Set(prev).add(workflowId))
      addToast('Executing workflow...', 'info')
      const res = await fetch('/api/workflows?action=execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workflowId } as { workflowId: string; input?: string; errorStrategy?: ErrorStrategy })
      })
      if (res.ok) {
        const data = await res.json()
        const result = data.result as ExecutionData | undefined
        if (result) {
          setShowExecutionResult(result)
        }
        addToast('Workflow executed successfully', 'success')
        loadWorkflows()
      } else {
        addToast('Failed to execute workflow', 'error')
      }
    } catch {
      addToast('Failed to execute workflow', 'error')
    } finally {
      setExecutingIds(prev => {
        const next = new Set(prev)
        next.delete(workflowId)
        return next
      })
    }
  }

  // ─── Duplicate workflow ──────────────────────────────────
  const duplicateWorkflow = async (workflow: WorkflowData) => {
    try {
      const res = await fetch('/api/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `${workflow.name} (Copy)`,
          description: workflow.description,
          steps: workflow.steps,
          edges: workflow.edges,
        })
      })
      if (res.ok) {
        addToast('Workflow duplicated', 'success')
        loadWorkflows()
      } else {
        addToast('Failed to duplicate workflow', 'error')
      }
    } catch {
      addToast('Failed to duplicate workflow', 'error')
    }
  }

  // ─── Create from template ────────────────────────────────
  const createFromTemplate = async (templateId: string, name: string) => {
    try {
      const res = await fetch('/api/workflows?action=from-template', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId, name })
      })
      if (res.ok) {
        setShowTemplateGallery(false)
        addToast('Workflow created from template', 'success')
        loadWorkflows()
      } else {
        const data = await res.json()
        addToast(data.error || 'Failed to create from template', 'error')
      }
    } catch {
      addToast('Failed to create from template', 'error')
    }
  }

  // ─── Load execution history ──────────────────────────────
  const loadHistory = async (workflowId: string) => {
    try {
      setHistoryLoading(true)
      setShowHistoryFor(workflowId)
      const res = await fetch(`/api/workflows?workflowId=${workflowId}&action=history`)
      if (res.ok) {
        const data = await res.json()
        setExecutionHistory(Array.isArray(data) ? data : [])
      } else {
        setExecutionHistory([])
      }
    } catch {
      setExecutionHistory([])
    } finally {
      setHistoryLoading(false)
    }
  }

  // ─── View execution result from history ──────────────────
  const viewExecutionResult = (record: ExecutionRecord) => {
    try {
      const result = JSON.parse(record.result) as ExecutionData
      setShowExecutionResult(result)
      setShowHistoryFor(null)
    } catch {
      addToast('Failed to parse execution result', 'error')
    }
  }

  // ─── Filtered workflows ─────────────────────────────────
  const filteredWorkflows = workflows.filter(w => {
    const matchesSearch = !searchQuery ||
      w.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (w.description?.toLowerCase() ?? '').includes(searchQuery.toLowerCase())
    const matchesStatus = statusFilter === 'all' || w.status === statusFilter
    return matchesSearch && matchesStatus
  })

  // ─── Template categories ─────────────────────────────────
  const categories = ['All', ...getTemplateCategories()]
  const filteredTemplates = templateCategory === 'All'
    ? WORKFLOW_TEMPLATES
    : WORKFLOW_TEMPLATES.filter(t => t.category === templateCategory)

  // ─── Render ──────────────────────────────────────────────
  return (
    <div className="h-full flex flex-col bg-zinc-50 dark:bg-zinc-900">
      {/* ── Header ─────────────────────────────────────────── */}
      <div className="border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 md:px-6 py-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center size-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/30">
              <Workflow className="size-4.5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Workflows</h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                {workflows.length} workflow{workflows.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowTemplateGallery(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors shadow-sm"
          >
            <Plus className="size-4" />
            New Workflow
          </button>
        </div>

        {/* Search & Filter */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-zinc-400" />
            <input
              type="text"
              placeholder="Search by name or description..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-sm bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 dark:text-zinc-100 placeholder:text-zinc-400"
            />
          </div>
          <div className="relative">
            <button
              onClick={() => setShowStatusFilter(!showStatusFilter)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 text-sm border rounded-lg transition-colors',
                statusFilter !== 'all'
                  ? 'bg-indigo-50 border-indigo-200 text-indigo-700 dark:bg-indigo-900/20 dark:border-indigo-800 dark:text-indigo-400'
                  : 'bg-white border-zinc-200 text-zinc-600 hover:bg-zinc-50 dark:bg-zinc-800 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-700'
              )}
            >
              <Filter className="size-3.5" />
              {statusFilter === 'all' ? 'Status' : statusFilter.charAt(0).toUpperCase() + statusFilter.slice(1)}
            </button>
            {showStatusFilter && (
              <div className="absolute right-0 top-full mt-1 z-20 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg shadow-lg py-1 min-w-[140px]">
                {['all', 'draft', 'active', 'archived'].map(s => (
                  <button
                    key={s}
                    onClick={() => { setStatusFilter(s); setShowStatusFilter(false) }}
                    className={cn(
                      'w-full text-left px-3 py-1.5 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors',
                      statusFilter === s ? 'text-indigo-600 dark:text-indigo-400 font-medium' : 'text-zinc-700 dark:text-zinc-300'
                    )}
                  >
                    {s === 'all' ? 'All Statuses' : s.charAt(0).toUpperCase() + s.slice(1)}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Workflow Cards ─────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="size-6 text-zinc-400 animate-spin" />
          </div>
        ) : filteredWorkflows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="flex items-center justify-center size-16 rounded-2xl bg-zinc-100 dark:bg-zinc-800 mb-4">
              <Workflow className="size-8 text-zinc-300 dark:text-zinc-600" />
            </div>
            <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              {searchQuery || statusFilter !== 'all' ? 'No matching workflows' : 'No workflows yet'}
            </p>
            <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-1 mb-5 max-w-xs">
              {searchQuery || statusFilter !== 'all'
                ? 'Try adjusting your search or filter criteria'
                : 'Create your first workflow to chain multiple steps together'}
            </p>
            {!searchQuery && statusFilter === 'all' && (
              <button
                onClick={() => setShowTemplateGallery(true)}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors shadow-sm"
              >
                <Plus className="size-4" />
                Create Workflow
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredWorkflows.map((workflow) => {
              const isExecuting = executingIds.has(workflow.id)
              const execCount = executionCounts[workflow.id] ?? 0
              const stepCount = workflow.steps.length
              return (
                <div
                  key={workflow.id}
                  className="group bg-white dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700/60 rounded-xl hover:border-indigo-300 dark:hover:border-indigo-700 hover:shadow-md transition-all duration-200 flex flex-col"
                >
                  {/* Card Header */}
                  <div className="p-4 pb-3 flex-1">
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">
                            {workflow.name}
                          </h3>
                          <StatusBadge status={workflow.status} />
                        </div>
                        {workflow.description && (
                          <p className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-2">
                            {workflow.description}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Step preview */}
                    {stepCount > 0 && (
                      <div className="mt-3 flex flex-wrap items-center gap-1">
                        {workflow.steps.slice(0, 5).map((step, idx) => {
                          const config = STEP_TYPE_CONFIG[step.type]
                          const Icon = config.icon
                          return (
                            <div key={step.id || idx} className="flex items-center gap-1">
                              {idx > 0 && <ArrowRight className="size-2.5 text-zinc-300 dark:text-zinc-600" />}
                              <span className={cn(
                                'inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] rounded-full border',
                                config.badge
                              )}>
                                <Icon className="size-2.5" />
                                {step.description || config.label}
                              </span>
                            </div>
                          )
                        })}
                        {stepCount > 5 && (
                          <span className="text-[10px] text-zinc-400 dark:text-zinc-500 ml-1">
                            +{stepCount - 5} more
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Card Footer */}
                  <div className="px-4 py-2.5 border-t border-zinc-100 dark:border-zinc-700/40 flex items-center justify-between">
                    <div className="flex items-center gap-3 text-[11px] text-zinc-400 dark:text-zinc-500">
                      <span className="flex items-center gap-1">
                        <Layers className="size-3" />
                        {stepCount} step{stepCount !== 1 ? 's' : ''}
                      </span>
                      <span className="flex items-center gap-1">
                        <Play className="size-3" />
                        {execCount} run{execCount !== 1 ? 's' : ''}
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="size-3" />
                        {formatRelativeTime(workflow.updatedAt)}
                      </span>
                    </div>
                    <div className="flex items-center gap-0.5">
                      <button
                        onClick={() => executeWorkflow(workflow.id)}
                        disabled={isExecuting}
                        className={cn(
                          'flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md transition-colors',
                          isExecuting
                            ? 'text-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 cursor-wait'
                            : 'text-white bg-indigo-600 hover:bg-indigo-700'
                        )}
                        title="Run workflow"
                      >
                        {isExecuting ? <Loader2 className="size-3 animate-spin" /> : <Play className="size-3" />}
                        Run
                      </button>
                      <button
                        onClick={() => setVisualEditingWorkflow({ ...workflow })}
                        className="p-1 text-zinc-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded transition-colors"
                        title="Visual editor"
                      >
                        <LayoutGrid className="size-3.5" />
                      </button>
                      <button
                        onClick={() => loadHistory(workflow.id)}
                        className="p-1 text-zinc-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors"
                        title="Execution history"
                      >
                        <History className="size-3.5" />
                      </button>
                      <button
                        onClick={() => duplicateWorkflow(workflow)}
                        className="p-1 text-zinc-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded transition-colors"
                        title="Duplicate"
                      >
                        <Copy className="size-3.5" />
                      </button>
                      <button
                        onClick={() => setDeleteConfirmId(workflow.id)}
                        className="p-1 text-zinc-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ── Toast Notifications ────────────────────────────── */}
      <ToastContainer toasts={toasts} />

      {/* ── Delete Confirmation Dialog ─────────────────────── */}
      {deleteConfirmId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 p-6 w-full max-w-sm shadow-xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="flex items-center justify-center size-10 rounded-full bg-red-100 dark:bg-red-900/20">
                <AlertCircle className="size-5 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Delete Workflow</h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">This action cannot be undone.</p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeleteConfirmId(null)}
                className="px-3.5 py-1.5 text-sm font-medium text-zinc-700 dark:text-zinc-300 bg-zinc-100 dark:bg-zinc-700 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-600 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteWorkflow(deleteConfirmId)}
                className="px-3.5 py-1.5 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Template Gallery Dialog ────────────────────────── */}
      {showTemplateGallery && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 w-full max-w-3xl shadow-xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-zinc-200 dark:border-zinc-700">
              <div>
                <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">Create Workflow</h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">Start from a template or create a blank workflow</p>
              </div>
              <button
                onClick={() => setShowTemplateGallery(false)}
                className="p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded-lg transition-colors"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Category tabs */}
            <div className="px-4 pt-3 flex items-center gap-1 overflow-x-auto">
              {categories.map(cat => (
                <button
                  key={cat}
                  onClick={() => setTemplateCategory(cat)}
                  className={cn(
                    'px-3 py-1.5 text-xs font-medium rounded-full whitespace-nowrap transition-colors',
                    templateCategory === cat
                      ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400'
                      : 'text-zinc-500 hover:text-zinc-700 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:text-zinc-300 dark:hover:bg-zinc-700'
                  )}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Template grid */}
            <div className="flex-1 overflow-y-auto p-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {filteredTemplates.map(template => (
                  <button
                    key={template.id}
                    onClick={() => createFromTemplate(template.id, template.name)}
                    className="group/card text-left p-4 border border-zinc-200 dark:border-zinc-700 rounded-xl hover:border-indigo-300 dark:hover:border-indigo-700 hover:shadow-sm transition-all duration-200 bg-white dark:bg-zinc-800/50"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex items-center justify-center size-10 rounded-lg bg-zinc-100 dark:bg-zinc-700 text-lg shrink-0 group-hover/card:bg-indigo-50 dark:group-hover/card:bg-indigo-900/20 transition-colors">
                        {template.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-medium text-zinc-900 dark:text-zinc-100 group-hover/card:text-indigo-600 dark:group-hover/card:text-indigo-400 transition-colors">
                          {template.name}
                        </h4>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5 line-clamp-2">
                          {template.description}
                        </p>
                        <div className="flex items-center gap-2 mt-2">
                          <span className="text-[10px] text-zinc-400 dark:text-zinc-500 flex items-center gap-0.5">
                            <Layers className="size-2.5" />
                            {template.steps.length} steps
                          </span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-zinc-100 dark:bg-zinc-700 text-zinc-500 dark:text-zinc-400">
                            {template.category}
                          </span>
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Execution History Dialog ───────────────────────── */}
      {showHistoryFor && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 w-full max-w-2xl shadow-xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-zinc-200 dark:border-zinc-700">
              <div className="flex items-center gap-2">
                <History className="size-4 text-blue-500" />
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Execution History</h3>
              </div>
              <button
                onClick={() => { setShowHistoryFor(null); setExecutionHistory([]) }}
                className="p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded-lg transition-colors"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {historyLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="size-5 text-zinc-400 animate-spin" />
                </div>
              ) : executionHistory.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <History className="size-8 text-zinc-300 dark:text-zinc-600 mb-2" />
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">No execution history yet</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {executionHistory.map(record => (
                    <button
                      key={record.id}
                      onClick={() => viewExecutionResult(record)}
                      className="w-full text-left p-3 border border-zinc-200 dark:border-zinc-700 rounded-lg hover:border-indigo-300 dark:hover:border-indigo-700 hover:bg-indigo-50/50 dark:hover:bg-indigo-900/10 transition-all group/row"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <ExecutionStatusIcon status={record.status} />
                          <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100 group-hover/row:text-indigo-600 dark:group-hover/row:text-indigo-400 transition-colors">
                            Execution
                          </span>
                          <ExecutionStatusBadge status={record.status} />
                        </div>
                        <div className="flex items-center gap-2 text-xs text-zinc-400 dark:text-zinc-500">
                          <span>{formatDuration(record.duration)}</span>
                          <Eye className="size-3 opacity-0 group-hover/row:opacity-100 transition-opacity" />
                        </div>
                      </div>
                      <div className="flex items-center gap-3 mt-1.5 text-[11px] text-zinc-400 dark:text-zinc-500">
                        <span className="flex items-center gap-1">
                          <Clock className="size-2.5" />
                          Started: {new Date(record.startedAt).toLocaleString()}
                        </span>
                        {record.completedAt && (
                          <span className="flex items-center gap-1">
                            <CheckCircle2 className="size-2.5" />
                            Completed: {new Date(record.completedAt).toLocaleString()}
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Execution Result Viewer ────────────────────────── */}
      {showExecutionResult && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 w-full max-w-2xl shadow-xl max-h-[85vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-zinc-200 dark:border-zinc-700">
              <div className="flex items-center gap-2.5">
                <div className="flex items-center justify-center size-7 rounded-lg bg-amber-100 dark:bg-amber-900/20">
                  <Zap className="size-3.5 text-amber-600 dark:text-amber-400" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                      {showExecutionResult.workflowName}
                    </h3>
                    <ExecutionStatusBadge status={showExecutionResult.status} />
                  </div>
                  <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5">
                    Total duration: {formatDuration(showExecutionResult.totalDuration)} &middot; {showExecutionResult.steps.length} step{showExecutionResult.steps.length !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>
              <button
                onClick={() => { setShowExecutionResult(null); setExpandedOutputStep(null) }}
                className="p-1.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded-lg transition-colors"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Steps */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {showExecutionResult.steps.map((step, idx) => {
                const config = STEP_TYPE_CONFIG[step.type as StepType]
                const Icon = config?.icon || FileText
                const isExpanded = expandedOutputStep === step.stepId
                const hasError = step.status === 'error' || step.output.startsWith('Error:')
                const isSkipped = step.status === 'skipped'

                return (
                  <div
                    key={step.stepId}
                    className={cn(
                      'border rounded-lg overflow-hidden transition-colors',
                      hasError && 'border-red-200 dark:border-red-800/60',
                      isSkipped && 'border-amber-200 dark:border-amber-800/60',
                      !hasError && !isSkipped && 'border-zinc-200 dark:border-zinc-700/60'
                    )}
                  >
                    {/* Step header */}
                    <button
                      onClick={() => setExpandedOutputStep(isExpanded ? null : step.stepId)}
                      className="w-full flex items-center gap-2 p-3 text-left hover:bg-zinc-50 dark:hover:bg-zinc-700/30 transition-colors"
                    >
                      <StepStatusIcon status={step.status} />
                      <span className={cn(
                        'inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded-full border',
                        config?.badge || 'bg-zinc-100 text-zinc-600 border-zinc-200'
                      )}>
                        <Icon className="size-2.5" />
                        {config?.label || step.type}
                      </span>
                      <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                        {step.stepName || `Step ${idx + 1}`}
                      </span>
                      {step.outputKey && (
                        <code className="text-[10px] font-mono text-indigo-500 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 px-1.5 py-0.5 rounded">
                          {'{{' + step.outputKey + '}}'}
                        </code>
                      )}
                      <span className="text-[11px] text-zinc-400 dark:text-zinc-500 ml-auto mr-1">
                        {formatDuration(step.duration)}
                      </span>
                      {isExpanded
                        ? <ChevronUp className="size-3.5 text-zinc-400" />
                        : <ChevronDown className="size-3.5 text-zinc-400" />
                      }
                    </button>

                    {/* Step output (collapsible) */}
                    {isExpanded && (
                      <div className="px-3 pb-3 border-t border-zinc-100 dark:border-zinc-700/40">
                        <pre className="mt-2 text-xs bg-zinc-50 dark:bg-zinc-900 rounded-lg p-3 whitespace-pre-wrap break-words max-h-48 overflow-y-auto text-zinc-700 dark:text-zinc-300 font-mono">
                          {step.output || '(no output)'}
                        </pre>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Final Output */}
            {showExecutionResult.finalOutput && (
              <div className="border-t border-zinc-200 dark:border-zinc-700 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="size-3.5 text-indigo-500" />
                  <h4 className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 uppercase tracking-wide">Final Output</h4>
                </div>
                <pre className="text-xs bg-zinc-50 dark:bg-zinc-900 rounded-lg p-3 whitespace-pre-wrap break-words max-h-52 overflow-y-auto text-zinc-700 dark:text-zinc-300 font-mono">
                  {showExecutionResult.finalOutput}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Visual Editor ──────────────────────────────────── */}
      {visualEditingWorkflow && (
        <WorkflowVisualEditor
          workflow={visualEditingWorkflow}
          onSave={async (saved) => {
            try {
              const res = await fetch('/api/workflows', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(saved)
              })
              if (res.ok) {
                const updated = await res.json()
                setWorkflows(prev => prev.map(w => w.id === updated.id ? updated : w))
                addToast('Workflow saved', 'success')
              } else {
                const data = await res.json()
                addToast(data.error || 'Failed to save workflow', 'error')
              }
            } catch {
              addToast('Failed to save workflow', 'error')
            }
            setVisualEditingWorkflow(null)
          }}
          onClose={() => setVisualEditingWorkflow(null)}
        />
      )}
    </div>
  )
}
