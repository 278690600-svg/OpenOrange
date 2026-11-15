'use client'

import { useState, useEffect, useCallback } from 'react'
import { useI18n } from '@/lib/i18n'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import {
  Wrench, Trash2, RefreshCw, Search, ChevronDown, ChevronUp, Clock,
  CheckCircle2, XCircle, Calendar, Filter, X, Activity, TrendingUp,
  Zap, Loader2,
} from 'lucide-react'

interface McpLog {
  id: string
  toolName: string
  serverName: string
  arguments: string
  result: string
  status: string
  duration: number
  chatId: string | null
  createdAt: string
}

interface StatsResult {
  totalCalls: number
  successRate: number
  avgDuration: number
  mostUsedTools: { toolName: string; count: number }[]
}

interface DailyEntry {
  date: string
  count: number
  successCount: number
  errorCount: number
  avgDuration: number
}

export function McpLogViewer() {
  const { t } = useI18n()
  const [logs, setLogs] = useState<McpLog[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<StatsResult | null>(null)
  const [dailyData, setDailyData] = useState<DailyEntry[]>([])
  const [expandedRow, setExpandedRow] = useState<string | null>(null)

  // Filters
  const [toolName, setToolName] = useState('')
  const [serverName, setServerName] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [showFilters, setShowFilters] = useState(false)

  // Pagination
  const [page, setPage] = useState(0)
  const [limit] = useState(20)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      params.set('limit', String(limit))
      params.set('offset', String(page * limit))
      if (toolName) params.set('toolName', toolName)
      if (serverName) params.set('serverName', serverName)
      if (dateFrom) params.set('dateFrom', dateFrom)
      if (dateTo) params.set('dateTo', dateTo)

      const [logsRes, statsRes, dailyRes] = await Promise.all([
        fetch(`/api/mcp/logs?${params}`),
        fetch('/api/mcp/logs?action=stats'),
        fetch('/api/mcp/logs?action=daily&days=30'),
      ])

      if (logsRes.ok) {
        const data = await logsRes.json()
        setLogs(data.logs)
        setTotal(data.total)
      }
      if (statsRes.ok) setStats(await statsRes.json())
      if (dailyRes.ok) setDailyData(await dailyRes.json())
    } catch (e) {
      console.error('Failed to fetch MCP logs:', e)
    } finally {
      setLoading(false)
    }
  }, [page, toolName, serverName, dateFrom, dateTo, limit])

  useEffect(() => { fetchData() }, [fetchData])

  const handleCleanOldLogs = async () => {
    if (!confirm('Delete logs older than 30 days?')) return
    try {
      const res = await fetch('/api/mcp/logs?olderThan=30d', { method: 'DELETE' })
      if (res.ok) {
        const data = await res.json()
        alert(`Deleted ${data.deleted} logs.`)
        fetchData()
      }
    } catch (e) {
      console.error('Failed to clean old logs:', e)
    }
  }

  const totalPages = Math.ceil(total / limit)
  const hasActiveFilters = toolName || serverName || dateFrom || dateTo

  return (
    <div className="flex flex-col gap-6 p-4">
      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            icon={Activity}
            label="Total Calls"
            value={stats.totalCalls.toLocaleString()}
            color="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
          />
          <StatCard
            icon={CheckCircle2}
            label="Success Rate"
            value={`${stats.successRate.toFixed(1)}%`}
            color="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
          />
          <StatCard
            icon={Clock}
            label="Avg Duration"
            value={`${stats.avgDuration}ms`}
            color="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
          />
          <StatCard
            icon={TrendingUp}
            label="Most Used Tool"
            value={stats.mostUsedTools[0]?.toolName ?? '—'}
            color="bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400"
            subValue={stats.mostUsedTools[0] ? `${stats.mostUsedTools[0].count} calls` : undefined}
          />
        </div>
      )}

      {/* Daily Usage Chart */}
      {dailyData.some(d => d.count > 0) && (
        <div className="rounded-lg border bg-card p-4">
          <h3 className="text-sm font-medium text-muted-foreground mb-3">Daily Tool Usage (30 days)</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={dailyData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis
                dataKey="date"
                tickFormatter={(v) => v.slice(5)}
                className="text-xs"
                tick={{ fontSize: 10 }}
              />
              <YAxis className="text-xs" tick={{ fontSize: 10 }} />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length > 0) {
                    return (
                      <div className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg p-2 shadow-lg">
                        <p className="text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1">{payload[0].payload.date}</p>
                        {payload.map((entry, idx) => (
                          <p key={idx} className="text-xs text-zinc-500 dark:text-zinc-400">
                            {String(entry.name)}: {String(entry.value)}
                          </p>
                        ))}
                      </div>
                    )
                  }
                  return null
                }}
              />
              <Legend wrapperStyle={{ fontSize: '12px' }} />
              <Bar dataKey="successCount" name="Success" fill="#22c55e" radius={[2, 2, 0, 0]} />
              <Bar dataKey="errorCount" name="Error" fill="#ef4444" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Controls */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Filter by tool name..."
            value={toolName}
            onChange={e => { setToolName(e.target.value); setPage(0) }}
            className="w-full h-9 pl-9 pr-3 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`inline-flex items-center gap-1.5 px-3 h-9 text-sm border rounded-md transition-colors ${showFilters ? 'bg-accent' : 'hover:bg-accent'}`}
        >
          <Filter className="h-4 w-4" />
          Filters
        </button>
        <button
          onClick={handleCleanOldLogs}
          className="inline-flex items-center gap-1.5 px-3 h-9 text-sm border rounded-md text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
        >
          <Trash2 className="h-4 w-4" />
          Clean Old
        </button>
        <button
          onClick={fetchData}
          className="inline-flex items-center gap-1.5 px-3 h-9 text-sm border rounded-md hover:bg-accent"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Extended Filters */}
      {showFilters && (
        <div className="flex items-center gap-3 flex-wrap p-3 rounded-lg border bg-muted/30">
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground">Server</label>
            <input
              type="text"
              value={serverName}
              onChange={e => { setServerName(e.target.value); setPage(0) }}
              className="h-8 px-2 text-sm border rounded-md bg-background w-40 focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Server name"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground">From</label>
            <input
              type="date"
              value={dateFrom}
              onChange={e => { setDateFrom(e.target.value); setPage(0) }}
              className="h-8 px-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground">To</label>
            <input
              type="date"
              value={dateTo}
              onChange={e => { setDateTo(e.target.value); setPage(0) }}
              className="h-8 px-2 text-sm border rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          {hasActiveFilters && (
            <button
              onClick={() => {
                setToolName(''); setServerName(''); setDateFrom(''); setDateTo(''); setPage(0)
              }}
              className="inline-flex items-center gap-1 h-7 px-2 text-xs border rounded-md hover:bg-accent"
            >
              <X className="h-3 w-3" />
              Clear all
            </button>
          )}
        </div>
      )}

      {/* Log Table */}
      <div className="rounded-lg border overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            Loading logs...
          </div>
        ) : logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Wrench className="h-8 w-8 mb-2 opacity-50" />
            <p className="text-sm">No tool call logs found</p>
          </div>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Tool</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Server</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Status</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Duration</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Arguments</th>
                  <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Date</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <LogRow key={log.id} log={log} expanded={expandedRow === log.id} onToggle={() => setExpandedRow(expandedRow === log.id ? null : log.id)} />
                ))}
              </tbody>
            </table>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/10">
                <span className="text-xs text-muted-foreground">
                  {page * limit + 1}–{Math.min((page + 1) * limit, total)} of {total}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage(p => Math.max(0, p - 1))}
                    disabled={page === 0}
                    className="h-7 px-2 text-xs border rounded-md disabled:opacity-40 hover:bg-accent"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                    disabled={page >= totalPages - 1}
                    className="h-7 px-2 text-xs border rounded-md disabled:opacity-40 hover:bg-accent"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function StatCard({
  icon: Icon, label, value, color, subValue,
}: {
  icon: typeof Wrench
  label: string
  value: string
  color: string
  subValue?: string
}) {
  return (
    <div className="rounded-lg border bg-card p-4 flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <div className={`p-1.5 rounded-md ${color}`}>
          <Icon className="h-4 w-4" />
        </div>
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <span className="text-xl font-semibold truncate">{value}</span>
      {subValue && <span className="text-xs text-muted-foreground">{subValue}</span>}
    </div>
  )
}

