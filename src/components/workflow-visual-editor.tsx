'use client'

import React, { useState, useCallback, useMemo, useEffect } from 'react'
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Edge,
  Node,
  Handle,
  Position,
  MarkerType,
  BackgroundVariant,
  useReactFlow,
  ReactFlowProvider,
  type NodeProps,
  type OnConnect,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import {
  X, Save, ChevronDown, ChevronRight, Search, Settings,
  FileText, Wrench, Trash2, AlertCircle, Maximize2
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Textarea } from '@/components/ui/textarea'
import {
  STEP_TYPE_CONFIG,
  NODE_CATEGORIES,
  getStepsByCategory,
  type StepTypeConfig,
} from '@/lib/workflow-config'
import type {
  StepType,
  NodeCategory,
  WorkflowStep,
  WorkflowEdgeData,
  WorkflowData,
  StepConfig,
} from '@/types/workflow'

// ============================================================
// Types
// ============================================================

interface CustomNodeData {
  stepType: StepType
  name: string
  prompt: string
  model?: string
  outputKey?: string
  description?: string
  order: number
  config?: StepConfig
  [key: string]: unknown
}

type WorkflowNode = Node<CustomNodeData>
type WorkflowEdge = Edge

// ============================================================
// Custom Node Component
// ============================================================

function WorkflowNodeComponent({ data, selected }: NodeProps<WorkflowNode>) {
  const config = STEP_TYPE_CONFIG[data.stepType] ?? STEP_TYPE_CONFIG.llm
  const Icon = config.icon

  const isCondition = data.stepType === 'condition'
  const isOutput = data.stepType === 'output'
  const isTrigger = data.stepType === 'trigger'

  return (
    <div
      className={cn(
        'relative rounded-xl border-2 shadow-lg overflow-hidden transition-all duration-200 min-w-[260px] max-w-[300px]',
        'bg-white dark:bg-zinc-800',
        selected
          ? 'border-indigo-500 shadow-indigo-500/20 shadow-xl scale-[1.02]'
          : 'border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600 hover:shadow-md'
      )}
    >
      {/* Input Handle (not for trigger) */}
      {!isTrigger && (
        <Handle
          type="target"
          position={Position.Top}
          className="!w-3 !h-3 !bg-zinc-400 dark:!bg-zinc-500 !border-2 !border-white dark:!border-zinc-800"
        />
      )}

      {/* Header */}
      <div
        className={cn(
          'px-3 py-2 flex items-center gap-2 border-b',
          config.bg,
          config.border
        )}
      >
        <div className={cn('p-1.5 rounded-lg text-white shadow-sm', config.color)}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-xs text-zinc-800 dark:text-zinc-200 truncate">
            {config.label}
          </div>
          {data.name && (
            <div className="text-[10px] text-zinc-500 dark:text-zinc-400 truncate">
              {data.name}
            </div>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="p-3 space-y-2">
        {data.description && (
          <div className="text-xs text-zinc-600 dark:text-zinc-400 line-clamp-1">
            {data.description}
          </div>
        )}

        {data.prompt && (
          <div className="text-[11px] text-zinc-500 dark:text-zinc-500 font-mono line-clamp-2 bg-zinc-50 dark:bg-zinc-900/60 p-1.5 rounded-md border border-zinc-100 dark:border-zinc-700">
            {data.prompt}
          </div>
        )}

        {/* Badges row */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {data.model && (
            <span
              className={cn(
                'inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border',
                config.badge
              )}
            >
              {data.model}
            </span>
          )}
          {data.outputKey && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-zinc-100 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-600">
              {data.outputKey}
            </span>
          )}
        </div>
      </div>

      {/* Output Handles */}
      {isCondition ? (
        <div className="absolute bottom-0 left-0 right-0 flex justify-between px-6 pb-1">
          {/* True handle - left */}
          <div className="flex flex-col items-center">
            <Handle
              type="source"
              position={Position.Bottom}
              id="true"
              className="!w-3 !h-3 !bg-emerald-500 !border-2 !border-white dark:!border-zinc-800"
            />
            <span className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
              True
            </span>
          </div>
          {/* False handle - right */}
          <div className="flex flex-col items-center">
            <Handle
              type="source"
              position={Position.Bottom}
              id="false"
              className="!w-3 !h-3 !bg-rose-500 !border-2 !border-white dark:!border-zinc-800"
            />
            <span className="text-[9px] font-bold text-rose-600 dark:text-rose-400 mt-0.5">
              False
            </span>
          </div>
        </div>
      ) : !isOutput ? (
        <Handle
          type="source"
          position={Position.Bottom}
          className="!w-3 !h-3 !bg-indigo-500 !border-2 !border-white dark:!border-zinc-800"
        />
      ) : null}
    </div>
  )
}

const nodeTypes = {
  workflowNode: WorkflowNodeComponent,
}

// ============================================================
// Topological Sort
// ============================================================

function topologicalSort(nodes: WorkflowNode[], edges: WorkflowEdge[]): WorkflowNode[] {
  if (nodes.length === 0) return []

  const inDegree = new Map<string, number>()
  const adjacency = new Map<string, string[]>()

  for (const node of nodes) {
    inDegree.set(node.id, 0)
    adjacency.set(node.id, [])
  }

  for (const edge of edges) {
    adjacency.get(edge.source)?.push(edge.target)
    inDegree.set(edge.target, (inDegree.get(edge.target) ?? 0) + 1)
  }

  const queue: string[] = []
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id)
  }

  const sorted: WorkflowNode[] = []
  while (queue.length > 0) {
    const id = queue.shift()!
    const node = nodes.find(n => n.id === id)
    if (node) sorted.push(node)

    for (const neighbor of adjacency.get(id) ?? []) {
      const newDeg = (inDegree.get(neighbor) ?? 1) - 1
      inDegree.set(neighbor, newDeg)
      if (newDeg === 0) queue.push(neighbor)
    }
  }

  // Fallback: append unsorted nodes (cycle case)
  if (sorted.length < nodes.length) {
    const sortedIds = new Set(sorted.map(n => n.id))
    const remaining = nodes.filter(n => !sortedIds.has(n.id))
    return [...sorted, ...remaining]
  }

  return sorted
}

