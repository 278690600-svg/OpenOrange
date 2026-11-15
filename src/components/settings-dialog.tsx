"use client"

import { useEffect, useState, useCallback } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { cn } from "@/lib/utils"
import { notify } from "@/lib/notifications"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Save, ExternalLink, Loader2, CheckCircle2, Plus, Trash2, Edit2, Cpu, Search, RefreshCw, ChevronDown, ChevronUp, Activity, ShieldCheck, Sparkles, Bot, Check, X, Sun, Moon, Monitor, Maximize2, Minimize2, PowerOff } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { useI18n } from "@/lib/i18n"
import { useTheme } from "@/components/theme-provider"
import { DEFAULT_OLLAMA_URL, DEFAULT_LMSTUDIO_URL } from "@/lib/constants"
import { getModelSpec } from "@/lib/model-specs"
import { Checkbox } from "./ui/checkbox"
import { Switch } from "./ui/switch"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./ui/collapsible"
import Editor from "@monaco-editor/react"

const MIN_WIDTH = 320
const MIN_HEIGHT = 400
const DEFAULT_WIDTH = 800
const DEFAULT_HEIGHT = 900

const SEARCH_ENGINES = [
  { id: 'bing', label: 'Bing', free: true, desc: 'No API key required, works in China' },
  { id: 'duckduckgo', label: 'DuckDuckGo', free: true, desc: 'No API key required' },
  { id: 'wikipedia', label: 'Wikipedia', free: true, desc: 'No API key required' },
  { id: 'tavily', label: 'Tavily', free: false, desc: 'Best AI-native quality', url: 'https://tavily.com' },
  { id: 'serpapi', label: 'SerpAPI (Google)', free: false, desc: 'Real Google results', url: 'https://serpapi.com' },
]

const LLM_PROVIDERS = [
  { id: 'openai', label: 'OpenAI', placeholder: 'sk-...' },
  { id: 'anthropic', label: 'Anthropic', placeholder: 'sk-ant-...' },
  { id: 'google', label: 'Google Gemini', placeholder: 'AIza...' },
  { id: 'deepseek', label: 'DeepSeek', placeholder: 'sk-...' },
  { id: 'minimax', label: 'MiniMax', placeholder: 'Key...' },
  { id: 'groq', label: 'Groq', placeholder: 'gsk_...' },
  { id: 'mistral', label: 'Mistral AI', placeholder: 'Key...' },
  { id: 'zhipu', label: '智谱 AI (Zhipu)', placeholder: 'API Key...' },
  { id: 'lingyi', label: '零一万物 (Lingyi)', placeholder: 'API Key...' },
  { id: 'openrouter', label: 'OpenRouter', placeholder: 'sk-or-...' },
  { id: 'nvidia', label: 'NVIDIA', placeholder: 'nvapi-...' },
  { id: 'volcengine', label: 'Volcengine (火山引擎)', placeholder: 'API Key...' },
]

interface McpServer {
  id?: string
  name: string
  type?: string
  command?: string
  args?: string | string[]
  url?: string
  enabled?: boolean
  packageName?: string
  description?: string
}

interface MarketServer {
  id?: string
  name: string
  description?: string
  packageName?: string
  url?: string
  command?: string
  args?: string | string[]
  type?: string
}

interface MarketModel {
  id: string
  name: string
  ggufFiles?: Array<string | { name: string; size: number }>
}

interface PromptItem {
  id: string
  name: string
  content: string
  description?: string
  isSystem?: boolean
}

