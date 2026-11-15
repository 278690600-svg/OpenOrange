"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import * as XLSX from "xlsx"
import { AgGridReact, AgGridProvider } from "ag-grid-react"
import { ColDef, GridReadyEvent, AllCommunityModule } from "ag-grid-community"
import { Loader2, AlertCircle, FileSpreadsheet, FileDown } from "lucide-react"
import { useTheme } from "@/components/theme-provider"

import "ag-grid-community/styles/ag-grid.css"
import "ag-grid-community/styles/ag-theme-alpine.css"

interface ExcelPreviewProps {
  data: ArrayBuffer
  fileName?: string
}

interface SheetData {
  name: string
  columns: ColDef[]
  rowData: Record<string, unknown>[]
}

export function ExcelPreview({ data, fileName }: ExcelPreviewProps) {
  const { resolvedMode } = useTheme()
  const isDark = resolvedMode === "dark"
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sheets, setSheets] = useState<SheetData[]>([])
  const [activeSheet, setActiveSheet] = useState(0)
  const [gridApi, setGridApi] = useState<GridReadyEvent['api'] | null>(null)

  useEffect(() => {
    try {
      setLoading(true)
      setError(null)

      let wb: XLSX.WorkBook | null = null
      try {
        wb = XLSX.read(data)
      } catch (readErr) {
        // Fallback: If standard binary read fails, check if the data is a Text/JSON/CSV string encoded inside the ArrayBuffer
        try {
          const text = new TextDecoder('utf-8').decode(data).trim()
          
          // 1. Try parsing as JSON
          try {
            const json = JSON.parse(text)
            wb = XLSX.utils.book_new()
            
            // Case A: { sheets: [ { name: 'xxx', headers: [...], rows: [[...]] } ] }
            if (json && json.sheets && Array.isArray(json.sheets)) {
              json.sheets.forEach((sheet: any) => {
                const name = sheet.name || 'Sheet'
                const headers = sheet.headers || []
                const rows = sheet.rows || []
                const allData = [headers, ...rows]
                const ws = XLSX.utils.aoa_to_sheet(allData)
                if (wb) XLSX.utils.book_append_sheet(wb, ws, name)
              })
            } 
            // Case B: [ { Col1: val, Col2: val } ]
            else if (Array.isArray(json)) {
              const ws = XLSX.utils.json_to_sheet(json)
              if (wb) XLSX.utils.book_append_sheet(wb, ws, "Sheet1")
            }
            // Case C: { Col1: val }
            else if (typeof json === 'object') {
              const ws = XLSX.utils.json_to_sheet([json])
              if (wb) XLSX.utils.book_append_sheet(wb, ws, "Sheet1")
            }
          } catch {
            // 2. Try parsing as CSV/TSV
            const lines = text.split('\n')
              .map(line => line.trim())
              .filter(line => line.length > 0)
            
            if (lines.length > 0) {
              const firstLine = lines[0] || ''
              const delimiter = firstLine.includes('\t') ? '\t' : ','
              const allData = lines.map(line => {
                return line.split(delimiter).map(cell => cell.replace(/^"(.*)"$/, '$1').trim())
              })
              wb = XLSX.utils.book_new()
              const ws = XLSX.utils.aoa_to_sheet(allData)
              if (wb) XLSX.utils.book_append_sheet(wb, ws, "Sheet1")
            } else {
              throw readErr
            }
          }
        } catch {
          throw readErr
        }
      }

      if (!wb || wb.SheetNames.length === 0) {
        throw new Error("No worksheets found in this workbook")
      }

      const parsedSheets: SheetData[] = wb.SheetNames.map(name => {
        const ws = wb.Sheets[name]
        const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1 })

        if (rows.length === 0) {
          return { name, columns: [], rowData: [] }
        }

        const headerRow = rows[0] as unknown[]
        const columns: ColDef[] = headerRow.map((header, i) => ({
          field: `col_${i}`,
          headerName: header != null ? String(header) : `Column ${i + 1}`,
          sortable: true,
          filter: true,
          resizable: true,
          editable: true,
          width: 150
        }))

        const rowData = rows.slice(1).map(row => {
          const item: Record<string, unknown> = {}
          headerRow.forEach((_, i) => {
            item[`col_${i}`] = (row as unknown[])[i] ?? ""
          })
          return item
        })

        return { name, columns, rowData }
      })

      setSheets(parsedSheets)
      setActiveSheet(0)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to parse Excel file")
    } finally {
      setLoading(false)
    }
  }, [data])

  const currentSheet = sheets[activeSheet]

  const handleCellValueChanged = useCallback((params: { data: Record<string, unknown>; colDef: { field?: string }; newValue: unknown }) => {
    setSheets(prev => prev.map((sheet, i) => {
      if (i !== activeSheet) return sheet
      return {
        ...sheet,
        rowData: sheet.rowData.map(row =>
          row === params.data
            ? { ...row, [params.colDef.field || '']: params.newValue }
            : row
        )
      }
    }))
  }, [activeSheet])

  const handleExport = useCallback(() => {
    if (!gridApi || sheets.length === 0) return

    const wb = XLSX.utils.book_new()
    sheets.forEach((sheet) => {
      const headers = sheet.columns.map(col => col.headerName || '')
      const rows = sheet.rowData.map(row => sheet.columns.map(col => row[col.field || ''] ?? ''))
      const allData = [headers, ...rows]
      const ws = XLSX.utils.aoa_to_sheet(allData)
      XLSX.utils.book_append_sheet(wb, ws, sheet.name)
    })

    const exportName = fileName
      ? `${fileName.replace(/\.[^/.]+$/, "")}_edited.xlsx`
      : 'edited_spreadsheet.xlsx'
    XLSX.writeFile(wb, exportName)
  }, [gridApi, sheets, fileName])

  const totalRows = useMemo(() => {
    return currentSheet?.rowData.length ?? 0
  }, [currentSheet])

  const totalCols = useMemo(() => {
    return currentSheet?.columns.length ?? 0
  }, [currentSheet])

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-zinc-50 dark:bg-zinc-900 gap-3">
        <Loader2 className="size-8 text-indigo-500 animate-spin" />
        <span className="text-sm text-zinc-500">Loading Excel file...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-zinc-50 dark:bg-zinc-900 gap-3">
        <AlertCircle className="size-8 text-red-500" />
        <span className="text-sm text-red-500">{error}</span>
      </div>
    )
  }

  if (sheets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full bg-zinc-50 dark:bg-zinc-900 gap-3">
        <FileSpreadsheet className="size-8 text-zinc-400" />
        <span className="text-sm text-zinc-500">No data found in this file</span>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-zinc-50 dark:bg-zinc-900">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800">
        <FileSpreadsheet className="size-4 text-indigo-500" />
        <span className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
          {currentSheet?.name}
        </span>
        <button
          onClick={handleExport}
          className="ml-auto flex items-center gap-1 px-2 py-0.5 text-[10px] rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 transition-colors"
        >
          <FileDown className="size-3" />
          导出 xlsx
        </button>
        <span className="text-[10px] text-zinc-400">
          {totalRows} rows × {totalCols} columns
        </span>
      </div>

      <div className="flex-1 overflow-hidden w-full h-full">
        <AgGridProvider modules={[AllCommunityModule]}>
          <div className={`w-full h-full ${isDark ? "ag-theme-alpine-dark" : "ag-theme-alpine"}`}>
            <AgGridReact
              rowData={currentSheet?.rowData ?? []}
              columnDefs={currentSheet?.columns ?? []}
              defaultColDef={{
                sortable: true,
                filter: true,
                resizable: true,
                editable: true,
                width: 150
              }}
              animateRows={true}
              onCellValueChanged={handleCellValueChanged}
              onGridReady={(params: GridReadyEvent) => {
                params.api.sizeColumnsToFit()
                setGridApi(params.api)
              }}
            />
          </div>
        </AgGridProvider>
      </div>

      {sheets.length > 1 && (
        <div className="flex items-center gap-1 px-2 py-1.5 border-t border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 overflow-x-auto">
          {sheets.map((sheet, index) => (
            <button
              key={sheet.name}
              onClick={() => setActiveSheet(index)}
              className={`px-3 py-1 text-xs rounded-md whitespace-nowrap transition-colors ${
                index === activeSheet
                  ? "bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 font-medium"
                  : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-700"
              }`}
            >
              {sheet.name}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
