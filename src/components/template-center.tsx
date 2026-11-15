"use client"

import { useState, useEffect } from "react"
import {
  Layout, Sparkles, Search, Plus, Upload, Eye, Copy, Trash2,
  Loader2, FileText, MessageSquare, Presentation, Table,
  Filter, Grid, Star, Download, Upload as UploadIcon,
  X, ArrowUp, ArrowDown, ChevronLeft, ChevronRight
} from "lucide-react"
import { useI18n } from "@/lib/i18n"

interface Template {
  id: string
  name: string
  description: string
  category: 'document' | 'spreadsheet' | 'presentation' | 'conversation'
  icon: string
  preview?: string
  isSystem: boolean
  usageCount: number
  rating?: number
  createdAt: string
  variables?: string[]
}

export function TemplateCenter() {
  const { t } = useI18n()
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [showPreview, setShowPreview] = useState<string | null>(null)
  const [previewSlideIdx, setPreviewSlideIdx] = useState<number>(0)

  const handleOpenPreview = (templateId: string) => {
    setPreviewSlideIdx(0)
    setShowPreview(templateId)
  }

  const activeTemplate = showPreview ? templates.find(t => t.id === showPreview) : null
  const previewSlides = (activeTemplate as any)?.slides || []
  const currentSlide = previewSlides[previewSlideIdx]

  // Upload Custom PPT Template State
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [uploadName, setUploadName] = useState('')
  const [uploadDesc, setUploadDesc] = useState('')
  const [uploadSlides, setUploadSlides] = useState('[\n  { "title": "自定义幻灯片标题", "subtitle": "副标题", "layout": "title" },\n  { "title": "内容要点", "bullets": ["要点一", "要点二", "要点三"], "layout": "content" },\n  { "title": "名言引用", "layout": "quote" }\n]')
  const [uploadError, setUploadError] = useState('')
  const [uploadLoading, setUploadLoading] = useState(false)

  // Visual Wizard Mode State
  const [activeUploadTab, setActiveUploadTab] = useState<'wizard' | 'json' | 'xml'>('wizard')
  const [xmlImportLoading, setXmlImportLoading] = useState(false)
  const [xmlSuccessMsg, setXmlSuccessMsg] = useState('')

  interface WizardSlide {
    id: string
    layout: 'title' | 'content' | 'quote'
    title: string
    subtitle?: string
    bullets?: string[]
  }
  const [wizardSlides, setWizardSlides] = useState<WizardSlide[]>([
    { id: '1', layout: 'title', title: '自定义幻灯片标题', subtitle: '副标题' },
    { id: '2', layout: 'content', title: '内容要点', bullets: ['要点一', '要点二', '要点三'] },
    { id: '3', layout: 'quote', title: '名言引用', subtitle: '作者/来源' }
  ])

  const handleXmlImport = async (file: File) => {
    if (!file) return
    if (!file.name.endsWith('.xml')) {
      setUploadError('仅支持导入 PowerPoint Flat OPC XML 格式的 .xml 文件')
      return
    }

    try {
      setXmlImportLoading(true)
      setUploadError('')
      setXmlSuccessMsg('')

      const formData = new FormData()
      formData.append('action', 'upload-xml-file')
      formData.append('file', file)
      formData.append('name', uploadName || file.name.replace('.xml', ''))
      formData.append('description', uploadDesc || '从本地 XML 一键智能导入的 PPT 模板')

      const res = await fetch('/api/presentations', {
        method: 'POST',
        body: formData
      })
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || '导入失败')
      }

      if (data.template && data.template.slides) {
        const mapped = data.template.slides.map((s: any, idx: number) => ({
          id: Math.random().toString(36).substr(2, 9) + '-' + idx,
          layout: s.layout,
          title: s.title || '',
          subtitle: s.subtitle || '',
          bullets: s.bullets || []
        }))
        setWizardSlides(mapped)
        setUploadName(data.template.name)
        setUploadDesc(data.template.description)
        setXmlSuccessMsg(`一键导入解析成功！已成功创建 PPT 自定义模板“${data.template.name}”（共 ${mapped.length} 页）。大纲已同步至“可视化向导 Tab”，您可以切换过去进行微调。`)
      }

      await loadTemplates()
    } catch (err: any) {
      setUploadError(err.message || '导入解析失败，请检查文件格式是否正确')
    } finally {
      setXmlImportLoading(false)
    }
  }

  const addWizardSlide = () => {
    const newSlide: WizardSlide = {
      id: Math.random().toString(36).substr(2, 9),
      layout: 'content',
      title: '新幻灯片页',
      bullets: ['新要点']
    }
    setWizardSlides([...wizardSlides, newSlide])
  }

  const deleteWizardSlide = (id: string) => {
    if (wizardSlides.length <= 1) {
      setUploadError('至少需要保留一页幻灯片')
      return
    }
    setUploadError('')
    setWizardSlides(wizardSlides.filter(s => s.id !== id))
  }

  const moveWizardSlide = (index: number, direction: 'up' | 'down') => {
    const newSlides = [...wizardSlides]
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= newSlides.length) return
    const temp = newSlides[index]
    newSlides[index] = newSlides[targetIndex]
    newSlides[targetIndex] = temp
    setWizardSlides(newSlides)
  }

  const updateSlideField = (id: string, field: string, value: any) => {
    setWizardSlides(wizardSlides.map(s => {
      if (s.id === id) {
        return { ...s, [field]: value }
      }
      return s
    }))
  }

  const updateSlideBullet = (slideId: string, bulletIndex: number, value: string) => {
    setWizardSlides(wizardSlides.map(s => {
      if (s.id === slideId) {
        const newBullets = [...(s.bullets || [])]
        newBullets[bulletIndex] = value
        return { ...s, bullets: newBullets }
      }
      return s
    }))
  }

  const addSlideBullet = (slideId: string) => {
    setWizardSlides(wizardSlides.map(s => {
      if (s.id === slideId) {
        return { ...s, bullets: [...(s.bullets || []), '新要点'] }
      }
      return s
    }))
  }

  const deleteSlideBullet = (slideId: string, bulletIndex: number) => {
    setWizardSlides(wizardSlides.map(s => {
      if (s.id === slideId) {
        return { ...s, bullets: (s.bullets || []).filter((_, i) => i !== bulletIndex) }
      }
      return s
    }))
  }

  useEffect(() => {
    loadTemplates()
  }, [])

  const loadTemplates = async () => {
    try {
      setLoading(true)
      
      const [docRes, convRes, presRes] = await Promise.all([
        fetch('/api/templates?action=list-templates'),
        fetch('/api/conversation-templates'),
        fetch('/api/presentations?action=templates')
      ])

      const [docData, convData, presData] = await Promise.all([
        docRes.json(),
        convRes.json(),
        presRes.json()
      ])

      const allTemplates: Template[] = [
        ...(docData.templates || []).map((t: any) => ({ ...t, category: t.category || 'document' })),
        ...(convData.templates || []).map((t: any) => ({ ...t, category: 'conversation' as const })),
        ...(presData.templates || []).map((t: any) => ({ ...t, category: 'presentation' as const }))
      ]

      const uniqueTemplatesMap = new Map<string, Template>()
      allTemplates.forEach(t => {
        uniqueTemplatesMap.set(t.id + '-' + t.category, t)
      })

      setTemplates(Array.from(uniqueTemplatesMap.values()))
    } catch (err) {
      console.error('Failed to load templates:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleUploadTemplate = async () => {
    if (!uploadName.trim()) {
      setUploadError('请输入模板名称')
      return
    }

    let finalSlidesStr = ''
    if (activeUploadTab === 'wizard') {
      const formatted = wizardSlides.map(s => {
        const slideItem: any = { layout: s.layout, title: s.title }
        if (s.layout === 'title' || s.layout === 'quote') {
          slideItem.subtitle = s.subtitle || ''
        } else if (s.layout === 'content') {
          slideItem.bullets = s.bullets || []
        }
        return slideItem
      })
      finalSlidesStr = JSON.stringify(formatted, null, 2)
    } else {
      finalSlidesStr = uploadSlides
    }

    try {
      const parsed = JSON.parse(finalSlidesStr)
      if (!Array.isArray(parsed)) {
        setUploadError('幻灯片数据必须是 JSON 数组')
        return
      }
    } catch {
      setUploadError('幻灯片数据必须是合法的 JSON 格式')
      return
    }

    try {
      setUploadLoading(true)
      setUploadError('')
      
      let endpoint = '/api/presentations'
      const formData = new FormData()
      
      if (selectedCategory === 'presentation') {
        formData.append('action', 'upload-template')
        formData.append('name', uploadName)
        formData.append('description', uploadDesc)
        formData.append('slides', finalSlidesStr)
      } else {
        endpoint = '/api/templates?action=create-template'
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: selectedCategory !== 'presentation' ? { 'Content-Type': 'application/json' } : undefined,
        body: selectedCategory !== 'presentation' ? JSON.stringify({
          name: uploadName,
          description: uploadDesc,
          systemPrompt: finalSlidesStr,
          category: selectedCategory,
          icon: selectedCategory === 'document' ? 'FileText' : 'Table'
        }) : formData
      })
      const data = await res.json()
      
      if (!res.ok) {
        throw new Error(data.error || '上传失败')
      }

      setUploadName('')
      setUploadDesc('')
      setUploadSlides('[\n  { "title": "自定义幻灯片标题", "subtitle": "副标题", "layout": "title" },\n  { "title": "内容要点", "bullets": ["要点一", "要点二", "要点三"], "layout": "content" },\n  { "title": "名言引用", "layout": "quote" }\n]')
      setWizardSlides([
        { id: '1', layout: 'title', title: '自定义幻灯片标题', subtitle: '副标题' },
        { id: '2', layout: 'content', title: '内容要点', bullets: ['要点一', '要点二', '要点三'] },
        { id: '3', layout: 'quote', title: '名言引用', subtitle: '作者/来源' }
      ])
      setShowUploadModal(false)
      await loadTemplates()
    } catch (err: any) {
      setUploadError(err.message || '上传失败，请重试')
    } finally {
      setUploadLoading(false)
    }
  }

  const handleDeleteTemplate = async (templateId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    e.preventDefault()
    if (!confirm('确定要删除此自定义 PPT 模板吗？')) return

    try {
      const formData = new FormData()
      formData.append('action', 'delete-template')
      formData.append('templateId', templateId)

      const res = await fetch('/api/presentations', {
        method: 'POST',
        body: formData
      })
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || '删除失败')
      }

      await loadTemplates()
    } catch (err: any) {
      alert(err.message || '删除失败，请重试')
    }
  }

  const categories = [
    { value: 'all', label: 'All', icon: <Grid className="size-3.5" />, count: templates.length },
    { value: 'document', label: 'Documents', icon: <FileText className="size-3.5" />, count: templates.filter(t => t.category === 'document').length },
    { value: 'conversation', label: 'Conversations', icon: <MessageSquare className="size-3.5" />, count: templates.filter(t => t.category === 'conversation').length },
    { value: 'presentation', label: 'Presentations', icon: <Presentation className="size-3.5" />, count: templates.filter(t => t.category === 'presentation').length },
    { value: 'spreadsheet', label: 'Spreadsheets', icon: <Table className="size-3.5" />, count: templates.filter(t => t.category === 'spreadsheet').length }
  ]

  const filtered = templates.filter(t => {
    const matchCategory = selectedCategory === 'all' || t.category === selectedCategory
    const matchSearch = !searchQuery || 
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.description?.toLowerCase().includes(searchQuery.toLowerCase())
    return matchCategory && matchSearch
  })

  const handleUseTemplate = async (template: Template) => {
    try {
      let endpoint = '/api/templates'
      let body: any = { action: 'use', templateId: template.id }

      if (template.category === 'conversation') {
        endpoint = '/api/conversation-templates'
        body = { action: 'create-from-template', templateId: template.id }
      } else if (template.category === 'presentation') {
        endpoint = '/api/presentations'
        body = { action: 'use-template', templateId: template.id }
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })

      const data = await res.json()
      if (data.redirect) {
        window.location.href = data.redirect
      }
    } catch (err) {
      console.error('Failed to use template:', err)
    }
  }

  return (
    <div className="flex flex-col h-full bg-zinc-50 dark:bg-zinc-900">
      {/* Header */}
      <div className="flex items-center justify-between pl-14 md:pl-16 pr-6 py-4 border-b border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl bg-indigo-100 dark:bg-indigo-500/20 flex items-center justify-center">
            <Layout className="size-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">{t("Template Center")}</h1>
            <p className="text-xs text-zinc-500">{t("Browse and use templates")}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {['presentation', 'document', 'spreadsheet'].includes(selectedCategory) && (
            <button
              onClick={() => {
                if (selectedCategory !== 'presentation') {
                  setActiveUploadTab('json')
                  setUploadSlides(selectedCategory === 'document' ? '<h1>标题</h1>\n<p>内容...</p>' : '{"sheets": [{"name": "Sheet1", "headers": ["A", "B"], "rows": [["1", "2"]]}]}')
                }
                setShowUploadModal(true)
              }}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition-colors shrink-0 shadow-sm"
            >
              <Plus className="size-3.5" />
              {t(selectedCategory === 'presentation' ? "Upload PPT Template" : selectedCategory === 'document' ? "Create Word Template" : "Create Excel Template")}
            </button>
          )}

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-zinc-400" />
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder={t("Search templates...")}
              className="pl-9 pr-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/40 w-64"
            />
          </div>

          <div className="flex items-center gap-1 bg-zinc-100 dark:bg-zinc-700 rounded-lg p-1">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded ${viewMode === 'grid' ? 'bg-white dark:bg-zinc-600 shadow-sm' : ''}`}
            >
              <Grid className="size-3.5" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-1.5 rounded ${viewMode === 'list' ? 'bg-white dark:bg-zinc-600 shadow-sm' : ''}`}
            >
              <Filter className="size-3.5" />
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Category Sidebar */}
        <div className="w-56 border-r border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 p-4 space-y-1">
          {categories.map(cat => (
            <button
              key={cat.value}
              onClick={() => setSelectedCategory(cat.value)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${selectedCategory === cat.value ? 'bg-indigo-50 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400' : 'text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700'}`}
            >
              {cat.icon}
              <span className="flex-1 text-left">{cat.label}</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-700">{cat.count}</span>
            </button>
          ))}
        </div>

        {/* Templates Grid */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="size-8 animate-spin text-zinc-400" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-zinc-400">
              <Layout className="size-16 mb-4" />
              <p className="text-sm">{t("No templates found")}</p>
            </div>
          ) : (
            <div className={viewMode === 'grid' ? 'grid grid-cols-2 lg:grid-cols-3 gap-4' : 'space-y-3'}>
              {filtered.map(template => (
                <div
                  key={template.id + '-' + template.category}
                  className="group rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 overflow-hidden hover:border-indigo-300 dark:hover:border-indigo-700 transition-all hover:shadow-md"
                >
                  <div className="aspect-video bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-500/10 dark:to-purple-500/10 p-4 flex items-center justify-center relative">
                    <div className="size-16 rounded-xl bg-white dark:bg-zinc-800 shadow-sm flex items-center justify-center">
                      {template.category === 'document' && <FileText className="size-6 text-blue-500" />}
                      {template.category === 'conversation' && <MessageSquare className="size-6 text-green-500" />}
                      {template.category === 'presentation' && <Presentation className="size-6 text-orange-500" />}
                      {template.category === 'spreadsheet' && <Table className="size-6 text-emerald-500" />}
                    </div>

                    {!template.isSystem && template.category === 'presentation' && (
                      <button
                        onClick={(e) => handleDeleteTemplate(template.id, e)}
                        className="absolute top-2 right-2 p-1.5 rounded-lg bg-white/80 dark:bg-zinc-800/80 hover:bg-red-50 dark:hover:bg-red-950/20 text-zinc-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all shadow-sm border border-zinc-200/50 dark:border-zinc-700/50"
                        title={t("Delete Template")}
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 line-clamp-1">{template.name}</h3>
                      {template.isSystem ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 shrink-0">System</span>
                      ) : (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 shrink-0">Custom</span>
                      )}
                    </div>
                    <p className="text-xs text-zinc-500 line-clamp-2 mb-3 h-8">{template.description}</p>

                    <div className="flex items-center justify-between text-[10px] text-zinc-400 mb-3">
                      <span>{template.usageCount || 0} {t("uses")}</span>
                      {template.rating && (
                        <div className="flex items-center gap-0.5">
                          <Star className="size-2.5 fill-yellow-400 text-yellow-400" />
                          <span>{template.rating.toFixed(1)}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleUseTemplate(template)}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium transition-colors"
                      >
                        <Sparkles className="size-3" />
                        {t("Use Template")}
                      </button>
                      <button 
                        onClick={() => handleOpenPreview(template.id)}
                        className="p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-700 text-zinc-500 hover:text-indigo-600 transition-colors shadow-sm"
                        title={t("Preview Template")}
                      >
                        <Eye className="size-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Preview Modal */}
      {showPreview && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 backdrop-blur-sm p-8 animate-in fade-in duration-200" onClick={() => setShowPreview(null)}>
          <div className="relative bg-white dark:bg-zinc-900 rounded-2xl w-full max-w-5xl h-[85vh] overflow-hidden shadow-2xl flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 shrink-0">
              <h3 className="font-bold text-lg">{templates.find(t => t.id === showPreview)?.name}</h3>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    const tpl = templates.find(t => t.id === showPreview)
                    if (tpl) { handleUseTemplate(tpl) }
                  }}
                  className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  <Sparkles className="size-4" />
                  {t("Use Template")}
                </button>
                <button onClick={() => setShowPreview(null)} className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 transition-colors">
                  <X className="size-5" />
                </button>
              </div>
            </div>
            <div className="flex-1 p-6 bg-zinc-100 dark:bg-zinc-950 overflow-y-auto">
              <div className="max-w-3xl mx-auto space-y-6">
                {activeTemplate?.category === 'presentation' ? (
                  <div className="space-y-4">
                    {/* PPT Preview Screen */}
                    <div className="aspect-video bg-zinc-950 rounded-2xl shadow-2xl border border-zinc-800 flex items-center justify-center relative overflow-hidden group/preview">
                      {/* Left navigation arrow */}
                      {previewSlides.length > 1 && (
                        <button
                          onClick={() => setPreviewSlideIdx(prev => Math.max(0, prev - 1))}
                          disabled={previewSlideIdx === 0}
                          className="absolute left-4 z-20 p-2 rounded-full bg-black/50 border border-zinc-800 text-zinc-300 hover:text-white disabled:opacity-20 hover:scale-105 transition-all shadow-lg opacity-0 group-hover/preview:opacity-100"
                        >
                          <ChevronLeft className="size-5" />
                        </button>
                      )}
                      
                      {/* Interactive slide layouts */}
                      <div className="absolute inset-0 select-none">
                        {currentSlide?.layout === 'title' ? (
                          <div className="w-full h-full bg-gradient-to-br from-indigo-900/60 via-purple-900/30 to-pink-900/40 flex flex-col items-center justify-center text-center p-12 animate-in fade-in duration-300">
                            <span className="text-[10px] font-bold tracking-widest text-indigo-400 uppercase mb-2">COVER SLIDE</span>
                            <h3 className="text-2xl sm:text-3xl font-black text-white leading-tight max-w-[85%]">{currentSlide?.title || '未命名幻灯片'}</h3>
                            {currentSlide?.subtitle && <p className="text-xs sm:text-sm text-zinc-300 mt-2 font-medium italic">{currentSlide.subtitle}</p>}
                            <div className="w-12 h-1 bg-indigo-500 rounded-full mt-6" />
                          </div>
                        ) : currentSlide?.layout === 'content' ? (
                          <div className="w-full h-full bg-zinc-900 flex flex-col justify-between p-10 text-left animate-in fade-in duration-300">
                            <div className="flex items-center gap-2.5 border-b border-zinc-800 pb-3">
                              <div className="w-2.5 h-2.5 rounded bg-indigo-500" />
                              <h3 className="text-lg font-bold text-white truncate">{currentSlide?.title || '要点大纲'}</h3>
                            </div>
                            <div className="flex-1 flex flex-col justify-center py-4">
                              {currentSlide?.bullets && Array.isArray(currentSlide.bullets) && currentSlide.bullets.length > 0 ? (
                                <ul className="space-y-3 text-xs sm:text-sm text-zinc-300">
                                  {currentSlide.bullets.map((b: string, i: number) => (
                                    <li key={i} className="flex items-start gap-2.5 leading-relaxed">
                                      <div className="size-1.5 rounded-full bg-indigo-400 mt-1.5 shrink-0" />
                                      <span>{b}</span>
                                    </li>
                                  ))}
                                </ul>
                              ) : (
                                <p className="text-xs text-zinc-500 italic">暂无内容要点</p>
                              )}
                            </div>
                            <div className="text-[9px] text-zinc-600 text-right">PAGE {previewSlideIdx + 1}</div>
                          </div>
                        ) : currentSlide?.layout === 'quote' ? (
                          <div className="w-full h-full bg-gradient-to-br from-indigo-950/80 to-zinc-950 flex flex-col items-center justify-center text-center p-12 relative overflow-hidden animate-in fade-in duration-300">
                            <span className="text-9xl font-serif text-indigo-500/5 absolute -top-8 -left-2 select-none">“</span>
                            <p className="text-base sm:text-lg font-bold text-zinc-300 italic relative z-10 max-w-[85%] leading-relaxed">
                              {currentSlide?.title || '“优秀的艺术品往往精雕细琢”'}
                            </p>
                            {currentSlide?.subtitle && (
                              <p className="text-xs font-semibold text-indigo-400 mt-4 uppercase tracking-wider">
                                — {currentSlide.subtitle}
                              </p>
                            )}
                          </div>
                        ) : (
                          <div className="w-full h-full bg-zinc-900 flex flex-col justify-between p-10 text-left animate-in fade-in duration-300">
                            <h3 className="text-lg font-bold text-white">{currentSlide?.title || '未命名幻灯片'}</h3>
                            <p className="text-xs text-zinc-400 italic">高保真排版版式</p>
                            <div className="text-[9px] text-zinc-600 text-right">PAGE {previewSlideIdx + 1}</div>
                          </div>
                        )}
                      </div>

                      {/* Right navigation arrow */}
                      {previewSlides.length > 1 && (
                        <button
                          onClick={() => setPreviewSlideIdx(prev => Math.min(previewSlides.length - 1, prev + 1))}
                          disabled={previewSlideIdx === previewSlides.length - 1}
                          className="absolute right-4 z-20 p-2 rounded-full bg-black/50 border border-zinc-800 text-zinc-300 hover:text-white disabled:opacity-20 hover:scale-105 transition-all shadow-lg opacity-0 group-hover/preview:opacity-100"
                        >
                          <ChevronRight className="size-5" />
                        </button>
                      )}

                      {/* Page Counter Badge */}
                      <span className="absolute bottom-4 left-4 z-20 px-2.5 py-0.5 rounded-full bg-black/60 border border-zinc-800 text-[10px] font-bold text-zinc-400 font-mono">
                        {previewSlideIdx + 1} / {previewSlides.length}
                      </span>
                    </div>

                    {/* Slides Thumbnails Strip */}
                    {previewSlides.length > 1 && (
                      <div className="flex gap-2 py-1 overflow-x-auto scrollbar-hide max-w-full">
                        {previewSlides.map((slide: any, idx: number) => (
                          <button
                            key={idx}
                            onClick={() => setPreviewSlideIdx(idx)}
                            className={`flex-shrink-0 w-24 aspect-video rounded-xl border-2 overflow-hidden transition-all flex flex-col justify-between p-2 select-none relative ${
                              previewSlideIdx === idx 
                                ? 'border-indigo-600 bg-indigo-50/10 dark:bg-indigo-950/20 scale-102 shadow-md' 
                                : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 hover:border-zinc-300 dark:hover:border-zinc-700'
                            }`}
                          >
                            <span className="text-[8px] font-bold text-zinc-700 dark:text-zinc-300 truncate w-full text-left">{slide.title || `第 ${idx + 1} 页`}</span>
                            <span className="text-[7px] font-bold text-zinc-400 uppercase tracking-widest font-mono text-right w-full block">{slide.layout || 'content'}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                ) : activeTemplate?.category === 'document' ? (
                  /* Word Document Skeleton Preview */
                  <div className="w-full aspect-[1/1.3] bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 shadow-xl p-8 rounded-2xl max-w-md mx-auto flex flex-col justify-between transition-colors relative group">
                    <div className="space-y-6">
                      {/* Doc Header */}
                      <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-900 pb-4 text-left">
                        <div className="flex items-center gap-2">
                          <div className="size-6 rounded bg-blue-500/10 dark:bg-blue-500/20 flex items-center justify-center text-blue-600 dark:text-blue-400"><FileText className="size-3.5" /></div>
                          <span className="text-[10px] font-bold text-zinc-400 tracking-wider">WORD DOCUMENT</span>
                        </div>
                        <span className="text-[8px] font-bold text-zinc-400 bg-zinc-100 dark:bg-zinc-900 px-2 py-0.5 rounded uppercase">A4 Page</span>
                      </div>
                      
                      {/* Doc content placeholders */}
                      <div className="space-y-4 pt-2 text-left">
                        <div className="h-6 w-3/4 bg-zinc-200 dark:bg-zinc-800 rounded animate-pulse" />
                        <div className="h-4 w-1/3 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 text-[10px] px-2.5 py-0.5 rounded font-bold inline-block">
                          {activeTemplate?.name || 'Word 模板大纲'}
                        </div>
                        
                        <div className="space-y-2.5 pt-4">
                          <div className="h-2 w-full bg-zinc-150 dark:bg-zinc-800/80 rounded-full" />
                          <div className="h-2 w-full bg-zinc-150 dark:bg-zinc-800/80 rounded-full" />
                          <div className="h-2 w-5/6 bg-zinc-150 dark:bg-zinc-800/80 rounded-full" />
                        </div>
                        
                        {/* Subheading */}
                        <div className="h-4 w-1/2 bg-zinc-200 dark:bg-zinc-800 rounded pt-2" />
                        <div className="space-y-2.5">
                          <div className="h-2 w-full bg-zinc-150 dark:bg-zinc-800/80 rounded-full" />
                          <div className="h-2 w-4/5 bg-zinc-150 dark:bg-zinc-800/80 rounded-full" />
                        </div>
                      </div>
                    </div>
                    
                    <div className="border-t border-zinc-100 dark:border-zinc-900 pt-4 flex items-center justify-between text-[9px] text-zinc-400 font-medium">
                      <span>大纲预览已就绪</span>
                      <span>1 / 1 页</span>
                    </div>
                  </div>
                ) : activeTemplate?.category === 'spreadsheet' ? (
                  /* Excel High-fidelity Grid Preview */
                  <div className="w-full bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden shadow-xl flex flex-col justify-between max-w-lg mx-auto">
                    {/* Excel Header */}
                    <div className="bg-emerald-500/10 dark:bg-emerald-500/20 border-b border-zinc-200 dark:border-zinc-800 p-3.5 flex items-center justify-between text-emerald-600 dark:text-emerald-400">
                      <div className="flex items-center gap-2">
                        <Table className="size-4" />
                        <span className="text-xs font-bold font-mono">Excel Sheet Preview</span>
                      </div>
                      <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 font-bold uppercase tracking-wider">Active Workspace</span>
                    </div>
                    
                    {/* Grid */}
                    <div className="p-4 overflow-x-auto">
                      <table className="w-full border-collapse text-[10px] text-zinc-500 dark:text-zinc-400 font-mono text-left">
                        <thead>
                          <tr className="bg-zinc-100 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
                            <th className="p-1.5 border border-zinc-200 dark:border-zinc-800 font-bold text-center"></th>
                            <th className="p-1.5 border border-zinc-200 dark:border-zinc-800 font-bold">A</th>
                            <th className="p-1.5 border border-zinc-200 dark:border-zinc-800 font-bold">B</th>
                            <th className="p-1.5 border border-zinc-200 dark:border-zinc-800 font-bold">C</th>
                            <th className="p-1.5 border border-zinc-200 dark:border-zinc-800 font-bold">D</th>
                          </tr>
                        </thead>
                        <tbody>
                          {[
                            { no: 1, a: '核心指标项', b: '目标值', c: '完成值', d: '达成比率' },
                            { no: 2, a: '项目收入总计', b: '¥850,000', c: '¥912,400', d: '107.3%' },
                            { no: 3, a: '核心活跃用户', b: '12,500', c: '13,100', d: '104.8%' },
                            { no: 4, a: '月度留存指标', b: '45.0%', c: '47.2%', d: '104.9%' },
                            { no: 5, a: '销售获客成本', b: '¥65.0', c: '¥58.5', d: '111.1%' }
                          ].map((row, idx) => (
                            <tr key={idx} className="border-b border-zinc-100 dark:border-zinc-900">
                              <td className="p-1.5 border border-zinc-200 dark:border-zinc-800 font-bold text-center bg-zinc-50 dark:bg-zinc-900 w-8">{row.no}</td>
                              <td className="p-1.5 border border-zinc-200 dark:border-zinc-800 font-medium text-zinc-900 dark:text-zinc-100">{row.a}</td>
                              <td className="p-1.5 border border-zinc-200 dark:border-zinc-800">{row.b}</td>
                              <td className="p-1.5 border border-zinc-200 dark:border-zinc-800 font-bold text-zinc-900 dark:text-zinc-100">{row.c}</td>
                              <td className="p-1.5 border border-zinc-200 dark:border-zinc-800">
                                <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold ${idx > 0 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400' : 'text-zinc-400'}`}>{row.d}</span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    
                    {/* Tab strip */}
                    <div className="bg-zinc-50 dark:bg-zinc-900 px-4 py-2 border-t border-zinc-200 dark:border-zinc-800 text-[8px] flex gap-2 font-bold text-zinc-400">
                      <span className="text-emerald-600 bg-white dark:bg-zinc-800 px-2 py-0.5 rounded border border-zinc-200 dark:border-zinc-700 shadow-sm cursor-pointer">数据大盘概览</span>
                      <span className="px-2 py-0.5 hover:text-zinc-600 dark:hover:text-zinc-300 cursor-pointer">流水明细表</span>
                    </div>
                  </div>
                ) : (
                  /* Fallback default icon preview */
                  <div className="aspect-video bg-white dark:bg-zinc-800 rounded-2xl shadow-lg border border-zinc-200 dark:border-zinc-700 flex flex-col items-center justify-center relative overflow-hidden gap-4 p-8">
                     {activeTemplate?.category === 'conversation' ? (
                       <MessageSquare className="size-16 text-green-500" />
                     ) : (
                       <FileText className="size-16 text-zinc-300" />
                     )}
                     <span className="text-xs font-bold text-zinc-400">对话式交互智能模板预览</span>
                  </div>
                )}
                
                {/* Template Info block */}
                <div className="bg-white dark:bg-zinc-800 rounded-2xl p-6 border border-zinc-200 dark:border-zinc-800 shadow-sm text-left">
                  <h4 className="font-bold text-sm text-zinc-900 dark:text-zinc-100 mb-2">模板设计与使用说明</h4>
                  <p className="text-zinc-600 dark:text-zinc-400 text-xs sm:text-sm leading-relaxed whitespace-pre-wrap">
                    {activeTemplate?.description || '暂无详细说明。此模板已进行排版和结构优化，可随时一键启用。'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Upload Custom PPT Template Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl w-full max-w-xl overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 dark:border-zinc-800">
              <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                {selectedCategory === 'document' ? <FileText className="size-5 text-blue-500" /> : selectedCategory === 'spreadsheet' ? <Table className="size-5 text-emerald-500" /> : <Presentation className="size-5 text-indigo-500" />}
                {t(selectedCategory === 'presentation' ? "Upload Custom PPT Template" : selectedCategory === 'document' ? "Create Word Template" : "Create Excel Template")}
              </h3>
              <button
                onClick={() => setShowUploadModal(false)}
                className="p-1.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-600 transition-colors"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto app-scrollbar">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">{t("Template Name")}</label>
                  <input
                    value={uploadName}
                    onChange={e => setUploadName(e.target.value)}
                    placeholder="例如: 年度业务总结报告"
                    className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 transition-all"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">{t("Description")}</label>
                  <input
                    value={uploadDesc}
                    onChange={e => setUploadDesc(e.target.value)}
                    placeholder="简要描述设计风格或适用场景..."
                    className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 transition-all"
                  />
                </div>
              </div>

              {/* Mode Selector Tab */}
              <div className="flex border-b border-zinc-200 dark:border-zinc-800">
                {selectedCategory === 'presentation' && (
                  <>
                    <button
                      type="button"
                      onClick={() => setActiveUploadTab('wizard')}
                      className={`flex-1 pb-2 text-xs font-bold border-b-2 transition-all ${activeUploadTab === 'wizard' ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400' : 'border-transparent text-zinc-400 hover:text-zinc-600'}`}
                    >
                      {t("Visual Wizard Mode")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveUploadTab('xml')}
                      className={`flex-1 pb-2 text-xs font-bold border-b-2 transition-all ${activeUploadTab === 'xml' ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400' : 'border-transparent text-zinc-400 hover:text-zinc-600'}`}
                    >
                      {t("Import XML Template")}
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => setActiveUploadTab('json')}
                  className={`flex-1 pb-2 text-xs font-bold border-b-2 transition-all ${activeUploadTab === 'json' ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400' : 'border-transparent text-zinc-400 hover:text-zinc-600'}`}
                >
                  {selectedCategory === 'presentation' ? t("JSON Code Mode") : t("Direct Code Input")}
                </button>
              </div>

              {/* Conditionally render Visual wizard vs XML importer vs Raw textarea */}
              {activeUploadTab === 'wizard' ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-1.5">
                    <span className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">{t("Slide List")}</span>
                    <button
                      type="button"
                      onClick={addWizardSlide}
                      className="flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 transition-colors"
                    >
                      <Plus className="size-3.5" />
                      {t("Add New Slide")}
                    </button>
                  </div>

                  <div className="space-y-3 max-h-[36vh] overflow-y-auto app-scrollbar pr-1">
                    {wizardSlides.map((slide, index) => (
                      <div key={slide.id} className="p-3.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/20 relative space-y-3 shadow-sm">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold text-zinc-400 font-mono">PAGE #{index + 1}</span>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              disabled={index === 0}
                              onClick={() => moveWizardSlide(index, 'up')}
                              className="p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-600 disabled:opacity-30 transition-colors"
                            >
                              <ArrowUp className="size-3.5" />
                            </button>
                            <button
                              type="button"
                              disabled={index === wizardSlides.length - 1}
                              onClick={() => moveWizardSlide(index, 'down')}
                              className="p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-600 disabled:opacity-30 transition-colors"
                            >
                              <ArrowDown className="size-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteWizardSlide(slide.id)}
                              className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-950/20 text-zinc-400 hover:text-red-500 transition-colors"
                            >
                              <Trash2 className="size-3.5" />
                            </button>
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-3">
                          <div className="col-span-1 space-y-1">
                            <label className="text-[10px] font-bold text-zinc-400 uppercase">{t("Layout")}</label>
                            <select
                              value={slide.layout}
                              onChange={e => updateSlideField(slide.id, 'layout', e.target.value)}
                              className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-2 py-1.5 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            >
                              <option value="title">封面页 (title)</option>
                              <option value="content">要点内容页 (content)</option>
                              <option value="quote">引用名言页 (quote)</option>
                            </select>
                          </div>

                          <div className="col-span-2 space-y-1">
                            <label className="text-[10px] font-bold text-zinc-400 uppercase">{t("Title")}</label>
                            <input
                              value={slide.title}
                              onChange={e => updateSlideField(slide.id, 'title', e.target.value)}
                              placeholder={slide.layout === 'quote' ? "填入名言或主要引用句" : "填入本页的主标题"}
                              className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            />
                          </div>
                        </div>

                        {slide.layout === 'title' && (
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-zinc-400 uppercase">{t("Subtitle")}</label>
                            <input
                              value={slide.subtitle || ''}
                              onChange={e => updateSlideField(slide.id, 'subtitle', e.target.value)}
                              placeholder="填入本页副标题 (可选)"
                              className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            />
                          </div>
                        )}

                        {slide.layout === 'quote' && (
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-zinc-400 uppercase">{t("Author / Source")}</label>
                            <input
                              value={slide.subtitle || ''}
                              onChange={e => updateSlideField(slide.id, 'subtitle', e.target.value)}
                              placeholder="例如: 乔布斯"
                              className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            />
                          </div>
                        )}

                        {slide.layout === 'content' && (
                          <div className="space-y-2 pt-1">
                            <div className="flex items-center justify-between">
                              <label className="text-[10px] font-bold text-zinc-400 uppercase">{t("Bullet Points")}</label>
                              <button
                                type="button"
                                onClick={() => addSlideBullet(slide.id)}
                                className="text-[10px] font-bold text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 transition-colors"
                              >
                                + {t("Add Bullet")}
                              </button>
                            </div>

                            <div className="space-y-1.5">
                              {(slide.bullets || []).map((bullet, bulletIdx) => (
                                <div key={bulletIdx} className="flex items-center gap-1.5">
                                  <span className="text-[11px] text-zinc-400 font-bold shrink-0">{bulletIdx + 1}.</span>
                                  <input
                                    value={bullet}
                                    onChange={e => updateSlideBullet(slide.id, bulletIdx, e.target.value)}
                                    placeholder={`要点文本 ${bulletIdx + 1}`}
                                    className="flex-1 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                  />
                                  <button
                                    type="button"
                                    onClick={() => deleteSlideBullet(slide.id, bulletIdx)}
                                    className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-950/20 text-zinc-400 hover:text-red-500 transition-colors"
                                  >
                                    <Trash2 className="size-3" />
                                  </button>
                                </div>
                              ))}
                              {(slide.bullets || []).length === 0 && (
                                <p className="text-[10px] text-zinc-400 italic">{t("No bullets yet, click top right to add")}</p>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : activeUploadTab === 'xml' ? (
                <div className="space-y-4">
                  <div className="border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl p-8 text-center bg-zinc-50/30 dark:bg-zinc-950/10 hover:bg-zinc-50 dark:hover:bg-zinc-950/20 hover:border-indigo-500/50 dark:hover:border-indigo-500/50 transition-all relative group">
                    <input
                      type="file"
                      accept=".xml"
                      disabled={xmlImportLoading}
                      onChange={e => {
                        const file = e.target.files?.[0]
                        if (file) handleXmlImport(file)
                      }}
                      className="absolute inset-0 opacity-0 cursor-pointer disabled:cursor-not-allowed"
                    />
                    
                    <div className="flex flex-col items-center justify-center space-y-3">
                      <div className="size-12 rounded-xl bg-white dark:bg-zinc-900 shadow-sm border border-zinc-200/50 dark:border-zinc-800 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                        {xmlImportLoading ? (
                          <Loader2 className="size-6 text-indigo-500 animate-spin" />
                        ) : (
                          <Upload className="size-6 text-indigo-500" />
                        )}
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs font-bold text-zinc-700 dark:text-zinc-300">
                          {xmlImportLoading ? t("Parsing and importing...") : t("Drag and drop PowerPoint XML file here, or click to upload")}
                        </p>
                        <p className="text-[10px] text-zinc-400">
                          支持从 PowerPoint 或 WPS 另存为生成的 .xml Flat OPC 包格式
                        </p>
                      </div>
                    </div>
                  </div>

                  {xmlSuccessMsg && (
                    <div className="p-3.5 bg-green-500/10 border border-green-500/20 text-green-600 dark:text-green-400 rounded-xl text-xs font-medium leading-relaxed">
                      {xmlSuccessMsg}
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                      {selectedCategory === 'presentation' ? t("Slide Structure Data (JSON Array)") : selectedCategory === 'document' ? t("Document Structure Template (HTML/Markdown)") : t("Spreadsheet Structure Template (JSON)")}
                    </label>
                    {selectedCategory === 'presentation' && <span className="text-[10px] text-zinc-400 font-mono">SUPPORT LAYOUTS: title | content | quote</span>}
                  </div>
                  <textarea
                    value={uploadSlides}
                    onChange={e => setUploadSlides(e.target.value)}
                    rows={8}
                    className="w-full rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3.5 py-2.5 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 transition-all"
                  />
                </div>
              )}

              {uploadError && (
                <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-500 rounded-xl text-xs font-medium">
                  {uploadError}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-950/20">
              <button
                onClick={() => setShowUploadModal(false)}
                className="px-4 py-2 text-xs font-bold rounded-xl border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                {t("Cancel")}
              </button>
              <button
                onClick={handleUploadTemplate}
                disabled={uploadLoading}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white transition-colors disabled:opacity-50 shadow-sm"
              >
                {uploadLoading && <Loader2 className="size-3.5 animate-spin" />}
                {t("Save Template")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
