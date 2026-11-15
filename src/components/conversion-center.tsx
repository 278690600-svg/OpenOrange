"use client"

import { useState, useCallback, useRef } from "react"
import { 
  ArrowRightLeft, Upload, Download, FileText, Table, Presentation, 
  Code, FileDown, Loader2, Check, X, Eye, Play, Sparkles, Printer, Copy, Trash2
} from "lucide-react"
import { useI18n } from "@/lib/i18n"
import { useRouter } from "next/navigation"
import ReactMarkdown from 'react-markdown'

type FileFormat = 'docx' | 'xlsx' | 'pptx' | 'html' | 'md' | 'txt' | 'pdf' | 'csv' | 'json'

interface ConversionTask {
  id: string
  fileName: string
  sourceFormat: string
  targetFormat: string
  status: 'queued' | 'converting' | 'completed' | 'failed'
  progress: number
  error?: string
  file: File
  resultText?: string
  blobUrl?: string
}

export function ConversionCenter() {
  const { t } = useI18n()
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const printIframeRef = useRef<HTMLIFrameElement>(null)
  
  const [tasks, setTasks] = useState<ConversionTask[]>([])
  const [dragOver, setDragOver] = useState(false)
  const [globalTarget, setGlobalTarget] = useState<FileFormat>('txt')
  const [converting, setConverting] = useState(false)
  const [activePreviewTask, setActivePreviewTask] = useState<ConversionTask | null>(null)
  const [copied, setCopied] = useState(false)

  const supportedFormats: { format: FileFormat; icon: React.ReactNode; label: string }[] = [
    { format: 'docx', icon: <FileText className="size-5 text-blue-500" />, label: 'Word (DOCX)' },
    { format: 'xlsx', icon: <Table className="size-5 text-green-500" />, label: 'Excel (XLSX)' },
    { format: 'pptx', icon: <Presentation className="size-5 text-orange-500" />, label: 'PowerPoint (PPTX)' },
    { format: 'pdf', icon: <FileDown className="size-5 text-red-500" />, label: 'PDF' },
    { format: 'html', icon: <Code className="size-5 text-purple-500" />, label: 'HTML' },
    { format: 'md', icon: <Code className="size-5 text-gray-500" />, label: 'Markdown' },
    { format: 'txt', icon: <FileText className="size-5 text-zinc-500" />, label: 'Text' },
    { format: 'csv', icon: <Table className="size-5 text-teal-500" />, label: 'CSV' },
    { format: 'json', icon: <Code className="size-5 text-yellow-500" />, label: 'JSON' }
  ]

  const conversionMatrix: Record<string, FileFormat[]> = {
    docx: ['html', 'md', 'txt', 'pdf'],
    xlsx: ['csv', 'html', 'json', 'pdf'],
    pptx: ['html', 'pdf', 'txt'],
    html: ['docx', 'md', 'txt', 'pdf'],
    md: ['html', 'docx', 'txt', 'pdf'],
    txt: ['html', 'docx', 'md', 'pdf'],
    csv: ['xlsx', 'json', 'html'],
    json: ['xlsx', 'csv', 'html']
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const files = Array.from(e.dataTransfer.files)
    files.forEach(file => handleFile(file))
  }, [globalTarget])

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files) {
      Array.from(files).forEach(file => handleFile(file))
    }
  }, [globalTarget])

  const handleFile = (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase() || ''
    const targetFormats = conversionMatrix[ext] || []

    const task: ConversionTask = {
      id: Date.now().toString() + Math.random(),
      fileName: file.name,
      sourceFormat: ext,
      targetFormat: targetFormats.includes(globalTarget) ? globalTarget : (targetFormats[0] || 'txt'),
      status: 'queued',
      progress: 0,
      file
    }

    setTasks(prev => [task, ...prev])
  }

  const convertSingleFile = async (task: ConversionTask) => {
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: 'converting', progress: 10 } : t))

    try {
      const formData = new FormData()
      formData.append('file', task.file)
      formData.append('targetFormat', task.targetFormat)

      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, progress: 40 } : t))

      const response = await fetch('/api/convert', {
        method: 'POST',
        body: formData
      })

      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, progress: 75 } : t))

      if (!response.ok) {
        throw new Error('Conversion failed')
      }

      const blob = await response.blob()
      let resultText = ''
      
      if (['txt', 'html', 'md', 'json', 'csv', 'pdf'].includes(task.targetFormat)) {
        resultText = await blob.text()
      }

      const url = URL.createObjectURL(blob)

      const updatedTask: ConversionTask = {
        ...task,
        status: 'completed',
        progress: 100,
        resultText,
        blobUrl: url
      }

      setTasks(prev => prev.map(t => t.id === task.id ? updatedTask : t))
      
      // Update preview context if currently viewing this task
      setActivePreviewTask(curr => curr?.id === task.id ? updatedTask : curr)
    } catch (err) {
      setTasks(prev => prev.map(t => t.id === task.id ? {
        ...t,
        status: 'failed',
        error: (err as Error).message,
        progress: 0
      } : t))
    }
  }

  const startBatchConversion = async () => {
    const queued = tasks.filter(t => t.status === 'queued')
    if (queued.length === 0) return
    setConverting(true)
    await Promise.all(queued.map(task => convertSingleFile(task)))
    setConverting(false)
  }

  const applyGlobalTarget = () => {
    setTasks(prev => prev.map(t => {
      if (t.status === 'queued') {
        const available = conversionMatrix[t.sourceFormat] || []
        if (available.includes(globalTarget)) {
          return { ...t, targetFormat: globalTarget }
        }
      }
      return t
    }))
  }

  const openInEditor = (task: ConversionTask) => {
    const target = task.targetFormat
    if (['docx', 'md', 'txt', 'html'].includes(target)) {
      router.push('/documents')
    } else if (['xlsx', 'csv', 'json'].includes(target)) {
      router.push('/spreadsheet')
    } else if (['pptx'].includes(target)) {
      router.push('/presentations')
    }
  }

  const getAvailableTargets = (sourceFormat: string): FileFormat[] => {
    return conversionMatrix[sourceFormat] || []
  }

  const clearCompleted = () => {
    setTasks(prev => prev.filter(t => t.status !== 'completed'))
  }

  const removeTask = (id: string) => {
    setTasks(prev => prev.filter(t => t.id !== id))
    if (activePreviewTask?.id === id) {
      setActivePreviewTask(null)
    }
  }

  const triggerDownload = (task: ConversionTask) => {
    if (task.targetFormat === 'pdf') {
      handlePrint(task)
      return
    }
    if (!task.blobUrl) return
    const a = document.createElement('a')
    a.href = task.blobUrl
    a.download = task.fileName.replace(/\.[^/.]+$/, '') + '.' + task.targetFormat
    a.click()
  }

  const handlePrint = (task?: ConversionTask) => {
    const targetTask = task || activePreviewTask
    if (!targetTask?.resultText) return
    const iframe = printIframeRef.current
    if (iframe) {
      const doc = iframe.contentDocument || iframe.contentWindow?.document
      if (doc) {
        doc.open()
        // If it is markdown, wrap it in readable HTML structure
        if (targetTask.targetFormat === 'md') {
          doc.write(`
            <html>
              <head>
                <style>
                  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 40px; color: #1f2937; line-height: 1.6; }
                  pre { background: #f3f4f6; padding: 16px; border-radius: 8px; font-family: monospace; }
                  table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
                  th, td { border: 1px solid #e5e7eb; padding: 12px; text-align: left; }
                  th { background: #f9fafb; font-weight: 600; }
                </style>
              </head>
              <body>
                ${targetTask.resultText.split('\n').map(p => p.trim() ? `<p>${p}</p>` : '<br/>').join('')}
              </body>
            </html>
          `)
        } else {
          doc.write(targetTask.resultText)
        }
        doc.close()
        setTimeout(() => {
          iframe.contentWindow?.focus()
          iframe.contentWindow?.print()
        }, 300)
      }
    }
  }

  const handleCopy = () => {
    if (!activePreviewTask?.resultText) return
    navigator.clipboard.writeText(activePreviewTask.resultText)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex h-full bg-zinc-50 dark:bg-zinc-900 overflow-hidden">
      {/* Main Panel */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between pl-14 md:pl-16 pr-6 py-4 border-b border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-xl bg-purple-100 dark:bg-purple-500/20 flex items-center justify-center">
              <ArrowRightLeft className="size-5 text-purple-600 dark:text-purple-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">{t('Conversion Center')}</h1>
              <p className="text-xs text-zinc-500">{t('Convert between document formats')}</p>
            </div>
          </div>
          {tasks.some(t => t.status === 'completed') && (
            <button
              onClick={clearCompleted}
              className="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 font-semibold"
            >
              {t('Clear Completed')}
            </button>
          )}
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Drop Zone */}
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${dragOver ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-500/10' : 'border-zinc-300 dark:border-zinc-700'}`}
          >
            <Upload className="size-12 mx-auto mb-4 text-zinc-400" />
            <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-2">
              {t('Drag and drop files here, or click to select')}
            </p>
            <p className="text-xs text-zinc-400 mb-4">
              {t('Supported formats: DOCX, XLSX, PPTX, HTML, MD, TXT, CSV, JSON')}
            </p>

            <label className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium cursor-pointer transition-colors shadow-md">
              <Upload className="size-4" />
              {t('Select Files')}
              <input
                type="file"
                multiple
                ref={fileInputRef}
                accept=".docx,.xlsx,.pptx,.html,.md,.txt,.csv,.json"
                className="hidden"
                onChange={handleFileSelect}
              />
            </label>
          </div>

          {/* Batch Configuration Header (Only show if there are queued tasks) */}
          {tasks.some(t => t.status === 'queued') && (
            <div className="bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
              <div className="flex items-center gap-2">
                <Sparkles className="size-4 text-indigo-500 animate-pulse" />
                <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                  {tasks.filter(t => t.status === 'queued').length} {t('Files Selected')}
                </span>
              </div>
              <div className="flex items-center gap-2 self-end md:self-auto">
                <span className="text-xs text-zinc-500">{t('Global Target Format')}:</span>
                <select
                  value={globalTarget}
                  onChange={e => setGlobalTarget(e.target.value as FileFormat)}
                  className="text-xs rounded border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 px-2 py-1.5 focus:outline-none"
                >
                  {supportedFormats.map(fmt => (
                    <option key={fmt.format} value={fmt.format} className="uppercase">{fmt.format}</option>
                  ))}
                </select>
                <button
                  onClick={applyGlobalTarget}
                  className="px-2.5 py-1.5 text-xs border border-zinc-200 dark:border-zinc-700 hover:border-zinc-400 rounded-lg text-zinc-600 dark:text-zinc-300 transition-colors font-medium bg-zinc-50 dark:bg-zinc-900"
                >
                  {t('Apply to All')}
                </button>
                <button
                  onClick={startBatchConversion}
                  disabled={converting}
                  className="px-4 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors font-bold shadow flex items-center gap-1.5"
                >
                  {converting ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
                  {t('Start Batch Conversion')}
                </button>
              </div>
            </div>
          )}

          {/* Conversion Tasks List */}
          {tasks.length > 0 && (
            <div className="bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 overflow-hidden shadow-sm">
              <div className="px-4 py-3 border-b border-zinc-200 dark:border-zinc-700 bg-zinc-50/50 dark:bg-zinc-800/50">
                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500">{t('Conversion Tasks')}</h3>
              </div>
              <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {tasks.map(task => (
                  <div 
                    key={task.id} 
                    className={`flex flex-col md:flex-row md:items-center justify-between gap-4 px-4 py-3.5 transition-colors ${activePreviewTask?.id === task.id ? 'bg-indigo-50/30 dark:bg-indigo-950/10' : ''}`}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className={`size-8 rounded-lg flex items-center justify-center shrink-0 ${task.status === 'completed' ? 'bg-green-50 dark:bg-green-500/20' : task.status === 'failed' ? 'bg-red-50 dark:bg-red-500/20' : 'bg-zinc-100 dark:bg-zinc-700'}`}>
                        {task.status === 'completed' ? <Check className="size-4 text-green-500" /> :
                         task.status === 'failed' ? <X className="size-4 text-red-500" /> :
                         task.status === 'converting' ? <Loader2 className="size-4 animate-spin text-indigo-500" /> :
                         <ArrowRightLeft className="size-4 text-zinc-400" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 truncate">{task.fileName}</p>
                        <div className="flex items-center gap-1.5 text-[10px] text-zinc-500 mt-0.5">
                          <span className="uppercase font-medium px-1 rounded bg-zinc-100 dark:bg-zinc-700">{task.sourceFormat}</span>
                          <ArrowRightLeft className="size-2.5" />
                          <span className="uppercase font-medium px-1 rounded bg-indigo-50 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400">{task.targetFormat}</span>
                        </div>
                        {task.status === 'converting' && (
                          <div className="mt-2 w-full max-w-[240px] h-1 bg-zinc-100 dark:bg-zinc-700 rounded-full overflow-hidden">
                            <div className="h-full bg-indigo-500 rounded-full transition-all duration-300" style={{ width: `${task.progress}%` }} />
                          </div>
                        )}
                        {task.error && (
                          <p className="mt-1 text-[10px] text-red-500 font-medium">{task.error}</p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end md:self-auto shrink-0">
                      {task.status === 'completed' ? (
                        <>
                          {['txt', 'html', 'md', 'json', 'csv', 'pdf'].includes(task.targetFormat) && (
                            <button
                              onClick={() => setActivePreviewTask(task)}
                              className={`flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg border font-semibold transition-all ${activePreviewTask?.id === task.id ? 'bg-indigo-600 text-white border-indigo-600' : 'border-zinc-200 dark:border-zinc-700 hover:border-indigo-300 text-zinc-600 dark:text-zinc-400'}`}
                            >
                              <Eye className="size-3.5" />
                              {t('Preview')}
                            </button>
                          )}
                          <button
                            onClick={() => openInEditor(task)}
                            className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg border border-zinc-200 dark:border-zinc-700 hover:border-indigo-300 text-zinc-600 dark:text-zinc-400 transition-all font-semibold"
                          >
                            <FileText className="size-3.5" />
                            {t('Open in Workstation')}
                          </button>
                          <button
                            onClick={() => task.targetFormat === 'pdf' ? handlePrint(task) : triggerDownload(task)}
                            className="flex-1 flex items-center justify-center p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-900 text-zinc-500 hover:text-zinc-800"
                            title={task.targetFormat === 'pdf' ? 'Print / Save as PDF' : t('Download File')}
                          >
                            {task.targetFormat === 'pdf' ? <Printer className="size-4" /> : <Download className="size-4" />}
                          </button>
                        </>
                      ) : (
                        <select
                          value={task.targetFormat}
                          disabled={task.status === 'converting'}
                          onChange={e => {
                            const newFormat = e.target.value as FileFormat
                            setTasks(prev => prev.map(t => t.id === task.id ? { ...t, targetFormat: newFormat } : t))
                          }}
                          className="text-xs rounded border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 px-2 py-1.5 focus:outline-none"
                        >
                          {getAvailableTargets(task.sourceFormat).map(fmt => (
                            <option key={fmt} value={fmt} className="uppercase">{fmt}</option>
                          ))}
                        </select>
                      )}

                      <button
                        onClick={() => removeTask(task.id)}
                        disabled={task.status === 'converting'}
                        className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-500/20 text-zinc-400 hover:text-red-500 disabled:opacity-30 shrink-0"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Format Matrix */}
          <div className="bg-white dark:bg-zinc-800 rounded-xl border border-zinc-200 dark:border-zinc-700 p-4 shadow-sm">
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500 mb-3">{t('Supported Conversions')}</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {Object.entries(conversionMatrix).map(([source, targets]) => (
                <div key={source} className="p-3 rounded-lg bg-zinc-50 dark:bg-zinc-900/50 border border-zinc-100 dark:border-zinc-800">
                  <div className="text-xs font-bold uppercase text-zinc-700 dark:text-zinc-300 mb-2">{source}</div>
                  <div className="flex flex-wrap gap-1">
                    {targets.map(target => (
                      <span key={target} className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 uppercase font-medium">
                        {target}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Hidden printing iframe */}
      <iframe ref={printIframeRef} className="hidden" title="Print helper" />

      {/* Slide-out Preview Panel */}
      {activePreviewTask && (
        <div className="w-[450px] border-l border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 flex flex-col h-full shadow-2xl animate-in slide-in-from-right duration-300 shrink-0">
          <div className="flex items-center justify-between px-4 py-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 shrink-0">
            <div className="min-w-0 flex-1 mr-2">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 truncate">{activePreviewTask.fileName}</h3>
              <p className="text-[10px] text-zinc-500 mt-0.5 uppercase">{t('Preview Result')} · {activePreviewTask.targetFormat}</p>
            </div>
            <button 
              onClick={() => { setActivePreviewTask(null); setCopied(false) }}
              className="p-1 rounded hover:bg-zinc-200 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-700"
            >
              <X className="size-4" />
            </button>
          </div>

          {/* Preview Panel Body */}
          <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
            {activePreviewTask.resultText ? (
              <div className="h-full flex flex-col gap-4">
                {/* Actions inside Preview */}
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={handleCopy}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-lg border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900 text-zinc-700 dark:text-zinc-300 transition-colors"
                  >
                    <Copy className="size-3.5" />
                    {copied ? t('Copied!') : t('Copy')}
                  </button>
                  {['html', 'md', 'txt', 'pdf'].includes(activePreviewTask.targetFormat) && (
                    <button
                      onClick={() => handlePrint(activePreviewTask)}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white transition-colors shadow-sm"
                    >
                      <Printer className="size-3.5" />
                      {t('Print to PDF')}
                    </button>
                  )}
                </div>

                {/* Content Renderers */}
                <div className="flex-1 rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden bg-zinc-50 dark:bg-zinc-900/20 p-3 min-h-[300px]">
                  {activePreviewTask.targetFormat === 'html' || activePreviewTask.targetFormat === 'pdf' ? (
                    <iframe
                      srcDoc={activePreviewTask.resultText}
                      className="w-full h-full border-none bg-white"
                      title="HTML Preview"
                      sandbox="allow-same-origin"
                    />
                  ) : activePreviewTask.targetFormat === 'md' ? (
                    <div className="prose prose-sm dark:prose-invert max-w-none h-full overflow-y-auto pr-1">
                      <ReactMarkdown>{activePreviewTask.resultText}</ReactMarkdown>
                    </div>
                  ) : (
                    <pre className="text-[11px] font-mono whitespace-pre-wrap leading-relaxed overflow-auto h-full text-zinc-800 dark:text-zinc-300">
                      {activePreviewTask.resultText}
                    </pre>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-zinc-400">
                <FileText className="size-16 mb-4 opacity-50" />
                <p className="text-xs">{t('No preview text available for binary files')}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
