"use client"

import { useState, useCallback, useRef, useEffect } from "react"
import { AgGridReact } from "ag-grid-react"
import { ColDef, CellValueChangedEvent, GridReadyEvent } from "ag-grid-community"
import { HyperFormula } from "hyperformula"
import {
  Save, Download, Upload, Plus, Trash2, Search, Sparkles,
  Loader2, BarChart3, PieChart, TrendingUp, Table as TableIcon,
  FileText, Printer, ZoomIn, ZoomOut, X, Check, Copy,
  Undo, Redo, Filter, SortAsc, SortDesc, Columns, Eye, Settings,
  FileDown, Bold, Italic, AlignLeft, AlignCenter, AlignRight
} from "lucide-react"
import { useI18n } from "@/lib/i18n"
import { BarChart, Bar, LineChart, Line, PieChart as RePieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts"

interface CellPosition { row: number; col: number }
interface ChartConfig {
  type: 'bar' | 'line' | 'pie' | 'area'
  title: string
  xColumn: string
  yColumns: string[]
}

interface SpreadsheetData {
  id: string
  title: string
  columns: string[]
  data: Record<string, unknown>[]
  chartConfig?: ChartConfig
}

interface SpreadsheetManagerProps {
  initialData?: SpreadsheetData
  onSave?: (data: SpreadsheetData) => void
}

export function SpreadsheetManager({ initialData, onSave }: SpreadsheetManagerProps) {
  const { t } = useI18n()
  const gridRef = useRef<AgGridReact>(null)
  const hyperFormulaRef = useRef<HyperFormula | null>(null)

  const [title, setTitle] = useState(initialData?.title || t('Untitled Spreadsheet'))
  const [columns, setColumns] = useState<ColDef[]>(initialData?.columns.map((col, i) => ({
    field: col,
    headerName: col,
    editable: true,
    sortable: true,
    filter: true,
    resizable: true,
    width: 120
  })) || getDefaultColumns())
  const [rowData, setRowData] = useState<Record<string, unknown>[]>(initialData?.data || [])
  const [selectedCells, setSelectedCells] = useState<CellPosition[]>([])
  const [showChart, setShowChart] = useState(false)
  const [chartConfig, setChartConfig] = useState<ChartConfig | null>(initialData?.chartConfig || null)
  const [chartData, setChartData] = useState<Record<string, unknown>[]>([])
  const [zoom, setZoom] = useState(100)
  const [isSaving, setIsSaving] = useState(false)
  const [showFormulaBar, setShowFormulaBar] = useState(true)
  const [selectedCell, setSelectedCell] = useState<string>('')
  const [formulaValue, setFormulaValue] = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [filterModel, setFilterModel] = useState<Record<string, unknown>>({})
  const [sortModel, setSortModel] = useState<Record<string, unknown>[]>([])

  useEffect(() => {
    if (!hyperFormulaRef.current) {
      hyperFormulaRef.current = HyperFormula.buildEmpty()
    }
  }, [])

  function getDefaultColumns(): ColDef[] {
    const cols = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']
    return cols.map(col => ({
      field: col,
      headerName: col,
      editable: true,
      sortable: true,
      filter: true,
      resizable: true,
      width: 120
    }))
  }

  const handleCellChange = useCallback((event: CellValueChangedEvent) => {
    const { data, colDef } = event
    const field = colDef.field

    if (field && typeof field === 'string' && field.startsWith('=')) {
      try {
        const hf = hyperFormulaRef.current
        if (hf && event.rowIndex !== undefined && event.column) {
          // @ts-ignore - HyperFormula executeExpression exists but not in types
          const result = hf.executeExpression(field.slice(1))
          event.api.applyTransaction({
            update: [{
              ...data,
              [field]: String(result)
            }]
          })
        }
      } catch (err) {
        console.error('Formula error:', err)
      }
    }

    setRowData([...data])
  }, [])

  const addColumn = () => {
    const newCol = String.fromCharCode(65 + columns.length)
    setColumns([...columns, {
      field: newCol,
      headerName: newCol,
      editable: true,
      sortable: true,
      filter: true,
      resizable: true,
      width: 120
    }])
  }

  const addRow = () => {
    const newRow: Record<string, unknown> = {}
    columns.forEach(col => {
      if (col.field) newRow[col.field] = ''
    })
    setRowData([...rowData, newRow])
  }

  const deleteSelectedRows = () => {
    if (selectedCells.length === 0) return
    const rowsToDelete = new Set(selectedCells.map(c => c.row))
    setRowData(rowData.filter((_, i) => !rowsToDelete.has(i)))
    setSelectedCells([])
  }

  const handleSave = async () => {
    setIsSaving(true)
    try {
      if (onSave) {
        onSave({
          id: initialData?.id || Date.now().toString(),
          title,
          columns: columns.map(c => String(c.field || '')),
          data: rowData,
          chartConfig: chartConfig || undefined
        })
      }
    } catch (err) {
      console.error('Save failed:', err)
    } finally {
      setIsSaving(false)
    }
  }

  const handleExport = async (format: 'xlsx' | 'csv' | 'json') => {
    try {
      const res = await fetch('/api/spreadsheets?action=export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          columns: columns.map(c => String(c.field || '')),
          data: rowData,
          format
        })
      })
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${title}.${format}`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Export failed:', err)
    }
  }

  const handleImport = async (file: File) => {
    try {
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch('/api/spreadsheets?action=import', {
        method: 'POST',
        body: formData
      })
      const data = await res.json()
      if (data.columns && data.data) {
        setColumns(data.columns.map((col: string) => ({
          field: col,
          headerName: col,
          editable: true,
          sortable: true,
          filter: true,
          resizable: true,
          width: 120
        })))
        setRowData(data.data)
        setTitle(file.name.replace(/\.[^/.]+$/, ''))
      }
    } catch (err) {
      console.error('Import failed:', err)
    }
  }

  const generateChart = () => {
    if (rowData.length === 0 || columns.length === 0) return

    const numericCols = columns.filter(col => {
      const field = col.field as string
      return rowData.some(row => typeof row[field] === 'number')
    })

    if (numericCols.length === 0) return

    const chartData = rowData.map((row, i) => {
      const item: Record<string, unknown> = { name: `Row ${i + 1}` }
      numericCols.forEach(col => {
        if (col.field) item[col.field as string] = row[col.field as string]
      })
      return item
    })

    setChartData(chartData)
    setChartConfig({
      type: 'bar',
      title: `${title} Chart`,
      xColumn: 'name',
      yColumns: numericCols.map(c => c.field as string).slice(0, 3)
    })
    setShowChart(true)
  }

  const handleAiAnalysis = async () => {
    try {
      const res = await fetch('/api/spreadsheets?action=ai-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          columns: columns.map(c => String(c.field || '')),
          data: rowData.slice(0, 100)
        })
      })
      const data = await res.json()
      if (data.analysis) {
        alert(data.analysis)
      }
    } catch (err) {
      console.error('AI analysis failed:', err)
    }
  }

  const handlePrint = () => {
    const printWindow = window.open('', '_blank')
    if (printWindow) {
      printWindow.document.write(`
        <html>
          <head><title>${title}</title>
          <style>
            table { border-collapse: collapse; width: 100%; font-size: 12px; }
            th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
            th { background-color: #f5f5f5; font-weight: bold; }
          </style>
          </head>
          <body>
            <h2>${title}</h2>
            <table>
              <thead><tr>${columns.map(c => `<th>${c.headerName}</th>`).join('')}</tr></thead>
              <tbody>${rowData.map(row => 
                `<tr>${columns.map(c => `<td>${row[c.field as string] || ''}</td>`).join('')}</tr>`
              ).join('')}</tbody>
            </table>
          </body>
        </html>
      `)
      printWindow.document.close()
      printWindow.print()
    }
  }

  return (
    <div className="flex flex-col h-full bg-zinc-50 dark:bg-zinc-900">
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 overflow-x-auto">
        <div className="flex items-center gap-0.5">
          <ToolbarButton onClick={() => {
            const hf = hyperFormulaRef.current
            if (hf) {
              hf.undo()
            }
          }} title={t('Undo')}><Undo className="size-3.5" /></ToolbarButton>
          <ToolbarButton onClick={() => {
            const hf = hyperFormulaRef.current
            if (hf) {
              hf.redo()
            }
          }} title={t('Redo')}><Redo className="size-3.5" /></ToolbarButton>
        </div>

        <div className="w-px h-5 bg-zinc-200 dark:bg-zinc-700 mx-1" />

        <div className="flex items-center gap-0.5">
          <ToolbarButton onClick={addRow} title={t('Add Row')}><Plus className="size-3.5" /></ToolbarButton>
          <ToolbarButton onClick={addColumn} title={t('Add Column')}><Columns className="size-3.5" /></ToolbarButton>
          <ToolbarButton onClick={deleteSelectedRows} title={t('Delete Rows')}><Trash2 className="size-3.5" /></ToolbarButton>
        </div>

        <div className="w-px h-5 bg-zinc-200 dark:bg-zinc-700 mx-1" />

        <div className="flex items-center gap-0.5">
          <ToolbarButton onClick={() => setShowFormulaBar(!showFormulaBar)} title={t('Formula Bar')}><TableIcon className="size-3.5" /></ToolbarButton>
          <ToolbarButton onClick={generateChart} title={t('Generate Chart')}><BarChart3 className="size-3.5" /></ToolbarButton>
          <ToolbarButton onClick={handleAiAnalysis} className="text-purple-500" title={t('AI Analysis')}><Sparkles className="size-3.5" /></ToolbarButton>
        </div>

        <div className="flex-1" />

        <div className="flex items-center gap-0.5">
          <ToolbarButton onClick={handlePrint} title={t('Print')}><Printer className="size-3.5" /></ToolbarButton>
          
          <div className="relative group">
            <ToolbarButton title={t('Export')}><Download className="size-3.5" /></ToolbarButton>
            <div className="absolute right-0 top-full mt-1 w-24 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 shadow-lg z-50 py-1 hidden group-hover:block">
              {(['xlsx', 'csv', 'json'] as const).map(format => (
                <button key={format} onClick={() => handleExport(format)}
                  className="w-full px-3 py-1.5 text-left text-xs hover:bg-zinc-100 dark:hover:bg-zinc-700 uppercase">
                  {format}
                </button>
              ))}
            </div>
          </div>

          <label className="cursor-pointer">
            <input type="file" accept=".xlsx,.csv,.json" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleImport(f) }} />
            <ToolbarButton asChild title={t('Import')}><Upload className="size-3.5" /></ToolbarButton>
          </label>

          <ToolbarButton onClick={handleSave}
            className={isSaving ? 'text-zinc-400' : 'text-green-500'} title={t('Save')}>
            {isSaving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
          </ToolbarButton>
        </div>
      </div>

      {/* Formula Bar */}
      {showFormulaBar && (
        <div className="flex items-center gap-2 px-3 py-1.5 border-b border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800">
          <span className="text-xs font-mono text-zinc-500 w-8">{selectedCell || 'A1'}</span>
          <input
            value={formulaValue}
            onChange={e => setFormulaValue(e.target.value)}
            className="flex-1 text-xs font-mono rounded px-2 py-1 border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900"
            placeholder="=SUM(A1:A10)"
          />
        </div>
      )}

      {/* Chart Panel */}
      {showChart && chartData.length > 0 && chartConfig && (
        <div className="absolute right-4 top-20 w-96 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 shadow-lg z-50 p-4">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold">{chartConfig.title}</h4>
            <button onClick={() => setShowChart(false)} className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-700">
              <X className="size-3" />
            </button>
          </div>
          
          <div className="flex gap-2 mb-3">
            {[
              { type: 'bar', icon: <BarChart3 className="size-3" /> },
              { type: 'line', icon: <TrendingUp className="size-3" /> },
              { type: 'pie', icon: <PieChart className="size-3" /> }
            ].map(({ type, icon }) => (
              <button
                key={type}
                onClick={() => setChartConfig({ ...chartConfig, type: type as any })}
                className={`p-1.5 rounded ${chartConfig.type === type ? 'bg-indigo-100 dark:bg-indigo-500/20 text-indigo-500' : 'text-zinc-400'}`}>
                {icon}
              </button>
            ))}
          </div>

          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              {chartConfig.type === 'bar' && (
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey={chartConfig.xColumn} />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  {chartConfig.yColumns.map((col, i) => (
                    <Bar key={col} dataKey={col} fill={['#6366f1', '#10b981', '#f59e0b'][i]} />
                  ))}
                </BarChart>
              )}
              {chartConfig.type === 'line' && (
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey={chartConfig.xColumn} />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  {chartConfig.yColumns.map((col, i) => (
                    <Line key={col} type="monotone" dataKey={col} stroke={['#6366f1', '#10b981', '#f59e0b'][i]} />
                  ))}
                </LineChart>
              )}
              {chartConfig.type === 'pie' && chartConfig.yColumns.length > 0 && (
                <RePieChart>
                  <Pie data={chartData} dataKey={chartConfig.yColumns[0]} nameKey={chartConfig.xColumn} cx="50%" cy="50%" outerRadius={80} fill="#6366f1" label>
                    {chartData.map((_, i) => (
                      <Cell key={i} fill={['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'][i % 5]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </RePieChart>
              )}
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Grid */}
      <div className="flex-1 overflow-hidden" style={{ transform: `scale(${zoom / 100})`, transformOrigin: 'top left' }}>
        <AgGridReact
          ref={gridRef}
          rowData={rowData}
          columnDefs={columns}
          defaultColDef={{
            editable: true,
            sortable: true,
            filter: true,
            resizable: true,
            width: 120
          }}
          rowSelection="multiple"
          animateRows={true}
          onCellValueChanged={handleCellChange}
          onGridReady={(params: GridReadyEvent) => {
            params.api.sizeColumnsToFit()
          }}
          onSelectionChanged={(event) => {
            const selected = event.api.getSelectedRows()
            setSelectedCells(selected.map((row, i) => ({ row: i, col: 0 })))
          }}
          className="ag-theme-alpine"
        />
      </div>

      {/* Status Bar */}
      <div className="flex items-center justify-between px-4 py-1.5 border-t border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-[10px] text-zinc-500">
        <div className="flex items-center gap-3">
          <span>{rowData.length} {t('rows')} × {columns.length} {t('columns')}</span>
          <span>{rowData.flatMap(row => Object.values(row) as string[]).filter(v => v !== '' && v != null).length} {t('cells')}</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setZoom(Math.max(50, zoom - 10))} className="p-0.5 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded">
            <ZoomOut className="size-3" />
          </button>
          <span className="w-8 text-center">{zoom}%</span>
          <button onClick={() => setZoom(Math.min(200, zoom + 10))} className="p-0.5 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded">
            <ZoomIn className="size-3" />
          </button>
        </div>
      </div>
    </div>
  )
}

function ToolbarButton({ children, onClick, className, title, asChild }: {
  children: React.ReactNode
  onClick?: () => void
  className?: string
  title?: string
  asChild?: boolean
}) {
  const Comp = asChild ? 'span' : 'button'
  return (
    <Comp onClick={onClick} title={title}
      className={`p-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors text-zinc-600 dark:text-zinc-400 cursor-pointer ${className || ''}`}>
      {children}
    </Comp>
  )
}
