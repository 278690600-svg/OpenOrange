"use client"

import React, { useState, useEffect, useRef, useCallback } from "react"
import { renderAsync } from "docx-preview"
import { DocumentEditor } from "@/components/document-editor"
import mammoth from "mammoth"
import { FileText, Loader2, AlertCircle, Edit3, Eye } from "lucide-react"
import { useI18n } from "@/lib/i18n"

interface DocxPreviewProps {
  data: ArrayBuffer | Blob
  showToggle?: boolean
  onEditModeRequest?: () => void
}

export function DocxPreview({ data, showToggle = true, onEditModeRequest }: DocxPreviewProps) {
  const { t } = useI18n()
  const containerRef = useRef<HTMLDivElement>(null)
  const styleContainerRef = useRef<HTMLDivElement>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editMode, setEditMode] = useState(false)
  const [htmlContent, setHtmlContent] = useState<string | null>(null)
  const [converting, setConverting] = useState(false)

  const toggleEditMode = useCallback(async () => {
    if (!editMode && !htmlContent) {
      setConverting(true)
      try {
        const blob = data instanceof Blob ? data : new Blob([data])
        const arrayBuffer = await blob.arrayBuffer()
        const result = await mammoth.convertToHtml({ arrayBuffer })
        setHtmlContent(result.value)
      } catch (err) {
        setError(err instanceof Error ? err.message : (t("Document conversion failed") || "文档转换失败"))
      } finally {
        setConverting(false)
      }
    }
    setEditMode(!editMode)
  }, [editMode, htmlContent, data, t])

  useEffect(() => {
    if (!containerRef.current) return

    let cancelled = false

    setIsLoading(true)
    setError(null)

    renderAsync(data, containerRef.current, styleContainerRef.current ?? undefined, {
      className: "docx-preview-wrapper",
      inWrapper: true,
      ignoreWidth: false,
      ignoreHeight: false,
      ignoreFonts: false,
      breakPages: true,
      renderHeaders: true,
      renderFooters: true,
      renderFootnotes: true,
    })
      .then(() => {
        if (!cancelled) {
          setIsLoading(false)
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setIsLoading(false)
          setError(err instanceof Error ? err.message : (t("Document render failed") || "文档渲染失败"))
        }
      })

    return () => {
      cancelled = true
    }
  }, [data, t])

  if (error) {
    return (
      <div className="my-4 p-12 border-2 border-dashed border-red-200 dark:border-red-900/50 rounded-2xl flex flex-col items-center justify-center gap-4 bg-red-50/50 dark:bg-red-950/20">
        <div className="p-4 bg-red-500/10 rounded-full">
          <AlertCircle className="size-8 text-red-500" />
        </div>
        <div className="flex flex-col items-center gap-1">
          <p className="text-sm font-bold text-red-700 dark:text-red-400">{t("Document load failed") || "文档加载失败"}</p>
          <p className="text-[11px] text-red-500 dark:text-red-500">{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="my-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden shadow-2xl bg-background">
      <div className="flex items-center gap-3 px-5 py-4 bg-zinc-50/50 dark:bg-zinc-900/50 border-b border-zinc-200 dark:border-zinc-800 backdrop-blur-md">
        <div className="p-2 bg-blue-500/10 rounded-lg">
          <FileText className="size-5 text-blue-500" />
        </div>
        <span className="font-bold text-sm">{t("Word Document Preview") || "Word 文档预览"}</span>
        <div className="flex-1" />
        {showToggle && (
          <button
            onClick={onEditModeRequest || toggleEditMode}
            disabled={converting}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg transition-colors bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-500/20"
          >
            {converting ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : editMode ? (
              <Eye className="size-3.5" />
            ) : (
              <Edit3 className="size-3.5" />
            )}
            {converting ? (t("Converting...") || "转换中...") : editMode ? (t("Preview Mode") || "预览模式") : (t("Edit Mode") || "编辑模式")}
          </button>
        )}
      </div>

      {editMode && htmlContent ? (
        <div className="h-[80vh]">
          <DocumentEditor initialContent={htmlContent} />
        </div>
      ) : (
        <>
          {isLoading && (
            <div className="flex flex-col items-center justify-center gap-4 py-16 bg-zinc-50/50 dark:bg-zinc-900/50">
              <div className="p-4 bg-blue-500/10 rounded-full">
                <Loader2 className="size-8 text-blue-500 animate-spin" />
              </div>
              <div className="flex flex-col items-center gap-1">
                <p className="text-sm font-bold text-zinc-900 dark:text-zinc-100">{t("Loading document...") || "正在加载文档..."}</p>
                <p className="text-[11px] text-zinc-500">{t("Please wait, document is rendering") || "请稍候，文档正在渲染中"}</p>
              </div>
            </div>
          )}

          <div
            ref={containerRef}
            className={`docx-preview-container bg-white dark:bg-zinc-950 overflow-auto max-h-[80vh] ${isLoading ? "hidden" : ""}`}
          />
          <div ref={styleContainerRef} className="hidden" />
        </>
      )}

      <style jsx>{`
        .docx-preview-container :global(.docx-preview-wrapper) {
          background: white;
          padding: 0;
        }
        .docx-preview-container :global(.docx-wrapper) {
          background: white !important;
          padding: 16px !important;
        }
        .docx-preview-container :global(.docx-wrapper > section.docx) {
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1), 0 1px 2px rgba(0, 0, 0, 0.06) !important;
          margin-bottom: 16px !important;
        }
        .dark .docx-preview-container :global(.docx-wrapper) {
          background: #09090b !important;
        }
        .dark .docx-preview-container :global(.docx-wrapper > section.docx) {
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3), 0 1px 2px rgba(0, 0, 0, 0.2) !important;
        }
      `}</style>
    </div>
  )
}
