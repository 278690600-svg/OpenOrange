"use client"

import React, { useState, useRef, useEffect } from "react"
import {
  Share2, Download, Copy, Check, X, Image as ImageIcon,
  Sparkles, Bot, User, Loader2
} from "lucide-react"
import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"

interface ChatShareDialogProps {
  isOpen: boolean
  onClose: () => void
  chatTitle: string
  messages: Array<{ role: string; content: string }>
}

export function ChatShareDialog({
  isOpen,
  onClose,
  chatTitle,
  messages
}: ChatShareDialogProps) {
  const { t } = useI18n()
  const [isGenerating, setIsGenerating] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!isOpen || messages.length === 0) return

    setIsGenerating(true)
    const generateImage = () => {
      const canvas = document.createElement("canvas")
      const ctx = canvas.getContext("2d")
      if (!ctx) return

      const width = 800
      const padding = 40
      const contentWidth = width - padding * 2

      // Pre-calculate heights
      ctx.font = "bold 22px -apple-system, BlinkMacSystemFont, sans-serif"
      const titleLines = wrapText(ctx, chatTitle || "AI 智能对话研报", contentWidth)

      ctx.font = "14px -apple-system, BlinkMacSystemFont, sans-serif"
      const renderedMessages: Array<{ role: string; lines: string[]; height: number }> = []

      let totalHeight = 180 + titleLines.length * 30 // Header space

      const validMessages = messages.slice(0, 10) // Render up to 10 key messages
      for (const msg of validMessages) {
        const text = typeof msg.content === "string" ? msg.content.replace(/```[\s\S]*?```/g, "[代码块/生成文档]") : String(msg.content)
        const lines = wrapText(ctx, text, contentWidth - 40)
        const cardHeight = Math.max(lines.length * 22 + 40, 60)
        renderedMessages.push({ role: msg.role, lines, height: cardHeight })
        totalHeight += cardHeight + 20
      }

      totalHeight += 100 // Footer space

      canvas.width = width
      canvas.height = totalHeight

      // 1. Background gradient
      const bgGrad = ctx.createLinearGradient(0, 0, width, totalHeight)
      bgGrad.addColorStop(0, "#09090b")
      bgGrad.addColorStop(0.5, "#18181b")
      bgGrad.addColorStop(1, "#09090b")
      ctx.fillStyle = bgGrad
      ctx.fillRect(0, 0, width, totalHeight)

      // 2. Header Brand
      ctx.fillStyle = "#f97316"
      ctx.font = "bold 16px -apple-system, BlinkMacSystemFont, sans-serif"
      ctx.fillText("OpenOrangeAI · 智能对话精选", padding, 50)

      ctx.fillStyle = "#ffffff"
      ctx.font = "bold 24px -apple-system, BlinkMacSystemFont, sans-serif"
      let currentY = 90
      for (const line of titleLines) {
        ctx.fillText(line, padding, currentY)
        currentY += 32
      }

      ctx.strokeStyle = "rgba(255, 255, 255, 0.1)"
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(padding, currentY + 15)
      ctx.lineTo(width - padding, currentY + 15)
      ctx.stroke()

      currentY += 40

      // 3. Render Message Cards
      for (const msg of renderedMessages) {
        const isUser = msg.role === "user"
        const cardY = currentY
        const cardH = msg.height

        // Card background
        ctx.fillStyle = isUser ? "rgba(249, 115, 22, 0.12)" : "rgba(255, 255, 255, 0.05)"
        ctx.strokeStyle = isUser ? "rgba(249, 115, 22, 0.3)" : "rgba(255, 255, 255, 0.1)"
        roundRect(ctx, padding, cardY, contentWidth, cardH, 12)
        ctx.fill()
        ctx.stroke()

        // Avatar & role tag
        ctx.fillStyle = isUser ? "#fb923c" : "#a1a1aa"
        ctx.font = "bold 12px -apple-system, BlinkMacSystemFont, sans-serif"
        ctx.fillText(isUser ? "👤 您" : "🤖 OpenOrangeAI", padding + 16, cardY + 24)

        // Text lines
        ctx.fillStyle = "#e4e4e7"
        ctx.font = "14px -apple-system, BlinkMacSystemFont, sans-serif"
        let textY = cardY + 48
        for (const line of msg.lines) {
          ctx.fillText(line, padding + 16, textY)
          textY += 22
        }

        currentY += cardH + 20
      }

      // 4. Footer
      currentY += 20
      ctx.fillStyle = "rgba(255, 255, 255, 0.4)"
      ctx.font = "12px -apple-system, BlinkMacSystemFont, sans-serif"
      ctx.fillText(`由 OpenOrangeAI 深度引擎生成 · ${new Date().toLocaleDateString()}`, padding, currentY)

      const dataUrl = canvas.toDataURL("image/png")
      setPreviewUrl(dataUrl)
      setIsGenerating(false)
    }

    generateImage()
  }, [isOpen, chatTitle, messages])

  function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
    const lines: string[] = []
    const paragraphs = text.split("\n")

    for (const para of paragraphs) {
      if (!para) {
        lines.push("")
        continue
      }
      let currentLine = ""
      for (let i = 0; i < para.length; i++) {
        const char = para[i]
        const testLine = currentLine + char
        const metrics = ctx.measureText(testLine)
        if (metrics.width > maxWidth && i > 0) {
          lines.push(currentLine)
          currentLine = char
        } else {
          currentLine = testLine
        }
      }
      if (currentLine) lines.push(currentLine)
    }

    return lines
  }

  function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
    ctx.beginPath()
    ctx.moveTo(x + r, y)
    ctx.arcTo(x + w, y, x + w, y + h, r)
    ctx.arcTo(x + w, y + h, x, y + h, r)
    ctx.arcTo(x, y + h, x, y, r)
    ctx.arcTo(x, y, x + w, y, r)
    ctx.closePath()
  }

  const handleDownload = () => {
    if (!previewUrl) return
    const a = document.createElement("a")
    a.href = previewUrl
    a.download = `${chatTitle.replace(/[^a-zA-Z0-9_\-\u4e00-\u9fa5]/g, "_") || "chat_share"}.png`
    a.click()
  }

  const handleCopyImage = async () => {
    if (!previewUrl) return
    try {
      const res = await fetch(previewUrl)
      const blob = await res.blob()
      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": blob })
      ])
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      handleDownload()
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/80 backdrop-blur-xl animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-zinc-900 border border-zinc-800 shadow-2xl rounded-3xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-800 bg-zinc-950/40">
          <div className="flex items-center gap-2 text-zinc-100">
            <ImageIcon className="size-5 text-orange-500" />
            <span className="font-semibold text-sm">{t("Generate Social Share Card") || "生成精美对话长图"}</span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Preview Area */}
        <div className="flex-1 overflow-y-auto p-6 flex flex-col items-center justify-center bg-zinc-950/80">
          {isGenerating ? (
            <div className="flex flex-col items-center gap-3 py-16 text-zinc-400">
              <Loader2 className="size-8 animate-spin text-orange-500" />
              <span className="text-xs">{t("Rendering high-definition card...") || "正在光栅化渲染高清卡片..."}</span>
            </div>
          ) : previewUrl ? (
            <div className="rounded-xl overflow-hidden border border-zinc-800 shadow-2xl max-w-full max-h-[500px] overflow-y-auto">
              <img src={previewUrl} alt="Chat Long Image Preview" className="w-full object-contain" />
            </div>
          ) : null}
        </div>

        {/* Action Controls Footer */}
        <div className="px-6 py-4 border-t border-zinc-800 bg-zinc-950/40 flex items-center justify-between">
          <span className="text-xs text-zinc-500">{t("Ultra HD 2x Resolution · Ideal for Social Sharing") || "超清 2x 分辨率 · 适于社交平台分享"}</span>
          <div className="flex items-center gap-3">
            <button
              onClick={handleCopyImage}
              disabled={isGenerating || !previewUrl}
              className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-medium flex items-center gap-2 transition-colors"
            >
              {copied ? <Check className="size-4 text-emerald-400" /> : <Copy className="size-4" />}
              <span>{copied ? (t("Copied!") || "已复制长图") : (t("Copy Image") || "复制长图")}</span>
            </button>
            <button
              onClick={handleDownload}
              disabled={isGenerating || !previewUrl}
              className="px-5 py-2 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-xs font-semibold flex items-center gap-2 shadow-lg transition-colors"
            >
              <Download className="size-4" />
              <span>{t("Download PNG") || "下载高清 PNG"}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
