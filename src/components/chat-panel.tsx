import React, { useEffect, useState, useRef, useImperativeHandle, forwardRef } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Brain, ChevronDown, Search, Database, Paperclip, X, FileText, Table2, Upload, Loader2, Square, Sparkles, AudioWaveform, Bot, Wand2, MoreHorizontal, Mic, Trash2 } from "lucide-react"
import { useI18n } from "@/lib/i18n"

type Model = { id: string; name: string; provider: string }

const PROVIDER_COLORS: Record<string, string> = {
  ollama: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  lmstudio: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  openai: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  'local-gguf': 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
}

function formatModelName(name: string): string {
  if (!name) return ""
  let formatted = name.replace(/\.(gguf|bin|sh)$/i, "")
  formatted = formatted.replace(/-q[0-9]_[0-9a-zA-Z_]+/i, "")
  formatted = formatted.replace(/-q[0-9]_[a-zA-Z]+/i, "")
  formatted = formatted.replace(/-q[0-9](_k)?(_m)?/i, "")
  formatted = formatted.replace(/-qat/i, "")
  formatted = formatted.replace(/-gguf/i, "")
  return formatted
}


export interface ChatPanelHandle {
  setValue: (value: string | ((prev: string) => string)) => void;
  focus: () => void;
  getValue: () => string;
}

interface UploadedFile {
  name: string
  type: string
  dataUrl?: string
  path?: string
}

interface PromptItem {
  id: string
  name: string
  description?: string
  content?: string
  isSystem?: boolean
}

interface ChatPanelProps {
  onSubmit: (input: string, docOptions?: { docType: 'none' | 'ppt' | 'docx' | 'xlsx'; docStyle: string; docTheme: string }) => void;
  isLoading: boolean;
  stop: () => void;
  selectedModel: string;
  setSelectedModel: (m: string) => void;
  webSearch: boolean | 'auto' | 'deep';
  setWebSearch: (v: boolean | 'auto' | 'deep') => void;
  deepThink: boolean;
  setDeepThink: (v: boolean) => void;
  kbId?: string | null;
  setKbId?: (v: string | null) => void;
  uploadedFiles: UploadedFile[];
  setUploadedFiles: (files: UploadedFile[]) => void;
  selectedPrompt?: PromptItem | null;
  setSelectedPrompt?: (p: PromptItem | null) => void;
  onDocAction?: (action: 'new-word' | 'new-excel' | 'upload-doc' | 'ai-generate') => void;
}

