"use client"

import { useState, useCallback, useEffect } from "react"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import {
  Database, Play, Loader2, Save, History, Sparkles, Table, TrendingUp,
  AlertTriangle, GitBranch, BarChart3, Eye, Trash2, Copy, Check,
  ChevronDown, ChevronRight, X, Server, EyeOff
} from "lucide-react"
import { useI18n } from "@/lib/i18n"
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as ChartTooltip,
  Legend
} from 'recharts'

type DBType = 'mysql' | 'postgresql' | 'sqlite' | 'sqlserver'

interface DBConfig {
  type: DBType
  connectionString?: string
  host?: string
  port?: number
  user?: string
  password?: string
  database?: string
  filePath?: string
}

interface QueryResult {
  rows: Record<string, unknown>[]
  totalRows: number
  columns: string[]
  executionTime: number
}

interface QueryHistoryItem {
  id: string
  sql: string
  naturalLanguage: string | null
  analysisType: string | null
  result: string
  executionTime: number | null
  createdAt: string
}

interface SchemaInfo {
  tables: Array<{
    name: string
    columns: Array<{ name: string; type: string; key_type?: string }>
    rowCount: number
  }>
}

type AnalysisType = 'trend' | 'anomaly' | 'correlation' | 'distribution' | 'summary' | null

const defaultPorts: Record<DBType, string> = {
  mysql: '3306',
  postgresql: '5432',
  sqlite: '',
  sqlserver: '1433'
}

