"use client"

import React, { useState, useEffect, useRef, useMemo } from "react"
import { useRouter } from "next/navigation"
import {
  Search, Sparkles, Bot, Command, Plus, Trash2, Sliders,
  FolderOpen, Workflow, LayoutTemplate, Presentation, ArrowRightLeft,
  ScanText, Layers, Mic, Moon, Sun, ArrowRight, CornerDownLeft
} from "lucide-react"
import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"

interface CommandItem {
  id: string
  title: string
  subtitle?: string
  icon: React.ComponentType<{ className?: string }>
  category: "actions" | "models" | "navigation" | "system"
  keywords?: string[]
  onSelect: () => void
}

export function CommandPalette() {
  const { t } = useI18n()
  const router = useRouter()
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [models, setModels] = useState<string[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  // Listen for global shortcut Ctrl+K / Cmd+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setIsOpen(prev => !prev)
      }
      if (e.key === "Escape" && isOpen) {
        setIsOpen(false)
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [isOpen])

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50)
      setQuery("")
      setSelectedIndex(0)
      // Fetch models list for quick switching
      fetch("/api/models")
        .then(res => res.json())
        .then(data => {
          if (Array.isArray(data)) {
            setModels(data.map((m: any) => m.id || m.name).slice(0, 8))
          }
        })
        .catch(() => {})
    }
  }, [isOpen])

  // Define commands list
  const commandItems: CommandItem[] = useMemo(() => {
    const items: CommandItem[] = [
      // 1. Actions
      {
        id: "new-chat",
        title: t("New Chat") || "新建对话",
        subtitle: t("Start a new AI conversation") || "开启一个新的 AI 会话",
        icon: Plus,
        category: "actions",
        keywords: ["new", "chat", "create", "对话", "新建"],
        onSelect: () => {
          router.push(`/chat/new-${Date.now()}`)
          setIsOpen(false)
        }
      },
      {
        id: "open-voice",
        title: t("Realtime Voice Studio") || "实时声波语音通话",
        subtitle: t("Start high quality voice conversation") || "开启高品质语音交互",
        icon: Mic,
        category: "actions",
        keywords: ["voice", "audio", "speech", "语音", "通话"],
        onSelect: () => {
          window.dispatchEvent(new CustomEvent("open-voice-studio"))
          setIsOpen(false)
        }
      },
      {
        id: "open-settings",
        title: t("Settings") || "全局系统设置",
        subtitle: t("Manage models, API keys, and appearance") || "管理大模型、API Key、搜索引擎与外观",
        icon: Sliders,
        category: "actions",
        keywords: ["settings", "config", "key", "设置", "配置"],
        onSelect: () => {
          window.dispatchEvent(new CustomEvent("open-settings-dialog"))
          setIsOpen(false)
        }
      },

      // 2. Navigation
      {
        id: "nav-plugins",
        title: t("Plugin Marketplace") || "插件市场",
        subtitle: t("Browse and install extension plugins") || "浏览与安装精选扩展插件",
        icon: Layers,
        category: "navigation",
        keywords: ["plugin", "market", "store", "插件", "市场"],
        onSelect: () => {
          router.push("/plugins")
          setIsOpen(false)
        }
      },
      {
        id: "nav-notes",
        title: t("Notes & Knowledge Graph") || "知识笔记与图谱",
        subtitle: t("Bidirectional notes and local knowledge") || "双向链接笔记与本地知识沉淀",
        icon: FolderOpen,
        category: "navigation",
        keywords: ["note", "notes", "graph", "笔记", "知识库"],
        onSelect: () => {
          router.push("/notes")
          setIsOpen(false)
        }
      },
      {
        id: "nav-workflows",
        title: t("Workflow Designer") || "工作流设计器",
        subtitle: t("Visual flowchart orchestration and automation") || "可视化流程图编排与自动化批处理",
        icon: Workflow,
        category: "navigation",
        keywords: ["workflow", "flow", "工作流", "流程"],
        onSelect: () => {
          router.push("/workflows")
          setIsOpen(false)
        }
      },
      {
        id: "nav-templates",
        title: t("Template Center") || "模板中心",
        subtitle: t("PPT, Word, Excel and system prompt templates") || "PPT、Word、Excel 与专业系统提示词模板",
        icon: LayoutTemplate,
        category: "navigation",
        keywords: ["template", "prompt", "模板", "提示词"],
        onSelect: () => {
          router.push("/templates")
          setIsOpen(false)
        }
      },
      {
        id: "nav-presentations",
        title: t("Presentations Workbench") || "演示文稿工作台",
        subtitle: t("AI slide typesetting and PPTX export") || "AI 幻灯片排版与 PPTX 导出",
        icon: Presentation,
        category: "navigation",
        keywords: ["ppt", "presentation", "slide", "演示文稿"],
        onSelect: () => {
          router.push("/presentations")
          setIsOpen(false)
        }
      },
      {
        id: "nav-convert",
        title: t("Convert Center") || "格式转换中心",
        subtitle: t("PDF / Word / Markdown multi-format converter") || "PDF / Word / Markdown 多格式相互转换",
        icon: ArrowRightLeft,
        category: "navigation",
        keywords: ["convert", "format", "转换", "格式"],
        onSelect: () => {
          router.push("/convert")
          setIsOpen(false)
        }
      },
      {
        id: "nav-ocr",
        title: t("OCR Text Recognition") || "OCR 文字识别",
        subtitle: t("High accuracy text extraction from images") || "从图像中高精度提取文本内容",
        icon: ScanText,
        category: "navigation",
        keywords: ["ocr", "image", "extract", "文字识别"],
        onSelect: () => {
          router.push("/ocr")
          setIsOpen(false)
        }
      }
    ]

    // Add dynamic models
    for (const modelId of models) {
      items.push({
        id: `model-${modelId}`,
        title: `${t("Switch Model") || "切换模型"}: ${modelId}`,
        subtitle: t("Switch active inference model immediately") || "将当前会话推理大模型即时切换",
        icon: Bot,
        category: "models",
        keywords: ["model", "llm", "switch", modelId, "模型"],
        onSelect: () => {
          window.dispatchEvent(new CustomEvent("switch-active-model", { detail: { modelId } }))
          setIsOpen(false)
        }
      })
    }

    return items
  }, [t, router, models])

  // Filter commands by search query
  const filteredCommands = useMemo(() => {
    if (!query.trim()) return commandItems
    const q = query.toLowerCase().trim()
    return commandItems.filter(item => {
      return (
        item.title.toLowerCase().includes(q) ||
        (item.subtitle && item.subtitle.toLowerCase().includes(q)) ||
        (item.keywords && item.keywords.some(k => k.toLowerCase().includes(q)))
      )
    })
  }, [commandItems, query])

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setSelectedIndex(prev => (prev + 1) % Math.max(filteredCommands.length, 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setSelectedIndex(prev => (prev - 1 + filteredCommands.length) % Math.max(filteredCommands.length, 1))
    } else if (e.key === "Enter" && filteredCommands[selectedIndex]) {
      e.preventDefault()
      filteredCommands[selectedIndex].onSelect()
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] p-4 bg-zinc-950/60 backdrop-blur-md animate-in fade-in duration-150">
      {/* Backdrop click to close */}
      <div className="fixed inset-0" onClick={() => setIsOpen(false)} />

      {/* Modal Dialog */}
      <div
        className="relative w-full max-w-2xl bg-background/95 backdrop-blur-xl border border-border shadow-2xl rounded-2xl overflow-hidden flex flex-col max-h-[70vh] z-10 animate-in zoom-in-95 duration-150"
        onKeyDown={handleKeyDown}
      >
        {/* Search Input Bar */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-border/60">
          <Search className="size-5 text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => {
              setQuery(e.target.value)
              setSelectedIndex(0)
            }}
            placeholder={t("Search actions, models, pages, tools...") || "搜索动作、模型、页面、工具... (或输入 @, /, >)"}
            className="flex-1 bg-transparent text-foreground placeholder:text-muted-foreground outline-none text-sm font-medium"
          />
          <kbd className="hidden sm:inline-flex items-center gap-0.5 px-2 py-0.5 text-[10px] font-mono rounded bg-muted text-muted-foreground border border-border">
            ESC
          </kbd>
        </div>

        {/* List of Results */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1 divide-y divide-border/20">
          {filteredCommands.length > 0 ? (
            filteredCommands.map((cmd, idx) => {
              const Icon = cmd.icon
              const isSelected = idx === selectedIndex
              return (
                <div
                  key={cmd.id}
                  onClick={() => cmd.onSelect()}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={cn(
                    "flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer transition-all text-left group",
                    isSelected
                      ? "bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20"
                      : "text-foreground hover:bg-muted/60"
                  )}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={cn(
                        "size-8 rounded-lg flex items-center justify-center shrink-0 transition-colors border",
                        isSelected
                          ? "bg-orange-500 text-white border-orange-600 shadow-sm"
                          : "bg-muted text-muted-foreground border-border"
                      )}
                    >
                      <Icon className="size-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold truncate leading-snug">{cmd.title}</div>
                      {cmd.subtitle && (
                        <div className="text-[11px] text-muted-foreground truncate">{cmd.subtitle}</div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 ml-2">
                    {isSelected && (
                      <span className="flex items-center gap-1 text-[11px] font-mono text-orange-500">
                        <span>{t("Execute") || "执行"}</span>
                        <CornerDownLeft className="size-3" />
                      </span>
                    )}
                  </div>
                </div>
              )
            })
          ) : (
            <div className="py-12 text-center text-muted-foreground text-sm flex flex-col items-center gap-2">
              <Command className="size-6 text-muted-foreground/50" />
              <span>{t("No matching commands or models found") || "未找到相关指令或模型"}</span>
            </div>
          )}
        </div>

        {/* Footer Hint */}
        <div className="px-4 py-2 border-t border-border/40 bg-muted/30 flex items-center justify-between text-[11px] text-muted-foreground">
          <div className="flex items-center gap-3">
            <span>↑↓ 切换</span>
            <span>↵ 确认执行</span>
          </div>
          <span className="font-mono">OpenOrangeAI Palette</span>
        </div>
      </div>
    </div>
  )
}
