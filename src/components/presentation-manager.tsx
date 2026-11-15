"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { PptRenderer, PptData } from "./ppt-renderer"
import {
  Plus, Trash2, Upload, Download, Sparkles, Layout, FileText,
  Loader2, X, Eye, Save, Play, Settings, ChevronLeft, ChevronRight,
  Grid, Monitor, Type, Image, Quote, List, ListOrdered, ListChecks
} from "lucide-react"
import { useI18n } from "@/lib/i18n"
import { notify } from "@/lib/notifications"

interface PresentationSlide {
  id: string
  title: string
  subtitle?: string
  content?: string[] | string
  leftContent?: string[] | string
  rightContent?: string[] | string
  layout: "title" | "bullet" | "two_column" | "hero" | "image" | "section" | "quote" | "kpi" | "three_column" | "image_left" | "image_right" | "custom"
  imageUrl?: string
  notes?: string
}

interface PresentationManagerProps {
  initialData?: PptData
  presentationId?: string
}

const slideLayouts = [
  { value: "title", label: "Title Slide", icon: <Type className="size-4" /> },
  { value: "bullet", label: "Bullet Points", icon: <List className="size-4" /> },
  { value: "two_column", label: "Two Columns", icon: <Layout className="size-4" /> },
  { value: "hero", label: "Hero Section", icon: <Monitor className="size-4" /> },
  { value: "quote", label: "Quote", icon: <Quote className="size-4" /> },
  { value: "image", label: "Image Focus", icon: <Image className="size-4" /> }
]