function DatabaseConnectionForm({ config, onChange, onTest }: {
  config: DBConfig
  onChange: (cfg: DBConfig) => void
  onTest: () => Promise<boolean>
}) {
  const { t } = useI18n()
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null)
  const [showPw, setShowPw] = useState(false)

  const handleTest = async () => {
    setTesting(true)
    const ok = await onTest()
    setTesting(false)
    setTestResult(ok ? { ok: true } : { ok: false, error: 'Connection failed' })
  }

  const inputCls = "w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all"

  if (config.type === 'sqlite') {
    return (
      <div className="flex flex-col gap-3">
        <input
          value={config.filePath || ''}
          onChange={e => onChange({ ...config, filePath: e.target.value })}
          placeholder="/path/to/database.db"
          className={inputCls}
        />
        <button
          onClick={handleTest}
          disabled={testing || !config.filePath}
          className="flex items-center justify-center gap-2 py-2 rounded-lg border border-indigo-300 dark:border-indigo-700 text-indigo-600 dark:text-indigo-400 text-sm font-medium hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors disabled:opacity-50"
        >
          {testing ? <Loader2 className="size-4 animate-spin" /> : <Server className="size-4" />}
          {testing ? t('Testing...') : t('Test Connection')}
        </button>
        {testResult && (
          <div className={`text-xs px-3 py-2 rounded-lg ${testResult.ok ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400' : 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400'}`}>
            {testResult.ok ? t('Connection successful!') : testResult.error}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        <input value={config.host || ''} onChange={e => onChange({ ...config, host: e.target.value })} placeholder={t('Host')} className={inputCls} />
        <input value={config.port || ''} onChange={e => onChange({ ...config, port: Number(e.target.value) })} placeholder={t('Port')} className={inputCls} />
        <input value={config.user || ''} onChange={e => onChange({ ...config, user: e.target.value })} placeholder={t('Username')} className={inputCls} />
        <div className="relative">
          <input type={showPw ? 'text' : 'password'} value={config.password || ''} onChange={e => onChange({ ...config, password: e.target.value })} placeholder={t('Password')} className={inputCls + " pr-8"} />
          <button onClick={() => setShowPw(!showPw)} className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600">
            {showPw ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
          </button>
        </div>
        <input value={config.database || ''} onChange={e => onChange({ ...config, database: e.target.value })} placeholder={t('Database Name')} className={inputCls + " col-span-2"} />
      </div>
      <button
        onClick={handleTest}
        disabled={testing || !config.host || !config.user}
        className="flex items-center justify-center gap-2 py-2 rounded-lg border border-indigo-300 dark:border-indigo-700 text-indigo-600 dark:text-indigo-400 text-sm font-medium hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors disabled:opacity-50"
      >
        {testing ? <Loader2 className="size-4 animate-spin" /> : <Server className="size-4" />}
        {testing ? t('Testing...') : t('Test Connection')}
      </button>
      {testResult && (
        <div className={`text-xs px-3 py-2 rounded-lg ${testResult.ok ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400' : 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400'}`}>
          {testResult.ok ? t('Connection successful!') : testResult.error}
        </div>
      )}
    </div>
  )
}

export function DatabaseQueryDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { t } = useI18n()
  const [config, setConfig] = useState<DBConfig>({ type: 'mysql', port: 3306 })
  const [connected, setConnected] = useState(false)
  const [sql, setSql] = useState('')
  const [naturalLanguage, setNaturalLanguage] = useState('')
  const [result, setResult] = useState<QueryResult | null>(null)
  const [analysis, setAnalysis] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [nlLoading, setNlLoading] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [schema, setSchema] = useState<SchemaInfo | null>(null)
  const [showSchema, setShowSchema] = useState(false)
  const [history, setHistory] = useState<QueryHistoryItem[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const [analysisType, setAnalysisType] = useState<AnalysisType>(null)
  const [copied, setCopied] = useState(false)
  const [selectedTable, setSelectedTable] = useState<string | null>(null)

  const [chartType, setChartType] = useState<'bar' | 'line' | 'none'>('none')
  const [xAxisKey, setXAxisKey] = useState('')
  const [yAxisKey, setYAxisKey] = useState('')

  useEffect(() => {
    if (result && result.rows && result.rows.length > 0) {
      const timeKeywords = ['date', 'time', 'month', 'year', 'week', 'day', 'period', 'createdat', 'updatedat']
      const nameKeywords = ['name', 'region', 'category', 'type', 'label', 'city', 'country', 'title', 'regionname']
      
      let xCol = ''
      xCol = result.columns.find(c => timeKeywords.some(kw => c.toLowerCase().includes(kw))) || ''
      if (!xCol) {
        xCol = result.columns.find(c => nameKeywords.some(kw => c.toLowerCase().includes(kw))) || ''
      }
      if (!xCol && result.columns.length > 0) {
        xCol = result.columns[0]
      }

      const valueKeywords = ['revenue', 'amount', 'sales', 'cost', 'count', 'total', 'price', 'value', 'qty', 'quantity', 'balance']
      let yCol = result.columns.find(c => c !== xCol && valueKeywords.some(kw => c.toLowerCase().includes(kw))) || ''
      
      if (!yCol && result.rows.length > 0) {
        const firstRow = result.rows[0]
        yCol = result.columns.find(c => c !== xCol && typeof firstRow[c] === 'number') || ''
      }
      if (!yCol && result.columns.length > 1) {
        yCol = result.columns.find(c => c !== xCol) || ''
      }

      if (xCol && yCol) {
        setXAxisKey(xCol)
        setYAxisKey(yCol)
        const isTime = timeKeywords.some(kw => xCol.toLowerCase().includes(kw))
        setChartType(isTime ? 'line' : 'bar')
      } else {
        setChartType('none')
      }
    } else {
      setChartType('none')
    }
  }, [result])

  const handleTestConnection = useCallback(async () => {
    try {
      const res = await fetch('/api/data-sources?action=test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config })
      })
      const data = await res.json()
      return data.ok
    } catch {
      return false
    }
  }, [config])

  const handleConnect = async () => {
    const ok = await handleTestConnection()
    if (ok) {
      setConnected(true)
      await loadSchema()
    }
  }

  const loadSchema = async () => {
    try {
      const res = await fetch('/api/data-sources?action=schema', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config })
      })
      const data = await res.json()
      if (data.schema) setSchema(data.schema)
    } catch (err) {
      console.error('Failed to load schema:', err)
    }
  }

  const handleExecuteSQL = async () => {
    if (!sql.trim() || !connected) return
    setLoading(true)
    setResult(null)
    setAnalysis(null)
    
    try {
      const startTime = Date.now()
      const res = await fetch('/api/data-sources?action=execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config, sql })
      })
      const data = await res.json()
      
      if (data.error) {
        setResult({ rows: [], totalRows: 0, columns: [], executionTime: Date.now() - startTime })
      } else {
        setResult({
          rows: data.rows,
          totalRows: data.totalRows,
          columns: data.columns,
          executionTime: Date.now() - startTime
        })
      }
      
      setHistory(prev => [{
        id: Date.now().toString(),
        sql,
        naturalLanguage: null,
        analysisType: null,
        result: JSON.stringify(data),
        executionTime: Date.now() - startTime,
        createdAt: new Date().toISOString()
      }, ...prev].slice(0, 50))
    } catch (err) {
      console.error('Query execution failed:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleNL2SQL = async () => {
    if (!naturalLanguage.trim() || !connected) return
    setNlLoading(true)
    
    try {
      const res = await fetch('/api/data-sources?action=nl2sql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config,
          naturalLanguage,
          schema: schema ? { tables: schema.tables.map(t => ({ name: t.name, columns: t.columns })) } : undefined
        })
      })
      const data = await res.json()
      
      if (data.sql && data.isSafe) {
        setSql(data.sql)
      }
    } catch (err) {
      console.error('NL2SQL failed:', err)
    } finally {
      setNlLoading(false)
    }
  }

  const handleAnalyze = async () => {
    if (!sql.trim() || !connected || !analysisType) return
    setAnalyzing(true)
    setAnalysis(null)
    
    try {
      const res = await fetch('/api/data-sources?action=analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config, sql, analysisType })
      })
      const data = await res.json()
      
      if (data.analysis) {
        setAnalysis(data.analysis)
      }
    } catch (err) {
      console.error('Analysis failed:', err)
    } finally {
      setAnalyzing(false)
    }
  }

  const handleCopySQL = () => {
    navigator.clipboard.writeText(sql)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleClearHistory = () => {
    setHistory([])
  }

  useEffect(() => {
    if (open) {
      setConnected(false)
      setResult(null)
      setAnalysis(null)
      setSchema(null)
      setShowSchema(false)
    }
  }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[900px] max-h-[90vh] flex flex-col border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-zinc-100 dark:border-zinc-800">
          <DialogTitle className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="size-8 rounded-lg bg-indigo-100 dark:bg-indigo-500/20 flex items-center justify-center">
                <Database className="size-4 text-indigo-600 dark:text-indigo-400" />
              </div>
              <div>
                <div className="font-bold text-base text-zinc-900 dark:text-zinc-100">{t("Database Query & Analysis")}</div>
                <div className="text-xs text-zinc-500 font-normal">{t("NL2SQL · Execute · Analyze")}</div>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowHistory(!showHistory)}
                className={`p-2 rounded-lg transition-colors ${showHistory ? 'bg-indigo-100 dark:bg-indigo-500/20 text-indigo-500' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400'}`}
                title={t("Query History")}
              >
                <History className="size-4" />
              </button>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-6 space-y-4 app-scrollbar">
          {!connected ? (
            <div className="flex flex-col gap-4">
              <div className="flex gap-2">
                {(['mysql', 'postgresql', 'sqlite', 'sqlserver'] as const).map(type => (
                  <button
                    key={type}
                    onClick={() => setConfig({ ...config, type, port: Number(defaultPorts[type]) || undefined })}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-bold border transition-all ${config.type === type ? 'bg-indigo-600 text-white border-indigo-600' : 'border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:border-indigo-300'}`}
                  >
                    {type === 'mysql' ? 'MySQL' : type === 'postgresql' ? 'PostgreSQL' : type === 'sqlite' ? 'SQLite' : 'SQL Server'}
                  </button>
                ))}
              </div>
              <DatabaseConnectionForm
                config={config}
                onChange={setConfig}
                onTest={handleTestConnection}
              />
              <button
                onClick={handleConnect}
                className="py-2.5 rounded-xl text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2"
              >
                <Database className="size-4" /> {t('Connect to Database')}
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {/* Connection info */}
              <div className="flex items-center gap-2 text-xs text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 px-3 py-2 rounded-lg">
                <Database className="size-3.5" />
                <span>{t('Connected to')} {config.type === 'sqlite' ? config.filePath : `${config.type}://${config.host}:${config.port}/${config.database}`}</span>
              </div>

              {/* Natural Language Query */}
              <div className="flex flex-col gap-2">
                <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 flex items-center gap-1.5">
                  <Sparkles className="size-3.5" /> {t('Natural Language Query')}
                </label>
                <div className="flex gap-2">
                  <input
                    value={naturalLanguage}
                    onChange={e => setNaturalLanguage(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleNL2SQL()}
                    placeholder={t('e.g., Show me the top 10 customers by total orders')}
                    className="flex-1 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 transition-all"
                  />
                  <button
                    onClick={handleNL2SQL}
                    disabled={nlLoading || !naturalLanguage.trim()}
                    className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold transition-colors disabled:opacity-40 flex items-center gap-1.5"
                  >
                    {nlLoading ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                    {nlLoading ? t('Generating...') : t('Generate SQL')}
                  </button>
                </div>
              </div>

              {/* SQL Editor */}
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 flex items-center gap-1.5">
                    <Table className="size-3.5" /> SQL Query
                  </label>
                  <div className="flex gap-2">
                    <button
                      onClick={handleCopySQL}
                      className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-600 transition-colors"
                      title={t('Copy SQL')}
                    >
                      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                    </button>
                    <button
                      onClick={() => setShowSchema(!showSchema)}
                      className={`p-1.5 rounded-lg transition-colors ${showSchema ? 'bg-indigo-100 dark:bg-indigo-500/20 text-indigo-500' : 'hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400'}`}
                      title={t('Show Schema')}
                    >
                      <Database className="size-3.5" />
                    </button>
                  </div>
                </div>
                <textarea
                  value={sql}
                  onChange={e => setSql(e.target.value)}
                  placeholder="SELECT * FROM users LIMIT 10"
                  className="w-full h-32 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm font-mono placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 transition-all resize-none"
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleExecuteSQL}
                    disabled={loading || !sql.trim()}
                    className="flex-1 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
                  >
                    {loading ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
                    {loading ? t('Executing...') : t('Execute Query')}
                  </button>
                </div>
              </div>

              {/* Schema Viewer */}
              {showSchema && schema && (
                <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden">
                  <div className="px-3 py-2 bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-200 dark:border-zinc-700">
                    <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">{t('Database Schema')}</span>
                  </div>
                  <div className="max-h-48 overflow-y-auto">
                    {schema.tables.map(table => (
                      <div key={table.name} className="border-b border-zinc-100 dark:border-zinc-800 last:border-0">
                        <button
                          onClick={() => setSelectedTable(selectedTable === table.name ? null : table.name)}
                          className="w-full flex items-center gap-2 px-3 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors"
                        >
                          {selectedTable === table.name ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
                          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{table.name}</span>
                          <span className="text-[10px] text-zinc-400 tabular-nums">{table.rowCount?.toLocaleString()} {t('rows')}</span>
                        </button>
                        {selectedTable === table.name && (
                          <div className="px-3 pb-2 pl-8">
                            <div className="grid grid-cols-3 gap-1 text-[10px] text-zinc-500">
                              {table.columns.map((col, i) => (
                                <div key={i} className="flex items-center gap-1">
                                  <span className="font-medium text-zinc-700 dark:text-zinc-300">{col.name}</span>
                                  <span className="text-zinc-400">{col.type}</span>
                                  {col.key_type === 'PRI' && <span className="text-yellow-500">🔑</span>}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Analysis Controls */}
              {result && result.rows.length > 0 && (
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 flex items-center gap-1.5">
                    <BarChart3 className="size-3.5" /> {t('AI Analysis')}
                  </label>
                  <div className="flex gap-2 flex-wrap">
                    {[
                      { type: 'summary' as const, icon: <Table className="size-3" />, label: t('Summary') },
                      { type: 'trend' as const, icon: <TrendingUp className="size-3" />, label: t('Trend') },
                      { type: 'anomaly' as const, icon: <AlertTriangle className="size-3" />, label: t('Anomaly') },
                      { type: 'correlation' as const, icon: <GitBranch className="size-3" />, label: t('Correlation') },
                      { type: 'distribution' as const, icon: <BarChart3 className="size-3" />, label: t('Distribution') }
                    ].map(({ type, icon, label }) => (
                      <button
                        key={type}
                        onClick={() => setAnalysisType(analysisType === type ? null : type)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all flex items-center gap-1.5 ${analysisType === type ? 'bg-indigo-600 text-white border-indigo-600' : 'border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-400 hover:border-indigo-300'}`}
                      >
                        {icon} {label}
                      </button>
                    ))}
                    <button
                      onClick={handleAnalyze}
                      disabled={analyzing || !analysisType}
                      className="px-4 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold transition-colors disabled:opacity-40 flex items-center gap-1.5"
                    >
                      {analyzing ? <Loader2 className="size-3 animate-spin" /> : <Sparkles className="size-3" />}
                      {analyzing ? t('Analyzing...') : t('Analyze')}
                    </button>
                  </div>
                </div>
              )}

              {/* Analysis Result */}
              {analysis && (
                <div className="rounded-lg border border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-900/20 p-4">
                  <h4 className="text-sm font-semibold text-purple-700 dark:text-purple-400 mb-2 flex items-center gap-2">
                    <Sparkles className="size-4" /> {t('AI Analysis Result')}
                  </h4>
                  <pre className="text-xs text-purple-600 dark:text-purple-300 whitespace-pre-wrap font-sans leading-relaxed">
                    {analysis}
                  </pre>
                </div>
              )}

              {/* Query Results */}
              {result && (
                <div className="flex flex-col gap-2">
                  {/* AI Chart Visualization */}
                  {chartType !== 'none' && result.rows.length > 0 && (
                    <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30 p-4 flex flex-col gap-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
                          <BarChart3 className="size-3.5" /> {t('AI Chart Recommendation')} ({xAxisKey} vs {yAxisKey})
                        </span>
                        <div className="flex items-center gap-1 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg p-0.5">
                          <button
                            onClick={() => setChartType('bar')}
                            className={`px-2 py-0.5 rounded text-[10px] font-medium transition-all ${chartType === 'bar' ? 'bg-indigo-600 text-white' : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'}`}
                          >
                            {t('Bar Chart')}
                          </button>
                          <button
                            onClick={() => setChartType('line')}
                            className={`px-2 py-0.5 rounded text-[10px] font-medium transition-all ${chartType === 'line' ? 'bg-indigo-600 text-white' : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'}`}
                          >
                            {t('Line Chart')}
                          </button>
                          <button
                            onClick={() => setChartType('none')}
                            className="px-2 py-0.5 rounded text-[10px] font-medium text-zinc-500 hover:text-red-500"
                          >
                            {t('Hide')}
                          </button>
                        </div>
                      </div>

                      <div className="h-48 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          {chartType === 'bar' ? (
                            <BarChart data={result.rows.slice(0, 15)}>
                              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e4e4e7" />
                              <XAxis dataKey={xAxisKey} tick={{ fontSize: 10 }} stroke="#a1a1aa" />
                              <YAxis tick={{ fontSize: 10 }} stroke="#a1a1aa" />
                              <ChartTooltip />
                              <Legend wrapperStyle={{ fontSize: 10 }} />
                              <Bar dataKey={yAxisKey} fill="#6366f1" radius={[4, 4, 0, 0]} />
                            </BarChart>
                          ) : (
                            <LineChart data={result.rows.slice(0, 15)}>
                              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e4e4e7" />
                              <XAxis dataKey={xAxisKey} tick={{ fontSize: 10 }} stroke="#a1a1aa" />
                              <YAxis tick={{ fontSize: 10 }} stroke="#a1a1aa" />
                              <ChartTooltip />
                              <Legend wrapperStyle={{ fontSize: 10 }} />
                              <Line type="monotone" dataKey={yAxisKey} stroke="#6366f1" strokeWidth={2} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                            </LineChart>
                          )}
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-400 flex items-center gap-1.5">
                      <Table className="size-3.5" /> {t('Query Results')}
                    </span>
                    <span className="text-[10px] text-zinc-400">
                      {result.totalRows} {t('rows')} · {result.executionTime}ms
                    </span>
                  </div>
                  
                  {result.columns.length > 0 ? (
                    <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden max-h-96 overflow-auto">
                      <table className="w-full text-xs">
                        <thead className="bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-200 dark:border-zinc-700">
                          <tr>
                            <th className="px-3 py-2 text-left font-medium text-zinc-500">#</th>
                            {result.columns.map(col => (
                              <th key={col} className="px-3 py-2 text-left font-medium text-zinc-500">{col}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {result.rows.slice(0, 100).map((row, i) => (
                            <tr key={i} className="border-b border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                              <td className="px-3 py-2 text-zinc-400">{i + 1}</td>
                              {result.columns.map(col => (
                                <td key={col} className="px-3 py-2 text-zinc-700 dark:text-zinc-300 font-mono max-w-[200px] truncate">
                                  {String(row[col] ?? '')}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="p-4 text-center text-xs text-zinc-400 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg">
                      {t('No results returned')}
                    </div>
                  )}
                </div>
              )}

              {/* Query History */}
              {showHistory && history.length > 0 && (
                <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden">
                  <div className="flex items-center justify-between px-3 py-2 bg-zinc-50 dark:bg-zinc-800/50 border-b border-zinc-200 dark:border-zinc-700">
                    <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">{t('Query History')}</span>
                    <button
                      onClick={handleClearHistory}
                      className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-zinc-400 hover:text-red-500 transition-colors"
                      title={t('Clear History')}
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                  <div className="max-h-48 overflow-y-auto">
                    {history.map((item, i) => (
                      <button
                        key={item.id}
                        onClick={() => {
                          setSql(item.sql)
                          setShowHistory(false)
                        }}
                        className="w-full flex items-start gap-2 px-3 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-800 transition-colors border-b border-zinc-100 dark:border-zinc-800 last:border-0 text-left"
                      >
                        <span className="text-[10px] text-zinc-400 mt-0.5">{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-mono text-zinc-700 dark:text-zinc-300 truncate">{item.sql}</div>
                          {item.naturalLanguage && (
                            <div className="text-[10px] text-zinc-500 truncate">{item.naturalLanguage}</div>
                          )}
                        </div>
                        {item.executionTime && (
                          <span className="text-[10px] text-zinc-400 tabular-nums">{item.executionTime}ms</span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