function LogRow({ log, expanded, onToggle }: {
  log: McpLog
  expanded: boolean
  onToggle: () => void
}) {
  const argsPreview = (() => {
    try {
      const parsed = JSON.parse(log.arguments)
      const str = JSON.stringify(parsed)
      return str.length > 60 ? str.slice(0, 60) + '...' : str
    } catch {
      return log.arguments.slice(0, 60)
    }
  })()

  const dateStr = new Date(log.createdAt).toLocaleString()

  return (
    <>
      <tr
        className="border-b hover:bg-muted/20 cursor-pointer transition-colors"
        onClick={onToggle}
      >
        <td className="px-4 py-2.5">
          <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{log.toolName}</code>
        </td>
        <td className="px-4 py-2.5 text-muted-foreground">{log.serverName}</td>
        <td className="px-4 py-2.5">
          <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full ${
            log.status === 'success'
              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
              : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
          }`}>
            {log.status === 'success' ? (
              <CheckCircle2 className="h-3 w-3" />
            ) : (
              <XCircle className="h-3 w-3" />
            )}
            {log.status}
          </span>
        </td>
        <td className="px-4 py-2.5 text-muted-foreground font-mono text-xs">{log.duration}ms</td>
        <td className="px-4 py-2.5 text-xs text-muted-foreground font-mono max-w-[200px] truncate">{argsPreview}</td>
        <td className="px-4 py-2.5 text-xs text-muted-foreground whitespace-nowrap">{dateStr}</td>
        <td className="px-2 py-2.5">
          {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={7} className="px-4 py-3 bg-muted/20">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div>
                <p className="font-medium mb-1 text-muted-foreground">Arguments</p>
                <pre className="bg-background border rounded-md p-3 overflow-auto max-h-48 font-mono">
                  {formatJson(log.arguments)}
                </pre>
              </div>
              <div>
                <p className="font-medium mb-1 text-muted-foreground">Result</p>
                <pre className="bg-background border rounded-md p-3 overflow-auto max-h-48 font-mono">
                  {formatJson(log.result)}
                </pre>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

function formatJson(str: string): string {
  try {
    return JSON.stringify(JSON.parse(str), null, 2)
  } catch {
    return str
  }
}
