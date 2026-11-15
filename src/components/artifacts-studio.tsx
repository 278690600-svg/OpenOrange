"use client"

import React, { useState, useEffect, useRef } from "react"
import {
  X, Maximize2, Minimize2, Copy, Check, Download, Code2, Eye,
  RefreshCw, Sparkles, FileCode, Layers, ZoomIn, ZoomOut, RotateCcw,
  ExternalLink, Laptop, Smartphone, Tablet
} from "lucide-react"
import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"

export interface ArtifactData {
  id: string
  title: string
  type: "html" | "react" | "svg" | "mermaid" | "markdown" | "docx" | "code"
  language?: string
  content: string
  version?: number
}

interface ArtifactsStudioProps {
  artifact: ArtifactData | null
  isOpen: boolean
  onClose: () => void
  onUpdateContent?: (content: string) => void
}

export function ArtifactsStudio({ artifact, isOpen, onClose }: ArtifactsStudioProps) {
  const { t } = useI18n()
  const [activeTab, setActiveTab] = useState<"preview" | "code">("preview")
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [deviceView, setDeviceView] = useState<"desktop" | "tablet" | "mobile">("desktop")
  const [copied, setCopied] = useState(false)
  const [zoomLevel, setZoomLevel] = useState(100)
  const [iframeKey, setIframeKey] = useState(0)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    // Reset zoom and reload iframe on artifact change
    setZoomLevel(100)
    setIframeKey(prev => prev + 1)
  }, [artifact?.id, artifact?.content])

  if (!isOpen || !artifact) return null

  const handleCopy = () => {
    navigator.clipboard.writeText(artifact.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleDownload = () => {
    let ext = "txt"
    let mime = "text/plain"

    if (artifact.type === "html" || artifact.type === "react") {
      ext = "html"
      mime = "text/html"
    } else if (artifact.type === "svg") {
      ext = "svg"
      mime = "image/svg+xml"
    } else if (artifact.type === "markdown") {
      ext = "md"
      mime = "text/markdown"
    } else if (artifact.type === "docx") {
      ext = "html"
      mime = "text/html"
    }

    const blob = new Blob([artifact.content], { type: mime })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${artifact.title.replace(/[^a-zA-Z0-9_\-\u4e00-\u9fa5]/g, "_") || "artifact"}.${ext}`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Generate safe HTML bundle for iframe preview
  const generatePreviewDoc = () => {
    if (artifact.type === "svg") {
      return `<!DOCTYPE html>
<html>
<head>
  <style>
    body { margin: 0; display: flex; align-items: center; justify-content: center; min-height: 100vh; background: #09090b; color: white; overflow: auto; padding: 20px; box-sizing: border-box; }
    svg { max-width: 100%; max-height: 100%; filter: drop-shadow(0 4px 12px rgba(0,0,0,0.5)); }
  </style>
</head>
<body>
  ${artifact.content}
</body>
</html>`
    }

    if (artifact.type === "html" || artifact.type === "react" || artifact.type === "docx") {
      // Check if it already has full HTML wrapper
      if (artifact.content.includes("<html") || artifact.content.includes("<!DOCTYPE")) {
        return artifact.content
      }

      return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://unpkg.com/lucide@latest"></script>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
  </style>
</head>
<body class="bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 p-6 min-h-screen">
  ${artifact.content}
  <script>
    if (window.lucide) lucide.createIcons();
  </script>
</body>
</html>`
    }

    // Markdown or generic preview
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; line-height: 1.6; }
    pre { background: #18181b; color: #f4f4f5; padding: 16px; border-radius: 8px; overflow-x: auto; }
  </style>
</head>
<body class="bg-white dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 p-8 max-w-4xl mx-auto">
  <pre><code>${artifact.content.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</code></pre>
</body>
</html>`
  }

  const deviceWidths = {
    desktop: "w-full",
    tablet: "w-[768px]",
    mobile: "w-[375px]"
  }

  return (
    <div
      className={cn(
        "flex flex-col bg-background border-l border-border shadow-2xl transition-all duration-300 z-40 overflow-hidden",
        isFullscreen ? "fixed inset-0 z-50" : "w-[620px] lg:w-[720px] xl:w-[840px] h-full"
      )}
    >
      {/* Header Bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/40 backdrop-blur shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="size-7 rounded-lg bg-orange-500/10 text-orange-500 flex items-center justify-center shrink-0 border border-orange-500/20">
            {artifact.type === "svg" ? <Layers className="size-3.5" /> : <Sparkles className="size-3.5" />}
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-semibold truncate text-foreground flex items-center gap-2">
              {artifact.title}
              <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground border">
                {artifact.type}
              </span>
            </h3>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1.5">
          {/* Tab Switcher */}
          <div className="flex items-center bg-muted p-0.5 rounded-lg border border-border mr-1">
            <button
              onClick={() => setActiveTab("preview")}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors",
                activeTab === "preview" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Eye className="size-3.5" />
              <span>{t("Preview") || "预览"}</span>
            </button>
            <button
              onClick={() => setActiveTab("code")}
              className={cn(
                "flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors",
                activeTab === "code" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Code2 className="size-3.5" />
              <span>{t("Code") || "代码"}</span>
            </button>
          </div>

          {/* Device viewport switch (in preview mode) */}
          {activeTab === "preview" && (
            <div className="hidden sm:flex items-center bg-muted/60 p-0.5 rounded-lg border border-border mr-1">
              <button
                onClick={() => setDeviceView("desktop")}
                title="Desktop View"
                className={cn("p-1 rounded text-muted-foreground hover:text-foreground", deviceView === "desktop" && "bg-background text-foreground shadow-sm")}
              >
                <Laptop className="size-3.5" />
              </button>
              <button
                onClick={() => setDeviceView("tablet")}
                title="Tablet View"
                className={cn("p-1 rounded text-muted-foreground hover:text-foreground", deviceView === "tablet" && "bg-background text-foreground shadow-sm")}
              >
                <Tablet className="size-3.5" />
              </button>
              <button
                onClick={() => setDeviceView("mobile")}
                title="Mobile View"
                className={cn("p-1 rounded text-muted-foreground hover:text-foreground", deviceView === "mobile" && "bg-background text-foreground shadow-sm")}
              >
                <Smartphone className="size-3.5" />
              </button>
            </div>
          )}

          {/* Refresh / Copy / Download */}
          <button
            onClick={() => setIframeKey(k => k + 1)}
            title={t("Refresh Canvas") || "刷新画布"}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <RefreshCw className="size-3.5" />
          </button>
          <button
            onClick={handleCopy}
            title={t("Copy Code") || "复制代码"}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            {copied ? <Check className="size-3.5 text-emerald-500" /> : <Copy className="size-3.5" />}
          </button>
          <button
            onClick={handleDownload}
            title={t("Download File") || "下载文件"}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <Download className="size-3.5" />
          </button>

          <div className="w-px h-4 bg-border mx-1" />

          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            title={isFullscreen ? (t("Exit Fullscreen") || "退出全屏") : (t("Fullscreen Preview") || "全屏预览")}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            {isFullscreen ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
          </button>
          <button
            onClick={onClose}
            title={t("Close Canvas") || "关闭画布"}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 bg-muted/20 overflow-hidden relative flex flex-col items-center justify-center p-2 sm:p-4">
        {activeTab === "preview" ? (
          <div
            className={cn(
              "h-full rounded-xl border border-border bg-background shadow-lg overflow-hidden flex flex-col transition-all duration-300",
              deviceWidths[deviceView]
            )}
            style={{ transform: `scale(${zoomLevel / 100})`, transformOrigin: "top center" }}
          >
            <iframe
              key={iframeKey}
              ref={iframeRef}
              srcDoc={generatePreviewDoc()}
              sandbox="allow-scripts allow-same-origin allow-modals allow-forms"
              className="size-full border-none bg-background"
              title={artifact.title}
            />
          </div>
        ) : (
          <div className="size-full bg-zinc-950 text-zinc-100 rounded-xl border border-zinc-800 shadow-lg overflow-hidden flex flex-col font-mono text-xs">
            <div className="px-4 py-2 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between text-zinc-400">
              <span>{(artifact.language || artifact.type) + " " + (t("Source Code") || "源代码")}</span>
              <span>{artifact.content.split("\n").length + " " + (t("lines") || "行")}</span>
            </div>
            <div className="flex-1 overflow-auto p-4 select-text">
              <pre className="leading-relaxed">
                <code>{artifact.content}</code>
              </pre>
            </div>
          </div>
        )}

        {/* Floating Zoom Controls for Preview */}
        {activeTab === "preview" && (
          <div className="absolute bottom-4 right-4 flex items-center gap-1 bg-background/90 backdrop-blur-md border border-border px-2 py-1 rounded-full shadow-lg text-xs">
            <button
              onClick={() => setZoomLevel(z => Math.max(z - 15, 50))}
              className="p-1 text-muted-foreground hover:text-foreground"
              title={t("Zoom Out") || "缩小"}
            >
              <ZoomOut className="size-3" />
            </button>
            <span className="font-mono text-[10px] w-10 text-center font-medium">{zoomLevel}%</span>
            <button
              onClick={() => setZoomLevel(z => Math.min(z + 15, 200))}
              className="p-1 text-muted-foreground hover:text-foreground"
              title={t("Zoom In") || "放大"}
            >
              <ZoomIn className="size-3" />
            </button>
            <button
              onClick={() => setZoomLevel(100)}
              className="p-1 text-muted-foreground hover:text-foreground ml-1"
              title={t("Reset Zoom") || "重置缩放"}
            >
              <RotateCcw className="size-3" />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
