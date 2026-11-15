"use client"

import { useState, useRef, useCallback } from "react"
import {
  Upload, BarChart3, PieChart as PieChartIcon, TrendingUp, AreaChart,
  Table as TableIcon, Sparkles, Save, Trash2, Plus, X, FileText,
  Loader2, AlertCircle, Database
} from "lucide-react"
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, AreaChart as ReAreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from "recharts"
import type { ColumnStats, TimeSeriesAnalysis, DashboardWidget, Dashboard } from "@/lib/data-analysis"

const COLORS = ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#f97316"]

interface AnalysisResult {
  rowCount: number
  columnCount: number
  columns: ColumnStats[]
  timeSeries?: TimeSeriesAnalysis[]
  correlations?: Array<{ colA: string; colB: string; coefficient: number }>
}

export function DashboardManager() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dataName, setDataName] = useState("")
  const [columns, setColumns] = useState<string[]>([])
  const [data, setData] = useState<Record<string, unknown>[]>([])
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [interpretation, setInterpretation] = useState("")
  const [isInterpreting, setIsInterpreting] = useState(false)
  const [widgets, setWidgets] = useState<DashboardWidget[]>([])
  const [isSaving, setIsSaving] = useState(false)
  const [savedDashboards, setSavedDashboards] = useState<{ id: string; title: string; dataName: string; widgetCount: number; createdAt: string }[]>([])
  const [dashboardTitle, setDashboardTitle] = useState("My Dashboard")
  const [showWidgetForm, setShowWidgetForm] = useState(false)
  const [editingWidget, setEditingWidget] = useState<DashboardWidget | null>(null)
  const [error, setError] = useState<string | null>(null)

  // New widget form state
  const [widgetType, setWidgetType] = useState<DashboardWidget["type"]>("bar")
  const [widgetTitle, setWidgetTitle] = useState("")
  const [widgetXColumn, setWidgetXColumn] = useState("")
  const [widgetYColumns, setWidgetYColumns] = useState<string[]>([])

  // Load saved dashboards
  const loadDashboards = useCallback(async () => {
    try {
      const res = await fetch("/api/analysis")
      const json = await res.json()
      if (json.dashboards) {
        setSavedDashboards(json.dashboards)
      }
    } catch (e) {
      console.error("Failed to load dashboards:", e)
    }
  }, [])

  // Parse uploaded file
  const handleFileUpload = async (file: File) => {
    setError(null)
    const ext = file.name.split(".").pop()?.toLowerCase()
    if (!["csv", "json", "xlsx"].includes(ext || "")) {
      setError("Unsupported file type. Please upload CSV, JSON, or XLSX files.")
      return
    }

    setDataName(file.name.replace(/\.[^/.]+$/, ""))
    setDashboardTitle(`${dataName} Dashboard`)

    try {
      let parsedColumns: string[]
      let parsedData: Record<string, unknown>[]

      if (ext === "csv" || ext === "json") {
        const text = await file.text()
        const res = await fetch("/api/spreadsheets?action=import", {
          method: "POST",
          body: (() => {
            const fd = new FormData()
            fd.append("file", file)
            return fd
          })(),
        })
        const json = await res.json()
        parsedColumns = json.columns || []
        parsedData = json.data || []
      } else {
        const res = await fetch("/api/spreadsheets?action=import", {
          method: "POST",
          body: (() => {
            const fd = new FormData()
            fd.append("file", file)
            return fd
          })(),
        })
        const json = await res.json()
        parsedColumns = json.columns || []
        parsedData = json.data || []
      }

      setColumns(parsedColumns)
      setData(parsedData)
    } catch (e) {
      setError("Failed to parse file. Please check the file format.")
      console.error("File parse error:", e)
    }
  }

  // Run analysis
  const runAnalysis = async () => {
    if (data.length === 0) return
    setIsAnalyzing(true)
    setError(null)

    try {
      const res = await fetch("/api/analysis?action=analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          format: "json",
          content: JSON.stringify(data),
        }),
      })
      const result = await res.json()
      if (result.error) {
        setError(result.error)
      } else {
        setAnalysis(result)
      }
    } catch (e) {
      setError("Analysis failed. Please try again.")
      console.error("Analysis error:", e)
    } finally {
      setIsAnalyzing(false)
    }
  }

  // AI interpretation
  const runInterpretation = async () => {
    if (!analysis) return
    setIsInterpreting(true)
    setError(null)

    try {
      const res = await fetch("/api/analysis?action=interpret", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          analysis,
          dataName,
          dataSample: data.slice(0, 10),
        }),
      })
      const result = await res.json()
      if (result.interpretation) {
        setInterpretation(result.interpretation)
      } else {
        setError("Failed to generate interpretation")
      }
    } catch (e) {
      setError("AI interpretation failed. Please try again.")
      console.error("Interpretation error:", e)
    } finally {
      setIsInterpreting(false)
    }
  }

  // Add widget
  const addWidget = () => {
    if (!widgetXColumn || widgetYColumns.length === 0) return

    const widget: DashboardWidget = {
      id: editingWidget?.id || `widget-${Date.now()}`,
      type: widgetType,
      title: widgetTitle || `${widgetType.toUpperCase()}: ${widgetXColumn}`,
      xColumn: widgetXColumn,
      yColumns: [...widgetYColumns],
    }

    if (editingWidget) {
      setWidgets(widgets.map(w => w.id === editingWidget.id ? widget : w))
      setEditingWidget(null)
    } else {
      setWidgets([...widgets, widget])
    }

    resetWidgetForm()
  }

  const resetWidgetForm = () => {
    setWidgetType("bar")
    setWidgetTitle("")
    setWidgetXColumn("")
    setWidgetYColumns([])
    setShowWidgetForm(false)
    setEditingWidget(null)
  }

  const editWidget = (widget: DashboardWidget) => {
    setEditingWidget(widget)
    setWidgetType(widget.type)
    setWidgetTitle(widget.title)
    setWidgetXColumn(widget.xColumn || "")
    setWidgetYColumns(widget.yColumns || [])
    setShowWidgetForm(true)
  }

  const removeWidget = (id: string) => {
    setWidgets(widgets.filter(w => w.id !== id))
  }

  // Save dashboard
  const saveDashboard = async () => {
    setIsSaving(true)
    try {
      const res = await fetch("/api/analysis", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: dashboardTitle,
          dataName,
          columns,
          data,
          widgets,
        }),
      })
      const json = await res.json()
      if (json.dashboard) {
        await loadDashboards()
      }
    } catch (e) {
      console.error("Save dashboard error:", e)
    } finally {
      setIsSaving(false)
    }
  }

  // Load dashboard
  const loadDashboard = async (id: string) => {
    try {
      const res = await fetch(`/api/analysis?action=get&id=${id}`)
      const json = await res.json()
      if (json.dashboard) {
        const d = json.dashboard
        setDataName(d.dataName)
        setDashboardTitle(d.title)
        setColumns(JSON.parse(d.columns))
        setData(JSON.parse(d.data))
        setWidgets(JSON.parse(d.widgets))
        setAnalysis(null)
        setInterpretation("")
      }
    } catch (e) {
      console.error("Load dashboard error:", e)
    }
  }

  // Delete dashboard
  const deleteDashboard = async (id: string) => {
    try {
      await fetch(`/api/analysis?id=${id}`, { method: "DELETE" })
      await loadDashboards()
    } catch (e) {
      console.error("Delete dashboard error:", e)
    }
  }

  // Prepare chart data
  const getChartData = (widget: DashboardWidget) => {
    if (!data.length || !widget.xColumn) return []

    if (widget.type === "pie") {
      // Aggregate by xColumn
      const agg: Record<string, number> = {}
      const yCol = widget.yColumns?.[0]
      if (!yCol) return []
      data.forEach(row => {
        const key = String(row[widget.xColumn!])
        const val = Number(row[yCol]) || 0
        agg[key] = (agg[key] || 0) + val
      })
      return Object.entries(agg).map(([name, value]) => ({ name, value }))
    }

    if (widget.type === "area" || widget.type === "line") {
      return data.map((row, i) => {
        const item: Record<string, unknown> = { name: String(row[widget.xColumn!]) || `Row ${i + 1}` }
        widget.yColumns?.forEach(col => {
          item[col] = Number(row[col]) || 0
        })
        return item
      })
    }

    // Bar chart
    return data.slice(0, 50).map((row, i) => {
      const item: Record<string, unknown> = { name: String(row[widget.xColumn!]) || `Row ${i + 1}` }
      widget.yColumns?.forEach(col => {
        item[col] = Number(row[col]) || 0
      })
      return item
    })
  }

  // Numeric columns for widget Y axis
  const numericColumns = analysis?.columns.filter(c => c.type === "numeric").map(c => c.column) || []
  const allColumns = analysis?.columns.map(c => c.column) || columns

  return (
    <div className="flex flex-col h-full bg-zinc-50 dark:bg-zinc-900">
      {/* Top Bar */}
      <div className="flex items-center gap-2 pl-14 md:pl-16 pr-4 py-2 border-b border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800">
        <Database className="size-4 text-indigo-500" />
        <input
          value={dashboardTitle}
          onChange={e => setDashboardTitle(e.target.value)}
          className="text-sm font-medium bg-transparent border-none outline-none flex-1 text-zinc-900 dark:text-zinc-100"
          placeholder="Dashboard title"
        />
        <button
          onClick={() => {
            fileInputRef.current?.click()
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-indigo-50 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-500/30 transition-colors"
        >
          <Upload className="size-3.5" />
          Import Data
        </button>
        <button
          onClick={runAnalysis}
          disabled={data.length === 0 || isAnalyzing}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-emerald-50 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-500/30 transition-colors disabled:bg-zinc-100 dark:disabled:bg-zinc-800 disabled:text-zinc-400 disabled:cursor-not-allowed"
        >
          {isAnalyzing ? <Loader2 className="size-3.5 animate-spin" /> : <BarChart3 className="size-3.5" />}
          Analyze
        </button>
        <button
          onClick={runInterpretation}
          disabled={!analysis || isInterpreting}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-purple-50 dark:bg-purple-500/20 text-purple-600 dark:text-purple-400 hover:bg-purple-100 dark:hover:bg-purple-500/30 transition-colors disabled:bg-zinc-100 dark:disabled:bg-zinc-800 disabled:text-zinc-400 disabled:cursor-not-allowed"
        >
          {isInterpreting ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
          AI Interpret
        </button>
        <button
          onClick={saveDashboard}
          disabled={widgets.length === 0 || isSaving}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-green-50 dark:bg-green-500/20 text-green-600 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-500/30 transition-colors disabled:bg-zinc-100 dark:disabled:bg-zinc-800 disabled:text-zinc-400 disabled:cursor-not-allowed"
        >
          {isSaving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
          Save
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.json,.xlsx,.xls"
          className="hidden"
          onChange={e => {
            const file = e.target.files?.[0]
            if (file) handleFileUpload(file)
            e.target.value = ""
          }}
        />
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Main Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {error && (
            <div className="mb-4 flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 text-red-700 dark:text-red-400 text-sm">
              <AlertCircle className="size-4" />
              {error}
              <button onClick={() => setError(null)} className="ml-auto"><X className="size-3.5" /></button>
            </div>
          )}

          {/* Stats Table */}
          {analysis && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-2">Column Statistics</h3>
              <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800">
                <table className="w-full text-xs">
                  <thead className="bg-zinc-50 dark:bg-zinc-900/50">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-zinc-500">Column</th>
                      <th className="px-3 py-2 text-left font-medium text-zinc-500">Type</th>
                      <th className="px-3 py-2 text-right font-medium text-zinc-500">Count</th>
                      <th className="px-3 py-2 text-right font-medium text-zinc-500">Nulls</th>
                      <th className="px-3 py-2 text-right font-medium text-zinc-500">Unique</th>
                      <th className="px-3 py-2 text-right font-medium text-zinc-500">Mean</th>
                      <th className="px-3 py-2 text-right font-medium text-zinc-500">Median</th>
                      <th className="px-3 py-2 text-right font-medium text-zinc-500">Std Dev</th>
                      <th className="px-3 py-2 text-right font-medium text-zinc-500">Min</th>
                      <th className="px-3 py-2 text-right font-medium text-zinc-500">Max</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-700">
                    {analysis.columns.map(col => (
                      <tr key={col.column} className="hover:bg-zinc-50 dark:hover:bg-zinc-700/50">
                        <td className="px-3 py-2 font-medium text-zinc-900 dark:text-zinc-100">{col.column}</td>
                        <td className="px-3 py-2">
                          <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium ${
                            col.type === "numeric" ? "bg-blue-50 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400" :
                            col.type === "datetime" ? "bg-orange-50 dark:bg-orange-500/20 text-orange-600 dark:text-orange-400" :
                            col.type === "boolean" ? "bg-green-50 dark:bg-green-500/20 text-green-600 dark:text-green-400" :
                            "bg-zinc-100 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-400"
                          }`}>
                            {col.type}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right text-zinc-600 dark:text-zinc-400">{col.count}</td>
                        <td className="px-3 py-2 text-right text-zinc-600 dark:text-zinc-400">{col.nulls}</td>
                        <td className="px-3 py-2 text-right text-zinc-600 dark:text-zinc-400">{col.unique}</td>
                        <td className="px-3 py-2 text-right text-zinc-600 dark:text-zinc-400">{col.mean ?? "-"}</td>
                        <td className="px-3 py-2 text-right text-zinc-600 dark:text-zinc-400">{col.median ?? "-"}</td>
                        <td className="px-3 py-2 text-right text-zinc-600 dark:text-zinc-400">{col.stdDev ?? "-"}</td>
                        <td className="px-3 py-2 text-right text-zinc-600 dark:text-zinc-400">{col.min ?? "-"}</td>
                        <td className="px-3 py-2 text-right text-zinc-600 dark:text-zinc-400">{col.max ?? "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Time Series */}
          {analysis?.timeSeries && analysis.timeSeries.length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-2">Time Series Analysis</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {analysis.timeSeries.map(ts => (
                  <div key={ts.column} className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-xs font-medium text-zinc-900 dark:text-zinc-100">{ts.column}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                        ts.trend === "increasing" ? "bg-green-50 dark:bg-green-500/20 text-green-600" :
                        ts.trend === "decreasing" ? "bg-red-50 dark:bg-red-500/20 text-red-600" :
                        ts.trend === "volatile" ? "bg-orange-50 dark:bg-orange-500/20 text-orange-600" :
                        "bg-zinc-100 dark:bg-zinc-700 text-zinc-600"
                      }`}>
                        {ts.trend} ({ts.growthRate}% growth)
                      </span>
                    </div>
                    <div className="h-40">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={ts.points.slice(-30)}>
                          <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-zinc-200 dark:text-zinc-700" />
                          <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                          <YAxis tick={{ fontSize: 10 }} />
                          <Tooltip />
                          <Line type="monotone" dataKey={ts.column} stroke="#6366f1" strokeWidth={2} dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Correlations */}
          {analysis?.correlations && analysis.correlations.length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-2">Key Correlations</h3>
              <div className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-zinc-50 dark:bg-zinc-900/50">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-zinc-500">Column A</th>
                      <th className="px-3 py-2 text-left font-medium text-zinc-500">Column B</th>
                      <th className="px-3 py-2 text-right font-medium text-zinc-500">Correlation</th>
                      <th className="px-3 py-2 text-left font-medium text-zinc-500">Strength</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-700">
                    {analysis.correlations.slice(0, 10).map((c, i) => (
                      <tr key={i} className="hover:bg-zinc-50 dark:hover:bg-zinc-700/50">
                        <td className="px-3 py-2 text-zinc-900 dark:text-zinc-100">{c.colA}</td>
                        <td className="px-3 py-2 text-zinc-900 dark:text-zinc-100">{c.colB}</td>
                        <td className="px-3 py-2 text-right font-mono">{c.coefficient}</td>
                        <td className="px-3 py-2">
                          <span className={`inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium ${
                            Math.abs(c.coefficient) > 0.7 ? "bg-green-50 dark:bg-green-500/20 text-green-600" :
                            Math.abs(c.coefficient) > 0.4 ? "bg-yellow-50 dark:bg-yellow-500/20 text-yellow-600" :
                            "bg-zinc-100 dark:bg-zinc-700 text-zinc-600"
                          }`}>
                            {Math.abs(c.coefficient) > 0.7 ? "Strong" : Math.abs(c.coefficient) > 0.4 ? "Moderate" : "Weak"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* AI Interpretation */}
          {interpretation && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 mb-2 flex items-center gap-2">
                <Sparkles className="size-3.5 text-purple-500" />
                AI Interpretation
              </h3>
              <div className="rounded-lg border border-purple-200 dark:border-purple-500/30 bg-purple-50 dark:bg-purple-500/10 p-4">
                <pre className="whitespace-pre-wrap text-xs text-zinc-700 dark:text-zinc-300 font-sans leading-relaxed">
                  {interpretation}
                </pre>
              </div>
            </div>
          )}

          {/* Widgets */}
          {widgets.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Charts ({widgets.length})</h3>
                <button
                  onClick={() => {
                    resetWidgetForm()
                    setShowWidgetForm(true)
                  }}
                  className="flex items-center gap-1 px-2 py-1 text-xs rounded-md bg-indigo-50 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-500/30 transition-colors"
                >
                  <Plus className="size-3.5" />
                  Add Chart
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {widgets.map(widget => (
                  <div key={widget.id} className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        {widget.type === "bar" && <BarChart3 className="size-3.5 text-indigo-500" />}
                        {widget.type === "line" && <TrendingUp className="size-3.5 text-emerald-500" />}
                        {widget.type === "pie" && <PieChartIcon className="size-3.5 text-amber-500" />}
                        {widget.type === "area" && <AreaChart className="size-3.5 text-rose-500" />}
                        <span className="text-xs font-medium text-zinc-900 dark:text-zinc-100">{widget.title}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button onClick={() => editWidget(widget)} className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-700">
                          <TableIcon className="size-3" />
                        </button>
                        <button onClick={() => removeWidget(widget.id)} className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-700 text-red-500">
                          <Trash2 className="size-3" />
                        </button>
                      </div>
                    </div>
                    <div className="h-52">
                      <ResponsiveContainer width="100%" height="100%">
                        {widget.type === "bar" && (
                          <BarChart data={getChartData(widget)}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                            <YAxis tick={{ fontSize: 10 }} />
                            <Tooltip />
                            <Legend />
                            {widget.yColumns?.map((col, i) => (
                              <Bar key={col} dataKey={col} fill={COLORS[i % COLORS.length]} />
                            ))}
                          </BarChart>
                        )}
                        {widget.type === "line" && (
                          <LineChart data={getChartData(widget)}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                            <YAxis tick={{ fontSize: 10 }} />
                            <Tooltip />
                            <Legend />
                            {widget.yColumns?.map((col, i) => (
                              <Line key={col} type="monotone" dataKey={col} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={false} />
                            ))}
                          </LineChart>
                        )}
                        {widget.type === "pie" && (
                          <PieChart>
                            <Pie
                              data={getChartData(widget)}
                              dataKey="value"
                              nameKey="name"
                              cx="50%"
                              cy="50%"
                              outerRadius={70}
                              label
                            >
                              {getChartData(widget).map((_, i) => (
                                <Cell key={i} fill={COLORS[i % COLORS.length]} />
                              ))}
                            </Pie>
                            <Tooltip />
                          </PieChart>
                        )}
                        {widget.type === "area" && (
                          <ReAreaChart data={getChartData(widget)}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                            <YAxis tick={{ fontSize: 10 }} />
                            <Tooltip />
                            <Legend />
                            {widget.yColumns?.map((col, i) => (
                              <Area key={col} type="monotone" dataKey={col} fill={COLORS[i % COLORS.length]} stroke={COLORS[i % COLORS.length]} strokeWidth={2} />
                            ))}
                          </ReAreaChart>
                        )}
                      </ResponsiveContainer>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Empty state */}
          {!dataName && widgets.length === 0 && !analysis && (
            <div className="flex flex-col items-center justify-center h-64 text-center">
              <Database className="size-12 text-zinc-300 dark:text-zinc-600 mb-4" />
              <h3 className="text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-1">No data imported</h3>
              <p className="text-xs text-zinc-400 dark:text-zinc-500 mb-4">Upload a CSV or JSON file to get started</p>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 px-4 py-2 text-sm rounded-md bg-indigo-500 text-white hover:bg-indigo-600 transition-colors"
              >
                <Upload className="size-4" />
                Import Data
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.json,.xlsx,.xls"
                className="hidden"
                onChange={e => {
                  const file = e.target.files?.[0]
                  if (file) handleFileUpload(file)
                  e.target.value = ""
                }}
              />
            </div>
          )}
        </div>

        {/* Sidebar - Widget Form & Saved Dashboards */}
        <div className="w-72 border-l border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 overflow-y-auto">
          {/* Widget Form */}
          {showWidgetForm && (
            <div className="p-4 border-b border-zinc-200 dark:border-zinc-700">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  {editingWidget ? "Edit Chart" : "Add Chart"}
                </h4>
                <button onClick={resetWidgetForm} className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-700">
                  <X className="size-3" />
                </button>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-[10px] font-medium text-zinc-500 mb-1">Chart Type</label>
                  <div className="grid grid-cols-4 gap-1">
                    {[
                      { type: "bar" as const, icon: <BarChart3 className="size-3" />, label: "Bar" },
                      { type: "line" as const, icon: <TrendingUp className="size-3" />, label: "Line" },
                      { type: "pie" as const, icon: <PieChartIcon className="size-3" />, label: "Pie" },
                      { type: "area" as const, icon: <AreaChart className="size-3" />, label: "Area" },
                    ].map(opt => (
                      <button
                        key={opt.type}
                        onClick={() => setWidgetType(opt.type)}
                        className={`flex flex-col items-center gap-0.5 p-1.5 rounded text-[10px] transition-colors ${
                          widgetType === opt.type
                            ? "bg-indigo-50 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400"
                            : "bg-zinc-50 dark:bg-zinc-700 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-600"
                        }`}
                      >
                        {opt.icon}
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-medium text-zinc-500 mb-1">Title</label>
                  <input
                    value={widgetTitle}
                    onChange={e => setWidgetTitle(e.target.value)}
                    placeholder="Chart title"
                    className="w-full px-2 py-1 text-xs rounded border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-medium text-zinc-500 mb-1">X Axis</label>
                  <select
                    value={widgetXColumn}
                    onChange={e => setWidgetXColumn(e.target.value)}
                    className="w-full px-2 py-1 text-xs rounded border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900"
                  >
                    <option value="">Select column</option>
                    {allColumns.map(col => (
                      <option key={col} value={col}>{col}</option>
                    ))}
                  </select>
                </div>

                {widgetType !== "pie" && (
                  <div>
                    <label className="block text-[10px] font-medium text-zinc-500 mb-1">Y Axis (multiple)</label>
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {numericColumns.map(col => (
                        <label key={col} className="flex items-center gap-1.5 text-xs">
                          <input
                            type="checkbox"
                            checked={widgetYColumns.includes(col)}
                            onChange={e => {
                              if (e.target.checked) {
                                setWidgetYColumns([...widgetYColumns, col])
                              } else {
                                setWidgetYColumns(widgetYColumns.filter(c => c !== col))
                              }
                            }}
                            className="rounded border-zinc-300"
                          />
                          {col}
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {widgetType === "pie" && (
                  <div>
                    <label className="block text-[10px] font-medium text-zinc-500 mb-1">Value Column</label>
                    <select
                      value={widgetYColumns[0] || ""}
                      onChange={e => setWidgetYColumns(e.target.value ? [e.target.value] : [])}
                      className="w-full px-2 py-1 text-xs rounded border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900"
                    >
                      <option value="">Select column</option>
                      {numericColumns.map(col => (
                        <option key={col} value={col}>{col}</option>
                      ))}
                    </select>
                  </div>
                )}

                <button
                  onClick={addWidget}
                  disabled={!widgetXColumn || widgetYColumns.length === 0}
                  className="w-full px-3 py-1.5 text-xs rounded-md bg-indigo-500 text-white hover:bg-indigo-600 disabled:bg-zinc-100 dark:disabled:bg-zinc-800 disabled:text-zinc-400 disabled:cursor-not-allowed transition-colors"
                >
                  {editingWidget ? "Update Chart" : "Add Chart"}
                </button>
              </div>
            </div>
          )}

          {/* Saved Dashboards */}
          <div className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">Saved Dashboards</h4>
              <button
                onClick={loadDashboards}
                className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-700"
              >
                <FileText className="size-3" />
              </button>
            </div>
            {savedDashboards.length === 0 ? (
              <p className="text-[10px] text-zinc-400 dark:text-zinc-500">No saved dashboards</p>
            ) : (
              <div className="space-y-2">
                {savedDashboards.map(d => (
                  <div key={d.id} className="flex items-center gap-2 p-2 rounded-md border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-700/50 transition-colors">
                    <button
                      onClick={() => loadDashboard(d.id)}
                      className="flex-1 text-left"
                    >
                      <p className="text-xs font-medium text-zinc-900 dark:text-zinc-100 truncate">{d.title}</p>
                      <p className="text-[10px] text-zinc-500">{d.widgetCount} charts - {d.dataName}</p>
                    </button>
                    <button
                      onClick={() => deleteDashboard(d.id)}
                      className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-500/20 text-red-500"
                    >
                      <Trash2 className="size-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Data Info */}
          {dataName && (
            <div className="p-4 border-t border-zinc-200 dark:border-zinc-700">
              <h4 className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 mb-2">Data Info</h4>
              <div className="space-y-1 text-[10px] text-zinc-500">
                <p>Name: <span className="text-zinc-900 dark:text-zinc-100">{dataName}</span></p>
                <p>Rows: <span className="text-zinc-900 dark:text-zinc-100">{data.length}</span></p>
                <p>Columns: <span className="text-zinc-900 dark:text-zinc-100">{columns.length}</span></p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}