export function SettingsDialog({ open, onOpenChange }: { open: boolean, onOpenChange: (open: boolean) => void }) {
  const [settings, setSettings] = useState({
    ollamaUrl: DEFAULT_OLLAMA_URL,
    lmstudioUrl: DEFAULT_LMSTUDIO_URL,
    openaiKey: "",
    openaiApiBase: "",
    anthropicKey: "",
    googleKey: "",
    minimaxKey: "",
    deepseekKey: "",
    groqKey: "",
    mistralKey: "",
    zhipuKey: "",
    lingyiKey: "",
    openrouterKey: "",
    nvidiaKey: "",
    volcengineKey: "",
    defaultModel: "",
    searchEngine: "duckduckgo",
    searchKey: "",
    localGgufEnabled: false,
    localGgufContextSize: 4096,
    localGgufTemperature: 0.7,
    localGgufTopP: 0.95,
    localGgufRepeatPenalty: 1.1,
    localGgufMaxTokens: 1024,
    apiTemperature: 0,
    apiTopP: 0,
    apiMaxTokens: 0,
    apiContextSize: 0,
    theme: "zinc",
    mcpEnabled: true,
    mcpAutoLoad: false,
    maxConcurrentChats: 3,
    enabledModels: [] as string[],
    customModels: [] as Array<{ id: string; name: string; provider: string }>,
  })
  const updateSetting = useCallback(<K extends keyof typeof settings>(key: K, value: (typeof settings)[K] | ((prev: (typeof settings)[K]) => (typeof settings)[K])) => {
    setSettings(prev => {
      const nextValue = typeof value === 'function' ? (value as (prev: (typeof settings)[K]) => (typeof settings)[K])(prev[key]) : value
      return { ...prev, [key]: nextValue }
    })
  }, [])
  const handleDefaultModelChange = useCallback((modelId: string | null) => {
    if (!modelId) return
    const spec = getModelSpec(modelId)
    setSettings(prev => {
      let nextMaxTokens = prev.apiMaxTokens ?? 0
      let nextContextSize = prev.apiContextSize ?? 0
      let nextTemp = prev.apiTemperature ?? 0
      let nextTopP = prev.apiTopP ?? 0
      
      if (nextMaxTokens !== 0 && nextMaxTokens > spec.maxOutputTokens) {
        nextMaxTokens = spec.maxOutputTokens
      }
      if (nextContextSize !== 0 && nextContextSize > spec.maxContextSize) {
        nextContextSize = spec.maxContextSize
      }
      
      return {
        ...prev,
        defaultModel: modelId,
        apiTemperature: nextTemp,
        apiTopP: nextTopP,
        apiMaxTokens: nextMaxTokens,
        apiContextSize: nextContextSize
      }
    })
  }, [])

  const restoreModelDefaultParams = useCallback(() => {
    setSettings(prev => ({
      ...prev,
      apiTemperature: 0,
      apiTopP: 0,
      apiMaxTokens: 0,
      apiContextSize: 0
    }))
  }, [])
  const [allModels, setAllModels] = useState<Array<{ id: string; name: string; provider: string }>>([])
  const [saving, setSaving] = useState(false)
  const [testResult, setTestResult] = useState<'ok' | 'fail' | null>(null)
  const [mcpServers, setMcpServers] = useState<McpServer[]>([])
  const [editingServer, setEditingServer] = useState<McpServer | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [mcpTab, setMcpTab] = useState<'mcp_list' | 'market' | 'raw' | 'model_market'>('mcp_list')

  const [newModelProvider, setNewModelProvider] = useState("openai")
  const [newModelId, setNewModelId] = useState("")
  const [newModelName, setNewModelName] = useState("")

  const handleAddCustomModel = () => {
    if (!newModelId.trim() || !newModelName.trim()) {
      alert(t("Please enter Model ID and Name"))
      return
    }
    const fullId = `${newModelProvider}::${newModelId.trim()}`
    
    const exists = settings.customModels.some(m => m.id === fullId) || allModels.some(m => m.id === fullId)
    if (exists) {
      alert(t("Model already exists"))
      return
    }

    const newModel = {
      id: fullId,
      name: newModelName.trim(),
      provider: newModelProvider
    }

    updateSetting('customModels', prev => [...prev, newModel])
    updateSetting('enabledModels', prev => [...prev, fullId])

    setAllModels(prev => [...prev, newModel])
    setModels(prev => [...prev, newModel])

    setNewModelId("")
    setNewModelName("")
    notify("success", t("Model Added"))
  }

  const handleRemoveCustomModel = (modelId: string) => {
    updateSetting('customModels', prev => prev.filter(m => m.id !== modelId))
    updateSetting('enabledModels', prev => prev.filter(id => id !== modelId))
    if (settings.defaultModel === modelId) {
      updateSetting('defaultModel', "")
    }
    setAllModels(prev => prev.filter(m => m.id !== modelId))
    setModels(prev => prev.filter(m => m.id !== modelId))
  }
  const [marketSearch, setMarketSearch] = useState("")
  const [mcpSearch, setMcpSearch] = useState("")
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null)
  const [isResizing, setIsResizing] = useState(false)

  const handleResizeStart = useCallback((e: React.MouseEvent, direction: string) => {
    e.preventDefault()
    e.stopPropagation()
    setIsResizing(true)

    const startWidth = dimensions?.width || 880
    const startHeight = dimensions?.height || 680

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const Center_X = window.innerWidth / 2
      const Center_Y = window.innerHeight / 2

      let newWidth = startWidth
      let newHeight = startHeight

      if (direction.includes('right') || direction.includes('left')) {
        newWidth = Math.abs(moveEvent.clientX - Center_X) * 2
      }
      if (direction.includes('bottom') || direction.includes('top')) {
        newHeight = Math.abs(moveEvent.clientY - Center_Y) * 2
      }

      const minW = Math.min(540, window.innerWidth - 32)
      const maxW = window.innerWidth - 32
      const minH = Math.min(450, window.innerHeight - 32)
      const maxH = window.innerHeight - 32

      newWidth = Math.max(minW, Math.min(maxW, newWidth))
      newHeight = Math.max(minH, Math.min(maxH, newHeight))

      setDimensions({ width: newWidth, height: newHeight })
    }

    const handleMouseUp = () => {
      setIsResizing(false)
      document.body.style.userSelect = ''
      document.body.style.cursor = ''
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }

    document.body.style.userSelect = 'none'
    let bodyCursor = 'default'
    if (direction === 'left' || direction === 'right') bodyCursor = 'ew-resize'
    else if (direction === 'top' || direction === 'bottom') bodyCursor = 'ns-resize'
    else if (direction === 'top-left' || direction === 'bottom-right') bodyCursor = 'nwse-resize'
    else if (direction === 'top-right' || direction === 'bottom-left') bodyCursor = 'nesw-resize'
    document.body.style.cursor = bodyCursor

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
  }, [dimensions])

  const [marketSource, setMarketSource] = useState<'github' | 'smithery' | 'modelscope' | 'glama'>('github')
  const [selectedSecurityProvider, setSelectedSecurityProvider] = useState("openai")
  const [marketServers, setMarketServers] = useState<MarketServer[]>([])
  const [loadingMcpMarket, setLoadingMcpMarket] = useState(false)
  const [loadingModelMarket, setLoadingModelMarket] = useState(false)
  const [modelMarketModels, setModelMarketModels] = useState<MarketModel[]>([])
  const [modelMarketSearch, setModelMarketSearch] = useState("qwen")
  const [downloadingModelId, setDownloadingModelId] = useState<string | null>(null)
  const [downloadProgress, setDownloadProgress] = useState<{status: string, progress: number, message: string, downloadedMB?: string, totalMB?: string} | null>(null)
  const { t, language, setLanguage } = useI18n()
  const { theme: _currentTheme, mode, setTheme, setMode } = useTheme()

  const [pingStatuses, setPingStatuses] = useState<Record<string, { loading: boolean; ok: boolean | null; latency?: number; error?: string }>>({})
  const [deviceVram, setDeviceVram] = useState(8.0)
  const [vramQuantization, setVramQuantization] = useState(false)
  const [showSecurityAlert, setShowSecurityAlert] = useState(false)
  const [pendingServer, setPendingServer] = useState<McpServer | null>(null)

  const triggerPing = useCallback(async (provider: string, key: string, url?: string) => {
    setPingStatuses(prev => ({ ...prev, [provider]: { loading: true, ok: null } }))
    try {
      const res = await fetch('/api/settings/ping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, key, url })
      })
      const data = await res.json()
      if (res.ok && data.ok) {
        setPingStatuses(prev => ({ ...prev, [provider]: { loading: false, ok: true, latency: data.latency } }))
      } else {
        setPingStatuses(prev => ({ ...prev, [provider]: { loading: false, ok: false, error: data.error || 'Connection Failed' } }))
      }
    } catch (e: any) {
      setPingStatuses(prev => ({ ...prev, [provider]: { loading: false, ok: false, error: e.message } }))
    }
  }, [])

  const PingIndicator = ({ provider, keyVal, urlVal }: { provider: string; keyVal: string; urlVal?: string }) => {
    const status = pingStatuses[provider]
    return (
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          type="button"
          className="h-6 text-[10px] gap-1 px-1.5 hover:bg-primary/5 text-zinc-400 hover:text-primary transition-all shrink-0"
          onClick={() => triggerPing(provider, keyVal, urlVal)}
          disabled={status?.loading}
        >
          {status?.loading ? (
            <Loader2 className="size-3 animate-spin text-primary" />
          ) : (
            <Activity className="size-3" />
          )}
          <span>{t("Test")}</span>
        </Button>
        {status && !status.loading && (
          status.ok ? (
            <span className="text-[9px] text-emerald-500 font-semibold flex items-center gap-1 bg-emerald-50/50 dark:bg-emerald-950/20 px-1.5 py-0.5 rounded border border-emerald-100/30 animate-in fade-in zoom-in-95">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              {status.latency}ms
            </span>
          ) : (
            <span 
              className="text-[9px] text-rose-500 font-semibold flex items-center gap-1 bg-rose-50/50 dark:bg-rose-950/20 px-1.5 py-0.5 rounded border border-rose-100/30 cursor-help animate-in fade-in zoom-in-95"
              title={status.error}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500"></span>
              Failed
            </span>
          )
        )}
      </div>
    )
  }

  const [localModelStatus, setLocalModelStatus] = useState<{isLoaded: boolean; modelName?: string} | null>(null)
  const [unloadingLocal, setUnloadingLocal] = useState(false)
  const [models, setModels] = useState<Array<{ id: string; name: string; provider: string }>>([])
  const [isLoadingModels, setIsLoadingModels] = useState(false)
  const [selectedMcpDetails, setSelectedMcpDetails] = useState<Record<string, { tools: Array<{ name: string }> }>>({})
  const [loadingMcpDetails, setLoadingMcpDetails] = useState<Record<string, boolean>>({})
  const [expandedMcp, setExpandedMcp] = useState<string | null>(null)

  const [rawMcpConfig, setRawMcpConfig] = useState("")
  const [loadingRawConfig, setLoadingRawConfig] = useState(false)

  const [mcpForm, setMcpForm] = useState({ name: "", type: "stdio", command: "", args: "", url: "" })
  
  const [prompts, setPrompts] = useState<PromptItem[]>([])
  const [editingPromptId, setEditingPromptId] = useState<string | null>(null)
  const [isAddingPrompt, setIsAddingPrompt] = useState(false)
  const [deletingPromptId, setDeletingPromptId] = useState<string | null>(null)
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null)
  const [promptForm, setPromptForm] = useState({ name: "", content: "", description: "" })

  useEffect(() => {
    if (editingServer) {
       setMcpForm({
         name: editingServer.name || "",
         type: editingServer.type || (editingServer.url ? "sse" : "stdio"),
         command: editingServer.command || "",
         args: Array.isArray(editingServer.args) ? editingServer.args.join(" ") : (editingServer.args || ""),
         url: editingServer.url || "",
       })
    } else {
       setMcpForm({ name: "", type: "stdio", command: "", args: "", url: "" })
    }
  }, [editingServer])

  useEffect(() => {
    if (mcpTab === 'raw') {
      fetchRawMcpConfig()
    }
  }, [mcpTab])
   const refreshPrompts = () => {
     fetch(`/api/prompts?t=${Date.now()}`).then(res => res.json()).then(data => { 
       if(Array.isArray(data)) setPrompts(data) 
     }).catch(console.error)
   }

  const fetchModels = async () => {
    setIsLoadingModels(true)
    try {
      const res = await fetch('/api/models?refresh=true')
      const data = await res.json()
      setModels(Array.isArray(data) ? data : (data?.models || []))
    } catch (e) {
      console.error('Fetch models error:', e)
    }
    setIsLoadingModels(false)
  }

  const deleteLocalModel = async (fileName: string) => {
    if (!confirm(t("Are you sure you want to delete this model?"))) return
    try {
      const res = await fetch(`/api/models/local?fileName=${encodeURIComponent(fileName)}`, { method: 'DELETE' })
      if (res.ok) {
        fetchModels()
      }
    } catch (e) {
      console.error('Delete model error:', e)
    }
  }

  const fetchMcpDetails = async (serverId: string) => {
    setLoadingMcpDetails(prev => ({ ...prev, [serverId]: true }))
    try {
      const res = await fetch(`/api/mcp/details?id=${serverId}`)
      const data = await res.json()
      setSelectedMcpDetails(prev => ({ ...prev, [serverId]: data }))
    } catch (e) {
      console.error('Fetch MCP details error:', e)
    }
    setLoadingMcpDetails(prev => ({ ...prev, [serverId]: false }))
  }

  const fetchLocalModelStatus = () => {
    fetch('/api/models/local/status')
      .then(res => res.json())
      .then(data => setLocalModelStatus(data))
      .catch(console.error)
  }

  const unloadLocalModel = async () => {
    if (!confirm(t("Unload the currently loaded model from VRAM?"))) return
    setUnloadingLocal(true)
    try {
      const res = await fetch('/api/models/local/status', { method: 'DELETE' })
      if (res.ok) {
        fetchLocalModelStatus()
      }
    } catch (e) {
      console.error('Unload model error:', e)
    }
    setUnloadingLocal(false)
  }

  useEffect(() => {
    if (open) {
      const maxW = window.innerWidth - 32
      const maxH = window.innerHeight - 32
      setDimensions({
        width: Math.min(880, Math.max(540, maxW)),
        height: Math.min(680, Math.max(450, maxH))
      })

      setTestResult(null)
      const controller = new AbortController()
      const { signal } = controller

      fetchLocalModelStatus()
      fetchModels()
      refreshPrompts()

      Promise.all([
        fetch('/api/settings', { signal }).then(res => res.json()),
        fetch('/api/models?all=true', { signal }).then(res => res.json()).catch(() => []),
        fetch('/api/settings/mcp', { signal }).then(res => res.json()).catch(() => []),
      ])
        .then(([data, allModelsData, mcpData]) => {
          setSettings({
            ollamaUrl: data.ollamaUrl || DEFAULT_OLLAMA_URL,
            lmstudioUrl: data.lmstudioUrl || DEFAULT_LMSTUDIO_URL,
            openaiKey: data.openaiKey || "",
            openaiApiBase: data.openaiApiBase || "",
            anthropicKey: data.anthropicKey || "",
            googleKey: data.googleKey || "",
            minimaxKey: data.minimaxKey || "",
            deepseekKey: data.deepseekKey || "",
            groqKey: data.groqKey || "",
            mistralKey: data.mistralKey || "",
            zhipuKey: data.zhipuKey || "",
            lingyiKey: data.lingyiKey || "",
            openrouterKey: data.openrouterKey || "",
            nvidiaKey: data.nvidiaKey || "",
            volcengineKey: data.volcengineKey || "",
            defaultModel: data.defaultModel || "",
            searchEngine: data.searchEngine || "duckduckgo",
            searchKey: data.searchKey || "",
            localGgufEnabled: data.localGgufEnabled ?? false,
            localGgufContextSize: data.localGgufContextSize ?? 4096,
            localGgufTemperature: data.localGgufTemperature ?? 0.7,
            localGgufTopP: data.localGgufTopP ?? 0.95,
            localGgufRepeatPenalty: data.localGgufRepeatPenalty ?? 1.1,
            localGgufMaxTokens: data.localGgufMaxTokens ?? 1024,
            apiTemperature: data.apiTemperature ?? 0,
            apiTopP: data.apiTopP ?? 0,
            apiMaxTokens: data.apiMaxTokens ?? 0,
            apiContextSize: data.apiContextSize ?? 0,
            theme: data.theme || "zinc",
            mcpEnabled: data.mcpEnabled ?? true,
            mcpAutoLoad: data.mcpAutoLoad ?? false,
            maxConcurrentChats: data.maxConcurrentChats ?? 3,
            enabledModels: (() => { try { return JSON.parse(data.enabledModels || "[]") } catch { return [] } })(),
            customModels: (() => { try { return JSON.parse(data.customModels || "[]") } catch { return [] } })(),
          })
          setAllModels(Array.isArray(allModelsData) ? allModelsData : (allModelsData?.models || []))
          setMcpServers(Array.isArray(mcpData) ? mcpData : [])
        })
        .catch((e) => {
          if (e.name !== 'AbortError') console.error(e)
        })

      return () => {
        controller.abort()
        setDimensions(null)
      }
    }
  }, [open])

  useEffect(() => {
    if (settings.mcpEnabled && mcpServers.length > 0) {
      const enabledServers = mcpServers.filter((s: McpServer) => s.enabled && s.id) as Array<McpServer & { id: string }>
      enabledServers.forEach((server) => {
        if (!selectedMcpDetails[server.id] && !loadingMcpDetails[server.id]) {
          fetchMcpDetails(server.id)
        }
      })
    }
  }, [settings.mcpEnabled, mcpServers, selectedMcpDetails, loadingMcpDetails])

  const saveSettings = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          ...settings,
          enabledModels: JSON.stringify(settings.enabledModels),
          customModels: JSON.stringify(settings.customModels)
        })
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: 'Save failed' }))
        alert(t('Save failed') + ': ' + (errData.error || `HTTP ${res.status}`))
        setSaving(false)
        return
      }

      // Force refresh models cache so that local-gguf models or toggles are synced instantly
      try {
        await fetch('/api/models?refresh=true').catch(() => {})
      } catch {}

      document.documentElement.setAttribute('data-theme', settings.theme)
      notify("success", t("Settings saved successfully"))
      setSaving(false)
      onOpenChange(false)
    } catch (e: unknown) {
      const err = e as Error
      alert(t('Save failed') + ': ' + err.message)
      setSaving(false)
    }
  }

  const fetchRawMcpConfig = async () => {
    setLoadingRawConfig(true)
    try {
      const res = await fetch('/api/settings/mcp/config')
      const data = await res.json()
      setRawMcpConfig(JSON.stringify(data, null, 2))
    } catch (e) {
      console.error("Fetch raw config error:", e)
    }
    setLoadingRawConfig(false)
  }

  const saveRawMcpConfig = async () => {
    setSaving(true)
    try {
      let parsed
      try { parsed = JSON.parse(rawMcpConfig) } catch { throw new Error("Invalid JSON") }
      const res = await fetch('/api/settings/mcp/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed)
      })
      if (res.ok) {
        const updated = await (await fetch('/api/settings/mcp')).json()
        setMcpServers(updated)
      }
    } catch (error: unknown) {
      const err = error as Error
      alert("Save failed: " + err.message)
    }
    setSaving(false)
  }

  const handleSaveServer = async (server: McpServer & { id?: string }) => {
    const cmdStr = ((server.command || "") + " " + (Array.isArray(server.args) ? server.args.join(" ") : (server.args || ""))).toLowerCase()
    const isDangerous = /\b(rm|delete|format|sh|bash|cmd|powershell|system32|rmdir)\b/.test(cmdStr)
    
    if (isDangerous && !server.id) {
      setPendingServer(server)
      setShowSecurityAlert(true)
      return
    }

    await executeSaveServer(server)
  }

  const executeSaveServer = async (server: McpServer & { id?: string }) => {
    try {
      const res = await fetch('/api/settings/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(server)
      })
      const saved = await res.json()
      if (server.id) {
        setMcpServers(prev => prev.map(s => s.id === saved.id ? saved : s))
      } else {
        setMcpServers(prev => [saved, ...prev])
      }
      setShowAddForm(false)
      setEditingServer(null)
      setMcpTab('mcp_list')
    } catch (error) {
      console.error("Save MCP error:", error)
    }
  }

  const handleDeleteServer = async (id: string) => {
    if (!confirm("确定要删除此服务器吗？")) return
    try {
      await fetch(`/api/settings/mcp/${id}`, { method: 'DELETE' })
      setMcpServers(prev => prev.filter(s => s.id !== id))
    } catch (error) {
      console.error("Delete MCP error:", error)
    }
  }

  const fetchMarket = useCallback(async (q?: string) => {
    setLoadingMcpMarket(true)
    try {
      const res = await fetch(`/api/settings/mcp/market?search=${encodeURIComponent(q || '')}&source=${marketSource}`)
      const data = await res.json()
      setMarketServers(data.servers || [])
    } catch (error) {
      console.error("Fetch market error:", error)
    }
    setLoadingMcpMarket(false)
  }, [marketSource])

  const searchModelMarket = async (q: string) => {
    setLoadingModelMarket(true)
    try {
      const res = await fetch(`/api/models/market?search=${encodeURIComponent(q)}`)
      const data = await res.json()
      setModelMarketModels(data.models || [])
    } catch (e) {
      console.error('Market search error:', e)
    }
    setLoadingModelMarket(false)
  }

  const downloadGguf = async (modelId: string, fileName: string) => {
    setDownloadingModelId(`${modelId}/${fileName}`)
    setDownloadProgress({ status: 'connecting', progress: 0, message: 'Initiating...' })

    try {
      const response = await fetch('/api/models/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelId, fileName })
      })

      if (!response.ok || !response.body) throw new Error('Download failed')

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value)
        const lines = chunk.split('\n')
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6))
              setDownloadProgress(data)
              if (data.status === 'done') {
                setDownloadingModelId(null)
                fetchModels()
              }
            } catch {}
          }
        }
      }
    } catch (e: unknown) {
      const err = e as Error
      setDownloadProgress({ status: 'error', progress: -1, message: err.message })
      setDownloadingModelId(null)
    }
  }

  useEffect(() => {
    if (mcpTab === 'market') {
      fetchMarket(marketSearch)
    } else if (mcpTab === 'raw') {
      fetchRawMcpConfig()
    }
  }, [mcpTab, marketSource, fetchMarket, marketSearch])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        className={cn(
          "flex flex-col bg-white/95 dark:bg-zinc-950/95 backdrop-blur-2xl border border-white/20 dark:border-zinc-800/50 shadow-2xl overflow-hidden p-0 rounded-2xl",
          isResizing ? "transition-none select-none" : "transition-all duration-300",
          !dimensions && "w-[94vw] sm:max-w-[540px] md:max-w-4xl md:w-[880px] h-[85vh] md:h-[680px]"
        )}
        style={dimensions ? {
          width: `${dimensions.width}px`,
          height: `${dimensions.height}px`,
          maxWidth: '96vw',
          maxHeight: '96vh',
        } : undefined}
      >
        {/* Resize Handles */}
        {/* Top */}
            <div 
              className="absolute top-0 left-2 right-2 h-1 cursor-ns-resize z-50 hover:bg-primary/20 transition-colors"
              onMouseDown={(e) => handleResizeStart(e, 'top')}
            />
            {/* Bottom */}
            <div 
              className="absolute bottom-0 left-2 right-2 h-1.5 cursor-ns-resize z-50 hover:bg-primary/20 transition-colors"
              onMouseDown={(e) => handleResizeStart(e, 'bottom')}
            />
            {/* Left */}
            <div 
              className="absolute left-0 top-2 bottom-2 w-1.5 cursor-ew-resize z-50 hover:bg-primary/20 transition-colors"
              onMouseDown={(e) => handleResizeStart(e, 'left')}
            />
            {/* Right */}
            <div 
              className="absolute right-0 top-2 bottom-2 w-1.5 cursor-ew-resize z-50 hover:bg-primary/20 transition-colors"
              onMouseDown={(e) => handleResizeStart(e, 'right')}
            />
            {/* Top-Left */}
            <div 
              className="absolute top-0 left-0 w-3 h-3 cursor-nwse-resize z-50 hover:bg-primary/30 transition-colors"
              onMouseDown={(e) => handleResizeStart(e, 'top-left')}
            />
            {/* Top-Right */}
            <div 
              className="absolute top-0 right-0 w-3 h-3 cursor-nesw-resize z-50 hover:bg-primary/30 transition-colors"
              onMouseDown={(e) => handleResizeStart(e, 'top-right')}
            />
            {/* Bottom-Left */}
            <div 
              className="absolute bottom-0 left-0 w-3 h-3 cursor-nesw-resize z-50 hover:bg-primary/30 transition-colors"
              onMouseDown={(e) => handleResizeStart(e, 'bottom-left')}
            />
            {/* Bottom-Right */}
            <div 
              className="absolute bottom-0 right-0 w-4.5 h-4.5 cursor-nwse-resize z-50 hover:bg-primary/30 transition-colors flex items-end justify-end p-0.5"
              onMouseDown={(e) => handleResizeStart(e, 'bottom-right')}
            >
              <svg className="size-2 text-zinc-400 dark:text-zinc-650 pointer-events-none" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <line x1="8" y1="2" x2="2" y2="8" />
                <line x1="8" y1="5" x2="5" y2="8" />
              </svg>
            </div>
        <DialogHeader className="px-6 py-4 border-b border-zinc-100 dark:border-zinc-800/60 bg-zinc-50/30 dark:bg-zinc-900/5 backdrop-blur-md flex flex-row items-center justify-between shrink-0">
          <DialogTitle className="text-base font-bold text-zinc-900 dark:text-zinc-50 tracking-tight flex items-center gap-2">
            <Sparkles className="size-4 text-indigo-500" />
            {t("Settings Title")}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col">
          <Tabs defaultValue="general" className="flex-1 flex flex-col min-h-0">
            <TabsList variant="line" className="flex flex-row justify-start items-center w-full overflow-x-auto gap-2 border-b border-zinc-100 dark:border-zinc-800/80 bg-zinc-50/40 dark:bg-zinc-900/10 px-6 py-1 shrink-0 scrollbar-none rounded-none border-x-0 border-t-0">
              <TabsTrigger value="general" className="px-4 py-2.5 text-sm font-semibold text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 data-[state=active]:text-primary border-b-2 border-transparent data-[state=active]:border-primary transition-all rounded-none bg-transparent">{t("General")}</TabsTrigger>
              <TabsTrigger value="models" className="px-4 py-2.5 text-sm font-semibold text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 data-[state=active]:text-primary border-b-2 border-transparent data-[state=active]:border-primary transition-all rounded-none bg-transparent">{t("Models")}</TabsTrigger>
              <TabsTrigger value="prompts" className="px-4 py-2.5 text-sm font-semibold text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 data-[state=active]:text-primary border-b-2 border-transparent data-[state=active]:border-primary transition-all rounded-none bg-transparent">{t("Prompts")}</TabsTrigger>
              <TabsTrigger value="security" className="px-4 py-2.5 text-sm font-semibold text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 data-[state=active]:text-primary border-b-2 border-transparent data-[state=active]:border-primary transition-all rounded-none bg-transparent">{t("Security")}</TabsTrigger>
              <TabsTrigger value="experimental" className="px-4 py-2.5 text-sm font-semibold text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 data-[state=active]:text-primary border-b-2 border-transparent data-[state=active]:border-primary transition-all rounded-none bg-transparent">{t("Experimental")}</TabsTrigger>
            </TabsList>

            <div className="flex-1 overflow-y-auto px-6 py-6 custom-scrollbar min-h-0">
              <TabsContent value="general" className="space-y-6 mt-0 focus-visible:outline-none">
                <div className="p-5 rounded-2xl bg-zinc-50/30 dark:bg-zinc-900/30 border border-zinc-150 dark:border-zinc-800/80 shadow-sm space-y-6">
                  {/* Theme Row */}
                  <div className="space-y-3 pb-6 border-b border-zinc-100 dark:border-zinc-800">
                    <div className="flex flex-col gap-1">
                      <Label className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{t("Appearance")}</Label>
                      <span className="text-xs text-zinc-400">{t("Choose a dynamic color palette for your workspace")}</span>
                    </div>
                    <div className="grid grid-cols-5 gap-3 pt-2">
                      {[
                        { id: 'zinc', name: 'Zinc', color: 'bg-zinc-500' },
                        { id: 'orange', name: 'Orange', color: 'bg-orange-500' },
                        { id: 'blue', name: 'Blue', color: 'bg-blue-500' },
                        { id: 'green', name: 'Green', color: 'bg-emerald-500' },
                        { id: 'rose', name: 'Rose', color: 'bg-rose-500' },
                      ].map((themeItem) => (
                        <button
                          key={themeItem.id}
                          onClick={() => {
                            updateSetting('theme', themeItem.id)
                            setTheme(themeItem.id as 'zinc' | 'orange' | 'blue' | 'green' | 'rose')
                          }}
                          className={`group relative flex flex-col items-center gap-2 p-3 rounded-xl border transition-all ${
                            settings.theme === themeItem.id ? 'border-primary bg-primary/5 shadow-sm' : 'border-zinc-100 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
                          }`}
                        >
                          <div className={`size-8 rounded-full shadow-md ${themeItem.color} group-hover:scale-110 transition-transform`} />
                          <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">{themeItem.name}</span>
                          {settings.theme === themeItem.id && (
                            <div className="absolute -top-1 -right-1 size-4 rounded-full bg-primary flex items-center justify-center text-[10px] text-white shadow-sm">
                              <CheckCircle2 className="size-2.5" />
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Language Row */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-zinc-100 dark:border-zinc-800 gap-4">
                    <div className="flex flex-col gap-1">
                      <Label className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{t("Language")}</Label>
                      <span className="text-xs text-zinc-400">{t("Select your preferred language interface")}</span>
                    </div>
                    <Select value={language} onValueChange={(v) => { if (v) setLanguage(v as any) }}>
                      <SelectTrigger className="w-full sm:w-[250px] h-10 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="max-h-80">
                        <SelectItem value="zh">🇨🇳 简体中文 (Simplified Chinese)</SelectItem>
                        <SelectItem value="zh-TW">🇭🇰 繁體中文 (Traditional Chinese)</SelectItem>
                        <SelectItem value="en">🇺🇸 English (英语)</SelectItem>
                        <SelectItem value="ja">🇯🇵 日本語 (Japanese)</SelectItem>
                        <SelectItem value="ko">🇰🇷 한국어 (Korean)</SelectItem>
                        <SelectItem value="es">🇪🇸 Español (Spanish)</SelectItem>
                        <SelectItem value="fr">🇫🇷 Français (French)</SelectItem>
                        <SelectItem value="de">🇩🇪 Deutsch (German)</SelectItem>
                        <SelectItem value="it">🇮🇹 Italiano (Italian)</SelectItem>
                        <SelectItem value="pt">🇵🇹 Português (Portuguese)</SelectItem>
                        <SelectItem value="ru">🇷🇺 Русский (Russian)</SelectItem>
                        <SelectItem value="vi">🇻🇳 Tiếng Việt (Vietnamese)</SelectItem>
                        <SelectItem value="th">🇹🇭 ไทย (Thai)</SelectItem>
                        <SelectItem value="id">🇮🇩 Bahasa Indonesia (Indonesian)</SelectItem>
                        <SelectItem value="ar">🇸🇦 العربية (Arabic)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Mode Row */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-zinc-100 dark:border-zinc-800 gap-4">
                    <div className="flex flex-col gap-1">
                      <Label className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{t("Mode")}</Label>
                      <span className="text-xs text-zinc-400">{t("Customize light, dark or system appearance")}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 w-full sm:w-[320px]">
                      {([
                        { id: 'light' as const, label: t("Light"), Icon: Sun },
                        { id: 'dark' as const, label: t("Dark"), Icon: Moon },
                        { id: 'system' as const, label: t("System"), Icon: Monitor },
                      ]).map((modeItem) => (
                        <button
                          key={modeItem.id}
                          onClick={() => setMode(modeItem.id)}
                          className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border text-xs font-semibold transition-all ${
                            mode === modeItem.id
                              ? 'border-primary bg-primary/10 text-primary shadow-sm'
                              : 'border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-950 hover:bg-zinc-50 dark:hover:bg-zinc-900 text-zinc-600 dark:text-zinc-400'
                          }`}
                        >
                          <modeItem.Icon className="size-4" />
                          <span>{modeItem.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Max Tasks Row */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-zinc-100 dark:border-zinc-800 last:border-0 last:pb-0 gap-4">
                    <div className="flex flex-col gap-1">
                      <Label className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{t("Max Concurrent Tasks")}</Label>
                      <span className="text-xs text-zinc-400">{t("Concurrent limit description")}</span>
                    </div>
                    <Input 
                      type="number" 
                      min={1} 
                      max={10} 
                      value={settings.maxConcurrentChats} 
                      onChange={(e) => updateSetting('maxConcurrentChats', Math.min(10, Math.max(1, parseInt(e.target.value) || 3)))}
                      className="w-24 h-10 text-xs text-center font-mono"
                    />
                  </div>

                  {/* Web Search Service Row */}
                  <div className="flex flex-col gap-3 pt-2">
                    <div className="flex flex-col gap-1">
                      <Label className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{t("Web Search Service")}</Label>
                      <span className="text-xs text-zinc-400">{t("Select engine for fetching real-time search context")}</span>
                    </div>
                    <div className="grid sm:grid-cols-2 gap-4">
                      <Select value={settings.searchEngine} onValueChange={(v) => { if (v) updateSetting('searchEngine', v) }}>
                        <SelectTrigger className="w-full h-10 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {SEARCH_ENGINES.map(e => (
                            <SelectItem key={e.id} value={e.id}>{e.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-zinc-500 bg-zinc-50/50 dark:bg-zinc-900/50 p-3 rounded-xl border border-zinc-100 dark:border-zinc-850 flex items-center">
                        {SEARCH_ENGINES.find(e => e.id === settings.searchEngine)?.desc}
                        {SEARCH_ENGINES.find(e => e.id === settings.searchEngine)?.free ? ` (${t("No key required")})` : ` (${t("Need to configure key in Security page")})`}
                      </p>
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="models" className="space-y-6 mt-0 flex-1 flex flex-col min-h-0 focus-visible:outline-none">
                <div className="space-y-6">
                  {/* Default Model & Whitelist Card */}
                  <div className="p-5 rounded-2xl bg-zinc-50/30 dark:bg-zinc-900/30 border border-zinc-150 dark:border-zinc-800/80 shadow-sm space-y-6">
                    <div className="flex flex-col gap-1">
                      <Label className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{t("Default Model Settings")}</Label>
                      <span className="text-xs text-zinc-400">{t("Configure default target models and enable list filtering")}</span>
                    </div>

                    <div className="flex flex-col gap-3">
                      <Label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">{t("Default Model")}</Label>
                      <div className="flex gap-2">
                        <Select value={settings.defaultModel} onValueChange={handleDefaultModelChange}>
                          <SelectTrigger className="flex-1 h-10 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {models.map(m => (
                              <SelectItem key={m.id} value={m.id} className="text-xs">
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline" className="text-[10px] scale-90 opacity-60 px-1 py-0 h-4 font-mono">{m.provider}</Badge>
                                  {m.name}
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button variant="outline" size="icon" onClick={fetchModels} disabled={isLoadingModels} className="h-10 w-10 shrink-0">
                          <RefreshCw className={`size-4 ${isLoadingModels ? "animate-spin" : ""}`} />
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-3 pt-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">{t("Model Whitelist")}</Label>
                        <div className="flex gap-2">
                          <Button variant="ghost" size="sm" className="h-7 text-[10px] px-2 text-primary" onClick={() => updateSetting('enabledModels', allModels.map(m => m.id))}>
                            {t("Enable All")}
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 text-[10px] px-2 text-zinc-400" onClick={() => updateSetting('enabledModels', [])}>
                            {t("Disable All")}
                          </Button>
                        </div>
                      </div>
                      <p className="text-xs text-zinc-400 leading-tight">{t("Only enabled models will appear in the chat selector.")}</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 max-h-[200px] overflow-y-auto p-4 rounded-xl border border-zinc-150 dark:border-zinc-800 bg-white dark:bg-zinc-950/50 custom-scrollbar shadow-inner">
                        {allModels.map(model => (
                          <div key={model.id} className="flex items-center space-x-2.5 p-2 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-900 border border-transparent hover:border-zinc-100 dark:hover:border-zinc-800 group transition-all">
                            <Checkbox 
                              id={`model-${model.id}`} 
                              checked={settings.enabledModels.includes(model.id)}
                              onCheckedChange={(checked) => {
                                if (checked) updateSetting('enabledModels', prev => [...prev, model.id])
                                else updateSetting('enabledModels', prev => prev.filter(id => id !== model.id))
                              }}
                            />
                            <Label 
                              htmlFor={`model-${model.id}`}
                              className="text-xs font-medium leading-none cursor-pointer flex-1 truncate flex items-center gap-1.5"
                            >
                              <Badge variant="outline" className="scale-75 origin-left opacity-60 text-[9px] px-1 h-4 font-mono">{model.provider}</Badge>
                              <span className="truncate group-hover:text-primary transition-colors text-zinc-700 dark:text-zinc-300">{model.name || model.id}</span>
                            </Label>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Manual Models Card */}
                  <div className="p-5 rounded-2xl bg-zinc-50/30 dark:bg-zinc-900/30 border border-zinc-150 dark:border-zinc-800/80 shadow-sm space-y-5">
                    <div className="flex flex-col gap-1">
                      <Label className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">{t("Manual Models")}</Label>
                      <span className="text-xs text-zinc-400">{t("Add custom model tags manually for providers that don't auto-fetch")}</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                      <div className="flex flex-col gap-1.5 sm:col-span-1">
                        <Label className="text-xs font-bold text-zinc-500">{t("Provider")}</Label>
                        <Select value={newModelProvider} onValueChange={(val) => val && setNewModelProvider(val)}>
                          <SelectTrigger className="h-10 text-xs bg-white dark:bg-zinc-950">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {LLM_PROVIDERS.map(p => (
                              <SelectItem key={p.id} value={p.id} className="text-xs font-semibold">{p.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex flex-col gap-1.5 sm:col-span-1.5">
                        <Label className="text-xs font-bold text-zinc-500">{t("Model Identifier")}</Label>
                        <Input 
                          value={newModelId} 
                          onChange={e => setNewModelId(e.target.value)} 
                          placeholder="e.g., gpt-4o-custom" 
                          className="h-10 text-xs font-mono bg-white dark:bg-zinc-950" 
                        />
                      </div>
                      <div className="flex flex-col gap-1.5 sm:col-span-1.5">
                        <Label className="text-xs font-bold text-zinc-500">{t("Model Name")}</Label>
                        <div className="flex gap-2">
                          <Input 
                            value={newModelName} 
                            onChange={e => setNewModelName(e.target.value)} 
                            placeholder="e.g., GPT-4o Custom" 
                            className="h-10 text-xs bg-white dark:bg-zinc-950 flex-1" 
                          />
                          <Button 
                            type="button" 
                            onClick={handleAddCustomModel} 
                            className="h-10 text-xs font-semibold px-4 shrink-0"
                          >
                            <Plus className="size-4" />
                          </Button>
                        </div>
                      </div>
                    </div>

                    {settings.customModels && settings.customModels.length > 0 && (
                      <div className="space-y-2 pt-2">
                        <div className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">{t("Added Models")}</div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 max-h-[150px] overflow-y-auto custom-scrollbar p-1">
                          {settings.customModels.map(model => (
                            <div key={model.id} className="flex items-center justify-between p-2 rounded-xl border border-zinc-150 dark:border-zinc-800 bg-white dark:bg-zinc-950 shadow-sm">
                              <div className="flex flex-col min-w-0 flex-1 mr-2">
                                <span className="text-xs font-bold truncate text-zinc-800 dark:text-zinc-200">{model.name}</span>
                                <span className="text-[10px] text-zinc-400 font-mono truncate">{model.id}</span>
                              </div>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="size-7 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 shrink-0 rounded-lg" 
                                onClick={() => handleRemoveCustomModel(model.id)}
                              >
                                <Trash2 className="size-3.5" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Embedded GGUF Engine Card */}
                  <div className="p-5 rounded-2xl border border-amber-200/40 dark:border-amber-900/30 bg-amber-50/5 dark:bg-amber-950/10 space-y-4 shadow-sm">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label className="text-sm font-bold flex items-center gap-2 text-amber-700 dark:text-amber-500">
                          <Cpu className="size-4 text-amber-600" />
                          {t("Embedded GGUF Engine")}
                        </Label>
                        <p className="text-xs text-zinc-400">{t("Run local .gguf files directly without external services")}</p>
                      </div>
                      <Switch checked={settings.localGgufEnabled} onCheckedChange={v => updateSetting('localGgufEnabled', v)} />
                    </div>

                    {settings.localGgufEnabled && (
                      <div className="flex items-center justify-between text-xs bg-white/50 dark:bg-zinc-900/50 rounded-xl p-3 border border-amber-100 dark:border-amber-900/20">
                        <span className="text-zinc-500 font-semibold">{t("Engine Status:")}</span>
                        <span className="font-bold flex items-center gap-2">
                          {localModelStatus?.isLoaded ? (
                            <>
                              <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-500"><span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span> {t("Loaded")} ({localModelStatus.modelName})</span>
                              <button
                                onClick={unloadLocalModel}
                                disabled={unloadingLocal}
                                className="ml-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-red-500/10 text-red-500 hover:bg-red-500/20 border border-red-500/20 transition-colors disabled:opacity-50"
                                title={t("Unload model from VRAM")}
                              >
                                {unloadingLocal ? <Loader2 className="size-3 animate-spin" /> : <PowerOff className="size-3" />}
                                {t("Unload")}
                              </button>
                            </>
                          ) : (
                            <span className="text-zinc-400">{t("Idle")}</span>
                          )}
                        </span>
                      </div>
                    )}

                    {settings.localGgufEnabled && (
                      <div className="p-5 rounded-xl bg-zinc-900/90 text-zinc-100 border border-zinc-800 shadow-2xl relative overflow-hidden space-y-4 animate-in fade-in slide-in-from-top-2">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-3xl pointer-events-none" />
                        
                        <div className="flex items-center justify-between border-b border-zinc-850 pb-3">
                          <span className="text-xs font-bold text-zinc-400 tracking-wider flex items-center gap-1.5 uppercase font-mono">
                            <Activity className="size-3.5 text-orange-500 animate-pulse" />
                            VRAM Shield / 显存安全守护
                          </span>
                          <Select 
                            value={String(deviceVram)} 
                            onValueChange={v => setDeviceVram(Number(v))}
                          >
                            <SelectTrigger className="w-24 h-8 text-[11px] bg-zinc-950 border-zinc-850 text-zinc-300 font-mono">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent className="bg-zinc-950 border-zinc-800 text-zinc-300">
                              <SelectItem value="6" className="text-[11px]">6.0 GB</SelectItem>
                              <SelectItem value="8" className="text-[11px]">8.0 GB</SelectItem>
                              <SelectItem value="12" className="text-[11px]">12.0 GB</SelectItem>
                              <SelectItem value="16" className="text-[11px]">16.0 GB</SelectItem>
                              <SelectItem value="24" className="text-[11px]">24.0 GB</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        {(() => {
                          const modelWeight = 4.2
                          const context = settings.localGgufContextSize || 4096
                          const kvMultiplier = vramQuantization ? 0.09 : 0.18
                          const kvCache = (context / 1024) * kvMultiplier
                          const totalRequired = Number((modelWeight + kvCache).toFixed(2))
                          const pct = Math.min(100, Math.round((totalRequired / deviceVram) * 100))
                          
                          const isWarning = totalRequired >= deviceVram * 0.9
                          const recommendedLayers = isWarning 
                            ? Math.max(0, Math.floor(35 * ((deviceVram * 0.85 - kvCache) / modelWeight)))
                            : 35

                          return (
                            <div className="space-y-4">
                              <div className="flex items-end justify-between">
                                <div className="space-y-0.5">
                                  <div className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">预测显存开销</div>
                                  <div className="text-xl font-black tracking-tight font-mono text-white">
                                    {totalRequired} <span className="text-xs text-zinc-500 font-normal">/ {deviceVram} GB</span>
                                  </div>
                                </div>
                                <div className="text-right">
                                  <div className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider">推荐 GPU 卸载层数</div>
                                  <div className="text-sm font-extrabold font-mono text-orange-500">
                                    {recommendedLayers} <span className="text-[10px] text-zinc-500 font-normal">/ 35 层</span>
                                  </div>
                                </div>
                              </div>

                              <div className="h-2.5 w-full bg-zinc-950 rounded-full border border-zinc-800/80 overflow-hidden relative shadow-inner">
                                <div 
                                  className={`h-full rounded-full transition-all duration-500 ${
                                    isWarning 
                                      ? "bg-gradient-to-r from-red-500 to-rose-600 shadow-[0_0_12px_rgba(239,68,68,0.6)]"
                                      : "bg-gradient-to-r from-emerald-500 via-orange-400 to-orange-500 shadow-[0_0_12px_rgba(249,115,22,0.4)]"
                                  }`}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>

                              <div className="text-xs text-zinc-400 leading-relaxed font-medium bg-zinc-950/70 p-3 rounded-xl border border-zinc-900 flex flex-col gap-1.5 shadow-inner">
                                <div className="flex justify-between items-center text-zinc-400 font-mono">
                                  <span>模型权重: {modelWeight} GB</span>
                                  <span>KV Cache: {kvCache.toFixed(2)} GB</span>
                                </div>
                                {isWarning ? (
                                  <span className="text-rose-400 font-bold flex items-center gap-1 mt-1 animate-pulse">
                                    ⚠️ 警告: 显存逼近 {pct}% 临界点！已自动将 Offload 压缩至 {recommendedLayers} 层，并建议量化 KV Cache！
                                  </span>
                                ) : (
                                  <span className="text-emerald-400 font-semibold flex items-center gap-1 mt-1">
                                    ✓ 状态优良: 显存剩余充足，全量 {recommendedLayers} 层可直接卸载至 GPU，维持极致推理速度。
                                  </span>
                                )}
                              </div>

                              <div className="flex items-center justify-between border-t border-zinc-850 pt-2">
                                <span className="text-xs text-zinc-300 font-semibold flex items-center gap-1.5">
                                  <ShieldCheck className="size-4 text-indigo-400" />
                                  开启 KV Cache Q4_0 智能量化 (节省50%缓存显存)
                                </span>
                                <Switch 
                                  checked={vramQuantization} 
                                  onCheckedChange={v => setVramQuantization(v)} 
                                  className="scale-75"
                                />
                              </div>
                            </div>
                          )
                        })()}
                      </div>
                    )}

                    {settings.localGgufEnabled && (
                      <div className="space-y-4 p-5 rounded-2xl border border-zinc-150 dark:border-zinc-800 bg-zinc-50/20 dark:bg-zinc-900/10 shadow-sm mt-4">
                        <div className="flex flex-col gap-1 mb-2">
                          <Label className="text-sm font-semibold">{t("Embedded Engine Parameters")}</Label>
                          <span className="text-xs text-zinc-400">{t("Configure default settings for local embedded model execution")}</span>
                        </div>

                        <div className="space-y-4 pt-2">
                          <div className="space-y-2">
                            <div className="flex justify-between text-xs font-semibold">
                              <span className="text-zinc-600 dark:text-zinc-400">{t("Context Size")}</span>
                              <span className="text-zinc-900 dark:text-zinc-100 font-mono">{settings.localGgufContextSize || 4096}</span>
                            </div>
                            <input type="range" min={1024} max={32768} step={1024} value={settings.localGgufContextSize || 4096}
                              onChange={(e) => updateSetting('localGgufContextSize', Number(e.target.value))}
                              className="w-full h-2 bg-zinc-100 dark:bg-zinc-800 rounded-full appearance-none cursor-pointer accent-primary" />
                          </div>
                          <div className="space-y-2">
                            <div className="flex justify-between text-xs font-semibold">
                              <span className="text-zinc-600 dark:text-zinc-400">{t("Temperature")}</span>
                              <span className="text-zinc-900 dark:text-zinc-100 font-mono">{(settings.localGgufTemperature ?? 0.7).toFixed(2)}</span>
                            </div>
                            <input type="range" min={0} max={2} step={0.05} value={settings.localGgufTemperature ?? 0.7}
                              onChange={(e) => updateSetting('localGgufTemperature', Number(e.target.value))}
                              className="w-full h-2 bg-zinc-100 dark:bg-zinc-800 rounded-full appearance-none cursor-pointer accent-primary" />
                          </div>
                          <div className="space-y-2">
                            <div className="flex justify-between text-xs font-semibold">
                              <span className="text-zinc-600 dark:text-zinc-400">{t("Max Tokens")}</span>
                              <span className="text-zinc-900 dark:text-zinc-100 font-mono">{settings.localGgufMaxTokens || 1024}</span>
                            </div>
                            <input type="range" min={256} max={8192} step={256} value={settings.localGgufMaxTokens || 1024}
                              onChange={(e) => updateSetting('localGgufMaxTokens', Number(e.target.value))}
                              className="w-full h-2 bg-zinc-100 dark:bg-zinc-800 rounded-full appearance-none cursor-pointer accent-primary" />
                          </div>
                          <div className="space-y-2">
                            <div className="flex justify-between text-xs font-semibold">
                              <span className="text-zinc-600 dark:text-zinc-400">{t("Repeat Penalty")}</span>
                              <span className="text-zinc-900 dark:text-zinc-100 font-mono">{(settings.localGgufRepeatPenalty ?? 1.1).toFixed(2)}</span>
                            </div>
                            <input type="range" min={1} max={2} step={0.05} value={settings.localGgufRepeatPenalty ?? 1.1}
                              onChange={(e) => updateSetting('localGgufRepeatPenalty', Number(e.target.value))}
                              className="w-full h-2 bg-zinc-100 dark:bg-zinc-800 rounded-full appearance-none cursor-pointer accent-primary" />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Local Servers Card */}
                  <div className="p-5 rounded-2xl border border-zinc-150 dark:border-zinc-800 bg-zinc-50/30 dark:bg-zinc-900/30 shadow-sm space-y-4">
                    <Label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">{t("Local Servers")}</Label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="space-y-2 p-4 rounded-xl border border-zinc-100 dark:border-zinc-800/80 bg-white dark:bg-zinc-950 shadow-sm">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs font-bold text-zinc-700 dark:text-zinc-300">{t("Ollama URL")}</Label>
                          <PingIndicator provider="ollama" keyVal="" urlVal={settings.ollamaUrl} />
                        </div>
                        <Input value={settings.ollamaUrl} onChange={e => updateSetting('ollamaUrl', e.target.value)} placeholder={DEFAULT_OLLAMA_URL} className="h-10 text-xs font-mono" />
                      </div>
                      <div className="space-y-2 p-4 rounded-xl border border-zinc-100 dark:border-zinc-800/80 bg-white dark:bg-zinc-950 shadow-sm">
                        <div className="flex items-center justify-between">
                          <Label className="text-xs font-bold text-zinc-700 dark:text-zinc-300">{t("LM Studio URL")}</Label>
                          <PingIndicator provider="lmstudio" keyVal="" urlVal={settings.lmstudioUrl} />
                        </div>
                        <Input value={settings.lmstudioUrl} onChange={e => updateSetting('lmstudioUrl', e.target.value)} placeholder={DEFAULT_LMSTUDIO_URL} className="h-10 text-xs font-mono" />
                      </div>
                    </div>
                  </div>

                  {/* API Model Parameters Sliders Card */}
                  {(() => {
                    const currentSpec = getModelSpec(settings.defaultModel)
                    const displayTemp = settings.apiTemperature ?? 0
                    const displayTopP = settings.apiTopP ?? 0
                    const displayMaxTokens = settings.apiMaxTokens ?? 0
                    const displayContextSize = settings.apiContextSize ?? 0

                    // Adjust step for context size to make large values (like Gemini 1M) easier to drag
                    const contextStep = currentSpec.maxContextSize > 200000 ? 8192 : 1024
                    const maxTokensStep = currentSpec.maxOutputTokens > 16384 ? 1024 : 256
                    const maxTokensMin = Math.min(256, currentSpec.maxOutputTokens)

                    return (
                      <div className="space-y-4 p-5 rounded-2xl border border-zinc-150 dark:border-zinc-800 bg-zinc-50/30 dark:bg-zinc-900/20 shadow-sm">
                        <div className="flex items-center justify-between gap-4 mb-2">
                          <div className="flex flex-col gap-1 min-w-0">
                            <Label className="text-sm font-semibold truncate">{t("API Model Parameters")}</Label>
                            <span className="text-xs text-zinc-400 truncate">{t("Adjust default generation settings for API-based model inference")}</span>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-8 text-xs gap-1.5 border-zinc-200 dark:border-zinc-800/80 hover:bg-zinc-100 dark:hover:bg-zinc-800/60 text-zinc-600 dark:text-zinc-400 font-medium shrink-0"
                            onClick={restoreModelDefaultParams}
                          >
                            <RefreshCw className="size-3 animate-none" />
                            {t("Restore Defaults")}
                          </Button>
                        </div>
                        
                        <div className="space-y-4 pt-2">
                          <div className="space-y-2">
                            <div className="flex justify-between text-xs font-semibold">
                              <span className="text-zinc-600 dark:text-zinc-400">{t("Temperature")}</span>
                              <span className="text-zinc-900 dark:text-zinc-100 font-mono">{displayTemp === 0 ? `${t("Unlimited")} (0.00)` : displayTemp.toFixed(2)}</span>
                            </div>
                            <input type="range" min={0} max={2} step={0.05} value={displayTemp}
                              onChange={(e) => updateSetting('apiTemperature', Number(e.target.value))}
                              className="w-full h-2 bg-zinc-100 dark:bg-zinc-800 rounded-full appearance-none cursor-pointer accent-primary" />
                          </div>
                          
                          <div className="space-y-2">
                            <div className="flex justify-between text-xs font-semibold">
                              <span className="text-zinc-600 dark:text-zinc-400">{t("Top P")}</span>
                              <span className="text-zinc-900 dark:text-zinc-100 font-mono">{displayTopP === 0 ? `${t("Unlimited")} (0.00)` : displayTopP.toFixed(2)}</span>
                            </div>
                            <input type="range" min={0} max={1} step={0.05} value={displayTopP}
                              onChange={(e) => updateSetting('apiTopP', Number(e.target.value))}
                              className="w-full h-2 bg-zinc-100 dark:bg-zinc-800 rounded-full appearance-none cursor-pointer accent-primary" />
                          </div>
                          
                           <div className="space-y-2">
                            <div className="flex justify-between text-xs font-semibold">
                              <span className="text-zinc-600 dark:text-zinc-400">{t("Max Tokens")}</span>
                              <span className="text-zinc-900 dark:text-zinc-100 font-mono">
                                {displayMaxTokens === 0 ? `${t("Unlimited")} (0)` : displayMaxTokens}
                              </span>
                            </div>
                            <input type="range" min={0} max={currentSpec.maxOutputTokens} step={maxTokensStep} value={displayMaxTokens}
                              onChange={(e) => updateSetting('apiMaxTokens', Number(e.target.value))}
                              className="w-full h-2 bg-zinc-100 dark:bg-zinc-800 rounded-full appearance-none cursor-pointer accent-primary" />
                          </div>
                          
                          <div className="space-y-2">
                            <div className="flex justify-between text-xs font-semibold">
                              <span className="text-zinc-600 dark:text-zinc-400">{t("Context Size")}</span>
                              <span className="text-zinc-900 dark:text-zinc-100 font-mono">
                                {displayContextSize === 0 ? `${t("Unlimited")} (0)` : displayContextSize}
                              </span>
                            </div>
                            <input type="range" min={0} max={currentSpec.maxContextSize} step={contextStep} value={displayContextSize}
                              onChange={(e) => updateSetting('apiContextSize', Number(e.target.value))}
                              className="w-full h-2 bg-zinc-100 dark:bg-zinc-800 rounded-full appearance-none cursor-pointer accent-primary" />
                          </div>
                        </div>
                      </div>
                    )
                  })()}

                  {/* Local Model Management Card */}
                  <div className="space-y-3 p-5 rounded-2xl border border-zinc-150 dark:border-zinc-800 bg-zinc-50/30 dark:bg-zinc-900/30 shadow-sm">
                    <Label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">{t("Local Model Management")}</Label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                      {models.filter(m => m.provider === 'local').map((model) => (
                        <div key={model.id} className="flex items-center justify-between p-3.5 border border-zinc-100 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-950 shadow-sm hover:border-red-200/50 dark:hover:border-red-950/50 transition-colors">
                          <div className="flex flex-col min-w-0 flex-1 mr-2">
                            <span className="text-xs font-semibold truncate text-zinc-800 dark:text-zinc-200">{model.name}</span>
                            <span className="text-[10px] text-zinc-400 font-mono tracking-tight">GGUF Model</span>
                          </div>
                          <Button variant="ghost" size="icon" className="size-8 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 shrink-0" onClick={() => deleteLocalModel(model.id)}>
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      ))}
                      {models.filter(m => m.provider === 'local').length === 0 && (
                        <div className="py-8 text-center text-zinc-400 text-xs border border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl col-span-full">
                          {t("No downloaded models yet")}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="prompts" className="space-y-6 mt-0 flex-1 flex flex-col min-h-0 focus-visible:outline-none">
                <div className="flex items-center justify-between shrink-0 pb-2">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-bold text-zinc-800 dark:text-zinc-200">{t("Prompt Hub / Character Presets")}</Label>
                    <p className="text-xs text-zinc-400">{t("Manage your system prompts and professional character presets")}</p>
                  </div>
                  <Button size="sm" variant="outline" className="h-9 text-xs bg-primary/5 hover:bg-primary/10 border-primary/20 text-primary px-4" onClick={() => {
                    setIsAddingPrompt(true)
                    setPromptForm({ name: "", content: "", description: "用户自定义预设" })
                  }}>
                    <Plus className="size-4 mr-1.5" />{t("Add")}
                  </Button>
                </div>
                
                <div className="space-y-4">
                  {/* 新增预设角色表单 */}
                  {isAddingPrompt && (
                    <div className="p-5 rounded-2xl border border-indigo-200 dark:border-indigo-900/50 bg-indigo-50/5 dark:bg-indigo-950/25 space-y-4 animate-in fade-in slide-in-from-top-2 shadow-sm">
                      <div className="grid gap-3.5">
                        <div className="grid gap-1.5">
                          <Label className="text-xs font-bold text-primary">{t("Preset Name")}</Label>
                          <Input 
                            value={promptForm.name} 
                            onChange={e => setPromptForm(prev => ({ ...prev, name: e.target.value }))}
                            placeholder={t("e.g., Frontend Expert")}
                            className="h-10 text-xs bg-white dark:bg-zinc-950"
                          />
                        </div>
                        <div className="grid gap-1.5">
                          <Label className="text-xs font-bold text-primary">{t("Role Instructions (System Prompt)")}</Label>
                          <textarea 
                            value={promptForm.content} 
                            onChange={e => setPromptForm(prev => ({ ...prev, content: e.target.value }))}
                            placeholder={t("You are an experienced frontend engineer...")}
                            className="min-h-[120px] w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary dark:border-zinc-800 dark:bg-zinc-950 shadow-inner custom-scrollbar"
                          />
                        </div>
                      </div>
                      <div className="flex justify-end gap-2 text-xs">
                        <Button variant="ghost" size="sm" className="h-8" onClick={() => setIsAddingPrompt(false)}>{t("Cancel")}</Button>
                        <Button size="sm" className="h-8" onClick={() => {
                          if(!promptForm.name || !promptForm.content) return alert(t("Please fill in all fields"));
                          fetch('/api/prompts', {
                            method: 'POST',
                            body: JSON.stringify(promptForm)
                          }).then(() => {
                            setIsAddingPrompt(false)
                            refreshPrompts()
                          });
                        }}>{t("Save Preset")}</Button>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {prompts.map((p: PromptItem) => (
                      <div key={p.id} className={`p-5 rounded-2xl border transition-all shadow-sm flex flex-col gap-3 group relative border-l-4 ${
                        editingPromptId === p.id 
                          ? 'border-primary bg-primary/5 ring-1 ring-primary/20' 
                          : 'border-zinc-150 dark:border-zinc-800/80 bg-zinc-50/20 dark:bg-zinc-900/10 hover:bg-zinc-100/30 dark:hover:bg-zinc-900/20 border-l-zinc-300 dark:border-l-zinc-700'
                      } ${!p.isSystem && editingPromptId !== p.id ? '!border-l-indigo-500' : ''}`}>
                        
                        {editingPromptId === p.id ? (
                          /* 编辑表单 */
                          <div className="space-y-4 w-full">
                            <div className="grid gap-3.5">
                              <div className="grid gap-1.5">
                                <Label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">{t("Preset Name")}</Label>
                                <Input 
                                  value={promptForm.name} 
                                  onChange={e => setPromptForm(prev => ({ ...prev, name: e.target.value }))}
                                  className="h-9 text-xs bg-white dark:bg-zinc-950"
                                />
                              </div>
                              <div className="grid gap-1.5">
                                <Label className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">{t("Role Instructions")}</Label>
                                <textarea 
                                  value={promptForm.content} 
                                  onChange={e => setPromptForm(prev => ({ ...prev, content: e.target.value }))}
                                  className="min-h-[100px] w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary dark:border-zinc-800 dark:bg-zinc-950 shadow-inner"
                                />
                              </div>
                            </div>
                            <div className="flex justify-end gap-2">
                              <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setEditingPromptId(null)}>{t("Cancel")}</Button>
                              <Button size="sm" className="h-8 text-xs" onClick={() => {
                                fetch('/api/prompts', {
                                  method: 'PUT',
                                  body: JSON.stringify({ id: p.id, ...promptForm })
                                }).then(() => {
                                  setEditingPromptId(null)
                                  refreshPrompts()
                                });
                              }}>{t("Update")}</Button>
                            </div>
                          </div>
                        ) : (
                          /* 展示内容 */
                          <div className="flex items-start justify-between flex-1 min-h-[100px]">
                            <div className="flex flex-col gap-2 min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <Sparkles className={`size-4 ${p.isSystem ? 'text-zinc-400' : 'text-amber-500 animate-pulse'}`} />
                                <span className="text-sm font-bold truncate group-hover:text-primary transition-colors text-zinc-900 dark:text-zinc-100">{p.name}</span>
                                {p.isSystem && <Badge variant="secondary" className="text-[9px] h-4.5 opacity-80 px-1 font-mono">SYSTEM</Badge>}
                              </div>
                              <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed line-clamp-4 select-text">{p.content}</p>
                            </div>
                            
                            <div className="ml-4 flex items-center gap-1 shrink-0 bg-white/40 dark:bg-zinc-900/40 border border-zinc-100/50 dark:border-zinc-800/50 rounded-xl p-0.5">
                              <Button size="sm" variant="ghost" className="size-8 p-0 text-zinc-400 hover:text-primary hover:bg-primary/5 transition-all rounded-lg" 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingPromptId(p.id);
                                  setPromptForm({ name: p.name, content: p.content, description: p.description || "" });
                                }}>
                                <Edit2 className="size-3.5" />
                              </Button>

                              {confirmingDeleteId === p.id ? (
                                <div className="flex items-center gap-0.5 animate-in fade-in zoom-in-95 duration-200">
                                  <Button size="sm" variant="ghost" className="size-8 p-0 text-red-500 hover:bg-red-50 rounded-lg transition-all" 
                                    disabled={deletingPromptId === p.id}
                                    title="确认删除"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setDeletingPromptId(p.id)
                                      fetch(`/api/prompts?id=${p.id}&t=${Date.now()}`, { method: 'DELETE' })
                                        .then(res => res.json())
                                        .then(data => {
                                          if (data.success) {
                                            refreshPrompts()
                                            setConfirmingDeleteId(null)
                                          } else {
                                            alert("删除失败: " + (data.error || "服务器未返回原因"))
                                          }
                                        })
                                        .catch(err => alert("网络错误: " + err.message))
                                        .finally(() => setDeletingPromptId(null))
                                    }}>
                                    {deletingPromptId === p.id ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                                  </Button>
                                  <Button size="sm" variant="ghost" className="size-8 p-0 text-zinc-400 hover:bg-zinc-100 rounded-lg transition-all" 
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setConfirmingDeleteId(null);
                                    }}>
                                    <X className="size-3.5" />
                                  </Button>
                                </div>
                              ) : (
                                <Button size="sm" variant="ghost" className="size-8 p-0 text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-lg transition-all disabled:opacity-50" 
                                  disabled={deletingPromptId === p.id}
                                  title="删除"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setConfirmingDeleteId(p.id);
                                  }}>
                                  <Trash2 className="size-3.5" />
                                </Button>
                              )}
                              
                              {p.isSystem && !confirmingDeleteId && (
                                <Button size="sm" variant="ghost" className="size-8 p-0 text-zinc-400 hover:text-primary rounded-lg transition-all" 
                                  title="复制并以此为模板创建"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setIsAddingPrompt(true)
                                    setPromptForm({ name: `${p.name} (副本)`, content: p.content, description: '基于系统预设克隆' })
                                    window.scrollTo({ top: 0, behavior: 'smooth' })
                                  }}>
                                  <ExternalLink className="size-3.5" />
                                </Button>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                  
                  {prompts.length === 0 && !isAddingPrompt && (
                    <div className="py-16 text-center space-y-3 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl bg-zinc-50/20">
                      <div className="size-12 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mx-auto">
                        <Bot className="size-6 text-zinc-300" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs font-semibold text-zinc-500">{t("No preset roles yet")}</p>
                        <p className="text-xs text-zinc-400">{t("Click the 'Add' button in the top right to start your professional workflow")}</p>
                      </div>
                    </div>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="security" className="space-y-5 mt-0 focus-visible:outline-none">
                <div className="space-y-5">
                  <div className="p-5 rounded-2xl bg-indigo-50/10 dark:bg-indigo-950/15 border border-indigo-100 dark:border-indigo-900/30 flex items-start gap-3.5 shadow-sm">
                    <ShieldCheck className="size-5 text-indigo-500 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <div className="text-sm font-bold text-zinc-850 dark:text-zinc-100">{t("Privacy & Security Settings")}</div>
                      <p className="text-xs text-zinc-500 leading-relaxed">{t("Your API keys are stored locally and used only for communication. Local models are recommended for data privacy.")}</p>
                    </div>
                  </div>

                  <div className="p-5 rounded-2xl border border-zinc-150 dark:border-zinc-800 bg-zinc-50/30 dark:bg-zinc-900/30 shadow-sm space-y-5">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-100 dark:border-zinc-800/80 pb-4">
                      <div className="flex flex-col gap-1">
                        <Label className="text-sm font-semibold">{t("LLM Providers")}</Label>
                        <span className="text-xs text-zinc-400">{t("Configure API endpoints and connection credentials")}</span>
                      </div>
                      <Select value={selectedSecurityProvider} onValueChange={v => v && setSelectedSecurityProvider(v)}>
                        <SelectTrigger className="w-[200px] h-10 text-xs font-mono bg-white dark:bg-zinc-950">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {LLM_PROVIDERS.map(p => (
                            <SelectItem key={p.id} value={p.id} className="text-xs font-semibold">{p.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="p-5 rounded-xl border border-zinc-100 dark:border-zinc-800/80 bg-white dark:bg-zinc-950 shadow-sm animate-in fade-in slide-in-from-top-1 duration-200">
                      {selectedSecurityProvider === 'openai' && (
                        <div className="grid gap-4">
                          <div className="grid gap-1.5">
                            <div className="flex items-center justify-between">
                              <Label className="text-xs font-bold text-zinc-700 dark:text-zinc-300">OpenAI API Key</Label>
                              <PingIndicator provider="openai" keyVal={settings.openaiKey} urlVal={settings.openaiApiBase} />
                            </div>
                            <Input type="password" value={settings.openaiKey} onChange={e => updateSetting('openaiKey', e.target.value)} placeholder="sk-..." className="h-10 text-xs font-mono" />
                          </div>
                          <div className="grid gap-1.5">
                            <Label className="text-xs font-bold text-zinc-700 dark:text-zinc-300">OpenAI API Base URL (Proxy Endpoint)</Label>
                            <Input type="text" value={settings.openaiApiBase} onChange={e => updateSetting('openaiApiBase', e.target.value)} placeholder="https://api.openai.com/v1" className="h-10 text-xs font-mono" />
                          </div>
                        </div>
                      )}
                      {selectedSecurityProvider === 'anthropic' && (
                        <div className="grid gap-2">
                          <div className="flex items-center justify-between">
                            <Label className="text-xs font-bold text-zinc-700 dark:text-zinc-300">Anthropic API Key</Label>
                            <PingIndicator provider="anthropic" keyVal={settings.anthropicKey} />
                          </div>
                          <Input type="password" value={settings.anthropicKey} onChange={e => updateSetting('anthropicKey', e.target.value)} placeholder="sk-ant-..." className="h-10 text-xs font-mono" />
                        </div>
                      )}
                      {selectedSecurityProvider === 'google' && (
                        <div className="grid gap-2">
                          <div className="flex items-center justify-between">
                            <Label className="text-xs font-bold text-zinc-700 dark:text-zinc-300">Google Gemini Key</Label>
                            <PingIndicator provider="google" keyVal={settings.googleKey} />
                          </div>
                          <Input type="password" value={settings.googleKey} onChange={e => updateSetting('googleKey', e.target.value)} placeholder="AIza..." className="h-10 text-xs font-mono" />
                        </div>
                      )}
                      {selectedSecurityProvider === 'deepseek' && (
                        <div className="grid gap-2">
                          <div className="flex items-center justify-between">
                            <Label className="text-xs font-bold text-zinc-700 dark:text-zinc-300">DeepSeek API Key</Label>
                            <PingIndicator provider="deepseek" keyVal={settings.deepseekKey} />
                          </div>
                          <Input type="password" value={settings.deepseekKey} onChange={e => updateSetting('deepseekKey', e.target.value)} placeholder="sk-..." className="h-10 text-xs font-mono" />
                        </div>
                      )}
                      {selectedSecurityProvider === 'minimax' && (
                        <div className="grid gap-2">
                          <div className="flex items-center justify-between">
                            <Label className="text-xs font-bold text-zinc-700 dark:text-zinc-300">MiniMax API Key</Label>
                            <PingIndicator provider="minimax" keyVal={settings.minimaxKey} />
                          </div>
                          <Input type="password" value={settings.minimaxKey} onChange={e => updateSetting('minimaxKey', e.target.value)} placeholder="Key..." className="h-10 text-xs font-mono" />
                        </div>
                      )}
                      {selectedSecurityProvider === 'groq' && (
                        <div className="grid gap-2">
                          <div className="flex items-center justify-between">
                            <Label className="text-xs font-bold text-zinc-700 dark:text-zinc-300">Groq API Key</Label>
                            <PingIndicator provider="groq" keyVal={settings.groqKey} />
                          </div>
                          <Input type="password" value={settings.groqKey} onChange={e => updateSetting('groqKey', e.target.value)} placeholder="gsk_..." className="h-10 text-xs font-mono" />
                        </div>
                      )}
                      {selectedSecurityProvider === 'mistral' && (
                        <div className="grid gap-2">
                          <div className="flex items-center justify-between">
                            <Label className="text-xs font-bold text-zinc-700 dark:text-zinc-300">Mistral AI Key</Label>
                            <PingIndicator provider="mistral" keyVal={settings.mistralKey} />
                          </div>
                          <Input type="password" value={settings.mistralKey} onChange={e => updateSetting('mistralKey', e.target.value)} placeholder="Key..." className="h-10 text-xs font-mono" />
                        </div>
                      )}
                      {selectedSecurityProvider === 'zhipu' && (
                        <div className="grid gap-2">
                          <div className="flex items-center justify-between">
                            <Label className="text-xs font-bold text-zinc-700 dark:text-zinc-300">智谱 AI (Zhipu) Key</Label>
                            <PingIndicator provider="zhipu" keyVal={settings.zhipuKey} />
                          </div>
                          <Input type="password" value={settings.zhipuKey} onChange={e => updateSetting('zhipuKey', e.target.value)} placeholder="API Key..." className="h-10 text-xs font-mono" />
                        </div>
                      )}
                      {selectedSecurityProvider === 'lingyi' && (
                        <div className="grid gap-2">
                          <div className="flex items-center justify-between">
                            <Label className="text-xs font-bold text-zinc-700 dark:text-zinc-300">零一万物 (Lingyi) Key</Label>
                            <PingIndicator provider="lingyi" keyVal={settings.lingyiKey} />
                          </div>
                          <Input type="password" value={settings.lingyiKey} onChange={e => updateSetting('lingyiKey', e.target.value)} placeholder="API Key..." className="h-10 text-xs font-mono" />
                        </div>
                      )}
                      {selectedSecurityProvider === 'openrouter' && (
                        <div className="grid gap-2">
                          <div className="flex items-center justify-between">
                            <Label className="text-xs font-bold text-zinc-700 dark:text-zinc-300">OpenRouter Key</Label>
                            <PingIndicator provider="openrouter" keyVal={settings.openrouterKey} />
                          </div>
                          <Input type="password" value={settings.openrouterKey} onChange={e => updateSetting('openrouterKey', e.target.value)} placeholder="sk-or-..." className="h-10 text-xs font-mono" />
                        </div>
                      )}
                      {selectedSecurityProvider === 'nvidia' && (
                        <div className="grid gap-2">
                          <div className="flex items-center justify-between">
                            <Label className="text-xs font-bold text-zinc-700 dark:text-zinc-300">NVIDIA API Key</Label>
                            <PingIndicator provider="nvidia" keyVal={settings.nvidiaKey} />
                          </div>
                          <div className="flex gap-2">
                            <Input type="password" value={settings.nvidiaKey} onChange={e => updateSetting('nvidiaKey', e.target.value)} placeholder="nvapi-..." className="h-10 text-xs font-mono flex-1" />
                            <Button variant="outline" size="sm" onClick={() => window.open('https://build.nvidia.com/explore/discover', '_blank')} className="h-10 text-xs gap-1 px-3.5">
                              <ExternalLink className="size-3.5" /> {t("Get")}
                            </Button>
                          </div>
                        </div>
                      )}
                      {selectedSecurityProvider === 'volcengine' && (
                        <div className="grid gap-2">
                          <div className="flex items-center justify-between">
                            <Label className="text-xs font-bold text-zinc-700 dark:text-zinc-300">Volcengine API Key</Label>
                            <PingIndicator provider="volcengine" keyVal={settings.volcengineKey} />
                          </div>
                          <div className="flex gap-2">
                            <Input type="password" value={settings.volcengineKey} onChange={e => updateSetting('volcengineKey', e.target.value)} placeholder="API Key..." className="h-10 text-xs font-mono flex-1" />
                            <Button variant="outline" size="sm" onClick={() => window.open('https://console.volcengine.com/ark/query/api/key', '_blank')} className="h-10 text-xs gap-1 px-3.5">
                              <ExternalLink className="size-3.5" /> {t("Get")}
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="p-5 rounded-2xl border border-zinc-150 dark:border-zinc-800 bg-zinc-50/30 dark:bg-zinc-900/30 shadow-sm space-y-4">
                    <div className="flex flex-col gap-1">
                      <Label className="text-sm font-semibold">{t("Search Services (Search Tools)")}</Label>
                      <span className="text-xs text-zinc-400">{t("Configure keys for Tavily, SerpAPI or other search integrations")}</span>
                    </div>
                    <div className="grid gap-2 pt-1.5">
                      <Label className="text-xs font-bold text-zinc-700 dark:text-zinc-300">{t("Tavily / SerpAPI Key")}</Label>
                      <Input type="password" value={settings.searchKey} onChange={e => updateSetting('searchKey', e.target.value)} placeholder="Key..." className="h-10 text-xs font-mono bg-white dark:bg-zinc-950" />
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="experimental" className="space-y-5 mt-0 min-h-0 focus-visible:outline-none">
                <div className="p-4 bg-amber-50/10 dark:bg-amber-950/15 border border-amber-200/40 dark:border-amber-900/20 rounded-2xl flex gap-3.5 items-center mb-2 shadow-sm">
                  <Activity className="size-5 text-amber-600 shrink-0" />
                  <p className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed font-medium">{t("These features are for advanced users to extend system productivity. Use with caution in Beta.")}</p>
                </div>
                
                <Tabs defaultValue="mcp_list" className="w-full flex-1 flex flex-col min-h-0" onValueChange={v => setMcpTab(v as 'mcp_list' | 'market' | 'model_market' | 'raw')}>
                  <TabsList className="flex w-full h-10 p-1 items-center bg-zinc-100/70 dark:bg-zinc-900/40 border border-zinc-150 dark:border-zinc-800/80 rounded-xl mb-4 shrink-0 gap-1">
                    <TabsTrigger value="mcp_list" className="text-xs font-semibold h-8 rounded-lg flex-1">{t("MCP Servers")}</TabsTrigger>
                    <TabsTrigger value="market" className="text-xs font-semibold h-8 rounded-lg flex-1">{t("MCP Market")}</TabsTrigger>
                    <TabsTrigger value="model_market" className="text-xs font-semibold h-8 rounded-lg flex-1">{t("Model Market")}</TabsTrigger>
                    <TabsTrigger value="raw" className="text-xs font-semibold h-8 rounded-lg flex-1">{t("Raw Config")}</TabsTrigger>
                  </TabsList>
                  
                  <div className="flex-1 overflow-y-auto min-h-0 pt-1">
                    <TabsContent value="mcp_list" className="mt-0 space-y-4 focus-visible:outline-none">
                      <div className="flex items-center justify-between px-1">
                        <div className="flex items-center gap-2.5">
                          <Label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">{t("ENABLE MCP")}</Label>
                          <Switch checked={settings.mcpEnabled} onCheckedChange={v => updateSetting('mcpEnabled', v)} className="scale-75" />
                        </div>
                        <Button size="sm" variant="ghost" className="h-8 text-xs text-primary px-3 rounded-lg hover:bg-primary/5 font-semibold" onClick={() => {
                          setEditingServer(null);
                          setMcpForm({ name: "", type: "stdio", command: "", args: "", url: "" });
                          setShowAddForm(true);
                        }}>
                          <Plus className="size-4 mr-1.5" /> {t("Add Custom")}
                        </Button>
                      </div>
                      
                      {showAddForm ? (
                        <div className="p-5 border border-zinc-200 dark:border-zinc-800/80 rounded-2xl bg-zinc-50/50 dark:bg-zinc-900/30 space-y-4 animate-in fade-in slide-in-from-top-1 shadow-sm">
                          <div className="flex items-center justify-between mb-1">
                            <h4 className="text-xs font-bold uppercase tracking-widest text-zinc-500">{editingServer ? t('Edit Server') : t('Add Custom')}</h4>
                            <Button variant="ghost" size="sm" className="h-7 text-xs rounded-lg px-2.5" onClick={() => {
                              setMcpForm({ name: "", type: "stdio", command: "", args: "", url: "" });
                              setShowAddForm(false);
                            }}>{t("Cancel")}</Button>
                          </div>
                          <div className="grid gap-3.5">
                            <div className="grid gap-1.5">
                              <Label className="text-xs font-semibold">{t("Name")}</Label>
                              <Input value={mcpForm.name} onChange={e => setMcpForm(prev => ({...prev, name: e.target.value}))} placeholder="My Server" className="h-9 text-xs bg-white dark:bg-zinc-950" />
                            </div>
                            <div className="grid gap-1.5">
                              <Label className="text-xs font-semibold">{t("Server Type")}</Label>
                              <div className="grid grid-cols-2 gap-2">
                                <button
                                  type="button"
                                  onClick={() => setMcpForm(prev => ({ ...prev, type: "stdio" }))}
                                  className={`py-2 rounded-xl border text-xs font-semibold transition-all ${
                                    mcpForm.type === "stdio"
                                      ? 'border-primary bg-primary/10 text-primary shadow-sm font-semibold'
                                      : 'border-zinc-150 bg-white dark:bg-zinc-950 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900 text-zinc-650 dark:text-zinc-350'
                                  }`}
                                >
                                  stdio (Command)
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setMcpForm(prev => ({ ...prev, type: "sse" }))}
                                  className={`py-2 rounded-xl border text-xs font-semibold transition-all ${
                                    mcpForm.type === "sse"
                                      ? 'border-primary bg-primary/10 text-primary shadow-sm font-semibold'
                                      : 'border-zinc-150 bg-white dark:bg-zinc-950 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-900 text-zinc-650 dark:text-zinc-350'
                                  }`}
                                >
                                  sse (Web URL)
                                </button>
                              </div>
                            </div>
                            {mcpForm.type === "stdio" ? (
                              <>
                                <div className="grid gap-1.5">
                                  <Label className="text-xs font-semibold">{t("Command")}</Label>
                                  <Input value={mcpForm.command} onChange={e => setMcpForm(prev => ({...prev, command: e.target.value}))} placeholder="e.g. npx" className="h-9 text-xs font-mono bg-white dark:bg-zinc-950" />
                                </div>
                                <div className="grid gap-1.5">
                                  <Label className="text-xs font-semibold">{t("Arguments")}</Label>
                                  <Input value={mcpForm.args} onChange={e => setMcpForm(prev => ({...prev, args: e.target.value}))} placeholder="e.g. -y @modelcontextprotocol/server-fetch" className="h-9 text-xs font-mono bg-white dark:bg-zinc-950" />
                                </div>
                              </>
                            ) : (
                              <div className="grid gap-1.5">
                                <Label className="text-xs font-semibold">{t("SSE URL")}</Label>
                                <Input value={mcpForm.url} onChange={e => setMcpForm(prev => ({...prev, url: e.target.value}))} placeholder="e.g. http://localhost:3001/sse" className="h-9 text-xs font-mono bg-white dark:bg-zinc-950" />
                              </div>
                            )}
                          </div>
                          <div className="pt-2 flex gap-2">
                            <Button size="sm" className="flex-1 h-9 text-xs rounded-xl" onClick={() => handleSaveServer({
                              ...editingServer,
                              name: mcpForm.name,
                              type: mcpForm.type,
                              command: mcpForm.type === "stdio" ? mcpForm.command : undefined,
                              args: mcpForm.type === "stdio" ? mcpForm.args.split(" ").filter(a => a.trim() !== "") : [],
                              url: mcpForm.type === "sse" ? mcpForm.url : undefined,
                              enabled: true
                            })}>保存服务器</Button>
                            {editingServer && (
                              <Button size="sm" variant="ghost" className="h-9 text-xs text-red-500 hover:text-red-650 hover:bg-red-50 rounded-xl px-4" onClick={() => {
                                 if (editingServer.id) handleDeleteServer(editingServer.id)
                                 setShowAddForm(false)
                              }}>删除</Button>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                          {mcpServers.length === 0 ? (
                            <div className="py-12 text-center text-zinc-400 text-xs border border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl col-span-full">{t("No plugin servers yet")}</div>
                          ) : (
                            mcpServers.filter(s => s.id).map((server) => (
                              <Collapsible
                                key={`server-${server.id}`}
                                open={expandedMcp === server.id}
                                onOpenChange={(open) => {
                                  setExpandedMcp(open ? server.id ?? null : null)
                                  if (open && server.id && !selectedMcpDetails[server.id]) fetchMcpDetails(server.id)
                                }}
                                className="group border border-zinc-150 dark:border-zinc-800 rounded-2xl overflow-hidden hover:border-indigo-200 dark:hover:border-indigo-900/50 hover:shadow-sm transition-all bg-white dark:bg-zinc-950 flex flex-col min-w-0"
                              >
                                <div className="flex items-center justify-between gap-3 p-4 bg-zinc-50/20 dark:bg-zinc-900/5 min-w-0">
                                  <div className="flex flex-col min-w-0 flex-1">
                                    <div className="flex items-center gap-2 min-w-0">
                                      <span className="text-xs font-bold truncate text-zinc-800 dark:text-zinc-200">{server.name}</span>
                                      {server.enabled && (
                                        <Badge variant="outline" className="text-[9px] py-0 h-4.5 bg-green-50 text-green-600 border-green-150 font-mono tracking-tighter uppercase scale-90 px-1">Active</Badge>
                                      )}
                                    </div>
                                    <span className="text-[10px] text-zinc-400 truncate max-w-[240px] font-mono mt-0.5">{server.command || server.url}</span>
                                  </div>
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <Switch 
                                      checked={server.enabled} 
                                      onCheckedChange={(v) => handleSaveServer({ ...server, enabled: !!v })} 
                                      className="scale-75"
                                    />
                                    <Button 
                                      variant="ghost" 
                                      size="icon" 
                                      className="size-8 opacity-0 group-hover:opacity-100 hover:bg-zinc-100 dark:hover:bg-zinc-900 rounded-lg transition-opacity"
                                      onClick={(e) => { e.stopPropagation(); setEditingServer(server); setShowAddForm(true); }}
                                    >
                                      <Edit2 className="size-3.5" />
                                    </Button>
                                    <CollapsibleTrigger>
                                      <div className="flex items-center justify-center size-8 cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-900 rounded-lg shrink-0">
                                        {expandedMcp === server.id ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                                      </div>
                                    </CollapsibleTrigger>
                                  </div>
                                </div>
                                <CollapsibleContent className="px-4 pb-4 border-t border-zinc-100 dark:border-zinc-800">
                                  <div className="pt-3 text-xs text-zinc-500">
                                    {(() => {
                                      const sid = server.id!
                                      return loadingMcpDetails[sid] ? <Loader2 className="size-4 animate-spin mx-auto my-2 text-zinc-300" /> : (
                                        selectedMcpDetails[sid]?.tools?.length > 0 ? (
                                          <div className="flex flex-wrap gap-1.5 pt-1">
                                            {selectedMcpDetails[sid].tools.map((tool, tIdx: number) => (
                                              <Badge key={`tool-${sid}-${tool.name || tIdx}`} variant="secondary" className="px-2 py-0.5 text-[9px] opacity-80 h-5 border-none font-mono bg-zinc-100 dark:bg-zinc-800 text-zinc-650 dark:text-zinc-350">{tool.name}</Badge>
                                            ))}
                                          </div>
                                        ) : t('No tools available')
                                      )
                                    })()}
                                  </div>
                                </CollapsibleContent>
                              </Collapsible>
                            ))
                          )}
                        </div>
                      )}
                    </TabsContent>
                    
                    <TabsContent value="market" className="mt-0 focus-visible:outline-none">
                      <div className="flex gap-2 mb-4">
                        <div className="relative flex-1">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-zinc-400" />
                          <Input 
                            placeholder="搜索市场 (GitHub / Smithery)..." 
                            className="pl-9 h-10 text-xs bg-white dark:bg-zinc-950" 
                            value={marketSearch}
                            onChange={e => setMarketSearch(e.target.value)}
                          />
                        </div>
                        <Select value={marketSource} onValueChange={(v) => { if (v) setMarketSource(v as 'github' | 'smithery' | 'modelscope' | 'glama') }}>
                          <SelectTrigger className="w-[120px] h-10 text-xs font-semibold bg-white dark:bg-zinc-950 font-mono">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="github">GITHUB</SelectItem>
                            <SelectItem value="smithery">SMITHERY</SelectItem>
                            <SelectItem value="modelscope">ModelScope</SelectItem>
                            <SelectItem value="glama">Glama</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                        {loadingMcpMarket ? <div key="market-loading" className="py-20 text-center col-span-full"><Loader2 className="size-8 animate-spin mx-auto text-zinc-300" /></div> : (
                          marketServers.map((s, idx: number) => (
                            <div key={`market-${s.id || idx}`} className="p-4 border border-zinc-150 dark:border-zinc-800 rounded-2xl flex items-center justify-between gap-3 bg-white dark:bg-zinc-950 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-all hover:shadow-sm">
                              <div className="flex flex-col min-w-0 flex-1 mr-2">
                                <span className="text-xs font-bold truncate text-zinc-800 dark:text-zinc-200">{s.name}</span>
                                <span className="text-[10px] text-zinc-400 truncate max-w-[240px] mt-1 leading-tight">{s.description}</span>
                              </div>
                              <Button size="sm" variant="outline" className="h-8 text-[10px] px-3.5 font-bold font-mono tracking-wider shrink-0 rounded-xl" onClick={() => {
                                const serverConfig = { ...s }
                                if (!serverConfig.command && serverConfig.packageName) {
                                  serverConfig.command = 'npx'
                                  serverConfig.args = ['-y', serverConfig.packageName]
                                }
                                if (serverConfig.url && !serverConfig.command) {
                                  serverConfig.type = 'sse'
                                }
                                handleSaveServer(serverConfig)
                              }}>INSTALL</Button>
                            </div>
                          ))
                        )}
                      </div>
                    </TabsContent>
    
                    <TabsContent value="model_market" className="mt-0 focus-visible:outline-none">
                      <div className="flex gap-2 mb-4">
                        <div className="relative flex-1">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-zinc-400" />
                          <Input 
                            placeholder="搜索 HuggingFace (GGUF)..." 
                            className="pl-9 h-10 text-xs bg-white dark:bg-zinc-950" 
                            value={modelMarketSearch}
                            onChange={e => setMarketSearch(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && searchModelMarket(modelMarketSearch)}
                          />
                        </div>
                        <Button size="sm" variant="secondary" className="h-10 text-xs px-4 font-bold font-mono rounded-xl shrink-0" onClick={() => searchModelMarket(modelMarketSearch)}>SEARCH</Button>
                      </div>
                      <div className="space-y-4">
                        {loadingModelMarket ? <div key="model-market-loading" className="py-20 text-center"><Loader2 className="size-8 animate-spin mx-auto text-zinc-300" /></div> : (
                          modelMarketModels.map((m, idx: number) => (
                            <div key={`model-${m.id || idx}`} className="p-4.5 border border-zinc-150 dark:border-zinc-800 rounded-2xl bg-white dark:bg-zinc-950 space-y-3.5 hover:shadow-sm transition-all">
                              <div className="flex items-center justify-between pb-2 border-b border-zinc-100 dark:border-zinc-900">
                                <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200">{m.name}</span>
                                <Badge variant="outline" className="text-[9px] h-4.5 font-mono px-1.5">GGUF</Badge>
                              </div>
                              <div className="grid grid-cols-1 gap-2">
                                {m.ggufFiles ? [...m.ggufFiles].sort((a: string | { name: string; size: number }, b: string | { name: string; size: number }) => {
                                  const getSize = (f: string | { name: string; size: number }) => typeof f === 'object' ? (f.size || 0) : 0
                                  const getQLevel = (s: string) => { const match = s.match(/Q(\d+)/i); return match ? parseInt(match[1]) : 99 }
                                  const aName = typeof a === 'string' ? a : (a.name || '')
                                  const bName = typeof b === 'string' ? b : (b.name || '')
                                  const sizeDiff = getSize(a) - getSize(b)
                                  return sizeDiff !== 0 ? sizeDiff : getQLevel(aName) - getQLevel(bName)
                                }).slice(0, 5).map((file: string | { name: string; size: number }, fIdx: number) => {
                                 const fileName = typeof file === 'string' ? file : file.name
                                 return (
                                   <div key={`file-${m.id}-${fileName}-${fIdx}`} className="flex items-center justify-between text-xs p-2.5 bg-zinc-50/50 dark:bg-zinc-900/50 rounded-xl group border border-zinc-100/50 dark:border-zinc-850 hover:border-zinc-200 dark:hover:border-zinc-800 transition-colors">
                                     <span className="truncate flex-1 font-mono text-zinc-650 dark:text-zinc-350">{typeof fileName === 'string' ? fileName : ''}</span>
                                     <Button size="sm" variant="ghost" className="h-7 text-[10px] px-3 font-bold font-mono tracking-wider shrink-0 bg-white dark:bg-zinc-900 border border-zinc-150 dark:border-zinc-800 hover:bg-zinc-50 rounded-lg ml-3" onClick={() => { if (typeof fileName === 'string') downloadGguf(m.id, fileName) }} disabled={downloadingModelId === `${m.id}/${fileName}`}>
                                       {downloadingModelId === `${m.id}/${fileName}` ? (
                                         <div className="flex items-center gap-1 text-primary"><Loader2 className="size-3 animate-spin" />{downloadProgress?.progress || 0}%</div>
                                       ) : 'DOWNLOAD'}
                                     </Button>
                                   </div>
                                  )
                                }) : null}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </TabsContent>
    
                    <TabsContent value="raw" className="mt-0 flex flex-col space-y-4 h-[340px] focus-visible:outline-none">
                      <div className="flex-1 w-full border border-zinc-200 dark:border-zinc-800/80 rounded-2xl overflow-hidden shadow-inner">
                        <Editor
                          height="100%"
                          defaultLanguage="json"
                          theme={mode === 'dark' ? 'vs-dark' : 'light'}
                          value={rawMcpConfig}
                          onChange={(val) => setRawMcpConfig(val || '')}
                          options={{
                            minimap: { enabled: false },
                            scrollBeyondLastLine: false,
                            fontSize: 13,
                            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                            wordWrap: 'on'
                          }}
                        />
                      </div>
                      <div className="flex justify-end gap-2 shrink-0">
                        <Button size="sm" variant="outline" className="h-9 text-xs px-4 font-bold font-mono tracking-wider rounded-xl" onClick={fetchRawMcpConfig}>REFRESH</Button>
                        <Button size="sm" className="h-9 text-xs px-4 font-bold font-mono tracking-wider rounded-xl" onClick={saveRawMcpConfig}>APPLY CHANGES</Button>
                      </div>
                    </TabsContent>
                  </div>
                </Tabs>
              </TabsContent>
            </div>
          </Tabs>

          <div className="pt-4 mt-auto flex items-center justify-between border-t border-zinc-100 dark:border-zinc-850 shrink-0 px-6 pb-6">
            <div className="flex items-center">
              <span className="text-[10px] text-zinc-400 font-mono tracking-wider bg-zinc-50/50 dark:bg-zinc-900/50 border border-zinc-100 dark:border-zinc-850 px-2 py-0.5 rounded">OpenOrangeAI v0.5.0-beta</span>
            </div>
            <Button size="default" onClick={saveSettings} disabled={saving} className="px-6 h-10 font-bold tracking-tight rounded-xl bg-primary text-primary-foreground shadow-sm hover:shadow-md transition-all">
              {saving ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Save className="size-4 mr-2" />}
              {t("Save changes")}
            </Button>
          </div>
        </div>

        {/* MCP 高危命令特权授权拦截毛玻璃弹窗 */}
        {showSecurityAlert && pendingServer && (
          <div className="absolute inset-0 z-[100] bg-zinc-950/80 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in duration-300">
            <div className="bg-zinc-900/95 border border-red-500/40 rounded-3xl p-6 max-w-md w-full shadow-[0_0_50px_rgba(239,68,68,0.25)] space-y-6 text-zinc-100">
              <div className="flex items-center gap-3 border-b border-zinc-800 pb-4">
                <div className="p-2.5 bg-red-500/10 rounded-2xl text-red-500 shadow-[0_0_15px_rgba(239,68,68,0.2)]">
                  <ShieldCheck className="size-6 animate-pulse" />
                </div>
                <div className="space-y-0.5">
                  <h3 className="text-sm font-black uppercase tracking-wider text-red-500">MCP 安全沙箱过滤防线</h3>
                  <p className="text-[10px] text-zinc-400">检测到高危宿主系统调用</p>
                </div>
              </div>

              <div className="space-y-3">
                <p className="text-xs text-zinc-300 leading-relaxed">
                  自定义 MCP 插件 <span className="font-bold text-white">"{pendingServer.name}"</span> 正在请求添加。其配置命令或参数中包含敏感系统指令，可能对您的宿主数据造成威胁：
                </p>
                <div className="p-3 bg-zinc-950 border border-zinc-800 rounded-xl font-mono text-[10px] text-red-400 break-all select-all shadow-inner">
                  {pendingServer.command} {Array.isArray(pendingServer.args) ? pendingServer.args.join(" ") : pendingServer.args}
                </div>
              </div>

              <div className="flex flex-col gap-2 pt-2 text-[10px]">
                <Button 
                  size="sm" 
                  type="button"
                  className="w-full h-9 bg-red-600 hover:bg-red-700 text-white font-bold transition-all shadow-[0_0_15px_rgba(220,38,38,0.4)]"
                  onClick={() => {
                    executeSaveServer(pendingServer)
                    setShowSecurityAlert(false)
                    setPendingServer(null)
                    notify("success", "MCP 插件已获取系统宿主特权授权运行。")
                  }}
                >
                  强制特权授权安装
                </Button>
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    type="button"
                    className="flex-1 h-9 bg-zinc-950 border-zinc-800 hover:bg-zinc-800 text-zinc-300 font-semibold"
                    onClick={() => {
                      const sandboxedServer = {
                        ...pendingServer,
                        name: `${pendingServer.name} (Sandbox隔离)`,
                        description: "已安全隔离开启运行"
                      }
                      executeSaveServer(sandboxedServer)
                      setShowSecurityAlert(false)
                      setPendingServer(null)
                      notify("success", "已成功将 MCP 插件安全沙箱隔离运行！")
                    }}
                  >
                    安全沙箱化运行
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    type="button"
                    className="flex-1 h-9 hover:bg-zinc-800 text-zinc-400 hover:text-white"
                    onClick={() => {
                      setShowSecurityAlert(false)
                      setPendingServer(null)
                    }}
                  >
                    放弃安装
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
