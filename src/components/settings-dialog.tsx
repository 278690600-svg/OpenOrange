"use client"

import { useEffect, useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Save, ExternalLink, Loader2, CheckCircle2, XCircle, Server, Plus, Trash2, Edit2, Globe, Cpu, Terminal, Search, RefreshCw, ChevronDown, ChevronUp, Package, Wrench, Activity, LayoutGrid, Info, ShieldCheck, Sparkles, Bot, Check, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { useI18n } from "@/lib/i18n"
import { Checkbox } from "./ui/checkbox"
import { Switch } from "./ui/switch"
import { Slider } from "./ui/slider"
import { ScrollArea } from "./ui/scroll-area"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./ui/collapsible"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./ui/dropdown-menu"

const MIN_WIDTH = 520
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
]

export function SettingsDialog({ open, onOpenChange }: { open: boolean, onOpenChange: (open: boolean) => void }) {
  const [ollamaUrl, setOllamaUrl] = useState("http://127.0.0.1:11434")
  const [lmstudioUrl, setLmstudioUrl] = useState("http://127.0.0.1:1234")
  const [openaiKey, setOpenaiKey] = useState("")
  const [anthropicKey, setAnthropicKey] = useState("")
  const [googleKey, setGoogleKey] = useState("")
  const [minimaxKey, setMinimaxKey] = useState("")
  const [deepseekKey, setDeepseekKey] = useState("")
  const [groqKey, setGroqKey] = useState("")
  const [mistralKey, setMistralKey] = useState("")
  const [zhipuKey, setZhipuKey] = useState("")
  const [lingyiKey, setLingyiKey] = useState("")
  const [openrouterKey, setOpenrouterKey] = useState("")
  const [nvidiaKey, setNvidiaKey] = useState("")
  const [defaultModel, setDefaultModel] = useState("")
  const [searchEngine, setSearchEngine] = useState("duckduckgo")
  const [searchKey, setSearchKey] = useState("")
  const [localGgufEnabled, setLocalGgufEnabled] = useState(false)
  const [localGgufContextSize, setLocalGgufContextSize] = useState(4096)
  const [localGgufTemperature, setLocalGgufTemperature] = useState(0.7)
  const [localGgufTopP, setLocalGgufTopP] = useState(0.95)
  const [localGgufRepeatPenalty, setLocalGgufRepeatPenalty] = useState(1.1)
  const [localGgufMaxTokens, setLocalGgufMaxTokens] = useState(1024)
  const [apiTemperature, setApiTemperature] = useState(0.7)
  const [apiTopP, setApiTopP] = useState(0.9)
  const [apiMaxTokens, setApiMaxTokens] = useState(2048)
  const [apiContextSize, setApiContextSize] = useState(8192)
  const [theme, setTheme] = useState("zinc")
  const [mcpEnabled, setMcpEnabled] = useState(true)
  const [mcpAutoLoad, setMcpAutoLoad] = useState(false)
  const [maxConcurrentChats, setMaxConcurrentChats] = useState(3)
  const [enabledModels, setEnabledModels] = useState<string[]>([])
  const [allModels, setAllModels] = useState<any[]>([])
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<'ok' | 'fail' | null>(null)
  const [mcpServers, setMcpServers] = useState<any[]>([])
  const [editingServer, setEditingServer] = useState<any>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [mcpTab, setMcpTab] = useState<'my' | 'market' | 'raw' | 'model_market'>('my')
  const [marketSearch, setMarketSearch] = useState("")
  const [marketSource, setMarketSource] = useState<'github' | 'smithery'>('github')
  const [selectedSecurityProvider, setSelectedSecurityProvider] = useState("openai")
  const [marketServers, setMarketServers] = useState<any[]>([])
  const [loadingMarket, setLoadingMarket] = useState(false)
  const [modelMarketModels, setModelMarketModels] = useState<any[]>([])
  const [modelMarketSearch, setModelMarketSearch] = useState("qwen")
  const [downloadingModelId, setDownloadingModelId] = useState<string | null>(null)
  const [downloadProgress, setDownloadProgress] = useState<{status: string, progress: number, message: string, downloadedMB?: string, totalMB?: string} | null>(null)
  const { t, language, setLanguage } = useI18n()

  const [localModelStatus, setLocalModelStatus] = useState<{isLoaded: boolean; modelName?: string} | null>(null)
  const [unloadingLocal, setUnloadingLocal] = useState(false)
  const [models, setModels] = useState<any[]>([])
  const [isLoadingModels, setIsLoadingModels] = useState(false)
  const [selectedMcpDetails, setSelectedMcpDetails] = useState<Record<string, any>>({})
  const [loadingMcpDetails, setLoadingMcpDetails] = useState<Record<string, boolean>>({})
  const [expandedMcp, setExpandedMcp] = useState<string | null>(null)

  const [rawMcpConfig, setRawMcpConfig] = useState("")
  const [loadingRawConfig, setLoadingRawConfig] = useState(false)

  // MCP Form State
  const [mcpName, setMcpName] = useState("")
  const [mcpCommand, setMcpCommand] = useState("")
  const [mcpArgs, setMcpArgs] = useState("")
  const [mcpUrl, setMcpUrl] = useState("")
  
  const [prompts, setPrompts] = useState<any[]>([])
  const [editingPromptId, setEditingPromptId] = useState<string | null>(null)
  const [isAddingPrompt, setIsAddingPrompt] = useState(false)
  const [deletingPromptId, setDeletingPromptId] = useState<string | null>(null)
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null)
  const [promptForm, setPromptForm] = useState({ name: "", content: "", description: "" })

  useEffect(() => {
    if (editingServer) {
       setMcpName(editingServer.name || "")
       setMcpCommand(editingServer.command || "")
       setMcpArgs(Array.isArray(editingServer.args) ? editingServer.args.join(" ") : (editingServer.args || ""))
       setMcpUrl(editingServer.url || "")
    } else {
       setMcpName("")
       setMcpCommand("")
       setMcpArgs("")
       setMcpUrl("")
    }
  }, [editingServer])
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

  useEffect(() => {
    if (open) {
      setTestResult(null)
      fetchLocalModelStatus()
      fetchModels()
      refreshPrompts()

      fetch('/api/settings')
        .then(res => res.json())
        .then(data => {
          setOllamaUrl(data.ollamaUrl || "http://127.0.0.1:11434")
          setLmstudioUrl(data.lmstudioUrl || "http://127.0.0.1:1234")
          setOpenaiKey(data.openaiKey || "")
          setAnthropicKey(data.anthropicKey || "")
          setGoogleKey(data.googleKey || "")
          setMinimaxKey(data.minimaxKey || "")
          setDeepseekKey(data.deepseekKey || "")
          setGroqKey(data.groqKey || "")
          setMistralKey(data.mistralKey || "")
          setZhipuKey(data.zhipuKey || "")
          setLingyiKey(data.lingyiKey || "")
          setOpenrouterKey(data.openrouterKey || "")
          setNvidiaKey(data.nvidiaKey || "")
          setDefaultModel(data.defaultModel || "")
          setSearchEngine(data.searchEngine || "duckduckgo")
          setSearchKey(data.searchKey || "")
          setLocalGgufEnabled(data.localGgufEnabled ?? false)
          setLocalGgufContextSize(data.localGgufContextSize ?? 4096)
          setLocalGgufTemperature(data.localGgufTemperature ?? 0.7)
          setLocalGgufTopP(data.localGgufTopP ?? 0.95)
          setLocalGgufRepeatPenalty(data.localGgufRepeatPenalty ?? 1.1)
          setLocalGgufMaxTokens(data.localGgufMaxTokens ?? 1024)
          setApiTemperature(data.apiTemperature ?? 0.7)
          setApiTopP(data.apiTopP ?? 0.9)
          setApiMaxTokens(data.apiMaxTokens ?? 2048)
          setApiContextSize(data.apiContextSize ?? 8192)
          setTheme(data.theme || "zinc")
          setMcpEnabled(data.mcpEnabled ?? true)
          setMcpAutoLoad(data.mcpAutoLoad ?? false)
          setMaxConcurrentChats(data.maxConcurrentChats ?? 3)
          try {
            setEnabledModels(JSON.parse(data.enabledModels || "[]"))
          } catch (e) {
            setEnabledModels([])
          }
        })
        .catch(console.error)
      
      fetch('/api/models?all=true')
        .then(res => res.json())
        .then(data => setAllModels(Array.isArray(data) ? data : []))
        .catch(console.error)
      
      fetch('/api/settings/mcp')
        .then(res => res.json())
        .then(data => setMcpServers(Array.isArray(data) ? data : []))
        .catch(console.error)
    }
  }, [open])

  useEffect(() => {
    if (mcpEnabled && mcpServers.length > 0) {
      const enabledServers = mcpServers.filter((s: any) => s.enabled)
      enabledServers.forEach((server: any) => {
        if (!selectedMcpDetails[server.id] && !loadingMcpDetails[server.id]) {
          fetchMcpDetails(server.id)
        }
      })
    }
  }, [mcpEnabled, mcpServers])

  const saveSettings = async () => {
    setSaving(true)
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        ollamaUrl, lmstudioUrl, 
        openaiKey, anthropicKey, googleKey, minimaxKey, deepseekKey, 
        groqKey, mistralKey, zhipuKey, lingyiKey, openrouterKey, nvidiaKey,
        defaultModel, searchEngine, searchKey, localGgufEnabled,
        localGgufContextSize, localGgufTemperature, localGgufTopP, localGgufRepeatPenalty, localGgufMaxTokens,
        apiTemperature, apiTopP, apiMaxTokens, apiContextSize, theme,
        mcpEnabled, mcpAutoLoad, maxConcurrentChats, enabledModels: JSON.stringify(enabledModels)
      })
    })

    if (!res.ok) {
      console.error("Save settings failed")
    }

    document.documentElement.setAttribute('data-theme', theme)
    setSaving(false)
    onOpenChange(false)
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
    } catch (error: any) {
      alert("Save failed: " + error.message)
    }
    setSaving(false)
  }

  const handleSaveServer = async (server: any) => {
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
      setMcpTab('my')
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

  const fetchMarket = async (q?: string) => {
    setLoadingMarket(true)
    try {
      const res = await fetch(`/api/settings/mcp/market?search=${encodeURIComponent(q || '')}&source=${marketSource}`)
      const data = await res.json()
      setMarketServers(data.servers || [])
    } catch (error) {
      console.error("Fetch market error:", error)
    }
    setLoadingMarket(false)
  }

  const searchModelMarket = async (q: string) => {
    setLoadingMarket(true)
    try {
      const res = await fetch(`/api/models/market?search=${encodeURIComponent(q)}`)
      const data = await res.json()
      setModelMarketModels(data.models || [])
    } catch (e) {
      console.error('Market search error:', e)
    }
    setLoadingMarket(false)
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
            } catch (e) {}
          }
        }
      }
    } catch (e: any) {
      setDownloadProgress({ status: 'error', progress: -1, message: e.message })
      setDownloadingModelId(null)
    }
  }

  useEffect(() => {
    if (mcpTab === 'market') {
      fetchMarket(marketSearch)
    } else if (mcpTab === 'raw') {
      fetchRawMcpConfig()
    }
  }, [mcpTab, marketSource])

  const [dialogSize, setDialogSize] = useState<{ width: number; height: number }>({
    width: DEFAULT_WIDTH,
    height: DEFAULT_HEIGHT,
  })

  useEffect(() => {
    if (open) {
      setDialogSize({ 
        width: DEFAULT_WIDTH, 
        height: typeof window !== 'undefined' ? window.innerHeight - 48 : DEFAULT_HEIGHT 
      })
    }
  }, [open])

  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const startY = e.clientY
    const startWidth = dialogSize.width
    const startHeight = dialogSize.height

    const onMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startX
      const dy = ev.clientY - startY
      setDialogSize({
        width: Math.max(MIN_WIDTH, startWidth + dx),
        height: Math.max(MIN_HEIGHT, startHeight + dy),
      })
    }
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        className="sm:max-w-none p-0 flex flex-col"
        style={{ 
          width: dialogSize.width, 
          maxWidth: 'calc(100vw - 2rem)',
          height: dialogSize.height,
          maxHeight: 'calc(100vh - 2rem)',
          minWidth: MIN_WIDTH,
          minHeight: MIN_HEIGHT,
        }}
      >
        <DialogHeader className="p-6 pb-0">
          <DialogTitle className="text-lg font-semibold">{t("Settings Title")}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-hidden flex flex-col p-6 pt-2">
          <Tabs defaultValue="general" className="flex-1 flex flex-col min-h-0">
            <TabsList className="w-full mb-4 shrink-0">
              <TabsTrigger value="general" className="flex-1">{t("General")}</TabsTrigger>
              <TabsTrigger value="models" className="flex-1">{t("Models")}</TabsTrigger>
              <TabsTrigger value="prompts" className="flex-1">{t("Prompts")}</TabsTrigger>
              <TabsTrigger value="security" className="flex-1">{t("Security")}</TabsTrigger>
              <TabsTrigger value="experimental" className="flex-1">{t("Experimental")}</TabsTrigger>
            </TabsList>

            <div className="flex-1 overflow-y-auto pr-1 -mr-1 custom-scrollbar min-h-0">
              <TabsContent value="general" className="space-y-6 mt-0">
                <div className="grid gap-3">
                  <Label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">{t("Appearance")}</Label>
                  <div className="grid grid-cols-5 gap-2">
                    {[
                      { id: 'zinc', name: 'OpenOrange', color: 'bg-zinc-500' },
                      { id: 'orange', name: 'Orange', color: 'bg-orange-500' },
                      { id: 'blue', name: 'Blue', color: 'bg-blue-500' },
                      { id: 'green', name: 'Green', color: 'bg-emerald-500' },
                      { id: 'rose', name: 'Rose', color: 'bg-rose-500' },
                    ].map((themeItem) => (
                      <button
                        key={themeItem.id}
                        onClick={() => {
                          setTheme(themeItem.id)
                          document.documentElement.setAttribute('data-theme', themeItem.id)
                        }}
                        className={`group relative flex flex-col items-center gap-2 p-2 rounded-xl border-2 transition-all ${
                          theme === themeItem.id ? 'border-primary bg-primary/5' : 'border-transparent hover:bg-zinc-100 dark:hover:bg-zinc-800'
                        }`}
                      >
                        <div className={`size-8 rounded-full shadow-sm ${themeItem.color} group-hover:scale-110 transition-transform`} />
                        <span className="text-[10px] font-medium">{themeItem.name}</span>
                        {theme === themeItem.id && (
                          <div className="absolute -top-1 -right-1 size-4 rounded-full bg-primary flex items-center justify-center text-[10px] text-white">
                            <CheckCircle2 className="size-2.5" />
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid gap-3 pt-2">
                  <Label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">{t("Language")}</Label>
                  <Select value={language} onValueChange={(v) => { if (v) setLanguage(v as any) }}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="en">English</SelectItem>
                      <SelectItem value="zh">中文 (简体)</SelectItem>
                      <SelectItem value="es">Español</SelectItem>
                      <SelectItem value="fr">Français</SelectItem>
                      <SelectItem value="de">Deutsch</SelectItem>
                      <SelectItem value="ja">日本語</SelectItem>
                      <SelectItem value="ko">한국어</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-3 pt-4 border-t border-zinc-100 dark:border-zinc-800">
                  <Label className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">{t("Max Concurrent Tasks") || "最大并发任务数"}</Label>
                  <div className="flex items-center gap-4">
                    <Input 
                      type="number" 
                      min={1} 
                      max={10} 
                      value={maxConcurrentChats} 
                      onChange={(e) => setMaxConcurrentChats(Math.min(10, Math.max(1, parseInt(e.target.value) || 3)))}
                      className="w-24 h-9 text-xs"
                    />
                    <span className="text-xs text-zinc-400">
                      {t("Concurrent limit description") || "允许后台同时运行的 AI 任务数上限（1-10）"}
                    </span>
                  </div>
                </div>

                <div className="grid gap-3 pt-4 border-t border-zinc-100 dark:border-zinc-800">
                  <Label className="text-[11px] font-bold text-zinc-400 uppercase tracking-wider">{t("Web Search Service")}</Label>
                  <div className="grid gap-3">
                    <Select value={searchEngine} onValueChange={(v) => { if (v) setSearchEngine(v) }}>
                      <SelectTrigger className="w-full h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SEARCH_ENGINES.map(e => (
                          <SelectItem key={e.id} value={e.id}>{e.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-[10px] text-zinc-500 bg-zinc-50 dark:bg-zinc-900/50 p-2 rounded-lg border border-zinc-100 dark:border-zinc-800">
                      {SEARCH_ENGINES.find(e => e.id === searchEngine)?.desc}
                      {SEARCH_ENGINES.find(e => e.id === searchEngine)?.free ? ` (${t("No key required")})` : ` (${t("Need to configure key in Security page")})`}
                    </p>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="models" className="space-y-6 mt-0 flex-1 flex flex-col min-h-0">
                <div className="flex-1 overflow-y-auto pr-1 -mr-1 custom-scrollbar space-y-6">
                  <div className="grid gap-2">
                    <Label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">{t("Default Model")}</Label>
                    <div className="flex gap-2">
                      <Select value={defaultModel} onValueChange={v => { if (v) setDefaultModel(v) }}>
                        <SelectTrigger className="flex-1 h-9">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {models.map(m => (
                            <SelectItem key={m.id} value={m.id}>
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="text-[10px] scale-90 opacity-50">{m.provider}</Badge>
                                {m.name}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button variant="outline" size="icon" onClick={fetchModels} disabled={isLoadingModels} className="h-9 w-9">
                        <RefreshCw className={`size-4 ${isLoadingModels ? "animate-spin" : ""}`} />
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">{t("Model Whitelist")}</Label>
                      <div className="flex gap-2">
                        <Button variant="ghost" size="sm" className="h-7 text-[10px]" onClick={() => setEnabledModels(allModels.map(m => m.id))}>
                          {t("Enable All")}
                        </Button>
                        <Button variant="ghost" size="sm" className="h-7 text-[10px]" onClick={() => setEnabledModels([])}>
                          {t("Disable All")}
                        </Button>
                      </div>
                    </div>
                    <p className="text-[10px] text-zinc-400">{t("Only enabled models will appear in the chat selector.")}</p>
                    <div className="grid grid-cols-2 gap-2 max-h-[160px] overflow-y-auto p-3 rounded-xl border border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-950/50 custom-scrollbar">
                      {allModels.map(model => (
                        <div key={model.id} className="flex items-center space-x-2 p-1.5 rounded-lg hover:bg-zinc-50 dark:hover:bg-zinc-900 border border-transparent hover:border-zinc-100 dark:hover:border-zinc-800 group transition-all">
                          <Checkbox 
                            id={`model-${model.id}`} 
                            checked={enabledModels.includes(model.id)}
                            onCheckedChange={(checked) => {
                              if (checked) setEnabledModels(prev => [...prev, model.id])
                              else setEnabledModels(prev => prev.filter(id => id !== model.id))
                            }}
                          />
                          <Label 
                            htmlFor={`model-${model.id}`}
                            className="text-[11px] font-medium leading-none cursor-pointer flex-1 truncate flex items-center gap-1.5"
                          >
                            <Badge variant="outline" className="scale-75 origin-left opacity-60 text-[9px] px-1 h-4">{model.provider}</Badge>
                            <span className="truncate group-hover:text-primary transition-colors">{model.name || model.id}</span>
                          </Label>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="p-4 rounded-xl border border-amber-200/50 dark:border-amber-900/30 bg-amber-50/20 dark:bg-amber-900/10 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label className="text-sm font-bold flex items-center gap-2 text-amber-700 dark:text-amber-500">
                          <Cpu className="size-4" />
                          {t("Embedded GGUF Engine")}
                        </Label>
                        <p className="text-[10px] text-zinc-500">{t("Run local .gguf files directly without external services")}</p>
                      </div>
                      <Switch checked={localGgufEnabled} onCheckedChange={setLocalGgufEnabled} />
                    </div>
                    {localGgufEnabled && (
                      <div className="flex items-center justify-between text-[11px] bg-white dark:bg-zinc-900/50 rounded-lg p-2 border border-amber-100 dark:border-amber-900/20">
                        <span className="text-zinc-500">{t("Engine Status:")}</span>
                        <span className="font-semibold flex items-center gap-1">
                          {localModelStatus?.isLoaded ? (
                            <><span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> {t("Loaded")}</>
                          ) : (
                            <span className="text-zinc-400">{t("Idle")}</span>
                          )}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="space-y-3">
                    <Label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">{t("Local Servers")}</Label>
                    <div className="grid gap-3 p-4 rounded-xl border border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30">
                      <div className="grid gap-1.5">
                        <Label className="text-[11px] font-medium">{t("Ollama URL")}</Label>
                        <Input value={ollamaUrl} onChange={e => setOllamaUrl(e.target.value)} placeholder="http://127.0.0.1:11434" className="h-8 text-xs font-mono" />
                      </div>
                      <div className="grid gap-1.5">
                        <Label className="text-[11px] font-medium">{t("LM Studio URL")}</Label>
                        <Input value={lmstudioUrl} onChange={e => setLmstudioUrl(e.target.value)} placeholder="http://127.0.0.1:1234" className="h-8 text-xs font-mono" />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3">
                     <Label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">{t("Local Model Management")}</Label>
                     <div className="space-y-2">
                        {models.filter(m => m.provider === 'local').map((model: any) => (
                          <div key={model.id} className="flex items-center justify-between p-3 border border-zinc-100 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-950">
                             <div className="flex flex-col min-w-0">
                                <span className="text-xs font-medium truncate">{model.name}</span>
                                <span className="text-[10px] text-zinc-400 font-mono">GGUF Model</span>
                             </div>
                             <Button variant="ghost" size="icon" className="size-7 hover:text-red-500" onClick={() => deleteLocalModel(model.id)}>
                               <Trash2 className="size-3" />
                             </Button>
                          </div>
                        ))}
                        {models.filter(m => m.provider === 'local').length === 0 && (
                          <div className="py-8 text-center text-zinc-400 text-xs border border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl">
                             {t("No downloaded models yet")}
                          </div>
                        )}
                     </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="prompts" className="space-y-6 mt-0 flex-1 flex flex-col min-h-0">
                <div className="flex items-center justify-between shrink-0">
                   <div className="space-y-0.5">
                     <Label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">{t("Prompt Hub / Character Presets")}</Label>
                     <p className="text-[10px] text-zinc-400">{t("Manage your system prompts and professional character presets")}</p>
                   </div>
                   <Button size="sm" variant="outline" className="h-8 text-[11px] bg-primary/5 hover:bg-primary/10 border-primary/20 text-primary" onClick={() => {
                     setIsAddingPrompt(true)
                     setPromptForm({ name: "", content: "", description: "用户自定义预设" })
                   }}>
                     <Plus className="size-3.5 mr-1" />{t("Add")}
                   </Button>
                </div>
                
                <div className="flex-1 overflow-y-auto pr-1 -mr-1 custom-scrollbar space-y-4">
                  {/* 新增表单 */}
                  {isAddingPrompt && (
                    <div className="p-4 rounded-2xl border-2 border-dashed border-primary/30 bg-primary/5 space-y-4 animate-in fade-in slide-in-from-top-2">
                       <div className="grid gap-3">
                         <div className="grid gap-1.5">
                           <Label className="text-[11px] font-bold text-primary">{t("Preset Name")}</Label>
                           <Input 
                             value={promptForm.name} 
                             onChange={e => setPromptForm(prev => ({ ...prev, name: e.target.value }))}
                             placeholder={t("e.g., Frontend Expert")}
                             className="h-8 text-xs bg-white dark:bg-zinc-950"
                           />
                         </div>
                         <div className="grid gap-1.5">
                           <Label className="text-[11px] font-bold text-primary">{t("Role Instructions (System Prompt)")}</Label>
                           <textarea 
                             value={promptForm.content} 
                             onChange={e => setPromptForm(prev => ({ ...prev, content: e.target.value }))}
                             placeholder={t("You are an experienced frontend engineer...")}
                             className="min-h-[100px] w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary dark:border-zinc-800 dark:bg-zinc-950"
                           />
                         </div>
                       </div>
                       <div className="flex justify-end gap-2 text-[11px]">
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

                  {prompts.map((p: any) => (
                    <div key={p.id} className={`p-4 rounded-2xl border transition-all shadow-sm ${
                      editingPromptId === p.id 
                        ? 'border-primary bg-primary/5 ring-1 ring-primary/20' 
                        : 'border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30 hover:bg-zinc-100/50 dark:hover:bg-zinc-900/50'
                    } flex flex-col gap-3 group relative border-l-4 ${p.isSystem ? 'border-l-zinc-300' : 'border-l-indigo-500'}`}>
                      
                      {editingPromptId === p.id ? (
                        /* 编辑表单 */
                        <div className="space-y-4 w-full">
                          <div className="grid gap-3">
                             <div className="grid gap-1.5">
                               <Label className="text-[11px] font-medium">{t("Preset Name")}</Label>
                               <Input 
                                 value={promptForm.name} 
                                 onChange={e => setPromptForm(prev => ({ ...prev, name: e.target.value }))}
                                 className="h-8 text-xs bg-white dark:bg-zinc-950"
                               />
                             </div>
                             <div className="grid gap-1.5">
                               <Label className="text-[11px] font-medium">{t("Role Instructions")}</Label>
                               <textarea 
                                 value={promptForm.content} 
                                 onChange={e => setPromptForm(prev => ({ ...prev, content: e.target.value }))}
                                 className="min-h-[100px] w-full rounded-md border border-zinc-200 bg-white px-3 py-2 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary dark:border-zinc-800 dark:bg-zinc-950"
                               />
                             </div>
                          </div>
                          <div className="flex justify-end gap-2">
                             <Button variant="ghost" size="sm" className="h-7 text-[10px]" onClick={() => setEditingPromptId(null)}>{t("Cancel")}</Button>
                             <Button size="sm" className="h-7 text-[10px]" onClick={() => {
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
                        <div className="flex items-start justify-between">
                          <div className="flex flex-col gap-1 min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <Sparkles className={`size-3.5 ${p.isSystem ? 'text-zinc-400' : 'text-amber-500'}`} />
                              <span className="text-sm font-bold truncate group-hover:text-primary transition-colors">{p.name}</span>
                              {p.isSystem && <Badge variant="secondary" className="text-[9px] h-4 opacity-70">SYSTEM</Badge>}
                            </div>
                            <p className="text-[11px] text-zinc-500 leading-relaxed line-clamp-3">{p.content}</p>
                          </div>
                          
                          <div className="ml-4 flex items-center gap-1 shrink-0">
                                <Button size="sm" variant="ghost" className="size-8 p-0 text-zinc-400 hover:text-primary hover:bg-primary/5 transition-all" 
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingPromptId(p.id);
                                    setPromptForm({ name: p.name, content: p.content, description: p.description || "" });
                                  }}>
                                  <Edit2 className="size-3.5" />
                                </Button>

                                {confirmingDeleteId === p.id ? (
                                  <div className="flex items-center gap-1 animate-in fade-in zoom-in-95 duration-200">
                                    <Button size="sm" variant="ghost" className="size-8 p-0 text-red-500 hover:bg-red-50 transition-all" 
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
                                    <Button size="sm" variant="ghost" className="size-8 p-0 text-zinc-400 hover:bg-zinc-100 transition-all" 
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setConfirmingDeleteId(null);
                                      }}>
                                      <X className="size-3.5" />
                                    </Button>
                                  </div>
                                ) : (
                                  <Button size="sm" variant="ghost" className="size-8 p-0 text-zinc-400 hover:text-red-500 hover:bg-red-50 transition-all disabled:opacity-50" 
                                    disabled={deletingPromptId === p.id}
                                    title="删除"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setConfirmingDeleteId(p.id);
                                    }}>
                                    <Trash2 className="size-3.5" />
                                  </Button>
                                )}
                            
                            {/* 系统预设额外功能保留 */}
                            {p.isSystem && !confirmingDeleteId && (
                              <Button size="sm" variant="ghost" className="size-8 p-0 text-zinc-300 hover:text-primary transition-all" 
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
                  
                  {prompts.length === 0 && !isAddingPrompt && (
                    <div className="py-16 text-center space-y-3 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-2xl bg-zinc-50/20">
                      <div className="size-12 rounded-full bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center mx-auto">
                        <Bot className="size-6 text-zinc-300" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs font-medium text-zinc-500">{t("No preset roles yet")}</p>
                        <p className="text-[10px] text-zinc-400">{t("Click the 'Add' button in the top right to start your professional workflow")}</p>
                      </div>
                    </div>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="security" className="space-y-4 mt-0">
                <div className="grid gap-4">
                  <div className="p-4 rounded-xl bg-indigo-50/30 dark:bg-indigo-900/10 border border-indigo-100 dark:border-indigo-900/30 flex items-start gap-3">
                    <ShieldCheck className="size-5 text-indigo-500 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                      <div className="text-sm font-semibold">{t("Privacy & Security Settings")}</div>
                      <p className="text-[11px] text-zinc-500 leading-relaxed">{t("Your API keys are stored locally and used only for communication. Local models are recommended for data privacy.")}</p>
                    </div>
                  </div>

                  <div className="space-y-6">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                         <Label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">{t("LLM Providers")}</Label>
                         <Select value={selectedSecurityProvider} onValueChange={v => v && setSelectedSecurityProvider(v)}>
                           <SelectTrigger className="w-[180px] h-8 text-[11px] font-mono bg-white dark:bg-zinc-950">
                             <SelectValue />
                           </SelectTrigger>
                           <SelectContent>
                             {LLM_PROVIDERS.map(p => (
                               <SelectItem key={p.id} value={p.id} className="text-[11px]">{p.label}</SelectItem>
                             ))}
                           </SelectContent>
                         </Select>
                      </div>

                      <div className="p-4 rounded-xl border border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-950 shadow-sm animate-in fade-in slide-in-from-top-1 duration-200">
                        {selectedSecurityProvider === 'openai' && (
                          <div className="grid gap-2">
                             <Label className="text-[11px] font-medium">OpenAI API Key</Label>
                             <Input type="password" value={openaiKey} onChange={e => setOpenaiKey(e.target.value)} placeholder="sk-..." className="h-9 text-xs" />
                          </div>
                        )}
                        {selectedSecurityProvider === 'anthropic' && (
                          <div className="grid gap-2">
                             <Label className="text-[11px] font-medium">Anthropic API Key</Label>
                             <Input type="password" value={anthropicKey} onChange={e => setAnthropicKey(e.target.value)} placeholder="sk-ant-..." className="h-9 text-xs" />
                          </div>
                        )}
                        {selectedSecurityProvider === 'google' && (
                          <div className="grid gap-2">
                             <Label className="text-[11px] font-medium">Google Gemini Key</Label>
                             <Input type="password" value={googleKey} onChange={e => setGoogleKey(e.target.value)} placeholder="AIza..." className="h-9 text-xs" />
                          </div>
                        )}
                        {selectedSecurityProvider === 'deepseek' && (
                          <div className="grid gap-2">
                             <Label className="text-[11px] font-medium">DeepSeek API Key</Label>
                             <Input type="password" value={deepseekKey} onChange={e => setDeepseekKey(e.target.value)} placeholder="sk-..." className="h-9 text-xs" />
                          </div>
                        )}
                        {selectedSecurityProvider === 'minimax' && (
                          <div className="grid gap-2">
                             <Label className="text-[11px] font-medium">MiniMax API Key</Label>
                             <Input type="password" value={minimaxKey} onChange={e => setMinimaxKey(e.target.value)} placeholder="Key..." className="h-9 text-xs" />
                          </div>
                        )}
                        {selectedSecurityProvider === 'groq' && (
                          <div className="grid gap-2">
                             <Label className="text-[11px] font-medium">Groq API Key</Label>
                             <Input type="password" value={groqKey} onChange={e => setGroqKey(e.target.value)} placeholder="gsk_..." className="h-9 text-xs" />
                          </div>
                        )}
                        {selectedSecurityProvider === 'mistral' && (
                          <div className="grid gap-2">
                             <Label className="text-[11px] font-medium">Mistral AI Key</Label>
                             <Input type="password" value={mistralKey} onChange={e => setMistralKey(e.target.value)} placeholder="Key..." className="h-9 text-xs" />
                          </div>
                        )}
                        {selectedSecurityProvider === 'zhipu' && (
                          <div className="grid gap-2">
                             <Label className="text-[11px] font-medium">智谱 AI (Zhipu) Key</Label>
                             <Input type="password" value={zhipuKey} onChange={e => setZhipuKey(e.target.value)} placeholder="API Key..." className="h-9 text-xs" />
                          </div>
                        )}
                        {selectedSecurityProvider === 'lingyi' && (
                          <div className="grid gap-2">
                             <Label className="text-[11px] font-medium">零一万物 (Lingyi) Key</Label>
                             <Input type="password" value={lingyiKey} onChange={e => setLingyiKey(e.target.value)} placeholder="API Key..." className="h-9 text-xs" />
                          </div>
                        )}
                        {selectedSecurityProvider === 'openrouter' && (
                          <div className="grid gap-2">
                             <Label className="text-[11px] font-medium">OpenRouter Key</Label>
                             <Input type="password" value={openrouterKey} onChange={e => setOpenrouterKey(e.target.value)} placeholder="sk-or-..." className="h-9 text-xs" />
                          </div>
                        )}
                        {selectedSecurityProvider === 'nvidia' && (
                          <div className="grid gap-2">
                             <Label className="text-[11px] font-medium">NVIDIA API Key</Label>
                             <div className="flex gap-2">
                               <Input type="password" value={nvidiaKey} onChange={e => setNvidiaKey(e.target.value)} placeholder="nvapi-..." className="h-9 text-xs" />
                               <Button variant="outline" size="sm" onClick={() => window.open('https://build.nvidia.com/explore/discover', '_blank')} className="h-9 text-[10px] gap-1 px-2">
                                 <ExternalLink className="size-3" /> {t("Get")}
                               </Button>
                             </div>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="space-y-3">
                        <Label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">{t("Search Services (Search Tools)")}</Label>
                        <div className="p-4 rounded-xl border border-zinc-100 dark:border-zinc-800 bg-zinc-50/30 dark:bg-zinc-900/10">
                          <div className="grid gap-2">
                            <Label className="text-[11px] font-medium">{t("Tavily / SerpAPI Key")}</Label>
                            <Input type="password" value={searchKey} onChange={e => setSearchKey(e.target.value)} placeholder="Key..." className="h-8 text-xs bg-white dark:bg-zinc-950" />
                          </div>
                        </div>
                    </div>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="experimental" className="space-y-4 mt-0 min-h-0">
                <div className="p-3 bg-amber-50/30 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/30 rounded-xl flex gap-3 items-center mb-2">
                   <Activity className="size-4 text-amber-600 shrink-0" />
                   <p className="text-[10px] text-amber-700 dark:text-amber-400">{t("These features are for advanced users to extend system productivity. Use with caution in Beta.")}</p>
                </div>
                
                <Tabs defaultValue="mcp_list" className="w-full flex-1" onValueChange={v => setMcpTab(v as any)}>
                   <TabsList className="w-full h-8 p-0.5 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 mb-4 shrink-0">
                     <TabsTrigger value="mcp_list" className="flex-1 text-[10px] h-7">{t("MCP Servers")}</TabsTrigger>
                     <TabsTrigger value="market" className="flex-1 text-[10px] h-7">{t("MCP Market")}</TabsTrigger>
                     <TabsTrigger value="model_market" className="flex-1 text-[10px] h-7">{t("Model Market")}</TabsTrigger>
                     <TabsTrigger value="raw" className="flex-1 text-[10px] h-7">{t("Raw Config")}</TabsTrigger>
                   </TabsList>
                   
                   <div className="flex-1 overflow-y-auto">
                     <TabsContent value="mcp_list" className="mt-0 space-y-4">
                        <div className="flex items-center justify-between px-1">
                           <div className="flex items-center gap-2">
                             <Label className="text-xs font-bold font-mono tracking-tighter">{t("ENABLE MCP")}</Label>
                             <Switch checked={mcpEnabled} onCheckedChange={setMcpEnabled} className="scale-75" />
                           </div>
                           <Button size="sm" variant="ghost" className="h-7 text-[10px] text-primary" onClick={() => { setEditingServer(null); setShowAddForm(true); }}>
                             <Plus className="size-3 mr-1" /> {t("Add Custom")}
                           </Button>
                        </div>
                        
                        {showAddForm ? (
                           <div className="p-4 border border-zinc-200 dark:border-zinc-800 rounded-xl bg-zinc-50/50 dark:bg-zinc-900/30 space-y-3">
                              <div className="flex items-center justify-between mb-1">
                                 <h4 className="text-xs font-bold uppercase tracking-tight">{editingServer ? t('Edit Server') : t('Add Custom')}</h4>
                                 <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={() => setShowAddForm(false)}>{t("Cancel")}</Button>
                              </div>
                              <div className="grid gap-3">
                                 <div className="grid gap-1.5">
                                    <Label className="text-[10px]">{t("Name")}</Label>
                                    <Input value={mcpName} onChange={e => setMcpName(e.target.value)} placeholder="My Server" className="h-8 text-xs font-mono" />
                                 </div>
                                 <div className="grid gap-1.5">
                                    <Label className="text-[10px]">{t("Command / URL")}</Label>
                                    <Input value={mcpCommand || mcpUrl} onChange={e => { if (mcpCommand) setMcpCommand(e.target.value); else setMcpUrl(e.target.value); }} placeholder="npx atau http://" className="h-8 text-xs font-mono" />
                                 </div>
                                 <div className="grid gap-1.5">
                                    <Label className="text-[10px]">{t("Arguments (Space separated)")}</Label>
                                    <Input value={mcpArgs} onChange={e => setMcpArgs(e.target.value)} placeholder="-y @modelcontextprotocol/server-fetch" className="h-8 text-xs font-mono" />
                                 </div>
                              </div>
                              <div className="pt-2 flex gap-2">
                                 <Button size="sm" className="flex-1 h-8 text-[11px]" onClick={() => handleSaveServer({
                                    ...editingServer,
                                    name: mcpName,
                                    command: mcpCommand,
                                    args: mcpArgs.split(" ").filter(a => a.trim() !== ""),
                                    url: mcpUrl,
                                    enabled: true
                                 })}>保存服务器</Button>
                                 {editingServer && (
                                    <Button size="sm" variant="ghost" className="h-8 text-[11px] text-red-500 hover:text-red-600 hover:bg-red-50" onClick={() => {
                                       handleDeleteServer(editingServer.id)
                                       setShowAddForm(false)
                                    }}>删除</Button>
                                 )}
                              </div>
                           </div>
                        ) : (
                        <div className="space-y-2">
                           {mcpServers.length === 0 ? (
                             <div className="py-12 text-center text-zinc-400 text-xs border border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl">{t("No plugin servers yet")}</div>
                           ) : (
                             mcpServers.map((server: any, idx: number) => (
                               <Collapsible
                                  key={`server-${server.id || idx}`}
                                  open={expandedMcp === server.id}
                                  onOpenChange={(open) => {
                                    setExpandedMcp(open ? server.id : null)
                                    if (open && !selectedMcpDetails[server.id]) fetchMcpDetails(server.id)
                                  }}
                                  className="group border border-zinc-100 dark:border-zinc-800 rounded-xl overflow-hidden hover:border-indigo-200 dark:hover:border-indigo-900/50 transition-all bg-white dark:bg-zinc-950"
                               >
                                  <div className="flex items-center gap-3 p-3 bg-zinc-50/10 dark:bg-zinc-900/5">
                                     <div className="flex flex-col min-w-0 flex-1">
                                        <div className="flex items-center gap-2">
                                          <span className="text-[11px] font-bold truncate">{server.name}</span>
                                          {server.enabled && (
                                            <Badge variant="outline" className="text-[9px] py-0 h-4 bg-green-50 text-green-600 border-green-100 font-mono tracking-tighter uppercase scale-90">Active</Badge>
                                          )}
                                        </div>
                                        <span className="text-[10px] text-zinc-400 truncate max-w-[200px] font-mono">{server.command || server.url}</span>
                                     </div>
                                     <div className="flex items-center gap-2">
                                        <Switch 
                                          checked={server.enabled} 
                                          onCheckedChange={(v) => handleSaveServer({ ...server, enabled: !!v })} 
                                          className="scale-75"
                                        />
                                        <Button 
                                          variant="ghost" 
                                          size="icon" 
                                          className="size-7 opacity-0 group-hover:opacity-100 transition-opacity"
                                          onClick={(e) => { e.stopPropagation(); setEditingServer(server); setShowAddForm(true); }}
                                        >
                                          <Edit2 className="size-3" />
                                        </Button>
                                        <CollapsibleTrigger>
                                          <div className="flex items-center justify-center size-7 cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-md">
                                            {expandedMcp === server.id ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
                                          </div>
                                        </CollapsibleTrigger>
                                     </div>
                                  </div>
                                  <CollapsibleContent className="px-3 pb-3 border-t border-zinc-100 dark:border-zinc-800">
                                     <div className="pt-2 text-[10px] text-zinc-500">
                                        {loadingMcpDetails[server.id] ? <Loader2 className="size-3 animate-spin mx-auto my-2" /> : (
                                          selectedMcpDetails[server.id]?.tools?.length > 0 ? (
                                            <div className="flex flex-wrap gap-1">
                                               {selectedMcpDetails[server.id].tools.map((t: any, tIdx: number) => (
                                                 <Badge key={`tool-${server.id}-${t.name || tIdx}`} variant="secondary" className="px-1.5 py-0 text-[9px] opacity-80 h-5 border-none font-mono">{t.name}</Badge>
                                               ))}
                                            </div>
                                          ) : t('No tools available')
                                        )}
                                     </div>
                                  </CollapsibleContent>
                               </Collapsible>
                             ))
                           )}
                        </div>
                        )}
                     </TabsContent>
                     
                     <TabsContent value="market" className="mt-0">
                        <div className="flex gap-2 mb-3">
                           <div className="relative flex-1">
                             <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3 text-zinc-400" />
                             <Input 
                               placeholder="搜索市场 (GitHub / Smithery)..." 
                               className="pl-8 h-8 text-[11px]" 
                               value={marketSearch}
                               onChange={e => setMarketSearch(e.target.value)}
                             />
                           </div>
                           <Select value={marketSource} onValueChange={(v: any) => setMarketSource(v)}>
                             <SelectTrigger className="w-[100px] h-8 text-[10px] font-mono">
                               <SelectValue />
                             </SelectTrigger>
                             <SelectContent>
                               <SelectItem value="github">GITHUB</SelectItem>
                               <SelectItem value="smithery">SMITHERY</SelectItem>
                             </SelectContent>
                           </Select>
                        </div>
                        <div className="space-y-2">
                           {loadingMarket ? <div key="market-loading" className="py-20 text-center"><Loader2 className="size-6 animate-spin mx-auto text-zinc-300" /></div> : (
                             marketServers.map((s: any, idx: number) => (
                               <div key={`market-${s.id || idx}`} className="p-3 border border-zinc-100 dark:border-zinc-800 rounded-xl flex items-center justify-between gap-3 bg-white dark:bg-zinc-950 hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors">
                                  <div className="flex flex-col min-w-0">
                                     <span className="text-[11px] font-bold truncate">{s.name}</span>
                                     <span className="text-[10px] text-zinc-400 truncate max-w-[200px]">{s.description}</span>
                                  </div>
                                  <Button size="sm" variant="outline" className="h-7 text-[10px] px-3 font-mono tracking-tighter" onClick={() => handleSaveServer(s)}>INSTALL</Button>
                               </div>
                             ))
                           )}
                        </div>
                     </TabsContent>
     
                     <TabsContent value="model_market" className="mt-0">
                        <div className="flex gap-2 mb-3">
                           <div className="relative flex-1">
                             <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3 text-zinc-400" />
                             <Input 
                               placeholder="搜索 HuggingFace (GGUF)..." 
                               className="pl-8 h-8 text-[11px]" 
                               value={modelMarketSearch}
                               onChange={e => setModelMarketSearch(e.target.value)}
                               onKeyDown={e => e.key === 'Enter' && searchModelMarket(modelMarketSearch)}
                             />
                           </div>
                           <Button size="sm" variant="secondary" className="h-8 text-[10px] px-3 font-mono" onClick={() => searchModelMarket(modelMarketSearch)}>SEARCH</Button>
                        </div>
                        <div className="space-y-3">
                           {loadingMarket ? <div key="model-market-loading" className="py-20 text-center"><Loader2 className="size-6 animate-spin mx-auto text-zinc-300" /></div> : (
                             modelMarketModels.map((m: any, idx: number) => (
                               <div key={`model-${m.id || idx}`} className="p-3 border border-zinc-100 dark:border-zinc-800 rounded-xl bg-white dark:bg-zinc-950 space-y-2">
                                  <div className="flex items-center justify-between">
                                     <span className="text-[11px] font-bold">{m.name}</span>
                                     <Badge variant="outline" className="text-[9px] h-4 font-mono">GGUF</Badge>
                                  </div>
                                  <div className="space-y-1">
                                     {m.ggufFiles?.slice(0, 2).map((file: string, fIdx: number) => (
                                        <div key={`file-${m.id}-${file}-${fIdx}`} className="flex items-center justify-between text-[10px] p-2 bg-zinc-50/50 dark:bg-zinc-900/50 rounded-lg group">
                                           <span className="truncate flex-1 font-mono">{file}</span>
                                           <Button size="sm" variant="ghost" className="h-6 text-[9px] px-2 font-mono" onClick={() => downloadGguf(m.id, file)} disabled={downloadingModelId === `${m.id}/${file}`}>
                                             {downloadingModelId === `${m.id}/${file}` ? (
                                               <div className="flex items-center gap-1"><Loader2 className="size-2.5 animate-spin" />{downloadProgress?.progress || 0}%</div>
                                             ) : 'DOWNLOAD'}
                                           </Button>
                                        </div>
                                     ))}
                                  </div>
                               </div>
                             ))
                           )}
                        </div>
                     </TabsContent>
     
                     <TabsContent value="raw" className="mt-0 space-y-3">
                        <textarea
                          className="flex-1 w-full bg-zinc-50 dark:bg-zinc-900/50 font-mono text-[10px] border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 outline-none resize-none focus:ring-1 focus:ring-primary/20 transition-all custom-scrollbar"
                          value={rawMcpConfig}
                          onChange={e => setRawMcpConfig(e.target.value)}
                          spellCheck={false}
                        />
                        <div className="flex justify-end gap-2 shrink-0">
                           <Button size="sm" variant="outline" className="h-8 text-[10px] px-4 font-mono" onClick={fetchRawMcpConfig}>REFRESH</Button>
                           <Button size="sm" className="h-8 text-[10px] px-4 font-mono" onClick={saveRawMcpConfig}>APPLY CHANGES</Button>
                        </div>
                     </TabsContent>
                   </div>
                </Tabs>
              </TabsContent>
            </div>
          </Tabs>

          <div className="pt-4 mt-auto flex items-center justify-between border-t border-zinc-100 dark:border-zinc-800 shrink-0">
            <div className="flex gap-2">
              <span className="text-[10px] text-zinc-400">OpenOrangeAI v0.5.0-beta</span>
            </div>
            <Button size="sm" onClick={saveSettings} disabled={saving} className="px-6 h-9">
              {saving ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Save className="size-4 mr-2" />}
              {t("Save changes")}
            </Button>
          </div>
        </div>
        <div onMouseDown={handleResizeStart} className="absolute bottom-0 right-0 z-50 cursor-nwse-resize w-6 h-6 flex items-center justify-center opacity-30 hover:opacity-100 transition-opacity">
          <svg className="w-3 h-3 text-zinc-400" viewBox="0 0 10 10" fill="none"><path d="M8 2V8H2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
        </div>
      </DialogContent>
    </Dialog>
  )
}
