"use client"

import { useEffect, useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Save, ExternalLink, Loader2, CheckCircle2, XCircle, Server, Plus, Trash2, Edit2, Globe, Cpu, Terminal, Search, RefreshCw, ChevronDown, ChevronUp, Package, Wrench, Activity, LayoutGrid, Info } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { useI18n } from "@/lib/i18n"
import { Checkbox } from "./ui/checkbox"
import { Switch } from "./ui/switch"
import { Slider } from "./ui/slider"
import { ScrollArea } from "./ui/scroll-area"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "./ui/collapsible"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "./ui/dropdown-menu"

const SEARCH_ENGINES = [
  { id: 'duckduckgo', label: 'DuckDuckGo', free: true, desc: 'No API key required' },
  { id: 'wikipedia', label: 'Wikipedia', free: true, desc: 'No API key required' },
  { id: 'tavily', label: 'Tavily', free: false, desc: 'Best AI-native quality', url: 'https://tavily.com' },
  { id: 'serpapi', label: 'SerpAPI (Google)', free: false, desc: 'Real Google results', url: 'https://serpapi.com' },
]

export function SettingsDialog({ open, onOpenChange }: { open: boolean, onOpenChange: (open: boolean) => void }) {
  const [ollamaUrl, setOllamaUrl] = useState("http://127.0.0.1:11434")
  const [lmstudioUrl, setLmstudioUrl] = useState("http://127.0.0.1:1234")
  const [openaiKey, setOpenaiKey] = useState("")
  const [minimaxKey, setMinimaxKey] = useState("")
  const [deepseekKey, setDeepseekKey] = useState("")
  const [openrouterKey, setOpenrouterKey] = useState("")
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
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<'ok' | 'fail' | null>(null)
  const [mcpServers, setMcpServers] = useState<any[]>([])
  const [editingServer, setEditingServer] = useState<any>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [mcpTab, setMcpTab] = useState<'my' | 'market'>('my')
  const [marketSearch, setMarketSearch] = useState("")
  const [marketSource, setMarketSource] = useState<'github' | 'modelscope' | 'smithery' | 'glama'>('github')
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

  const fetchModels = async () => {
    setIsLoadingModels(true)
    try {
      const res = await fetch('/api/models')
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
        // If it was the downloaded list in market, we might want to refresh that too if we separate them
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
    setUnloadingLocal(true)
    try {
      await fetch('/api/models/local/status', { method: 'DELETE' })
      setLocalModelStatus({ isLoaded: false })
    } catch(e) {}
    setUnloadingLocal(false)
  }

  useEffect(() => {
    if (open) {
      setTestResult(null)
      fetchLocalModelStatus()
      fetchModels()

      fetch('/api/settings')
        .then(res => res.json())
        .then(data => {
          setOllamaUrl(data.ollamaUrl || "http://127.0.0.1:11434")
          setLmstudioUrl(data.lmstudioUrl || "http://127.0.0.1:1234")
          setOpenaiKey(data.openaiKey || "")
          setMinimaxKey(data.minimaxKey || "")
          setDeepseekKey(data.deepseekKey || "")
          setOpenrouterKey(data.openrouterKey || "")
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
        })
        .catch(console.error)
      
      fetch('/api/settings/mcp')
        .then(res => res.json())
        .then(data => setMcpServers(Array.isArray(data) ? data : []))
        .catch(console.error)
    }
  }, [open])

  const saveSettings = async () => {
    setSaving(true)
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        ollamaUrl, lmstudioUrl, openaiKey, minimaxKey, deepseekKey, openrouterKey, 
        defaultModel, searchEngine, searchKey, localGgufEnabled,
        localGgufContextSize, localGgufTemperature, localGgufTopP, localGgufRepeatPenalty, localGgufMaxTokens,
        apiTemperature, apiTopP, apiMaxTokens, apiContextSize, theme
      })
    })
    // Apply theme immediately
    document.documentElement.setAttribute('data-theme', theme)
    setSaving(false)
    onOpenChange(false)
  }

  const testSearch = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      // Save first so the server picks up the latest settings
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          ollamaUrl, lmstudioUrl, openaiKey, minimaxKey, deepseekKey, openrouterKey, 
          defaultModel, searchEngine, searchKey, localGgufEnabled,
          localGgufContextSize, localGgufTemperature, localGgufTopP, localGgufRepeatPenalty, localGgufMaxTokens,
          apiTemperature, apiTopP, apiMaxTokens, apiContextSize
        })
      })
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'hello world' })
      })
      const data = await res.json()
      setTestResult(data.results?.length > 0 ? 'ok' : 'fail')
    } catch {
      setTestResult('fail')
    }
    setTesting(false)
  }

  const selectedEngine = SEARCH_ENGINES.find(e => e.id === searchEngine)
  const needsKey = selectedEngine && !selectedEngine.free

  const handleDeleteServer = async (id: string) => {
    try {
      await fetch(`/api/settings/mcp/${id}`, { method: 'DELETE' })
      setMcpServers(prev => prev.filter(s => s.id !== id))
    } catch (error) {
      console.error("Delete MCP error:", error)
    }
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

  const fetchMarket = async (q?: string) => {
    setLoadingMarket(true)
    setMarketServers([]) // Clear current list to prevent UI flicker/inconsistency
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
                // Refresh local models list if possible
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
    }
  }, [marketSource])

  useEffect(() => {
    if (mcpTab === 'market' && marketServers.length === 0) {
      fetchMarket()
    }
  }, [mcpTab])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-hidden flex flex-col p-0">
        <DialogHeader className="p-6 pb-0">
          <DialogTitle className="text-lg font-semibold">{t("Settings Title")}</DialogTitle>
        </DialogHeader>
        <div className="flex-1 overflow-hidden flex flex-col p-6 pt-2">
        <Tabs defaultValue="general">
          <TabsList className="w-full mb-4">
             <TabsTrigger value="general" className="flex-1">{t("General")}</TabsTrigger>
            <TabsTrigger value="providers" className="flex-1">{t("Providers")}</TabsTrigger>
            <TabsTrigger value="local_gguf" className="flex-1">{t("Local GGUF")}</TabsTrigger>
            <TabsTrigger value="market" className="flex-1">{t("Model Market")}</TabsTrigger>
            <TabsTrigger value="search" className="flex-1">{t("Search")}</TabsTrigger>
            <TabsTrigger value="mcp" className="flex-1">MCP</TabsTrigger>
          </TabsList>

          {/* GENERAL TAB */}
          <TabsContent value="general" className="space-y-6 pt-2">
            <div className="grid gap-3">
              <Label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">{t("Appearance")}</Label>
              <div className="grid grid-cols-5 gap-2">
                {[
                  { id: 'zinc', name: 'OpenOrange', color: 'bg-zinc-500' },
                  { id: 'orange', name: 'Orange', color: 'bg-orange-500' },
                  { id: 'blue', name: 'Blue', color: 'bg-blue-500' },
                  { id: 'green', name: 'Green', color: 'bg-emerald-500' },
                  { id: 'rose', name: 'Rose', color: 'bg-rose-500' },
                ].map((t) => (
                  <button
                    key={t.id}
                    onClick={() => {
                      setTheme(t.id)
                      document.documentElement.setAttribute('data-theme', t.id)
                    }}
                    className={`group relative flex flex-col items-center gap-2 p-2 rounded-xl border-2 transition-all ${
                      theme === t.id 
                        ? 'border-primary bg-primary/5' 
                        : 'border-transparent hover:bg-zinc-100 dark:hover:bg-zinc-800'
                    }`}
                  >
                    <div className={`size-8 rounded-full shadow-sm ${t.color} group-hover:scale-110 transition-transform`} />
                    <span className="text-[10px] font-medium">{t.name}</span>
                    {theme === t.id && (
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
          </TabsContent>

          {/* PROVIDERS TAB (Renamed from Models) */}
          <TabsContent value="providers" className="space-y-4">
            <div className="grid gap-4 max-h-[500px] overflow-y-auto px-1">
              <div className="grid gap-2">
                <Label>{t("Default Model")}</Label>
                <div className="flex gap-2">
                  <Select value={defaultModel} onValueChange={v => { if (v) setDefaultModel(v); setTestResult(null) }}>
                    <SelectTrigger className="flex-1">
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
                  <Button variant="outline" size="icon" onClick={fetchModels} disabled={isLoadingModels}>
                    <RefreshCw className={`size-4 ${isLoadingModels ? "animate-spin" : ""}`} />
                  </Button>
                </div>
              </div>

              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">Local Providers</h4>
                  <div className="grid gap-3 p-3 rounded-xl border border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30">
                    <div className="grid gap-1.5">
                      <Label className="text-xs">{t("Ollama URL")}</Label>
                      <Input value={ollamaUrl} onChange={e => setOllamaUrl(e.target.value)} placeholder="http://127.0.0.1:11434" />
                    </div>
                    <div className="grid gap-1.5">
                      <Label className="text-xs">{t("LM Studio URL")}</Label>
                      <Input value={lmstudioUrl} onChange={e => setLmstudioUrl(e.target.value)} placeholder="http://127.0.0.1:1234" />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">API Providers</h4>
                  <div className="grid gap-3 p-3 rounded-xl border border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30">
                    <div className="grid gap-1.5">
                      <Label className="text-xs">{t("OpenAI API Key (optional)")}</Label>
                      <Input type="password" value={openaiKey} onChange={e => setOpenaiKey(e.target.value)} placeholder="sk-..." />
                    </div>
                    <div className="grid gap-1.5">
                      <Label className="text-xs">{t("DeepSeek API Key (optional)")}</Label>
                      <Input type="password" value={deepseekKey} onChange={e => setDeepseekKey(e.target.value)} placeholder="sk-..." />
                    </div>
                    <div className="grid gap-1.5">
                      <Label className="text-xs">{t("MiniMax API Key (optional)")}</Label>
                      <Input type="password" value={minimaxKey} onChange={e => setMinimaxKey(e.target.value)} placeholder="Key..." />
                    </div>
                    <div className="grid gap-1.5">
                      <Label className="text-xs">{t("OpenRouter API Key (optional)")}</Label>
                      <Input type="password" value={openrouterKey} onChange={e => setOpenrouterKey(e.target.value)} placeholder="sk-or-v1-..." />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">{t("Model Parameters")}</h4>
                  <div className="grid gap-4 p-4 rounded-xl border border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30">
                    <div className="grid gap-3">
                      <div className="flex justify-between items-center">
                        <Label className="text-[10px] text-zinc-500">{t("Global Temperature")}</Label>
                        <span className="text-[10px] font-mono font-bold text-indigo-500">{apiTemperature}</span>
                      </div>
                      <Slider 
                        min={0} max={1.5} step={0.1} 
                        value={[apiTemperature]} 
                        onValueChange={(v: number[]) => setApiTemperature(v[0])} 
                        className="py-1"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="grid gap-1.5">
                        <Label className="text-[10px] text-zinc-500">{t("Context Length")}</Label>
                        <Input 
                          type="number" 
                          value={apiContextSize} 
                          onChange={e => setApiContextSize(parseInt(e.target.value) || 8192)}
                          className="h-7 text-[10px] font-mono"
                        />
                      </div>
                      <div className="grid gap-1.5">
                        <Label className="text-[10px] text-zinc-500">{t("Max Tokens")}</Label>
                        <Input 
                          type="number" 
                          value={apiMaxTokens} 
                          onChange={e => setApiMaxTokens(parseInt(e.target.value) || 2048)}
                          className="h-7 text-[10px] font-mono"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* LOCAL GGUF TAB (Dedicated) */}
          <TabsContent value="local_gguf" className="space-y-4">
            <div className="space-y-4 max-h-[500px] overflow-y-auto px-1">
              <div className="p-4 rounded-xl border border-amber-200 dark:border-amber-900/50 bg-amber-50/50 dark:bg-amber-950/20 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label className="text-sm font-bold flex items-center gap-2">
                      <Cpu className="size-4 text-amber-600" />
                      {t("Enable Local GGUF Engine")}
                    </Label>
                    <p className="text-[10px] text-zinc-500">{t("Disable this to save memory and speed up development.")}</p>
                  </div>
                  <Switch checked={localGgufEnabled} onCheckedChange={setLocalGgufEnabled} />
                </div>
              </div>

              {localGgufEnabled && (
                <div className="space-y-4 animate-in fade-in slide-in-from-top-1 duration-300">
                  <div className="grid gap-2">
                    <Label className="text-[10px] font-bold text-zinc-400 uppercase">{t("Engine Status")}</Label>
                    <div className="p-3 rounded-xl border border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-950 flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-zinc-500">
                          {t("Current Status")}
                        </span>
                        <span className="flex items-center gap-1.5 text-xs font-semibold">
                          {localModelStatus?.isLoaded ? (
                            <><span className="w-2 h-2 rounded-full bg-emerald-500 inline-block animate-pulse"></span> {t("Loaded in VRAM")}</>
                          ) : (
                            <><span className="w-2 h-2 rounded-full bg-zinc-300 dark:bg-zinc-700 inline-block"></span> {t("Standby")}</>
                          )}
                        </span>
                      </div>
                      {localModelStatus?.isLoaded && localModelStatus?.modelName && (
                        <div className="text-[10px] font-mono text-zinc-500 px-2 py-1.5 bg-zinc-50 dark:bg-zinc-900 rounded border border-zinc-100 dark:border-zinc-800 truncate">
                          {localModelStatus.modelName}
                        </div>
                      )}
                      {localModelStatus?.isLoaded && (
                        <Button 
                          variant="destructive" 
                          size="sm" 
                          className="w-full mt-1 h-8 text-xs font-bold" 
                          onClick={unloadLocalModel}
                          disabled={unloadingLocal}
                        >
                          {unloadingLocal ? t("Releasing...") : t("Force Eject from VRAM")}
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <Label className="text-[10px] font-bold text-zinc-400 uppercase">{t("Inference Parameters")}</Label>
                    <div className="grid grid-cols-2 gap-4 p-4 rounded-xl border border-zinc-100 dark:border-zinc-800 bg-white dark:bg-zinc-950">
                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <Label className="text-[10px] text-zinc-500">{t("Context Size")}</Label>
                          <span className="text-[10px] font-mono font-bold text-orange-500">{localGgufContextSize}</span>
                        </div>
                        <Slider 
                          min={512} max={32768} step={512} 
                          value={[localGgufContextSize]} 
                          onValueChange={(v: number[]) => setLocalGgufContextSize(v[0])} 
                          className="py-1"
                        />
                      </div>
                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <Label className="text-[10px] text-zinc-500">{t("Max Tokens")}</Label>
                          <span className="text-[10px] font-mono font-bold text-orange-500">{localGgufMaxTokens}</span>
                        </div>
                        <Slider 
                          min={128} max={8192} step={128} 
                          value={[localGgufMaxTokens]} 
                          onValueChange={(v: number[]) => setLocalGgufMaxTokens(v[0])} 
                          className="py-1"
                        />
                      </div>
                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <Label className="text-[10px] text-zinc-500">{t("Temperature")}</Label>
                          <span className="text-[10px] font-mono font-bold text-orange-500">{localGgufTemperature}</span>
                        </div>
                        <Slider 
                          min={0} max={2} step={0.1} 
                          value={[localGgufTemperature]} 
                          onValueChange={(v: number[]) => setLocalGgufTemperature(v[0])} 
                          className="py-1"
                        />
                      </div>
                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <Label className="text-[10px] text-zinc-500">{t("Repeat Penalty")}</Label>
                          <span className="text-[10px] font-mono font-bold text-orange-500">{localGgufRepeatPenalty}</span>
                        </div>
                        <Slider 
                          min={1} max={2} step={0.05} 
                          value={[localGgufRepeatPenalty]} 
                          onValueChange={(v: number[]) => setLocalGgufRepeatPenalty(v[0])} 
                          className="py-1"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="p-4 rounded-xl border border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30 flex items-start gap-3">
                    <Cpu className="size-4 text-zinc-400 mt-0.5" />
                    <p className="text-[10px] text-zinc-500 leading-relaxed">
                      {t("To use local models, place your .gguf files in the following directory. They will appear in the model list automatically.")}
                      <br />
                      <code className="text-[9px] bg-white dark:bg-zinc-950 px-1 py-0.5 rounded border border-zinc-200 dark:border-zinc-800 mt-1 inline-block">.models/</code>
                    </p>
                  </div>
                </div>
              )}
            </div>
          </TabsContent>

          {/* MODEL MARKET TAB */}
          <TabsContent value="market" className="space-y-4">
            <div className="flex flex-col gap-4 h-[500px]">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-zinc-400" />
                  <Input 
                    value={modelMarketSearch}
                    onChange={e => setModelMarketSearch(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && searchModelMarket(modelMarketSearch)}
                    placeholder={t("Search Hugging Face models (e.g. qwen, llama)...")} 
                    className="pl-9"
                  />
                  {loadingMarket && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 size-3 animate-spin text-orange-500" />}
                </div>
                <Button variant="outline" size="icon" onClick={() => searchModelMarket(modelMarketSearch)}>
                  <Search className="size-4" />
                </Button>
              </div>

              <ScrollArea className="flex-1 h-[300px] -mx-1 px-1 custom-scrollbar">
                <div className="grid gap-3">
                  {modelMarketModels.map(model => (
                    <div key={model.id} className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 flex flex-col gap-3 group hover:border-orange-200 dark:hover:border-orange-900/50 transition-all">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <h4 className="text-xs font-bold truncate">{model.id.split('/')[1]}</h4>
                            <Badge variant="outline" className="text-[9px] font-mono py-0 h-4">{model.author}</Badge>
                          </div>
                          <p className="text-[9px] text-zinc-500 line-clamp-1">{model.id}</p>
                        </div>
                        <div className="flex items-center gap-1.5 text-[9px] text-zinc-400 font-medium">
                          <Activity className="size-3" /> {model.downloads?.toLocaleString() || '0'}
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {(model.siblings || model.ggufFiles || []).filter((s: any) => (s.rfilename || s).endsWith('.gguf')).slice(0, 3).map((file: any) => {
                          const fileName = file.rfilename || file
                          const isDownloading = downloadingModelId === `${model.id}/${fileName}`
                          return (
                            <div key={fileName} className="flex-1 min-w-[140px] p-2 rounded-lg bg-zinc-50 dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800">
                              <div className="flex items-center justify-between gap-2 mb-1.5">
                                <span className="text-[10px] font-mono truncate max-w-[80px]" title={fileName}>{fileName}</span>
                                <Button 
                                  size="icon" 
                                  variant="ghost" 
                                  className="size-6 text-orange-600 hover:text-orange-700 hover:bg-orange-100 dark:hover:bg-orange-900/30"
                                  disabled={!!downloadingModelId}
                                  onClick={() => downloadGguf(model.id, fileName)}
                                >
                                  {isDownloading ? <Loader2 className="size-3 animate-spin" /> : <Plus className="size-3" />}
                                </Button>
                              </div>
                              {isDownloading && downloadProgress && (
                                <div className="space-y-1">
                                  <div className="w-full bg-zinc-200 dark:bg-zinc-800 h-1 rounded-full overflow-hidden">
                                    <div className="bg-orange-500 h-full transition-all duration-300" style={{ width: `${downloadProgress.progress}%` }} />
                                  </div>
                                  <div className="flex justify-between text-[8px] text-zinc-500 font-mono">
                                    <span>{downloadProgress.progress}%</span>
                                    <span>{downloadProgress.downloadedMB || '0'} / {downloadProgress.totalMB || '0'}MB</span>
                                  </div>
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                  
                  {modelMarketModels.length === 0 && !loadingMarket && (
                    <div className="py-12 text-center text-zinc-400">
                      <Search className="size-8 mx-auto mb-2 opacity-20" />
                      <p className="text-xs">{t("Search for models on Hugging Face")}</p>
                    </div>
                  )}
                </div>
              </ScrollArea>

              <div className="pt-4 border-t">
                <h4 className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Package className="size-3.5" />
                  {t("Downloaded Models")}
                </h4>
                <div className="grid gap-2 max-h-[120px] overflow-y-auto pr-1 custom-scrollbar">
                  {models.filter(m => m.provider === 'local').map(m => (
                    <div key={m.id} className="flex items-center justify-between p-2 rounded-lg bg-zinc-50 dark:bg-zinc-900 border border-zinc-100 dark:border-zinc-800">
                      <div className="flex items-center gap-2 min-w-0">
                        <Terminal className="size-3 text-zinc-400" />
                        <span className="text-xs font-mono truncate">{m.name}</span>
                      </div>
                      <Button 
                        size="icon" 
                        variant="ghost" 
                        className="size-7 text-zinc-400 hover:text-red-500"
                        onClick={() => deleteLocalModel(m.name)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  ))}
                  {models.filter(m => m.provider === 'local').length === 0 && (
                    <p className="text-[10px] text-zinc-400 italic text-center py-2">{t("No local models found")}</p>
                  )}
                </div>
              </div>
            </div>
          </TabsContent>

          {/* SEARCH TAB */}
          <TabsContent value="search" className="space-y-4">
            <div className="grid gap-2">
              <Label>{t("Search Engine")}</Label>
              <Select value={searchEngine} onValueChange={v => { if (v) setSearchEngine(v); setTestResult(null) }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SEARCH_ENGINES.map(e => (
                    <SelectItem key={e.id} value={e.id}>
                      <div className="flex items-center gap-2">
                        {e.label}
                        {e.free ? (
                          <Badge variant="secondary" className="text-[10px] h-4">Free</Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] h-4">Paid</Badge>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedEngine && (
                <p className="text-xs text-muted-foreground">
                  {selectedEngine.desc}
                  {selectedEngine.url && (
                    <a href={selectedEngine.url} target="_blank" rel="noreferrer" className="ml-1 inline-flex items-center gap-1 text-blue-500 hover:underline">
                      Sign up <ExternalLink className="size-3" />
                    </a>
                  )}
                </p>
              )}
            </div>

            {needsKey && (
              <div className="grid gap-2">
                <Label>{selectedEngine?.label} API Key</Label>
                <Input type="password" value={searchKey} onChange={e => setSearchKey(e.target.value)} placeholder="API key..." />
              </div>
            )}

            <div className="flex items-center gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={testSearch} disabled={testing}>
                {testing ? <Loader2 className="size-4 mr-2 animate-spin" /> : null}
                {t("Test Search")}
              </Button>
              {testResult === 'ok' && <span className="flex items-center gap-1 text-sm text-green-600"><CheckCircle2 className="size-4" /> {t("Working!")}</span>}
              {testResult === 'fail' && <span className="flex items-center gap-1 text-sm text-red-500"><XCircle className="size-4" /> {t("Failed")}</span>}
            </div>
          </TabsContent>

          {/* MCP TAB */}
          <TabsContent value="mcp" className="space-y-4 min-h-[400px]">
            <div className="flex items-center justify-between border-b pb-2">
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setMcpTab('my')}
                  className={`text-sm font-medium pb-1.5 transition-colors border-b-2 ${mcpTab === 'my' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-zinc-500 hover:text-zinc-700'}`}
                >
                  {t("My Servers")}
                </button>
                <button
                  onClick={() => setMcpTab('market')}
                  className={`text-sm font-medium pb-1.5 transition-colors border-b-2 ${mcpTab === 'market' ? 'border-indigo-500 text-indigo-600' : 'border-transparent text-zinc-500 hover:text-zinc-700'}`}
                >
                  {t("Market")}
                </button>
              </div>
              {mcpTab === 'my' && !showAddForm && (
                <Button size="sm" variant="outline" className="h-7 text-[10px] gap-1" onClick={() => { setEditingServer({ name: '', type: 'stdio', command: '', args: '[]', env: '{}', enabled: true }); setShowAddForm(true); }}>
                  <Plus className="size-3" />
                  {t("Add Server")}
                </Button>
              )}
            </div>

            {showAddForm ? (
              <div className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 space-y-4 animate-in slide-in-from-top-2 duration-200">
                <div className="grid gap-3">
                  <div className="grid gap-1.5">
                    <Label className="text-xs">{t("Server Name")}</Label>
                    <Input size={1} value={editingServer?.name} onChange={e => setEditingServer({ ...editingServer, name: e.target.value })} placeholder="e.g. Postgres tools" className="h-8 text-sm" />
                  </div>
                  <div className="grid gap-1.5">
                    <Label className="text-xs">{t("Type")}</Label>
                    <Select value={editingServer?.type || 'stdio'} onValueChange={(v: string) => setEditingServer({ ...editingServer, type: v })}>
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="stdio">stdio (Local Command)</SelectItem>
                        <SelectItem value="sse">sse (HTTP Server)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {editingServer?.type === 'stdio' ? (
                    <>
                      <div className="grid gap-1.5">
                        <Label className="text-xs">{t("Command")}</Label>
                        <Input size={1} value={editingServer?.command} onChange={e => setEditingServer({ ...editingServer, command: e.target.value })} placeholder="npx, python, etc." className="h-8 text-sm" />
                      </div>
                      <div className="grid gap-1.5">
                        <Label className="text-xs">{t("Arguments (JSON array)")}</Label>
                        <Input size={1} value={editingServer?.args} onChange={e => setEditingServer({ ...editingServer, args: e.target.value })} placeholder='["-y", "@modelcontextprotocol/server-postgres"]' className="h-8 text-sm" />
                      </div>
                    </>
                  ) : (
                    <div className="grid gap-1.5">
                      <Label className="text-xs">{t("URL (for SSE)")}</Label>
                      <Input size={1} value={editingServer?.url} onChange={e => setEditingServer({ ...editingServer, url: e.target.value })} placeholder="http://localhost:3001/sse" className="h-8 text-sm" />
                    </div>
                  )}
                  <div className="flex items-center gap-2 pt-1">
                    <Checkbox id="mcp-enabled" checked={editingServer?.enabled} onCheckedChange={v => setEditingServer({ ...editingServer, enabled: !!v })} />
                    <Label htmlFor="mcp-enabled" className="text-xs font-normal cursor-pointer">{t("Enabled")}</Label>
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="ghost" onClick={() => { setShowAddForm(false); setEditingServer(null); }}>{t("Cancel")}</Button>
                  <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700 h-8" onClick={() => {
                    const final = { ...editingServer };
                    try { final.args = typeof final.args === 'string' ? JSON.parse(final.args) : final.args; } catch { final.args = []; }
                    try { final.env = typeof final.env === 'string' ? JSON.parse(final.env) : final.env; } catch { final.env = {}; }
                    handleSaveServer(final);
                  }}>{t("Save Server")}</Button>
                </div>
              </div>
            ) : mcpTab === 'my' ? (
              <ScrollArea className="h-[400px] -mx-1 px-1">
                <div className="space-y-2">
                  {mcpServers.length === 0 ? (
                    <div className="py-12 text-center text-zinc-400">
                      <Server className="size-8 mx-auto mb-2 opacity-20" />
                      <p className="text-xs">{t("No servers added yet")}</p>
                      <Button variant="link" className="text-xs text-indigo-500" onClick={() => setMcpTab('market')}>{t("Browse Market")}</Button>
                    </div>
                  ) : (
                    mcpServers.map((server: any) => (
                      <Collapsible
                        key={server.id}
                        open={expandedMcp === server.id}
                        onOpenChange={(open) => {
                          setExpandedMcp(open ? server.id : null)
                          if (open && !selectedMcpDetails[server.id]) fetchMcpDetails(server.id)
                        }}
                        className="group p-1 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:border-indigo-200 dark:hover:border-indigo-900/50 hover:bg-indigo-50/10 dark:hover:bg-indigo-900/5 transition-all"
                      >
                        <div className="flex items-center justify-between p-2">
                          <CollapsibleTrigger className="flex items-center gap-3 flex-1 cursor-pointer text-left">
                            <div className={`p-2 rounded-lg ${server.enabled ? 'bg-indigo-100/50 text-indigo-600 dark:bg-indigo-900/30' : 'bg-zinc-100 text-zinc-400 dark:bg-zinc-800'}`}>
                              {server.type === 'stdio' ? <Terminal className="size-4" /> : <Globe className="size-4" />}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="text-sm font-bold truncate">{server.name || 'Untitled Server'}</p>
                                <Checkbox checked={server.enabled} onCheckedChange={(v) => handleSaveServer({ ...server, enabled: !!v })} className="size-3.5" onClick={e => e.stopPropagation()} />
                              </div>
                              <p className="text-[10px] text-zinc-400 font-mono truncate max-w-[200px]">
                                {server.type === 'stdio' ? `${server.command}` : server.url}
                              </p>
                            </div>
                            <div className="ml-auto">
                              {expandedMcp === server.id ? <ChevronUp className="size-3.5 text-zinc-400" /> : <ChevronDown className="size-3.5 text-zinc-400" />}
                            </div>
                          </CollapsibleTrigger>
                          
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button size="icon" variant="ghost" className="size-8 text-zinc-400 hover:text-indigo-600" onClick={() => {
                              setEditingServer({ ...server, args: typeof server.args === 'string' ? server.args : JSON.stringify(server.args) });
                              setShowAddForm(true);
                            }}>
                              <Edit2 className="size-3.5" />
                            </Button>
                            <Button size="icon" variant="ghost" className="size-8 text-zinc-400 hover:text-red-500" onClick={() => handleDeleteServer(server.id)}>
                              <Trash2 className="size-3.5" />
                            </Button>
                          </div>
                        </div>

                        <CollapsibleContent className="px-3 pb-3 animate-in fade-in slide-in-from-top-1">
                          <div className="mt-2 pt-2 border-t border-zinc-100 dark:border-zinc-800 space-y-3">
                            {loadingMcpDetails[server.id] ? (
                              <div className="flex items-center justify-center py-4">
                                <Loader2 className="size-4 animate-spin text-indigo-500" />
                              </div>
                            ) : selectedMcpDetails[server.id] ? (
                              <div className="grid gap-4">
                                {selectedMcpDetails[server.id].tools?.length > 0 && (
                                  <div className="space-y-1.5">
                                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-zinc-400 uppercase tracking-tight">
                                      <Wrench className="size-3" />
                                      {t("Tools")} ({selectedMcpDetails[server.id].tools.length})
                                    </div>
                                    <div className="flex flex-wrap gap-1.5">
                                      {selectedMcpDetails[server.id].tools.map((tool: any) => (
                                        <Badge key={tool.name} variant="secondary" className="text-[9px] py-0 px-1.5 bg-indigo-50 text-indigo-700 dark:bg-indigo-900/20 dark:text-indigo-300 border-none">
                                          {tool.name}
                                        </Badge>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                {selectedMcpDetails[server.id].resources?.length > 0 && (
                                  <div className="space-y-1.5">
                                    <div className="flex items-center gap-1.5 text-[10px] font-bold text-zinc-400 uppercase tracking-tight">
                                      <Package className="size-3" />
                                      {t("Resources")} ({selectedMcpDetails[server.id].resources.length})
                                    </div>
                                    <div className="flex flex-wrap gap-1.5">
                                      {selectedMcpDetails[server.id].resources.map((res: any) => (
                                        <Badge key={res.uri} variant="outline" className="text-[9px] py-0 px-1.5 opacity-70">
                                          {res.name}
                                        </Badge>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <p className="text-[10px] text-zinc-400 italic text-center py-2">{t("Failed to load details")}</p>
                            )}
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    ))
                  )}
                </div>
              </ScrollArea>
            ) : (
              <div className="space-y-4 animate-in fade-in duration-300">
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-zinc-400" />
                    <Input
                      value={marketSearch}
                      onChange={e => setMarketSearch(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') fetchMarket(marketSearch) }}
                      placeholder={t("Search Servers") + "..."}
                      className="pl-9 h-9"
                    />
                    {loadingMarket && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 size-4 animate-spin text-indigo-500" />}
                  </div>
                  <Select value={marketSource} onValueChange={(v: any) => setMarketSource(v)}>
                    <SelectTrigger className="w-[120px] h-9 text-xs">
                      <SelectValue placeholder={t("Source")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="github">{t("GitHub")}</SelectItem>
                      <SelectItem value="modelscope">{t("ModelScope")}</SelectItem>
                      <SelectItem value="smithery">{t("Smithery")}</SelectItem>
                      <SelectItem value="glama">{t("Glama")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid gap-3 max-h-[350px] overflow-y-auto pr-2 custom-scrollbar">
                  {marketServers.length === 0 && !loadingMarket ? (
                    <div className="py-8 text-center text-zinc-400 text-xs">
                      {t("Registry")}: {marketSource === 'github' ? t("GitHub") : t("ModelScope")}
                    </div>
                  ) : (
                    marketServers.map((item: any) => {
                      const server = item.server || item
                      const isInstalled = mcpServers.some(s => s.name === server.name)
                      return (
                        <div key={server.name} className="p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 flex items-start gap-3">
                          <div className="shrink-0 size-10 rounded-lg bg-zinc-100 dark:bg-zinc-900 flex items-center justify-center text-zinc-500">
                            <Server className="size-5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <h4 className="text-sm font-semibold truncate">{server.name}</h4>
                              {server.homepage && (
                                <a href={server.homepage} target="_blank" rel="noreferrer" className="text-zinc-400 hover:text-indigo-500 transition-colors">
                                  <ExternalLink className="size-3.5" />
                                </a>
                              )}
                            </div>
                            <p className="text-xs text-zinc-500 line-clamp-2 mt-0.5 leading-relaxed">
                              {server.description}
                            </p>
                            <div className="mt-3 flex items-center justify-between">
                              <span className="text-[10px] text-zinc-400 font-medium">by {server.vendor || 'Community'}</span>
                              <Button
                                size="sm"
                                variant={isInstalled ? "outline" : "default"}
                                disabled={isInstalled}
                                className={`h-7 px-3 text-[10px] ${isInstalled ? '' : 'bg-indigo-600 hover:bg-indigo-700 text-white'}`}
                                onClick={() => {
                                  const repoUrl = server.repository?.url || server.githubUrl || ''
                                  let command = server.command || 'npx'
                                  let args = server.args
                                  
                                  if (!args) {
                                    const pkgName = server.packageName || server.name
                                    // Remove any spaces or invalid chars for fallback just in case
                                    const safePkgName = pkgName.toLowerCase().replace(/\s+/g, '-')
                                    
                                    if (marketSource === 'modelscope') {
                                      args = ['-y', `@modelscope/mcp-server-${safePkgName}`]
                                    } else if (marketSource === 'smithery') {
                                      // Smithery packages are typically mapped identically to their ID/slug
                                      args = ['-y', `@smithery/mcp-server-${safePkgName}`]
                                    } else {
                                      args = ['-y', repoUrl.replace('https://github.com/', '')]
                                    }
                                  }

                                  setEditingServer({
                                    name: server.name,
                                    type: server.transport === 'sse' ? 'sse' : 'stdio',
                                    command: command,
                                    args: JSON.stringify(args),
                                    url: server.url || '',
                                    enabled: true,
                                  })
                                  setShowAddForm(true)
                                }}
                              >
                                {isInstalled ? t("Installed") : t("Install")}
                              </Button>
                            </div>
                          </div>
                        </div>
                      )
                    })
                  )}
                </div>
              </div>
            )}
          </TabsContent>
        </Tabs>

        <div className="flex justify-end pt-2 border-t">
          <Button onClick={saveSettings} disabled={saving}>
            {saving ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Save className="size-4 mr-2" />}
            {t("Save changes")}
          </Button>
        </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