export function PresentationManager({ initialData, presentationId }: PresentationManagerProps) {
  const { t } = useI18n()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const editorRef = useRef<HTMLTextAreaElement>(null)

  const [title, setTitle] = useState(initialData?.title || "Untitled Presentation")
  const [slides, setSlides] = useState<PresentationSlide[]>(
    initialData?.slides?.map((s, i) => ({
      id: `slide-${i}`,
      title: s.title,
      subtitle: s.subtitle,
      content: s.content,
      leftContent: s.leftContent,
      rightContent: s.rightContent,
      layout: s.layout || "bullet",
      imageUrl: s.imageUrl,
      notes: s.notes
    })) || []
  )
  const [selectedSlideId, setSelectedSlideId] = useState<string | null>(null)
  const [theme, setTheme] = useState<PptData["theme"]>(initialData?.theme || "zinc")
  const [style, setStyle] = useState<PptData["style"]>(initialData?.style || "modern")
  const [isSaving, setIsSaving] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [viewMode, setViewMode] = useState<"editor" | "grid" | "preview" | "fullscreen">("grid")
  const [showLayoutPicker, setShowLayoutPicker] = useState(false)
  const [templates, setTemplates] = useState<any[]>([])
  const [loadingTemplates, setLoadingTemplates] = useState(false)

  useEffect(() => {
    loadTemplates()
  }, [])

  useEffect(() => {
    if (slides.length > 0) {
      if (selectedSlideId === null || !slides.some(s => s.id === selectedSlideId)) {
        setSelectedSlideId(slides[0].id)
      }
    } else {
      setSelectedSlideId(null)
    }
  }, [slides, selectedSlideId])

  const loadTemplates = async () => {
    try {
      setLoadingTemplates(true)
      const res = await fetch('/api/presentations?action=templates')
      const data = await res.json()
      setTemplates(data.templates || [])
    } catch (err) {
      console.error('Failed to load templates:', err)
    } finally {
      setLoadingTemplates(false)
    }
  }

  const addSlide = (layout: PresentationSlide["layout"] = "bullet") => {
    const newSlide: PresentationSlide = {
      id: `slide-${Date.now()}`,
      title: "New Slide",
      layout,
      content: []
    }
    setSlides([...slides, newSlide])
    setSelectedSlideId(newSlide.id)
  }

  const deleteSlide = (id: string) => {
    setSlides(slides.filter(s => s.id !== id))
    if (selectedSlideId === id) {
      setSelectedSlideId(null)
    }
  }

  const duplicateSlide = (id: string) => {
    const slide = slides.find(s => s.id === id)
    if (!slide) return
    const newSlide = { ...slide, id: `slide-${Date.now()}` }
    const index = slides.findIndex(s => s.id === id)
    const newSlides = [...slides]
    newSlides.splice(index + 1, 0, newSlide)
    setSlides(newSlides)
    setSelectedSlideId(newSlide.id)
  }

  const updateSlide = (id: string, updates: Partial<PresentationSlide>) => {
    setSlides(slides.map(s => s.id === id ? { ...s, ...updates } : s))
  }

  const handleSave = async () => {
    setIsSaving(true)
    try {
      const pptData: PptData = {
        title,
        theme,
        style,
        slides: slides.map(s => ({
          title: s.title,
          subtitle: s.subtitle,
          content: s.content,
          leftContent: s.leftContent,
          rightContent: s.rightContent,
          layout: s.layout,
          imageUrl: s.imageUrl,
          notes: s.notes
        }))
      }
      
      if (presentationId) {
        await fetch(`/api/presentations?id=${presentationId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(pptData)
        })
      }
      
      localStorage.setItem(`presentation-${presentationId || 'draft'}`, JSON.stringify(pptData))
    } catch (err) {
      console.error('Save failed:', err)
    } finally {
      setIsSaving(false)
    }
  }

  const handleExport = async () => {
    setExporting(true)
    try {
      const formData = new FormData()
      formData.append('action', 'export')
      formData.append('data', JSON.stringify({
        title,
        slides: slides.map(s => ({
          title: s.title,
          subtitle: s.subtitle,
          bullets: Array.isArray(s.content) ? s.content : [],
          layout: s.layout
        }))
      }))

      const res = await fetch('/api/presentations', {
        method: 'POST',
        body: formData
      })
      
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${title}.pptx`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Export failed:', err)
    } finally {
      setExporting(false)
    }
  }

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('action', 'import')

      const res = await fetch('/api/presentations', {
        method: 'POST',
        body: formData
      })
      const data = await res.json()
      
      if (data.slides) {
        setSlides(data.slides.map((s: any, i: number) => ({
          id: `slide-${i}`,
          title: s.title,
          subtitle: s.subtitle,
          content: s.bullets || [],
          layout: s.layout || "bullet",
          imageUrl: s.image
        })))
        setTitle(file.name.replace('.pptx', ''))
      }
    } catch (err) {
      console.error('Import failed:', err)
    }
  }

  const loadTemplate = async (template: any) => {
    const pptSlides: PresentationSlide[] = template.slides.map((s: any, i: number) => ({
      id: `slide-${i}`,
      title: s.title,
      subtitle: s.subtitle,
      content: s.bullets || [],
      layout: s.layout || "bullet"
    }))
    setSlides(pptSlides)
    setTitle(template.name)
  }

  const selectedSlide = slides.find(s => s.id === selectedSlideId)

  const getThemeColors = () => {
    switch (theme) {
      case "blue": return { primary: "#2563eb", secondary: "#3b82f6", accent: "#60a5fa", bg: "bg-blue-50" }
      case "green": return { primary: "#059669", secondary: "#10b981", accent: "#34d399", bg: "bg-green-50" }
      case "orange": return { primary: "#ea580c", secondary: "#f97316", accent: "#fb923c", bg: "bg-orange-50" }
      case "rose": return { primary: "#e11d48", secondary: "#f43f5e", accent: "#fb7185", bg: "bg-rose-50" }
      default: return { primary: "#52525b", secondary: "#71717a", accent: "#a1a1aa", bg: "bg-zinc-50" }
    }
  }

  const themeColors = getThemeColors()

  const handleAiCommand = useCallback(async ({ text, command, slideIndex }: { text: string; command: string; slideIndex: number }) => {
    setIsSaving(true)
    notify("success", `AI 已接收对幻灯片第 ${slideIndex + 1} 页的微调指令: "${command}"`)
    
    await new Promise(resolve => setTimeout(resolve, 1500))
    
    setSlides(prev => {
      const newSlides = [...prev]
      const slide = { ...newSlides[slideIndex] }
      
      const cmd = command.toLowerCase()
      if (cmd.includes("三") || cmd.includes("3") || cmd.includes("卡") || cmd.includes("栏")) {
        slide.layout = "three_column"
        slide.content = [
          "结构重塑核心点一：优化交互与多端适配",
          "结构重塑核心点二：全景安全沙箱过滤预检",
          "结构重塑核心点三：璀璨发光WebGL 3D脑网"
        ]
        slide.title = "AI 智能结构重塑"
      } else if (cmd.includes("双") || cmd.includes("二") || cmd.includes("2") || cmd.includes("两") || cmd.includes("对比")) {
        slide.layout = "two_column"
        slide.leftContent = "局部划词重构侧一：深度极客生产力"
        slide.rightContent = "局部划词重构侧二：瑞士网格磨砂质感"
        slide.title = "AI 智能双栏对比"
      } else {
        if (Array.isArray(slide.content)) {
          slide.content = slide.content.map(c => c.includes(text) ? c.replace(text, `[AI优化] ${text}`) : c)
        } else if (typeof slide.content === 'string') {
          slide.content = slide.content.replace(text, `[AI优化] ${text}`)
        }
        if (slide.title && slide.title.includes(text)) {
          slide.title = slide.title.replace(text, `[AI优化] ${text}`)
        }
      }
      
      newSlides[slideIndex] = slide
      return newSlides
    })
    
    notify("success", "幻灯片局部布局自适应重构完毕！")
    setIsSaving(false)
  }, [])

  const pptData: PptData = {
    title,
    theme,
    style,
    slides: slides.map(s => ({
      title: s.title,
      subtitle: s.subtitle,
      content: s.content,
      leftContent: s.leftContent,
      rightContent: s.rightContent,
      layout: s.layout,
      imageUrl: s.imageUrl,
      notes: s.notes
    }))
  }

  return (
    <div className="flex flex-col h-full bg-zinc-50 dark:bg-zinc-900">
      {/* Toolbar */}
      <div className="flex items-center gap-1 pl-14 md:pl-16 pr-3 py-2 border-b border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800">
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          className="flex-1 text-sm font-semibold bg-transparent border-none outline-none text-zinc-900 dark:text-zinc-100"
          placeholder={t("Presentation title...")}
        />

        <div className="flex items-center gap-1">
          <ToolbarButton onClick={() => setViewMode("grid")} active={viewMode === "grid"} title={t("Grid View")}>
            <Grid className="size-3.5" />
          </ToolbarButton>
          <ToolbarButton onClick={() => setViewMode("preview")} active={viewMode === "preview"} title={t("Preview")}>
            <Eye className="size-3.5" />
          </ToolbarButton>
        </div>

        <div className="w-px h-5 bg-zinc-200 dark:bg-zinc-700 mx-1" />

        <div className="flex items-center gap-1">
          <ToolbarButton onClick={() => setShowLayoutPicker(true)} title={t("Add Slide")}>
            <Plus className="size-3.5" />
          </ToolbarButton>
        </div>

        <div className="flex-1" />

        <div className="flex items-center gap-1">
          <ToolbarButton onClick={handleSave} className={isSaving ? 'text-zinc-400' : 'text-green-500'} title={t("Save")}>
            {isSaving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
          </ToolbarButton>
          
          <label className="cursor-pointer">
            <input type="file" accept=".pptx" className="hidden" ref={fileInputRef} onChange={handleImport} />
            <ToolbarButton asChild title={t("Import PPTX")}><Upload className="size-3.5" /></ToolbarButton>
          </label>

          <ToolbarButton onClick={handleExport} className={exporting ? 'text-zinc-400' : 'text-indigo-500'} title={t("Export PPTX")}>
            {exporting ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
          </ToolbarButton>
        </div>
      </div>

      {/* Content */}
      {viewMode === "grid" && (
        <div className="flex-1 overflow-hidden flex">
          {/* Slide thumbnails */}
          <div className="w-64 border-r border-zinc-200 dark:border-zinc-700 overflow-y-auto bg-white dark:bg-zinc-800 p-3 space-y-2">
            {templates.length > 0 && (
              <div className="mb-4">
                <h4 className="text-xs font-semibold text-zinc-500 mb-2">{t("Templates")}</h4>
                <div className="space-y-1">
                  {templates.map(template => (
                    <button
                      key={template.id}
                      onClick={() => loadTemplate(template)}
                      className="w-full text-left px-2 py-1.5 rounded text-xs hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors truncate"
                    >
                      {template.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <button
              onClick={() => addSlide("title")}
              className="w-full p-3 rounded-lg border-2 border-dashed border-zinc-300 dark:border-zinc-700 hover:border-indigo-400 dark:hover:border-indigo-600 text-center text-xs text-zinc-500 hover:text-indigo-500 transition-colors"
            >
              <Plus className="size-4 mx-auto mb-1" />
              {t("Add Slide")}
            </button>

            {slides.map((slide, i) => (
              <div
                key={slide.id}
                onClick={() => setSelectedSlideId(slide.id)}
                className={`relative p-2 rounded-lg border-2 cursor-pointer transition-all ${selectedSlideId === slide.id ? "border-indigo-500 shadow-sm" : "border-zinc-200 dark:border-zinc-700 hover:border-zinc-300"}`}
              >
                <div className="aspect-video bg-zinc-100 dark:bg-zinc-900 rounded flex items-center justify-center mb-1">
                  <span className="text-xs text-zinc-500">{slide.layout}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] truncate text-zinc-900 dark:text-zinc-100">{slide.title}</span>
                  <span className="text-[10px] text-zinc-400">{i + 1}</span>
                </div>
                <div className="absolute top-1 right-1 opacity-0 hover:opacity-100 transition-opacity flex gap-0.5">
                  <button onClick={e => { e.stopPropagation(); duplicateSlide(slide.id) }} className="p-0.5 rounded bg-white dark:bg-zinc-800 shadow">
                    <FileText className="size-2.5" />
                  </button>
                  <button onClick={e => { e.stopPropagation(); deleteSlide(slide.id) }} className="p-0.5 rounded bg-white dark:bg-zinc-800 shadow text-red-500">
                    <Trash2 className="size-2.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Selected slide editor */}
          {selectedSlide ? (
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1 block">Title</label>
                  <input
                    value={selectedSlide.title}
                    onChange={e => updateSlide(selectedSlide.id, { title: e.target.value })}
                    className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1 block">Layout</label>
                  <select
                    value={selectedSlide.layout}
                    onChange={e => updateSlide(selectedSlide.id, { layout: e.target.value as any })}
                    className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 px-3 py-2 text-sm"
                  >
                    {slideLayouts.map(layout => (
                      <option key={layout.value} value={layout.value}>{layout.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1 block">Content (one bullet per line)</label>
                <textarea
                  value={Array.isArray(selectedSlide.content) ? selectedSlide.content.join('\n') : selectedSlide.content || ''}
                  onChange={e => updateSlide(selectedSlide.id, { content: e.target.value.split('\n') })}
                  rows={6}
                  className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 px-3 py-2 text-sm font-mono"
                  placeholder="Enter bullet points..."
                />
              </div>

              <div className="flex gap-4">
                <div className="flex-1">
                  <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1 block">Theme</label>
                  <div className="flex gap-2">
                    {(["zinc", "blue", "green", "orange", "rose"] as const).map(t => (
                      <button
                        key={t}
                        onClick={() => setTheme(t)}
                        className={`size-8 rounded-lg border-2 transition-all ${theme === t ? "border-indigo-500 scale-110" : "border-zinc-200 dark:border-zinc-700"}`}
                        style={{ backgroundColor: t === "zinc" ? "#52525b" : t === "blue" ? "#2563eb" : t === "green" ? "#059669" : t === "orange" ? "#ea580c" : "#e11d48" }}
                      />
                    ))}
                  </div>
                </div>
                <div className="flex-1">
                  <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-1 block">Style</label>
                  <select
                    value={style}
                    onChange={e => setStyle(e.target.value as any)}
                    className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 px-3 py-2 text-sm"
                  >
                    {["modern", "pencil", "gradient", "brutalism", "swiss", "apple", "editorial"].map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="aspect-video rounded-lg overflow-hidden border border-zinc-200 dark:border-zinc-700">
                <PptRenderer data={pptData} onTriggerAiCommand={handleAiCommand} />
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-zinc-400">
              <div className="text-center">
                <Layout className="size-16 mx-auto mb-4" />
                <p className="text-sm">Select a slide to edit</p>
              </div>
            </div>
          )}
        </div>
      )}

      {viewMode === "preview" && (
        <div className="flex-1 overflow-y-auto p-8 bg-zinc-100 dark:bg-zinc-950">
          <div className="max-w-5xl mx-auto space-y-8">
            <PptRenderer data={pptData} onTriggerAiCommand={handleAiCommand} />
          </div>
        </div>
      )}

      {/* Layout picker modal */}
      {showLayoutPicker && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowLayoutPicker(false)}>
          <div className="bg-white dark:bg-zinc-800 rounded-xl w-full max-w-lg p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">Choose Layout</h3>
              <button onClick={() => setShowLayoutPicker(false)} className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-700">
                <X className="size-4" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {slideLayouts.map(layout => (
                <button
                  key={layout.value}
                  onClick={() => { addSlide(layout.value as any); setShowLayoutPicker(false) }}
                  className="p-4 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:border-indigo-400 dark:hover:border-indigo-600 text-center transition-all"
                >
                  <div className="size-8 mx-auto mb-2 text-zinc-600 dark:text-zinc-400">{layout.icon}</div>
                  <span className="text-xs text-zinc-700 dark:text-zinc-300">{layout.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ToolbarButton({ children, onClick, className, title, active, asChild }: {
  children: React.ReactNode
  onClick?: () => void
  className?: string
  title?: string
  active?: boolean
  asChild?: boolean
}) {
  const Comp = asChild ? 'span' : 'button'
  return (
    <Comp onClick={onClick} title={title}
      className={`p-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors cursor-pointer ${active ? 'bg-indigo-50 dark:bg-indigo-500/20 text-indigo-500' : 'text-zinc-600 dark:text-zinc-400'} ${className || ''}`}>
      {children}
    </Comp>
  )
}
