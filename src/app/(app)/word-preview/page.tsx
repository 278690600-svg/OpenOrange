"use client"

import { useState, useRef } from "react"
import { DocxPreview } from "@/components/docx-preview"
import { Upload, FileText } from "lucide-react"
import { useI18n } from "@/lib/i18n"

export default function WordPreviewPage() {
  const { t } = useI18n()
  const [fileData, setFileData] = useState<ArrayBuffer | null>(null)
  const [fileName, setFileName] = useState("")
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    const buffer = await file.arrayBuffer()
    setFileData(buffer)
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (!file) return
    if (!file.name.endsWith(".docx")) return
    setFileName(file.name)
    const buffer = await file.arrayBuffer()
    setFileData(buffer)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }

  const handleReset = () => {
    setFileData(null)
    setFileName("")
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  return (
    <div className="flex flex-col h-full bg-zinc-50 dark:bg-zinc-900">
      <div className="flex items-center justify-between pl-14 md:pl-16 pr-6 py-4 border-b border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center">
            <FileText className="size-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">{t("Word Document Preview") || "Word 文档预览"}</h1>
            <p className="text-xs text-zinc-500">{t("Upload .docx file for online preview") || "上传 .docx 文件进行在线预览"}</p>
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
          <div>
            <div className="flex items-center gap-2 mb-4 text-sm text-zinc-500">
              <FileText className="size-4" />
              <span>{fileName}</span>
            </div>
            <DocxPreview data={fileData} />
          </div>
        ) : (
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            className="border-2 border-dashed border-zinc-300 dark:border-zinc-700 rounded-2xl p-16 flex flex-col items-center justify-center gap-4 hover:border-blue-400 dark:hover:border-blue-500 transition-colors cursor-pointer"
            onClick={() => fileInputRef.current?.click()}
          >
            <div className="p-4 bg-blue-50 dark:bg-blue-500/10 rounded-2xl">
              <Upload className="size-10 text-blue-500" />
            </div>
            <div className="flex flex-col items-center gap-1">
              <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{t("Drag or click to upload .docx file") || "拖拽或点击上传 .docx 文件"}</p>
              <p className="text-xs text-zinc-400">{t("Supports Microsoft Word (.docx) format") || "支持 Microsoft Word (.docx) 格式"}</p>
            </div>
            <label className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium cursor-pointer transition-colors">
              <Upload className="size-4" />
              {t("Choose File") || "选择文件"}
              <input
                type="file"
                accept=".docx"
                className="hidden"
                ref={fileInputRef}
                onChange={handleFileChange}
              />
            </label>
          </div>
        )}
      </div>
    </div>
  )
}
