"use client"
import ReactMarkdown from 'react-markdown'
import { useState, useCallback, useRef } from "react"
import Tesseract from "tesseract.js"
import {
  Upload, Image as ImageIcon, FileText, Languages, Loader2,
  Check, X, Copy, Download, Eye, RefreshCw, Settings,
  ZoomIn, ZoomOut, RotateCw, Sparkles, Printer
} from "lucide-react"
import { useI18n } from "@/lib/i18n"

interface OcrResult {
  id: string
  fileName: string
  text: string
  confidence: number
  language: string
  processingTime: number
  imageUrl: string
  timestamp: Date
}

interface OcrProcessorProps {
  onResult?: (result: OcrResult) => void
}

export function OcrProcessor({ onResult }: OcrProcessorProps) {
  const { t } = useI18n()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [results, setResults] = useState<OcrResult[]>([])
  const [processing, setProcessing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [selectedLang, setSelectedLang] = useState("eng+chi_sim")
  const [selectedResult, setSelectedResult] = useState<OcrResult | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [zoom, setZoom] = useState(100)
  const [showSettings, setShowSettings] = useState(false)
  const [correcting, setCorrecting] = useState(false)
  const [ocrEngine, setOcrEngine] = useState<'local' | 'ai'>('ai')
  const [previewMode, setPreviewMode] = useState<'markdown' | 'text'>('markdown')

  const handleAiCorrect = async (option: "correct" | "markdown" | "translate" | "summary") => {
    if (!selectedResult) return
    setCorrecting(true)
    try {
      const res = await fetch("/api/analysis?action=ocr-correct", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: selectedResult.text, option })
      })
      if (!res.ok) throw new Error("AI Processing failed")
      const data = await res.json()
      if (data.result) {
        const updated = { ...selectedResult, text: data.result }
        setSelectedResult(updated)
        setResults(prev => prev.map(r => r.id === selectedResult.id ? updated : r))
      }
    } catch (err) {
      console.error(err)
      alert("AI Processing failed")
    } finally {
      setCorrecting(false)
    }
  }

  const languages = [
    { value: "eng", label: "English" },
    { value: "chi_sim", label: "简体中文" },
    { value: "chi_tra", label: "繁體中文" },
    { value: "jpn", label: "日本語" },
    { value: "kor", label: "한국어" },
    { value: "eng+chi_sim", label: "English + 简体中文" },
    { value: "eng+jpn", label: "English + 日本語" },
    { value: "fra", label: "Français" },
    { value: "deu", label: "Deutsch" },
    { value: "spa", label: "Español" },
    { value: "rus", label: "Русский" },
    { value: "ara", label: "العربية" }
  ]

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const files = Array.from(e.dataTransfer.files)
    files.forEach(file => processImage(file))
  }, [selectedLang])

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files) {
      Array.from(files).forEach(file => processImage(file))
    }
  }, [selectedLang])

  const processImage = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      alert("Please select an image file")
      return
    }

    setProcessing(true)
    setProgress(0)

    const imageUrl = URL.createObjectURL(file)
    const startTime = Date.now()

    try {
      if (ocrEngine === 'ai') {
        // AI OCR Mode
        const base64Data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onloadend = () => resolve(reader.result as string)
          reader.onerror = reject
          reader.readAsDataURL(file)
        })

        const res = await fetch("/api/analysis?action=ocr-ai", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image: base64Data, language: selectedLang })
        })

        const data = await res.json()

        if (!res.ok) {
          throw new Error(data.details || "AI OCR failed")
        }

        const processingTime = Date.now() - startTime
        const result: OcrResult = {
          id: Date.now().toString(),
          fileName: file.name,
          text: data.text,
          confidence: 99.9,
          language: "AI OCR (多模态大模型)",
          processingTime,
          imageUrl,
          timestamp: new Date()
        }

        setResults(prev => [result, ...prev])
        setSelectedResult(result)

        if (onResult) {
          onResult(result)
        }
      } else {
        // Local Tesseract OCR Mode
        const { data } = await Tesseract.recognize(file, selectedLang, {
          langPath: 'https://fastly.jsdelivr.net/gh/naptha/tessdata@gh-pages/4.0.0_best/',
          logger: m => {
            if (m.progress) {
              setProgress(Math.round(m.progress * 100))
            }
          }
        })

        const processingTime = Date.now() - startTime
        const result: OcrResult = {
          id: Date.now().toString(),
          fileName: file.name,
          text: data.text,
          confidence: data.confidence,
          language: selectedLang,
          processingTime,
          imageUrl,
          timestamp: new Date()
        }

        setResults(prev => [result, ...prev])
        setSelectedResult(result)

        if (onResult) {
          onResult(result)
        }
      }
    } catch (err) {
      console.error("OCR failed:", err)
      alert((err as Error).message || "OCR 识别出错，请稍后重试。")
    } finally {
      setProcessing(false)
      setProgress(0)
    }
  }

  const copyText = async (text: string) => {
    await navigator.clipboard.writeText(text)
  }

  const downloadText = (result: OcrResult) => {
    const blob = new Blob([result.text], { type: "text/plain" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${result.fileName.replace(/\.[^/.]+$/, "")}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  const deleteResult = (id: string) => {
    setResults(prev => prev.filter(r => r.id !== id))
    if (selectedResult?.id === id) {
      setSelectedResult(null)
    }
  }

  const clearAll = () => {
    setResults([])
    setSelectedResult(null)
  }

  return (
    <div className="flex flex-col h-full bg-zinc-50 dark:bg-zinc-900">
      {/* Header */}
      <div className="flex items-center justify-between pl-14 md:pl-16 pr-6 py-4 border-b border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl bg-blue-100 dark:bg-blue-500/20 flex items-center justify-center">
            <ImageIcon className="size-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">{t("OCR Processor")}</h1>
            <p className="text-xs text-zinc-500">{t("Extract text from images")}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="p-2 rounded-lg border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-700"
          >
            <Settings className="size-4" />
          </button>
          {results.length > 0 && (
            <button
              onClick={clearAll}
              className="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
            >
              {t("Clear All")}
            </button>
          )}
        </div>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div className="bg-white dark:bg-zinc-800 border-b border-zinc-200 dark:border-zinc-700 p-4 space-y-4">
          <div className="flex flex-wrap items-center gap-6">
            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">{t("OCR Engine") || "OCR 引擎"}:</span>
              <div className="flex bg-zinc-100 dark:bg-zinc-900 p-1 rounded-lg border border-zinc-200 dark:border-zinc-700">
                <button
                  onClick={() => setOcrEngine('ai')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${ocrEngine === 'ai' ? 'bg-indigo-600 text-white shadow' : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-800'}`}
                >
                  <Sparkles className="size-3" />
                  {t("AI High Precision (Vision LLM)") || "AI 高精准 (大模型)"}
                </button>
                <button
                  onClick={() => setOcrEngine('local')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-bold transition-all ${ocrEngine === 'local' ? 'bg-zinc-800 text-white shadow' : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-800'}`}
                >
                  {t("Local Offline (Tesseract)") || "本地离线 (Tesseract)"}
                </button>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">{t("Language")}:</span>
              <select
                value={selectedLang}
                onChange={e => setSelectedLang(e.target.value)}
                className="rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 px-3 py-1.5 text-xs focus:outline-none"
              >
                {languages.map(lang => (
                  <option key={lang.value} value={lang.value}>{lang.label}</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-hidden flex">
        {/* Left Panel - Upload */}
        <div className="w-1/2 border-r border-zinc-200 dark:border-zinc-700 overflow-y-auto p-6">
          {/* Drop Zone */}
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${dragOver ? "border-blue-500 bg-blue-50 dark:bg-blue-500/10" : "border-zinc-300 dark:border-zinc-700"}`}
          >
            {processing ? (
              <div className="space-y-4 max-w-sm mx-auto">
                <Loader2 className={`size-12 mx-auto animate-spin ${ocrEngine === 'ai' ? 'text-indigo-500' : 'text-blue-500'}`} />
                <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
                  {ocrEngine === 'ai' ? (t("AI is intelligently recognizing and typesetting...") || "AI 正在智能识别排版中...") : `${t("Processing...")} ${progress}%`}
                </p>
                <div className="w-full h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${ocrEngine === 'ai' ? 'w-full bg-indigo-500 animate-pulse' : 'bg-blue-500'}`}
                    style={ocrEngine === 'local' ? { width: `${progress}%` } : undefined}
                  />
                </div>
                {ocrEngine === 'ai' && (
                  <p className="text-[10px] text-zinc-400">
                    提示：首次使用或本地模型加载时可能需要较长时间，请耐心等待
                  </p>
                )}
              </div>
            ) : (
              <>
                <Upload className="size-12 mx-auto mb-4 text-zinc-400" />
                <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-2">
                  {t("Drag and drop images here, or click to select")}
                </p>
                <p className="text-xs text-zinc-400 mb-4">
                  {t("Supported: PNG, JPG, JPEG, WEBP, BMP")}
                </p>
                <label className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium cursor-pointer transition-colors">
                  <Upload className="size-4" />
                  {t("Select Image")}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    ref={fileInputRef}
                    onChange={handleFileSelect}
                  />
                </label>
              </>
            )}
          </div>

          {/* Results History */}
          {results.length > 0 && (
            <div className="mt-6">
              <h3 className="text-sm font-semibold mb-3">{t("Recent Results")} ({results.length})</h3>
              <div className="space-y-2">
                {results.map(result => (
                  <div
                    key={result.id}
                    onClick={() => setSelectedResult(result)}
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${selectedResult?.id === result.id ? "border-blue-500 bg-blue-50 dark:bg-blue-500/10" : "border-zinc-200 dark:border-zinc-700 hover:border-zinc-300"}`}
                  >
                    <div className="size-12 rounded-lg bg-zinc-100 dark:bg-zinc-800 overflow-hidden flex-shrink-0">
                      <img src={result.imageUrl} alt="" className="size-full object-cover" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-zinc-900 dark:text-zinc-100 truncate">{result.fileName}</p>
                      <div className="flex items-center gap-2 text-[10px] text-zinc-500 mt-1">
                        <span>{result.confidence.toFixed(1)}%</span>
                        <span>·</span>
                        <span>{result.processingTime}ms</span>
                        <span>·</span>
                        <span>{result.text.length} {t("chars")}</span>
                      </div>
                    </div>
                    <button
                      onClick={e => { e.stopPropagation(); deleteResult(result.id) }}
                      className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-500/20 text-zinc-400 hover:text-red-500"
                    >
                      <X className="size-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right Panel - Result */}
        <div className="w-1/2 overflow-y-auto p-6">
          {selectedResult ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold truncate max-w-[150px]">{selectedResult.fileName}</h3>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1 border-r border-zinc-200 dark:border-zinc-700 pr-2 mr-1">
                    <button
                      onClick={() => handleAiCorrect('correct')}
                      disabled={correcting}
                      className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 hover:brightness-95 disabled:opacity-50 font-medium"
                    >
                      {correcting ? <Loader2 className="size-3 animate-spin" /> : <Sparkles className="size-3" />}
                      {t("AI Correct")}
                    </button>
                    <button
                      onClick={() => handleAiCorrect('markdown')}
                      disabled={correcting}
                      className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 hover:brightness-95 disabled:opacity-50 font-medium"
                    >
                      {t("Markdown Format")}
                    </button>
                    <button
                      onClick={() => handleAiCorrect('summary')}
                      disabled={correcting}
                      className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 hover:brightness-95 disabled:opacity-50 font-medium"
                    >
                      {t("Summarize")}
                    </button>
                    <button
                      onClick={() => handleAiCorrect('translate')}
                      disabled={correcting}
                      className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 hover:brightness-95 disabled:opacity-50 font-medium"
                    >
                      {t("Translate")}
                    </button>
                  </div>

                  <button
                    onClick={() => copyText(selectedResult.text)}
                    className="flex items-center gap-1 px-2 py-1 rounded text-xs border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-700"
                  >
                    <Copy className="size-3" /> {t("Copy")}
                  </button>
                  <button
                    onClick={() => downloadText(selectedResult)}
                    className="flex items-center gap-1 px-2 py-1 rounded text-xs border border-zinc-200 dark:border-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-700"
                  >
                    <Download className="size-3" /> {t("Download")}
                  </button>
                </div>
              </div>

              <div className="bg-zinc-100 dark:bg-zinc-800 rounded-lg overflow-hidden">
                <img src={selectedResult.imageUrl} alt="" className="w-full object-contain" style={{ zoom: `${zoom}%` }} />
              </div>

              <div className="flex items-center gap-1">
                <button onClick={() => setZoom(Math.max(50, zoom - 10))} className="p-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-700">
                  <ZoomOut className="size-3.5" />
                </button>
                <span className="text-xs text-zinc-500 w-8 text-center">{zoom}%</span>
                <button onClick={() => setZoom(Math.min(200, zoom + 10))} className="p-1.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-700">
                  <ZoomIn className="size-3.5" />
                </button>
              </div>

              <div className="bg-white dark:bg-zinc-800 rounded-lg border border-zinc-200 dark:border-zinc-700 p-4">
                <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-700 pb-2 mb-3">
                  <div className="flex items-center gap-4 text-[10px] text-zinc-500">
                    <span className="flex items-center gap-1">
                      <Check className="size-3 text-green-500" />
                      {t("Confidence")}: {selectedResult.confidence.toFixed(1)}%
                    </span>
                    <span>{t("Engine")}: {selectedResult.language}</span>
                    <span>{t("Processing Time")}: {selectedResult.processingTime}ms</span>
                  </div>

                  <div className="flex bg-zinc-100 dark:bg-zinc-900 p-0.5 rounded-md border border-zinc-200 dark:border-zinc-700 shrink-0">
                    <button
                      onClick={() => setPreviewMode('markdown')}
                      className={`px-2 py-1 rounded text-[10px] font-bold transition-all ${previewMode === 'markdown' ? 'bg-white dark:bg-zinc-800 text-indigo-600 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'}`}
                    >
                      排版预览 (Markdown)
                    </button>
                    <button
                      onClick={() => setPreviewMode('text')}
                      className={`px-2 py-1 rounded text-[10px] font-bold transition-all ${previewMode === 'text' ? 'bg-white dark:bg-zinc-800 text-indigo-600 shadow-sm' : 'text-zinc-500 hover:text-zinc-700'}`}
                    >
                      原始文本
                    </button>
                  </div>
                </div>

                <div className="max-h-[500px] overflow-y-auto custom-scrollbar">
                  {previewMode === 'markdown' ? (
                    <div className="prose prose-sm dark:prose-invert max-w-none text-xs leading-relaxed text-zinc-800 dark:text-zinc-200">
                      <ReactMarkdown>{selectedResult.text}</ReactMarkdown>
                    </div>
                  ) : (
                    <pre className="whitespace-pre-wrap text-xs text-zinc-900 dark:text-zinc-100 font-mono leading-relaxed">
                      {selectedResult.text}
                    </pre>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-zinc-400">
              <FileText className="size-16 mb-4" />
              <p className="text-sm">{t("Select an image to see OCR results")}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
