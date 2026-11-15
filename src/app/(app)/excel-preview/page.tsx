"use client"

import { useState, useRef } from "react"
import { ExcelPreview } from "@/components/excel-preview"
import { Upload, FileSpreadsheet, Loader2 } from "lucide-react"
import { useI18n } from "@/lib/i18n"
import { notify } from "@/lib/notifications"

export default function ExcelPreviewPage() {
  const { t } = useI18n()
  const [fileData, setFileData] = useState<ArrayBuffer | null>(null)
  const [fileName, setFileName] = useState("")
  const [isDragging, setIsDragging] = useState(false)
  const [isReading, setIsReading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const isValidExcelFile = (name: string) => {
    return /\.(xlsx|xls|csv)$/i.test(name)
  }

  const processFile = async (file: File) => {
    if (!isValidExcelFile(file.name)) {
      notify("warning", t("Please upload a valid Excel or CSV file (.xlsx, .xls, .csv)") || "请上传格式为 .xlsx, .xls 或 .csv 的表格文件")
      return
    }

    try {
      setIsReading(true)
      const buffer = await file.arrayBuffer()
      setFileName(file.name)
      setFileData(buffer)
    } catch (err) {
      console.error("Failed to read file buffer:", err)
      notify("error", t("Failed to read file") || "读取文件失败，请重试")
    } finally {
      setIsReading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    processFile(file)
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (!file) return
    processFile(file)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!isDragging) setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragging(false)
    }
  }

  const handleReset = () => {
    setFileData(null)
    setFileName("")
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  return (
    <div className="flex flex-col h-full bg-zinc-50 dark:bg-zinc-900">
      <input
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        ref={fileInputRef}
        onChange={handleFileChange}
      />

      <div className="flex items-center justify-between pl-14 md:pl-16 pr-6 py-4 border-b border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl bg-emerald-100 dark:bg-emerald-500/20 flex items-center justify-center">
            <FileSpreadsheet className="size-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">{t("Excel Spreadsheet Preview") || "Excel 表格预览"}</h1>
            <p className="text-xs text-zinc-500">{t("Upload Excel or CSV file for online preview") || "上传 Excel (.xlsx, .xls) 或 CSV 文件进行在线预览"}</p>
          </div>
        </div>
        {fileData && (
          <button
            onClick={handleReset}
            className="px-4 py-2 text-sm font-medium rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors"
          >
            {t("Re-upload") || "重新上传"}
          </button>
        )}
      </div>

      <div className="flex-1 overflow-auto p-6">
        {fileData ? (
          <div className="h-full flex flex-col">
            <div className="flex items-center gap-2 mb-4 text-sm text-zinc-500">
              <FileSpreadsheet className="size-4 text-emerald-600 dark:text-emerald-400" />
              <span className="font-medium text-zinc-700 dark:text-zinc-200">{fileName}</span>
            </div>
            <div className="flex-1 min-h-0 border border-zinc-200 dark:border-zinc-700 rounded-xl overflow-hidden bg-white dark:bg-zinc-800 shadow-sm">
              <ExcelPreview data={fileData} fileName={fileName} />
            </div>
          </div>
        ) : (
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-16 flex flex-col items-center justify-center gap-4 transition-all cursor-pointer h-full max-h-[560px] ${
              isDragging
                ? "border-emerald-500 bg-emerald-500/10 scale-[1.005] shadow-md"
                : "border-zinc-300 dark:border-zinc-700 hover:border-emerald-400 dark:hover:border-emerald-500 bg-white dark:bg-zinc-800/60"
            }`}
          >
            {isReading ? (
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="size-10 text-emerald-500 animate-spin" />
                <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{t("Reading file...") || "正在读取文件..."}</p>
              </div>
            ) : (
              <>
                <div className="p-4 bg-emerald-50 dark:bg-emerald-500/10 rounded-2xl transition-transform group-hover:scale-105">
                  <Upload className="size-10 text-emerald-500" />
                </div>
                <div className="flex flex-col items-center gap-1">
                  <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                    {t("Drag or click to upload Excel file") || "拖拽或点击上传 Excel / CSV 文件"}
                  </p>
                  <p className="text-xs text-zinc-400">
                    {t("Supports .xlsx, .xls, .csv formats") || "支持 Microsoft Excel (.xlsx, .xls) 及 CSV 格式"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    fileInputRef.current?.click()
                  }}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-sm font-medium transition-colors shadow-sm"
                >
                  <Upload className="size-4" />
                  {t("Choose File") || "选择文件"}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