// ============================================================
// Cycle Detection
// ============================================================

function wouldCreateCycle(
  edges: WorkflowEdge[],
  newSource: string,
  newTarget: string
): boolean {
  const adjacency = new Map<string, string[]>()
  for (const edge of edges) {
    if (!adjacency.has(edge.source)) adjacency.set(edge.source, [])
    adjacency.get(edge.source)!.push(edge.target)
  }

  const visited = new Set<string>()
  const queue = [newTarget]
  while (queue.length > 0) {
    const current = queue.shift()!
    if (current === newSource) return true
    if (visited.has(current)) continue
    visited.add(current)
    for (const neighbor of adjacency.get(current) ?? []) {
      queue.push(neighbor)
    }
  }
  return false
}

// ============================================================
// Sidebar Component
// ============================================================

function Sidebar({
  onAddNode,
}: {
  onAddNode: (type: StepType) => void
}) {
  const [search, setSearch] = useState('')
  const [collapsed, setCollapsed] = useState<Record<NodeCategory, boolean>>({
    flow: false,
    ai: false,
    logic: false,
    action: false,
  })
  const stepsByCategory = useMemo(() => getStepsByCategory(), [])

  const filteredByCategory = useMemo(() => {
    const result: Record<NodeCategory, StepType[]> = { flow: [], ai: [], logic: [], action: [] }
    const q = search.toLowerCase().trim()
    for (const cat of Object.keys(stepsByCategory) as NodeCategory[]) {
      result[cat] = stepsByCategory[cat].filter(type => {
        const cfg = STEP_TYPE_CONFIG[type]
        if (!q) return true
        return (
          cfg.label.toLowerCase().includes(q) ||
          cfg.description.toLowerCase().includes(q) ||
          type.toLowerCase().includes(q)
        )
      })
    }
    return result
  }, [search, stepsByCategory])

  const toggleCategory = (cat: NodeCategory) => {
    setCollapsed(prev => ({ ...prev, [cat]: !prev[cat] }))
  }

  return (
    <div className="w-64 border-r border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex flex-col shrink-0">
      {/* Header */}
      <div className="p-3 border-b border-zinc-200 dark:border-zinc-800">
        <h3 className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-2">
          Node Types
        </h3>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search nodes..."
            className="w-full pl-8 pr-3 py-1.5 bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg text-xs text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-400 transition-all"
          />
        </div>
      </div>

      {/* Categories */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {NODE_CATEGORIES.map(cat => {
          const items = filteredByCategory[cat.id]
          if (items.length === 0 && search) return null

          return (
            <div key={cat.id}>
              <button
                onClick={() => toggleCategory(cat.id)}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-left"
              >
                {collapsed[cat.id] ? (
                  <ChevronRight className="w-3.5 h-3.5 text-zinc-400" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5 text-zinc-400" />
                )}
                <span className="text-sm">{cat.icon}</span>
                <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                  {cat.label}
                </span>
                <span className="ml-auto text-[10px] text-zinc-400">{items.length}</span>
              </button>

              {!collapsed[cat.id] && (
                <div className="ml-1 mt-0.5 space-y-0.5">
                  {items.map(type => {
                    const cfg = STEP_TYPE_CONFIG[type]
                    const Icon = cfg.icon
                    return (
                      <button
                        key={type}
                        onClick={() => onAddNode(type)}
                        className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg border border-transparent hover:border-zinc-200 dark:hover:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-all text-left group"
                      >
                        <div
                          className={cn(
                            'p-1.5 rounded-md text-white shadow-sm group-hover:scale-110 transition-transform',
                            cfg.color
                          )}
                        >
                          <Icon className="w-3.5 h-3.5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium text-zinc-700 dark:text-zinc-300 group-hover:text-indigo-700 dark:group-hover:text-indigo-400 truncate">
                            {cfg.label}
                          </div>
                          <div className="text-[10px] text-zinc-400 dark:text-zinc-500 truncate">
                            {cfg.description}
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ============================================================
// Property Panel Component
// ============================================================

type PropertyTab = 'settings' | 'prompt' | 'advanced'

function PropertyPanel({
  node,
  onUpdate,
  onDelete,
  onClose,
}: {
  node: WorkflowNode
  onUpdate: (updates: Partial<CustomNodeData>) => void
  onDelete: () => void
  onClose: () => void
}) {
  const [activeTab, setActiveTab] = useState<PropertyTab>('settings')
  const config = STEP_TYPE_CONFIG[node.data.stepType] ?? STEP_TYPE_CONFIG.llm
  const Icon = config.icon

  const tabs: { id: PropertyTab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
    { id: 'settings', label: 'Settings', icon: Settings },
    { id: 'prompt', label: 'Prompt', icon: FileText },
    { id: 'advanced', label: 'Advanced', icon: Wrench },
  ]

  return (
    <div className="w-80 border-l border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex flex-col shrink-0 shadow-xl">
      {/* Header */}
      <div className="p-3 border-b border-zinc-200 dark:border-zinc-700 flex items-center gap-2">
        <div className={cn('p-1.5 rounded-md text-white', config.color)}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 truncate">
            {config.label}
          </div>
          <div className="text-[10px] text-zinc-400 truncate">{node.id}</div>
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded transition-colors"
        >
          <X className="w-4 h-4 text-zinc-500" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-zinc-200 dark:border-zinc-700">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors border-b-2',
              activeTab === tab.id
                ? 'text-indigo-600 dark:text-indigo-400 border-indigo-600 dark:border-indigo-400'
                : 'text-zinc-500 dark:text-zinc-400 border-transparent hover:text-zinc-700 dark:hover:text-zinc-300'
            )}
          >
            <tab.icon className="w-3.5 h-3.5" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {activeTab === 'settings' && (
          <>
            <Field label="Name">
              <input
                className={inputClass}
                value={node.data.name ?? ''}
                onChange={e => onUpdate({ name: e.target.value })}
                placeholder="Step name"
              />
            </Field>

            <Field label="Description">
              <input
                className={inputClass}
                value={node.data.description ?? ''}
                onChange={e => onUpdate({ description: e.target.value })}
                placeholder="What does this step do?"
              />
            </Field>

            <Field label="Step Type">
              <select
                className={inputClass}
                value={node.data.stepType}
                onChange={e => onUpdate({ stepType: e.target.value as StepType })}
              >
                {Object.entries(STEP_TYPE_CONFIG).map(([key, cfg]) => (
                  <option key={key} value={key}>
                    {cfg.label}
                  </option>
                ))}
              </select>
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Model">
                <input
                  className={inputClass}
                  value={node.data.model ?? ''}
                  onChange={e => onUpdate({ model: e.target.value })}
                  placeholder="e.g. gpt-4"
                />
              </Field>
              <Field label="Output Key">
                <input
                  className={cn(inputClass, 'font-mono')}
                  value={node.data.outputKey ?? ''}
                  onChange={e => onUpdate({ outputKey: e.target.value })}
                  placeholder="e.g. result"
                />
              </Field>
            </div>
          </>
        )}

        {activeTab === 'prompt' && (
          <>
            <Field label="Prompt Template">
              <Textarea
                className="w-full font-mono text-xs min-h-[200px] resize-y focus:ring-2 focus:ring-indigo-500/40 bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100"
                value={node.data.prompt ?? ''}
                onChange={e => onUpdate({ prompt: e.target.value })}
                placeholder="Enter your prompt template here...&#10;&#10;Use {{variable}} for dynamic values."
              />
            </Field>

            {node.data.stepType === 'condition' && (
              <Field label="Condition Expression">
                <Textarea
                  className="w-full font-mono text-xs min-h-[80px] resize-y focus:ring-2 focus:ring-indigo-500/40 bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100"
                  value={node.data.config?.conditionExpression ?? ''}
                  onChange={e =>
                    onUpdate({
                      config: { ...node.data.config, conditionExpression: e.target.value },
                    })
                  }
                  placeholder="e.g. {{output.score}} > 0.8"
                />
              </Field>
            )}
          </>
        )}

        {activeTab === 'advanced' && (
          <>
            {node.data.stepType === 'llm' && (
              <>
                <Field label="Temperature">
                  <input
                    type="number"
                    min={0}
                    max={2}
                    step={0.1}
                    className={inputClass}
                    value={node.data.config?.temperature ?? 0.7}
                    onChange={e =>
                      onUpdate({
                        config: {
                          ...node.data.config,
                          temperature: parseFloat(e.target.value),
                        },
                      })
                    }
                  />
                </Field>
                <Field label="Max Tokens">
                  <input
                    type="number"
                    min={1}
                    max={32768}
                    className={inputClass}
                    value={node.data.config?.maxTokens ?? 2048}
                    onChange={e =>
                      onUpdate({
                        config: {
                          ...node.data.config,
                          maxTokens: parseInt(e.target.value, 10),
                        },
                      })
                    }
                  />
                </Field>
                <Field label="System Prompt">
                  <Textarea
                    className="w-full font-mono text-xs min-h-[100px] resize-y focus:ring-2 focus:ring-indigo-500/40 bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100"
                    value={node.data.config?.systemPrompt ?? ''}
                    onChange={e =>
                      onUpdate({
                        config: { ...node.data.config, systemPrompt: e.target.value },
                      })
                    }
                    placeholder="System instructions..."
                  />
                </Field>
              </>
            )}

            {node.data.stepType === 'loop' && (
              <>
                <Field label="Loop Variable">
                  <input
                    className={cn(inputClass, 'font-mono')}
                    value={node.data.config?.loopVariable ?? 'items'}
                    onChange={e =>
                      onUpdate({
                        config: { ...node.data.config, loopVariable: e.target.value },
                      })
                    }
                    placeholder="Variable to iterate"
                  />
                </Field>
                <Field label="Max Iterations">
                  <input
                    type="number"
                    min={1}
                    max={10000}
                    className={inputClass}
                    value={node.data.config?.maxIterations ?? 100}
                    onChange={e =>
                      onUpdate({
                        config: {
                          ...node.data.config,
                          maxIterations: parseInt(e.target.value, 10),
                        },
                      })
                    }
                  />
                </Field>
              </>
            )}

            {node.data.stepType === 'http' && (
              <>
                <Field label="Method">
                  <select
                    className={inputClass}
                    value={node.data.config?.method ?? 'GET'}
                    onChange={e =>
                      onUpdate({
                        config: {
                          ...node.data.config,
                          method: e.target.value as StepConfig['method'],
                        },
                      })
                    }
                  >
                    {['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].map(m => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="URL">
                  <input
                    className={cn(inputClass, 'font-mono')}
                    value={node.data.config?.url ?? ''}
                    onChange={e =>
                      onUpdate({ config: { ...node.data.config, url: e.target.value } })
                    }
                    placeholder="https://api.example.com/..."
                  />
                </Field>
                <Field label="Body">
                  <Textarea
                    className="w-full font-mono text-xs min-h-[80px] resize-y focus:ring-2 focus:ring-indigo-500/40 bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100"
                    value={node.data.config?.body ?? ''}
                    onChange={e =>
                      onUpdate({ config: { ...node.data.config, body: e.target.value } })
                    }
                    placeholder="Request body (JSON)..."
                  />
                </Field>
              </>
            )}

            {node.data.stepType === 'code' && (
              <>
                <Field label="Language">
                  <select
                    className={inputClass}
                    value={node.data.config?.language ?? 'javascript'}
                    onChange={e =>
                      onUpdate({
                        config: {
                          ...node.data.config,
                          language: e.target.value as StepConfig['language'],
                        },
                      })
                    }
                  >
                    <option value="javascript">JavaScript</option>
                    <option value="python">Python</option>
                  </select>
                </Field>
                <Field label="Code">
                  <Textarea
                    className="w-full font-mono text-xs min-h-[150px] resize-y focus:ring-2 focus:ring-indigo-500/40 bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100"
                    value={node.data.config?.code ?? ''}
                    onChange={e =>
                      onUpdate({ config: { ...node.data.config, code: e.target.value } })
                    }
                    placeholder="// Process input&#10;return input;"
                  />
                </Field>
              </>
            )}

            {node.data.stepType === 'merge' && (
              <Field label="Merge Strategy">
                <select
                  className={inputClass}
                  value={node.data.config?.mergeStrategy ?? 'wait_all'}
                  onChange={e =>
                    onUpdate({
                      config: {
                        ...node.data.config,
                        mergeStrategy: e.target.value as StepConfig['mergeStrategy'],
                      },
                    })
                  }
                >
                  <option value="wait_all">Wait All</option>
                  <option value="wait_any">Wait Any</option>
                </select>
              </Field>
            )}

            {/* Common advanced fields */}
            <div className="grid grid-cols-2 gap-3">
              <Field label="Timeout (ms)">
                <input
                  type="number"
                  min={0}
                  className={inputClass}
                  value={node.data.config?.timeout ?? ''}
                  onChange={e =>
                    onUpdate({
                      config: {
                        ...node.data.config,
                        timeout: e.target.value ? parseInt(e.target.value, 10) : undefined,
                      },
                    })
                  }
                  placeholder="30000"
                />
              </Field>
              <Field label="Retries">
                <input
                  type="number"
                  min={0}
                  max={10}
                  className={inputClass}
                  value={node.data.config?.retries ?? ''}
                  onChange={e =>
                    onUpdate({
                      config: {
                        ...node.data.config,
                        retries: e.target.value ? parseInt(e.target.value, 10) : undefined,
                      },
                    })
                  }
                  placeholder="0"
                />
              </Field>
            </div>
          </>
        )}
      </div>

      {/* Delete button */}
      <div className="p-3 border-t border-zinc-200 dark:border-zinc-700">
        <button
          onClick={onDelete}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-rose-50 dark:bg-rose-900/20 hover:bg-rose-100 dark:hover:bg-rose-900/30 text-rose-600 dark:text-rose-400 rounded-lg text-xs font-medium transition-colors border border-rose-200 dark:border-rose-800"
        >
          <Trash2 className="w-3.5 h-3.5" />
          Delete Node
        </button>
      </div>
    </div>
  )
}

// ============================================================
// Shared UI helpers
// ============================================================

const inputClass =
  'w-full px-3 py-1.5 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-md text-xs text-zinc-900 dark:text-zinc-100 focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-400 outline-none transition-all placeholder:text-zinc-400'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] font-medium text-zinc-600 dark:text-zinc-400 mb-1">
        {label}
      </label>
      {children}
    </div>
  )
}

// ============================================================
// Inner Editor (needs ReactFlowProvider context)
// ============================================================

function WorkflowEditorInner({
  workflow,
  onSave,
  onClose,
}: {
  workflow: WorkflowData
  onSave: (w: WorkflowData) => void
  onClose: () => void
}) {
  const [nodes, setNodes, onNodesChange] = useNodesState<WorkflowNode>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<WorkflowEdge>([])
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [cycleWarning, setCycleWarning] = useState<string | null>(null)
  const { screenToFlowPosition, fitView } = useReactFlow()

  // Initialize graph from workflow data
  useEffect(() => {
    const stepIdMap = new Map<string, string>()
    const initialNodes: WorkflowNode[] = workflow.steps.map((step, index) => {
      const nodeId = step.id ?? `step-${crypto.randomUUID()}`
      stepIdMap.set(step.id ?? `__idx-${index}`, nodeId)
      return {
        id: nodeId,
        type: 'workflowNode',
        position: { x: 300, y: 80 + index * 200 },
        data: {
          stepType: step.type,
          name: step.name,
          prompt: step.prompt,
          model: step.model,
          outputKey: step.outputKey,
          description: step.description,
          order: step.order,
          config: step.config,
        } satisfies CustomNodeData,
      }
    })

    const initialEdges: WorkflowEdge[] = workflow.edges.map((edge, index) => {
      const sourceId = stepIdMap.get(edge.sourceStepId) ?? edge.sourceStepId
      const targetId = stepIdMap.get(edge.targetStepId) ?? edge.targetStepId
      const isConditionBranch = edge.sourceHandle === 'true' || edge.sourceHandle === 'false'

      return {
        id: edge.id ?? `edge-${crypto.randomUUID()}`,
        source: sourceId,
        target: targetId,
        sourceHandle: edge.sourceHandle ?? undefined,
        type: 'smoothstep',
        animated: true,
        style: {
          stroke: isConditionBranch
            ? edge.sourceHandle === 'true'
              ? '#10b981'
              : '#f43f5e'
            : '#6366f1',
          strokeWidth: 2,
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: isConditionBranch
            ? edge.sourceHandle === 'true'
              ? '#10b981'
              : '#f43f5e'
            : '#6366f1',
        },
        label: edge.label ?? (isConditionBranch ? (edge.sourceHandle === 'true' ? 'Yes' : 'No') : undefined),
        labelStyle: {
          fontSize: 10,
          fontWeight: 600,
          fill: isConditionBranch
            ? edge.sourceHandle === 'true'
              ? '#10b981'
              : '#f43f5e'
            : '#6366f1',
        },
        labelBgStyle: {
          fill: 'white',
          fillOpacity: 0.9,
        },
        labelBgPadding: [4, 6] as [number, number],
        labelBgBorderRadius: 4,
      }
    })

    // If no edges defined, auto-chain sequential nodes
    if (initialEdges.length === 0 && initialNodes.length > 1) {
      for (let i = 0; i < initialNodes.length - 1; i++) {
        const sourceNode = initialNodes[i]
        const targetNode = initialNodes[i + 1]
        const sourceConfig = STEP_TYPE_CONFIG[sourceNode.data.stepType]

        if (sourceConfig.outputHandles === 'single') {
          initialEdges.push({
            id: `edge-auto-${i}`,
            source: sourceNode.id,
            target: targetNode.id,
            type: 'smoothstep',
            animated: true,
            style: { stroke: '#6366f1', strokeWidth: 2 },
            markerEnd: { type: MarkerType.ArrowClosed, color: '#6366f1' },
          })
        }
      }
    }

    setNodes(initialNodes)
    setEdges(initialEdges)
  }, [workflow, setNodes, setEdges])

  // Handle new connections
  const onConnect: OnConnect = useCallback(
    (params: Connection) => {
      if (!params.source || !params.target) return
      if (params.source === params.target) return

      // Cycle check
      if (wouldCreateCycle(edges, params.source, params.target)) {
        setCycleWarning('Cannot create cycle: this connection would create a loop')
        setTimeout(() => setCycleWarning(null), 3000)
        return
      }

      const isConditionBranch =
        params.sourceHandle === 'true' || params.sourceHandle === 'false'

      const edgeColor = isConditionBranch
        ? params.sourceHandle === 'true'
          ? '#10b981'
          : '#f43f5e'
        : '#6366f1'

      const edgeLabel = isConditionBranch
        ? params.sourceHandle === 'true'
          ? 'Yes'
          : 'No'
        : undefined

      setEdges(eds =>
        addEdge(
          {
            ...params,
            type: 'smoothstep',
            animated: true,
            style: { stroke: edgeColor, strokeWidth: 2 },
            markerEnd: { type: MarkerType.ArrowClosed, color: edgeColor },
            label: edgeLabel,
            labelStyle: {
              fontSize: 10,
              fontWeight: 600,
              fill: edgeColor,
            },
            labelBgStyle: { fill: 'white', fillOpacity: 0.9 },
            labelBgPadding: [4, 6] as [number, number],
            labelBgBorderRadius: 4,
          },
          eds
        )
      )
    },
    [edges, setEdges]
  )

  const onNodeClick = useCallback((_: React.MouseEvent, node: WorkflowNode) => {
    setSelectedNodeId(node.id)
  }, [])

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null)
  }, [])

  // Add new node
  const handleAddNode = useCallback(
    (type: StepType) => {
      const newNodeId = `step-${crypto.randomUUID()}`
      const cfg = STEP_TYPE_CONFIG[type]

      // Position: find a good spot near the center of the viewport
      const position = screenToFlowPosition({
        x: window.innerWidth / 2 - 130 + Math.random() * 60,
        y: window.innerHeight / 2 - 60 + Math.random() * 60,
      })

      const newNode: WorkflowNode = {
        id: newNodeId,
        type: 'workflowNode',
        position,
        data: {
          stepType: type,
          name: cfg.label,
          prompt: '',
          description: cfg.description,
          order: nodes.length,
          config: cfg.defaultConfig
            ? { ...cfg.defaultConfig } as StepConfig
            : undefined,
        } satisfies CustomNodeData,
      }

      setNodes(ns => [...ns, newNode])
      setSelectedNodeId(newNodeId)
    },
    [nodes.length, screenToFlowPosition, setNodes]
  )

  // Delete selected node and its edges
  const deleteSelectedNode = useCallback(() => {
    if (!selectedNodeId) return
    setNodes(ns => ns.filter(n => n.id !== selectedNodeId))
    setEdges(es => es.filter(e => e.source !== selectedNodeId && e.target !== selectedNodeId))
    setSelectedNodeId(null)
  }, [selectedNodeId, setNodes, setEdges])

  // Update selected node data
  const updateSelectedNodeData = useCallback(
    (updates: Partial<CustomNodeData>) => {
      if (!selectedNodeId) return
      setNodes(ns =>
        ns.map(n => {
          if (n.id === selectedNodeId) {
            return { ...n, data: { ...n.data, ...updates } }
          }
          return n
        })
      )
    },
    [selectedNodeId, setNodes]
  )

  // Save workflow
  const handleSave = useCallback(() => {
    const sortedNodes = topologicalSort(nodes, edges)

    const steps: WorkflowStep[] = sortedNodes.map((n, index) => ({
      id: n.id,
      order: index,
      type: n.data.stepType,
      name: n.data.name ?? STEP_TYPE_CONFIG[n.data.stepType].label,
      prompt: n.data.prompt ?? '',
      model: n.data.model || undefined,
      outputKey: n.data.outputKey || undefined,
      description: n.data.description || undefined,
      config: n.data.config,
    }))

    const workflowEdges: WorkflowEdgeData[] = edges.map(e => ({
      id: e.id,
      sourceStepId: e.source,
      targetStepId: e.target,
      sourceHandle: (e.sourceHandle as 'true' | 'false') || undefined,
      label: (e.label as string) || undefined,
    }))

    onSave({
      ...workflow,
      steps,
      edges: workflowEdges,
      updatedAt: new Date().toISOString(),
    })
  }, [nodes, edges, workflow, onSave])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+S / Cmd+S to save
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        handleSave()
        return
      }
      // Escape to close editor
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }
      // Delete/Backspace to delete selected node (only when no input focused)
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const activeEl = document.activeElement
        if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'SELECT')) {
          return
        }
        e.preventDefault()
        deleteSelectedNode()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleSave, onClose, deleteSelectedNode])

  const selectedNode = nodes.find(n => n.id === selectedNodeId) ?? null

  // MiniMap color helper
  const miniMapNodeColor = useCallback((n: WorkflowNode) => {
    const cfg = STEP_TYPE_CONFIG[n.data?.stepType]
    if (!cfg) return '#64748b'
    const colorMap: Record<string, string> = {
      'bg-sky-500': '#0ea5e9',
      'bg-blue-500': '#3b82f6',
      'bg-purple-500': '#8b5cf6',
      'bg-amber-500': '#f59e0b',
      'bg-green-500': '#22c55e',
      'bg-teal-500': '#14b8a6',
      'bg-orange-500': '#f97316',
      'bg-cyan-500': '#06b6d4',
      'bg-pink-500': '#ec4899',
      'bg-rose-500': '#f43f5e',
    }
    return colorMap[cfg.color] ?? '#64748b'
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-zinc-100 dark:bg-zinc-950">
      {/* Top Toolbar */}
      <div className="h-12 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex items-center justify-between px-4 shrink-0 shadow-sm">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-zinc-500 dark:text-zinc-400" />
          </button>
          <div className="h-5 w-px bg-zinc-200 dark:bg-zinc-700" />
          <div>
            <h2 className="font-semibold text-zinc-800 dark:text-zinc-100 text-sm leading-tight">
              {workflow.name}
            </h2>
            <p className="text-[10px] text-zinc-400 leading-tight">
              Visual Workflow Editor
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {cycleWarning && (
            <span className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-2.5 py-1 rounded-md border border-amber-200 dark:border-amber-800">
              <AlertCircle className="w-3.5 h-3.5" />
              {cycleWarning}
            </span>
          )}
          <div className="text-[10px] text-zinc-400">
            {nodes.length} nodes · {edges.length} edges
          </div>
          <button
            onClick={() => fitView({ padding: 0.3, duration: 300 })}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-zinc-100 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg transition-colors"
            title="Fit view (Shift+1)"
          >
            <Maximize2 className="w-3.5 h-3.5" />
            Fit View
          </button>
          <button
            onClick={handleSave}
            className="flex items-center gap-2 px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-medium transition-colors shadow-sm shadow-indigo-600/20"
          >
            <Save className="w-3.5 h-3.5" />
            Save Workflow
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <Sidebar onAddNode={handleAddNode} />

        {/* Canvas */}
        <div className="flex-1 relative">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            fitView
            fitViewOptions={{ padding: 0.3 }}
            className="bg-zinc-50 dark:bg-zinc-950"
            deleteKeyCode={['Backspace', 'Delete']}
            proOptions={{ hideAttribution: true }}
          >
            <Background
              variant={BackgroundVariant.Dots}
              color="#94a3b8"
              gap={24}
              size={1.5}
            />
            <Controls
              position="bottom-right"
              className="!bg-white dark:!bg-zinc-800 !border-zinc-200 dark:!border-zinc-700 !shadow-lg !rounded-lg overflow-hidden"
            />
            <MiniMap
              nodeColor={miniMapNodeColor}
              maskColor="rgba(0, 0, 0, 0.1)"
              className="!border-zinc-200 dark:!border-zinc-700 !shadow-lg !rounded-lg"
              position="bottom-left"
              pannable
              zoomable
            />
          </ReactFlow>
        </div>

        {/* Right Property Panel */}
        {selectedNode && (
          <PropertyPanel
            node={selectedNode}
            onUpdate={updateSelectedNodeData}
            onDelete={deleteSelectedNode}
            onClose={() => setSelectedNodeId(null)}
          />
        )}
      </div>
    </div>
  )
}

// ============================================================
// Exported Component (wrapped with ReactFlowProvider)
// ============================================================

export function WorkflowVisualEditor({
  workflow,
  onSave,
  onClose,
}: {
  workflow: WorkflowData
  onSave: (w: WorkflowData) => void
  onClose: () => void
}) {
  return (
    <ReactFlowProvider>
      <WorkflowEditorInner workflow={workflow} onSave={onSave} onClose={onClose} />
    </ReactFlowProvider>
  )
}