export const ChatPanel = forwardRef<ChatPanelHandle, ChatPanelProps>(({
  onSubmit, isLoading, stop,
  selectedModel, setSelectedModel,
  webSearch, setWebSearch,
  deepThink, setDeepThink,
  kbId, setKbId,
  uploadedFiles, setUploadedFiles,
  selectedPrompt, setSelectedPrompt,
  onDocAction
}, ref) => {
  const { t, language } = useI18n()
  const [input, setInput] = useState("")

  // 录音相关状态
  const [voiceRecording, setVoiceRecording] = useState(false)
  const [voiceProcessing, setVoiceProcessing] = useState(false)
  const [isCancelReady, setIsCancelReady] = useState(false)
  const [recordDuration, setRecordDuration] = useState(0)
  const [voiceError, setVoiceError] = useState("")

  // 录音与语音识别相关 Refs 与状态
  const [realtimeText, setRealtimeText] = useState("")
  const recognitionRef = useRef<any>(null)
  const durationIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const pressStartTimeRef = useRef<number>(0)
  const touchStartYRef = useRef<number>(0)
  const wasRecordingRef = useRef<boolean>(false)
  const realtimeTextRef = useRef<string>("")
  const shouldSubmitRef = useRef<boolean>(false)
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null)
  const isRecordingStartedRef = useRef<boolean>(false)

  const startVoiceRecord = async () => {
    try {
      setVoiceError("")
      setRealtimeText("")
      realtimeTextRef.current = ""
      shouldSubmitRef.current = false
      
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
      if (!SpeechRecognition) {
        setVoiceError(t("Web speech recognition is not supported in this browser") || "当前浏览器不支持网页语音识别工具")
        setTimeout(() => setVoiceError(""), 3000)
        return
      }

      const rec = new SpeechRecognition()
      rec.continuous = true
      const speechLocaleMap: Record<string, string> = {
        zh: 'zh-CN', 'zh-TW': 'zh-TW', ja: 'ja-JP', ko: 'ko-KR',
        es: 'es-ES', fr: 'fr-FR', de: 'de-DE', it: 'it-IT',
        pt: 'pt-BR', ru: 'ru-RU', vi: 'vi-VN', th: 'th-TH',
        id: 'id-ID', ar: 'ar-SA', en: 'en-US'
      }
      rec.lang = speechLocaleMap[language] || 'en-US'

      rec.onresult = (event: any) => {
        let finalTranscript = ""
        let interimTranscript = ""
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript
          } else {
            interimTranscript += event.results[i][0].transcript
          }
        }
        const latestTranscript = finalTranscript || interimTranscript
        setRealtimeText(latestTranscript)
        realtimeTextRef.current = latestTranscript
      }

      rec.onerror = (e: any) => {
        if (e.error === 'aborted' || e.error === 'no-speech') {
          return
        }
        
        console.error('Speech recognition error:', e)
        if (e.error === 'not-allowed') {
          setVoiceError(t("Microphone permission denied") || "麦克风权限被拒绝")
        } else {
          setVoiceError(`${t("Recognition error") || "识别出错"}: ${e.error}`)
        }
        setTimeout(() => setVoiceError(""), 3000)
      }

      rec.onend = () => {
        if (shouldSubmitRef.current && realtimeTextRef.current) {
          wasRecordingRef.current = true
          setTimeout(() => {
            wasRecordingRef.current = false
          }, 300)

          setInput(prev => {
            const space = prev && !prev.endsWith(' ') ? ' ' : ''
            return prev + space + realtimeTextRef.current
          })
          setTimeout(() => textareaRef.current?.focus(), 50)
        }
        setVoiceRecording(false)
      }

      recognitionRef.current = rec
      pressStartTimeRef.current = Date.now()
      rec.start()
      setVoiceRecording(true)
      setRecordDuration(0)

      if (durationIntervalRef.current) clearInterval(durationIntervalRef.current)
      durationIntervalRef.current = setInterval(() => {
        setRecordDuration(prev => {
          if (prev >= 59) {
            stopVoiceRecord(false)
            return 60
          }
          return prev + 1
        })
      }, 1000)
    } catch (err) {
      console.error('Failed to start voice recognition:', err)
    }
  }

  const stopVoiceRecord = (isCancel = false) => {
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current)
      durationIntervalRef.current = null
    }

    const duration = Date.now() - pressStartTimeRef.current
    const rec = recognitionRef.current

    if (rec) {
      if (isCancel || duration < 500) {
        shouldSubmitRef.current = false
        rec.stop()
        if (duration < 500) {
          setVoiceError(t("Recording time too short"))
          setTimeout(() => setVoiceError(""), 2000)
        }
        setVoiceRecording(false)
      } else {
        shouldSubmitRef.current = true
        rec.stop()
      }
    } else {
      setVoiceRecording(false)
    }
  }

  // Mouse Events
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return // Only left click
    e.preventDefault()
    setIsCancelReady(false)
    isRecordingStartedRef.current = false

    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current)
    longPressTimerRef.current = setTimeout(() => {
      isRecordingStartedRef.current = true
      startVoiceRecord()
    }, 250)
  }

  const handleMouseUp = (e: React.MouseEvent) => {
    e.preventDefault()
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }

    if (isRecordingStartedRef.current) {
      stopVoiceRecord(isCancelReady)
    } else {
      // 单击：如果输入框有文字，直接提交发送
      if (input.trim() || uploadedFiles.length > 0) {
        handleSubmit()
      }
    }
    isRecordingStartedRef.current = false
    setIsCancelReady(false)
  }

  const handleMouseLeave = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }

    if (isRecordingStartedRef.current) {
      setIsCancelReady(true)
    }
  }

  const handleMouseEnter = () => {
    if (isRecordingStartedRef.current) {
      setIsCancelReady(false)
    }
  }

  // Touch Events
  const handleTouchStart = (e: React.TouchEvent) => {
    e.preventDefault()
    if (e.touches.length > 0) {
      touchStartYRef.current = e.touches[0].clientY
    }
    setIsCancelReady(false)
    isRecordingStartedRef.current = false

    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current)
    longPressTimerRef.current = setTimeout(() => {
      isRecordingStartedRef.current = true
      startVoiceRecord()
    }, 250)
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isRecordingStartedRef.current || e.touches.length === 0) return
    const currentY = e.touches[0].clientY
    const diffY = touchStartYRef.current - currentY
    if (diffY > 60) {
      setIsCancelReady(true)
    } else {
      setIsCancelReady(false)
    }
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    e.preventDefault()
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }

    if (isRecordingStartedRef.current) {
      stopVoiceRecord(isCancelReady)
    } else {
      // 单击
      if (input.trim() || uploadedFiles.length > 0) {
        handleSubmit()
      }
    }
    isRecordingStartedRef.current = false
    setIsCancelReady(false)
  }

  const handleTouchCancel = (e: React.TouchEvent) => {
    e.preventDefault()
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current)
      longPressTimerRef.current = null
    }

    if (isRecordingStartedRef.current) {
      stopVoiceRecord(true)
    }
    setIsCancelReady(false)
  }
  const [docType, setDocType] = useState<'none' | 'ppt' | 'docx' | 'xlsx'>('none')
  const [docStyle, setDocStyle] = useState<string>('swiss')
  const [docTheme, setDocTheme] = useState<string>('zinc')
  const [refreshingModels, setRefreshingModels] = useState(false)
  const [models, setModels] = useState<Model[]>([])
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false)
  const [kbs, setKbs] = useState<Array<{ id: string; name: string }>>([])
  const [kbDropdownOpen, setKbDropdownOpen] = useState(false)
  const [prompts, setPrompts] = useState<PromptItem[]>([])
  const [promptDropdownOpen, setPromptDropdownOpen] = useState(false)
  const [docDropdownOpen, setDocDropdownOpen] = useState(false)
  const [showMoreMobile, setShowMoreMobile] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useImperativeHandle(ref, () => ({
    setValue: (val) => {
      if (typeof val === 'function') {
        setInput(val)
      } else {
        setInput(val)
      }
    },
    focus: () => {
      textareaRef.current?.focus()
    },
    getValue: () => input
  }))

  const refreshKbs = () => fetch('/api/kb').then(res => {
    if (!res.ok) return
    return res.json()
  }).then(data => { if(Array.isArray(data)) setKbs(data) }).catch((err) => { console.error('[Chat] Failed to refresh knowledge bases:', err) })

  useEffect(() => {
    refreshKbs()
    refreshModels()
    refreshPrompts()
  }, [])

  const refreshPrompts = () => fetch('/api/prompts').then(res => res.json()).then(data => { if(Array.isArray(data)) setPrompts(data) }).catch(() => {})

  const refreshModels = () => {
    if (refreshingModels) return
    setRefreshingModels(true)
    fetch('/api/models?refresh=true')
      .then(res => res.json())
      .then(data => {
        const fetchedModels = Array.isArray(data) ? data : (data.models || [])
        setModels(fetchedModels)
        if (fetchedModels.length > 0 && !fetchedModels.find((m: { id: string }) => m.id === selectedModel)) {
          setSelectedModel(fetchedModels[0].id)
        }
      })
      .catch((err) => { console.error('[Chat] Failed to refresh models:', err) })
      .finally(() => setRefreshingModels(false))
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault()
    if (voiceRecording || wasRecordingRef.current) {
      wasRecordingRef.current = false
      return
    }
    if ((!input.trim() && uploadedFiles.length === 0) || isLoading) return
    onSubmit(input, { docType, docStyle, docTheme })
    setInput("")
  }

  const currentModel = models.find(m => m.id === selectedModel)
  const groupedModels = models.reduce((acc, m) => {
    if (!acc[m.provider]) acc[m.provider] = []
    acc[m.provider].push(m)
    return acc
  }, {} as Record<string, Model[]>)
  
  const providerLabel: Record<string, string> = { 
    ollama: 'Ollama', 
    lmstudio: 'LM Studio', 
    openai: 'OpenAI',
    'local-gguf': 'Local GGUF'
  }

  const ALLOWED_FILE_TYPES = [
    'text/plain', 'text/markdown', 'text/csv', 'text/html', 'text/xml',
    'text/x-python', 'text/x-typescript', 'text/x-javascript',
    'text/x-rust', 'text/x-go', 'text/x-java', 'text/x-c', 'text/x-c++',
    'application/json', 'application/xml', 'application/x-yaml',
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/msword', 'application/vnd.ms-excel', 'application/vnd.ms-powerpoint',
    'application/zip', 'application/gzip',
    'image/png', 'image/jpeg', 'image/gif', 'image/webp',
  ]
  const MAX_FILE_SIZE_MB = 50
  const MAX_FILES = 10

  const validateFile = (file: File): string | null => {
    if (ALLOWED_FILE_TYPES.length > 0 && file.type && !ALLOWED_FILE_TYPES.includes(file.type)) {
      const ext = file.name.split('.').pop()?.toLowerCase()
      if (ext && !['md', 'txt', 'py', 'ts', 'tsx', 'js', 'jsx', 'json', 'xml', 'yaml', 'yml', 'rs', 'go', 'java', 'c', 'cpp', 'h', 'hpp', 'cs', 'rb', 'sh', 'bat', 'ps1', 'html', 'htm', 'css', 'sql', 'log', 'csv', 'pdf', 'docx', 'xlsx', 'pptx', 'doc', 'xls', 'ppt', 'zip', 'gz', 'tar', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) {
        return t('File type not supported') + ': ' + file.name
      }
    }
    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      return t('File too large') + ': ' + file.name + ' (' + (file.size / (1024*1024)).toFixed(1) + 'MB)'
    }
    return null
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return
    if (uploadedFiles.length + files.length > MAX_FILES) {
      alert(t('Maximum') + ' ' + MAX_FILES + ' ' + t('files allowed'))
      return
    }

    for (const file of Array.from(files)) {
      const error = validateFile(file)
      if (error) {
        alert(error)
        return
      }
    }

    setIsUploading(true)
    const formData = new FormData()
    for (let i = 0; i < files.length; i++) {
      formData.append('files', files[i])
    }

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: 'Upload failed' }))
        alert(t('Upload failed') + ': ' + (errData.error || `HTTP ${res.status}`))
        return
      }
      const data = await res.json()
      if (data.files) {
        setUploadedFiles([...uploadedFiles, ...data.files])
      }
    } catch (err) {
      console.error('Upload failed', err)
      alert(t('Upload failed'))
    } finally {
      setIsUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const removeFile = (index: number) => {
    setUploadedFiles(uploadedFiles.filter((_, i) => i !== index))
  }

  return (
    <div className="w-full flex flex-col gap-4">
      {/* File Chips */}
      {uploadedFiles.length > 0 && (
        <div className="flex flex-wrap gap-2 px-1">
          {uploadedFiles.map((file, i) => (
            <div 
              key={i} 
              className="group flex items-center gap-1.5 pl-1.5 pr-1 py-1 rounded-xl bg-white dark:bg-card border border-border text-xs animate-in fade-in slide-in-from-bottom-1 shadow-sm"
            >
              {file.dataUrl ? (
                <div className="size-5 rounded-md overflow-hidden border border-border">
                  <img src={file.dataUrl} alt="" className="size-full object-cover" />
                </div>
              ) : (
                <FileText className="size-3 text-muted-foreground ml-0.5" />
              )}
              <span className="max-w-[120px] truncate text-foreground font-medium">
                {file.name}
              </span>
              <button
                type="button"
                onClick={() => removeFile(i)}
                className="p-0.5 rounded-full hover:bg-muted dark:hover:bg-muted text-muted-foreground hover:text-destructive transition-colors"
              >
                <X className="size-3" />
              </button>
            </div>
          ))}
          {isUploading && (
            <div className="flex items-center gap-2 px-3 py-1 rounded-xl bg-white/50 dark:bg-card/50 border border-dashed border-border text-[10px] text-muted-foreground">
              <Loader2 className="size-3 animate-spin" />
              {t("Parsing...")}
            </div>
          )}
        </div>
      )}

      {/* Main Integrated Container */}
      <div className="relative flex w-full flex-col rounded-[2rem] bg-white dark:bg-card border border-border dark:border-border shadow-xl transition-all focus-within:ring-4 focus-within:ring-primary/5 focus-within:border-primary/40">
        <form
          onSubmit={handleSubmit}
          className="relative flex flex-col"
        >
          {/* Voice Recording Overlay */}
          {voiceRecording && (
            <div className={`absolute inset-0 z-30 rounded-[2rem] backdrop-blur-md flex flex-col items-center justify-center gap-4 animate-in fade-in duration-200 transition-colors ${
              isCancelReady 
                ? 'bg-red-500/10 dark:bg-red-950/20 border-2 border-red-500/40' 
                : 'bg-white/80 dark:bg-zinc-950/80 border-2 border-primary/20'
            }`}>
              <div className="relative flex items-center justify-center">
                {isCancelReady ? (
                  <div className="size-16 rounded-full bg-red-500 flex items-center justify-center text-white shadow-lg shadow-red-500/30 transition-transform scale-110 animate-pulse">
                    <Trash2 className="size-6" />
                  </div>
                ) : (
                  <>
                    <div className="absolute size-24 rounded-full bg-primary/10 animate-ping duration-1000" />
                    <div className="absolute size-16 rounded-full bg-primary/20 animate-pulse duration-700" />
                    <div className="size-12 rounded-full bg-primary flex items-center justify-center text-primary-foreground shadow-lg shadow-primary/30">
                      <Mic className="size-6 animate-bounce" />
                    </div>
                  </>
                )}
              </div>
              
              <div className="flex flex-col items-center gap-1">
                <span className={`text-sm font-bold animate-pulse ${isCancelReady ? 'text-red-500' : 'text-foreground'}`}>
                  {isCancelReady ? t("Release to cancel") : t("Recording...")}
                </span>
                <span className="text-xs text-muted-foreground">{recordDuration}s / 60s</span>
              </div>

              {!isCancelReady && realtimeText && (
                <div className="px-6 py-2 bg-muted/40 dark:bg-zinc-800/40 rounded-xl border border-border/50 max-w-[85%] max-h-[80px] overflow-y-auto app-scrollbar text-center animate-in fade-in zoom-in-95 duration-150">
                  <p className="text-xs text-foreground/80 font-medium italic select-none">
                    "{realtimeText}"
                  </p>
                </div>
              )}
              
              <div className="text-[10px] text-muted-foreground px-3 py-1 bg-muted/60 rounded-full border border-border">
                {t("Release to send, move out to cancel")}
              </div>
            </div>
          )}

          {voiceError && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-40 bg-red-500 text-white text-xs px-4 py-2 rounded-full shadow-lg border border-red-600 animate-in fade-in slide-in-from-top-1 font-semibold flex items-center gap-1.5 max-w-[90%] text-center">
              <span>⚠️</span>
              <span>{voiceError}</span>
            </div>
          )}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            multiple
            className="hidden"
          />

          {/* Document Generation Options Panel */}
          {docType !== 'none' && (
            <div className="mx-4 mt-4 p-3.5 rounded-2xl bg-white/60 dark:bg-zinc-900/60 backdrop-blur-xl border border-zinc-200/50 dark:border-zinc-800/50 animate-in slide-in-from-top-2 duration-300 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`p-1.5 rounded-lg ${
                    docType === 'ppt' ? 'bg-orange-500/10 text-orange-500' :
                    docType === 'docx' ? 'bg-blue-500/10 text-blue-500' : 'bg-emerald-500/10 text-emerald-500'
                  }`}>
                    <FileText className="size-4" />
                  </div>
                  <span className="text-sm font-bold text-foreground">
                    {docType === 'ppt' ? t('AI PPT Courseware') :
                     docType === 'docx' ? t('AI Word Document') : t('AI Excel Spreadsheet')}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setDocType('none')}
                  className="p-1 rounded-full hover:bg-muted dark:hover:bg-muted text-muted-foreground transition-colors"
                >
                  <X className="size-4" />
                </button>
              </div>

              {docType === 'ppt' && (
                <div className="flex flex-col gap-3 border-t border-border/50 pt-2.5 animate-in fade-in duration-200">
                  {/* Style selector */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs text-muted-foreground mr-1.5">{t('Style Template')}:</span>
                    {[
                      { id: 'swiss', label: 'Swiss Grid' },
                      { id: 'apple', label: 'Apple Minimal' },
                      { id: 'editorial', label: 'Editorial Magazine' },
                      { id: 'modern', label: 'Modern Flat' },
                      { id: 'pencil', label: 'Hand-drawn Doodle' }
                    ].map((style) => (
                      <button
                        key={style.id}
                        type="button"
                        onClick={() => setDocStyle(style.id)}
                        className={`px-3 py-1 rounded-full text-xs font-semibold border transition-all ${
                          docStyle === style.id
                            ? 'bg-orange-500 text-white border-orange-500 shadow-md shadow-orange-500/15 scale-105'
                            : 'bg-muted/40 text-muted-foreground border-border hover:bg-muted'
                        }`}
                      >
                        {t(style.label)}
                      </button>
                    ))}
                  </div>

                  {/* Theme selector */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs text-muted-foreground mr-1.5">{t('Color Theme')}:</span>
                    {[
                      { id: 'zinc', color: 'bg-zinc-800 dark:bg-zinc-200 ring-zinc-300', label: t('Minimalist Dark') || '极简黑' },
                      { id: 'orange', color: 'bg-orange-500 ring-orange-200', label: t('Vibrant Orange') || '活力橙' },
                      { id: 'blue', color: 'bg-blue-500 ring-blue-200', label: t('Tech Blue') || '蔚蓝科' },
                      { id: 'green', color: 'bg-green-500 ring-green-200', label: t('Mint Green') || '薄荷绿' },
                      { id: 'rose', color: 'bg-rose-500 ring-rose-200', label: t('Romantic Pink') || '浪漫粉' }
                    ].map((theme) => (
                      <button
                        key={theme.id}
                        type="button"
                        onClick={() => setDocTheme(theme.id)}
                        title={theme.label}
                        className={`size-6 rounded-full ${theme.color} flex items-center justify-center transition-all relative ${
                          docTheme === theme.id 
                            ? 'ring-4 ring-offset-2 ring-primary/40 scale-110 shadow-lg' 
                            : 'hover:scale-105 hover:shadow'
                        }`}
                      >
                        {docTheme === theme.id && (
                          <span className="absolute inset-0 m-auto size-2 rounded-full bg-white shadow-sm" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Textarea Row */}
          <div className="flex items-start px-2">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={uploadedFiles.length > 0 ? t("Describe or ask questions about these files...") : t("Message {{modelName}}...", { modelName: formatModelName(currentModel?.name || 'OpenOrangeAI') })}
              className="min-h-[80px] max-h-64 w-full resize-none border-0 bg-transparent px-4 pt-6 pb-2 focus-visible:ring-0 text-base sm:text-lg leading-relaxed placeholder:text-muted-foreground"
              rows={1}
            />
          </div>

          {/* Integrated Toolbar & Actions row */}
          <div className="flex items-center justify-between px-3 pb-3 pt-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              {/* Upload Pill */}
              <button
                type="button"
                disabled={isUploading}
                onClick={() => fileInputRef.current?.click()}
                className="p-2 rounded-full text-muted-foreground hover:text-primary hover:bg-muted dark:hover:bg-muted transition-all disabled:opacity-50"
              >
                {isUploading ? <Loader2 className="size-5 animate-spin" /> : <Paperclip className="size-5" />}
              </button>

              {/* Model Picker Pill */}
              <div className="relative">
                <button 
                  type="button"
                  onClick={() => {
                    setModelDropdownOpen(!modelDropdownOpen)
                    if (!modelDropdownOpen) refreshModels()
                  }}
                  className="flex items-center gap-1.5 h-9 px-3 rounded-full border border-border dark:border-border bg-muted/50 dark:bg-card/50 hover:bg-muted dark:hover:bg-muted transition-all text-xs font-medium text-muted-foreground dark:text-zinc-300 shadow-sm"
                >
                  {currentModel && <Sparkles className="size-3 text-purple-500" />}
                  <span className="max-w-[70px] sm:max-w-[120px] truncate">{formatModelName(currentModel?.name || t("Select model"))}</span>
                  <ChevronDown className="size-3 text-muted-foreground" />
                </button>

                {modelDropdownOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setModelDropdownOpen(false)} />
                    <div className="absolute bottom-full left-0 mb-2 w-56 sm:w-64 max-h-[250px] overflow-y-auto app-scrollbar bg-white dark:bg-card border border-border dark:border-border rounded-2xl shadow-2xl z-50 py-2">
                      {Object.entries(groupedModels).map(([provider, pModels]) => (
                        <div key={provider}>
                          <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
                            {providerLabel[provider] || provider}
                          </div>
                          {pModels.map(m => (
                            <button
                              key={m.id}
                              onClick={() => { setSelectedModel(m.id); setModelDropdownOpen(false) }}
                              className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted/50 dark:hover:bg-muted text-left transition-colors"
                            >
                              <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${PROVIDER_COLORS[m.provider] || ''}`}>
                                {m.provider === 'lmstudio' ? 'LMS' : m.provider === 'local-gguf' ? 'GGUF' : m.provider.toUpperCase()}
                              </span>
                              <span className="truncate text-sm text-foreground dark:text-zinc-300">{m.name}</span>
                              {m.id === selectedModel && <span className="ml-auto text-xs text-primary font-bold">✓</span>}
                            </button>
                          ))}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {(() => {
                const extraTools = (
                  <>
                    {/* Web Search Pill */}
              <button
                type="button"
                onClick={() => {
                  if (webSearch === 'auto') setWebSearch('deep')
                  else if (webSearch === 'deep') setWebSearch(true)
                  else if (webSearch === true) setWebSearch(false)
                  else setWebSearch('auto')
                }}
                className={`flex items-center gap-1.5 h-9 px-4 rounded-full border transition-all text-xs font-semibold ${
                  webSearch === 'auto'
                    ? 'bg-amber-50/50 text-amber-700 border-amber-200/50 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-800/50'
                    : webSearch === 'deep'
                    ? 'bg-purple-50/50 text-purple-700 border-purple-200/50 dark:bg-purple-950/30 dark:text-purple-300 dark:border-purple-800/50'
                    : webSearch === true
                    ? 'bg-sky-50/50 text-sky-700 border-sky-200/50 dark:bg-sky-950/30 dark:text-sky-300 dark:border-sky-800/50'
                    : 'bg-muted/50 text-muted-foreground border-border dark:bg-card/50 dark:border-border'
                }`}
              >
                <Search className="size-3.5" />
                <span>{webSearch === 'auto' ? t('Auto') : webSearch === 'deep' ? 'Deep' : webSearch ? t('On') : t('Off')}</span>
              </button>

              {/* KB Pill */}
              {setKbId && (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => { setKbDropdownOpen(!kbDropdownOpen); if (!kbDropdownOpen) refreshKbs() }}
                    className={`flex items-center gap-1.5 h-9 px-4 rounded-full border transition-all text-xs font-semibold ${
                      kbId ? 'bg-primary/5 text-primary border-primary/20' : 'bg-muted/50 text-muted-foreground border-border dark:bg-card/50 dark:border-border'
                    }`}
                  >
                    <Database className="size-3.5" />
                    <span className="max-w-[100px] truncate">{kbId ? kbs.find(k => k.id === kbId)?.name : t("Knowledge")}</span>
                  </button>
                  {kbDropdownOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setKbDropdownOpen(false)} />
                      <div className="absolute bottom-full left-0 mb-2 w-56 max-h-64 overflow-y-auto bg-white dark:bg-card border border-border rounded-2xl shadow-2xl z-50 py-2">
                        <button
                          onClick={() => { setKbId(null); setKbDropdownOpen(false) }}
                          className={`w-full px-4 py-2 hover:bg-muted/50 text-left text-sm ${!kbId ? 'text-primary font-bold' : 'text-muted-foreground'}`}
                        >
                          {t("None")}
                        </button>
                        {kbs.map(kb => (
                          <button
                            key={kb.id}
                            onClick={() => { setKbId(kb.id); setKbDropdownOpen(false) }}
                            className={`w-full px-4 py-2 hover:bg-muted/50 text-left text-sm ${kb.id === kbId ? 'text-primary font-bold' : ''}`}
                          >
                            {kb.name}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Deep Think Pill */}
              <button
                type="button"
                onClick={() => setDeepThink(!deepThink)}
                className={`flex items-center gap-1.5 h-9 px-4 rounded-full border transition-all text-xs font-semibold ${
                  deepThink ? 'bg-primary/10 text-primary border-primary/20' : 'bg-muted/50 text-muted-foreground border-border dark:bg-card/50 dark:border-border'
                }`}
              >
                <Brain className="size-3.5" />
                <span>{t("Thinking")}</span>
              </button>

              <div className="relative">
                <button
                  type="button"
                  onClick={() => setDocDropdownOpen(!docDropdownOpen)}
                  className="flex items-center gap-1.5 h-9 px-4 rounded-full border transition-all text-xs font-semibold bg-muted/50 text-muted-foreground border-border dark:bg-card/50 dark:border-border hover:bg-muted dark:hover:bg-muted"
                >
                  <FileText className="size-3.5" />
                  <span>{t("Documents")}</span>
                  <ChevronDown className="size-3 text-muted-foreground" />
                </button>
                {docDropdownOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setDocDropdownOpen(false)} />
                    <div className="absolute bottom-full left-0 mb-2 w-56 bg-white dark:bg-card border border-border dark:border-border rounded-2xl shadow-2xl z-50 py-2">
                      <button
                        onClick={() => {
                          setDocType('ppt')
                          setInput(t('prompt.generate_ppt') || '请帮我制作一份关于 [主题] 的 PPT 幻灯片，内容包含：\n1. \n2. \n3. ')
                          setDocDropdownOpen(false)
                          setTimeout(() => textareaRef.current?.focus(), 100)
                        }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50 dark:hover:bg-muted text-left transition-colors"
                      >
                        <div className="p-1.5 bg-orange-500/10 rounded-lg">
                          <Sparkles className="size-4 text-orange-500" />
                        </div>
                        <div className="flex flex-col">
                          <span className="text-sm font-medium text-foreground dark:text-zinc-200">{t("AI Generate PPT")}</span>
                          <span className="text-[10px] text-muted-foreground">{t("Auto output design-oriented slide JSON")}</span>
                        </div>
                      </button>
                      <button
                        onClick={() => {
                          setDocType('docx')
                          setInput(t('prompt.generate_word') || '请帮我撰写一份关于 [主题] 的 Word 文档，格式要求排版工整，包含：\n1. \n2. ')
                          setDocDropdownOpen(false)
                          setTimeout(() => textareaRef.current?.focus(), 100)
                        }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50 dark:hover:bg-muted text-left transition-colors"
                      >
                        <div className="p-1.5 bg-blue-500/10 rounded-lg">
                          <FileText className="size-4 text-blue-500" />
                        </div>
                        <div className="flex flex-col">
                          <span className="text-sm font-medium text-foreground dark:text-zinc-200">{t("AI Generate Word")}</span>
                          <span className="text-[10px] text-muted-foreground">{t("Output beautiful HTML format report")}</span>
                        </div>
                      </button>
                      <button
                        onClick={() => {
                          setDocType('xlsx')
                          setInput(t('prompt.generate_excel') || '请帮我生成一份关于 [主题] 的 Excel 表格，包含以下列和数据：\n1. \n2. ')
                          setDocDropdownOpen(false)
                          setTimeout(() => textareaRef.current?.focus(), 100)
                        }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50 dark:hover:bg-muted text-left transition-colors"
                      >
                        <div className="p-1.5 bg-emerald-500/10 rounded-lg">
                          <Table2 className="size-4 text-emerald-500" />
                        </div>
                        <div className="flex flex-col">
                          <span className="text-sm font-medium text-foreground dark:text-zinc-200">{t("AI Generate Excel")}</span>
                          <span className="text-[10px] text-muted-foreground">{t("Output structured JSON spreadsheet")}</span>
                        </div>
                      </button>
                      <div className="h-px bg-muted dark:bg-muted my-1" />
                      <button
                        onClick={() => { onDocAction?.('new-word'); setDocDropdownOpen(false) }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50 dark:hover:bg-muted text-left transition-colors"
                      >
                        <div className="p-1.5 bg-blue-500/10 rounded-lg">
                          <FileText className="size-4 text-blue-500" />
                        </div>
                        <div className="flex flex-col">
                          <span className="text-sm font-medium text-foreground dark:text-zinc-200">{t("New Word Document")}</span>
                          <span className="text-[10px] text-muted-foreground">{t("Create and edit rich text document")}</span>
                        </div>
                      </button>
                      <button
                        onClick={() => { onDocAction?.('new-excel'); setDocDropdownOpen(false) }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50 dark:hover:bg-muted text-left transition-colors"
                      >
                        <div className="p-1.5 bg-emerald-500/10 rounded-lg">
                          <Table2 className="size-4 text-emerald-500" />
                        </div>
                        <div className="flex flex-col">
                          <span className="text-sm font-medium text-foreground dark:text-zinc-200">{t("New Excel Sheet")}</span>
                          <span className="text-[10px] text-muted-foreground">{t("Create and edit spreadsheet")}</span>
                        </div>
                      </button>
                      <div className="h-px bg-muted dark:bg-muted my-1" />
                      <button
                        onClick={() => { onDocAction?.('ai-generate'); setDocDropdownOpen(false) }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50 dark:hover:bg-muted text-left transition-colors"
                      >
                        <div className="p-1.5 bg-purple-500/10 rounded-lg">
                          <Wand2 className="size-4 text-purple-500" />
                        </div>
                        <div className="flex flex-col">
                          <span className="text-sm font-medium text-foreground dark:text-zinc-200">{t("AI Generate Document")}</span>
                          <span className="text-[10px] text-muted-foreground">{t("Generate document content with AI prompts")}</span>
                        </div>
                      </button>
                      <div className="h-px bg-muted dark:bg-muted my-1" />
                      <button
                        onClick={() => { onDocAction?.('upload-doc'); setDocDropdownOpen(false) }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50 dark:hover:bg-muted text-left transition-colors"
                      >
                        <div className="p-1.5 bg-amber-500/10 rounded-lg">
                          <Upload className="size-4 text-amber-500" />
                        </div>
                        <div className="flex flex-col">
                          <span className="text-sm font-medium text-foreground dark:text-zinc-200">{t("Upload Document to Edit")}</span>
                          <span className="text-[10px] text-muted-foreground">{t("Upload .docx/.xlsx file for online editing")}</span>
                        </div>
                      </button>
                    </div>
                  </>
                )}
              </div>

              {/* Prompt Hub Pill */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => { setPromptDropdownOpen(!promptDropdownOpen); if (!promptDropdownOpen) refreshPrompts() }}
                  className={`flex items-center gap-1.5 h-9 px-4 rounded-full border transition-all text-xs font-semibold ${
                    selectedPrompt ? 'bg-amber-50/50 text-amber-700 border-amber-200/50 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-800/50' : 'bg-muted/50 text-muted-foreground border-border dark:bg-card/50 dark:border-border'
                  }`}
                >
                  <Sparkles className={`size-3.5 ${selectedPrompt ? 'text-amber-500' : 'text-muted-foreground'}`} />
                  <span className="max-w-[100px] truncate">{selectedPrompt ? selectedPrompt.name : t("Default Role")}</span>
                </button>
                {promptDropdownOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setPromptDropdownOpen(false)} />
                    <div className="absolute bottom-full left-0 mb-2 w-64 max-h-80 overflow-y-auto bg-white dark:bg-card border border-border rounded-2xl shadow-2xl z-50 py-2">
                      <button
                        onClick={() => { setSelectedPrompt?.(null); setPromptDropdownOpen(false) }}
                        className={`w-full px-4 py-2 hover:bg-muted/50 dark:hover:bg-muted text-left text-sm flex items-center gap-2 ${!selectedPrompt ? 'text-primary font-bold bg-primary/5' : 'text-muted-foreground dark:text-muted-foreground'}`}
                      >
                         <Bot className="size-3.5" />
                         <span>{t("Default General Assistant")}</span>
                      </button>
                      <div className="h-px bg-muted dark:bg-muted my-1" />
                      {prompts.map(p => (
                        <button
                          key={p.id}
                          onClick={() => { setSelectedPrompt?.(p); setPromptDropdownOpen(false) }}
                          className={`w-full px-4 py-2 hover:bg-muted/50 dark:hover:bg-muted text-left transition-colors flex flex-col gap-0.5 ${p.id === selectedPrompt?.id ? 'bg-primary/5 border-l-2 border-primary' : ''}`}
                        >
                          <div className="flex items-center gap-2">
                             <Sparkles className="size-3 text-amber-500" />
                             <span className={`text-sm ${p.id === selectedPrompt?.id ? 'text-primary font-bold' : 'text-foreground dark:text-zinc-200 font-medium'}`}>{p.name}</span>
                          </div>
                          {p.description && <span className="text-[10px] text-muted-foreground truncate pl-5">{p.description}</span>}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
                  </>
                );

                return (
                  <>
                    {/* Desktop Extra Tools */}
                    <div className="hidden sm:flex items-center gap-1.5 flex-wrap">
                      {extraTools}
                    </div>

                    {/* Mobile More Tools Toggle */}
                    <div className="relative sm:hidden">
                      <button
                        type="button"
                        onClick={() => setShowMoreMobile(!showMoreMobile)}
                        className={`flex items-center justify-center size-9 rounded-full border transition-all shadow-sm ${
                          showMoreMobile 
                            ? 'bg-primary/10 text-primary border-primary/20' 
                            : 'bg-muted/50 text-muted-foreground border-border dark:bg-card/50 hover:bg-muted dark:hover:bg-muted'
                        }`}
                      >
                        <MoreHorizontal className="size-4" />
                      </button>
                      {showMoreMobile && (
                        <>
                          <div className="fixed inset-0 z-30" onClick={() => setShowMoreMobile(false)} />
                          <div className="absolute bottom-[calc(100%+8px)] left-0 w-[260px] p-3 flex flex-wrap gap-2 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md border border-border dark:border-zinc-800 rounded-2xl shadow-xl z-40 animate-in slide-in-from-bottom-2 fade-in">
                            <div className="w-full text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1 px-1">
                              {t("More Tools")}
                            </div>
                            {extraTools}
                          </div>
                        </>
                      )}
                    </div>
                  </>
                );
              })()}
            </div>

            {/* Action Buttons (Far Right) */}
            <div className="flex items-center gap-2 ml-auto pr-1">
              {isLoading ? (
                <Button
                  size="icon" variant="ghost" type="button"
                  className="rounded-full size-10 bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors shadow-sm"
                  onClick={stop}
                >
                  <Square className="size-4 fill-current" />
                </Button>
              ) : (
                <Button
                  type="submit"
                  size="icon"
                  onMouseDown={handleMouseDown}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={handleMouseLeave}
                  onMouseEnter={handleMouseEnter}
                  onTouchStart={handleTouchStart}
                  onTouchMove={handleTouchMove}
                  onTouchEnd={handleTouchEnd}
                  onTouchCancel={handleTouchCancel}
                  disabled={voiceProcessing}
                  className={`rounded-full h-10 w-14 bg-primary text-primary-foreground hover:bg-primary/90 transition-all shadow-lg active:scale-95 flex items-center justify-center p-0 relative ${
                    voiceRecording
                      ? 'bg-red-500 hover:bg-red-600 text-white border-red-500 scale-110 shadow-lg shadow-red-500/25 animate-pulse z-40'
                      : !input.trim() && uploadedFiles.length === 0
                      ? 'opacity-60 hover:opacity-80'
                      : ''
                  }`}
                  title={t("Press and hold to record, click to send")}
                >
                  {voiceProcessing ? (
                    <Loader2 className="size-5 animate-spin" />
                  ) : (
                    <AudioWaveform className="size-5" />
                  )}
                </Button>
              )}
            </div>
          </div>
        </form>
      </div>

      <p className="text-center text-[10px] text-muted-foreground mt-2 flex items-center justify-center gap-1.5 opacity-60">
        {t("AI can make mistakes. Verify important information.")}
      </p>
    </div>
  )
})
ChatPanel.displayName = 'ChatPanel'
