"use client"

import { useEffect, useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Save, ExternalLink, Loader2, CheckCircle2, XCircle, Server, Plus, Trash2, Edit2, Globe, Cpu, Terminal, Search } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { useI18n } from "@/lib/i18n"
import { Checkbox } from "./ui/checkbox"

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
  const { t, language, setLanguage } = useI18n()

  useEffect(() => {
    if (open) {
      setTestResult(null)
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
      body: JSON.stringify({ ollamaUrl, lmstudioUrl, openaiKey, minimaxKey, deepseekKey, openrouterKey, defaultModel, searchEngine, searchKey })
    })
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
        body: JSON.stringify({ ollamaUrl, lmstudioUrl, openaiKey, minimaxKey, deepseekKey, openrouterKey, defaultModel, searchEngine, searchKey })
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
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">{t("Settings Title")}</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="general">
          <TabsList className="w-full mb-4">
            <TabsTrigger value="general" className="flex-1">{t("General")}</TabsTrigger>
            <TabsTrigger value="models" className="flex-1">{t("Models")}</TabsTrigger>
            <TabsTrigger value="search" className="flex-1">{t("Search")}</TabsTrigger>
            <TabsTrigger value="mcp" className="flex-1">MCP</TabsTrigger>
          </TabsList>

          {/* GENERAL TAB */}
          <TabsContent value="general" className="space-y-4">
            <div className="grid gap-2">
              <Label>{t("Language")}</Label>
              <Select value={language} onValueChange={(v) => { if (v) setLanguage(v as "en" | "zh") }}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="zh">中文 (简体)</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </TabsContent>

          {/* MODELS TAB */}
          <TabsContent value="models" className="space-y-4">
            <div className="grid gap-2">
              <Label>{t("Ollama URL")}</Label>
              <Input value={ollamaUrl} onChange={e => setOllamaUrl(e.target.value)} placeholder="http://127.0.0.1:11434" />
            </div>
            <div className="grid gap-2">
              <Label>{t("LM Studio URL")}</Label>
              <Input value={lmstudioUrl} onChange={e => setLmstudioUrl(e.target.value)} placeholder="http://127.0.0.1:1234" />
            </div>
            <div className="grid gap-2">
              <Label>{t("OpenAI API Key (optional)")}</Label>
              <Input type="password" value={openaiKey} onChange={e => setOpenaiKey(e.target.value)} placeholder="sk-..." />
            </div>
            <div className="grid gap-2">
              <Label>{t("DeepSeek API Key (optional)")}</Label>
              <Input type="password" value={deepseekKey} onChange={e => setDeepseekKey(e.target.value)} placeholder="sk-..." />
            </div>
            <div className="grid gap-2">
              <Label>{t("MiniMax API Key (optional)")}</Label>
              <Input type="password" value={minimaxKey} onChange={e => setMinimaxKey(e.target.value)} placeholder="API key..." />
            </div>
            <div className="grid gap-2">
              <Label>{t("OpenRouter API Key (optional)")}</Label>
              <Input type="password" value={openrouterKey} onChange={e => setOpenrouterKey(e.target.value)} placeholder="sk-or-v1-..." />
            </div>
            <div className="grid gap-2">
              <Label>{t("Default Model")}</Label>
              <Input value={defaultModel} onChange={e => setDefaultModel(e.target.value)} placeholder="ollama::llama3" />
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
              <div className="space-y-2">
                {mcpServers.length === 0 ? (
                  <div className="py-12 text-center border-2 border-dashed border-zinc-100 dark:border-zinc-800 rounded-2xl">
                    <Cpu className="size-8 text-zinc-300 mx-auto mb-2 opacity-50" />
                    <p className="text-xs text-zinc-400">{t("No MCP servers configured.")}</p>
                  </div>
                ) : (
                  mcpServers.map(server => (
                    <div key={server.id} className="group flex items-center justify-between p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 hover:border-indigo-200 dark:hover:border-indigo-900/50 hover:bg-indigo-50/10 dark:hover:bg-indigo-900/5 transition-all">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-lg ${server.enabled ? 'bg-indigo-100/50 text-indigo-600 dark:bg-indigo-900/30' : 'bg-zinc-100 text-zinc-400 dark:bg-zinc-800'}`}>
                          {server.type === 'stdio' ? <Terminal className="size-4" /> : <Globe className="size-4" />}
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-medium">{server.name || 'Untitled Server'}</p>
                            <Checkbox checked={server.enabled} onCheckedChange={(v) => handleSaveServer({ ...server, enabled: !!v })} className="size-3.5" />
                          </div>
                          <p className="text-[10px] text-zinc-400 font-mono truncate max-w-[300px]">
                            {server.type === 'stdio' ? `${server.command} ${Array.isArray(server.args) ? server.args.join(' ') : (typeof server.args === 'string' ? server.args : '')}` : server.url}
                          </p>
                        </div>
                      </div>
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
                  ))
                )}
              </div>
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
      </DialogContent>
    </Dialog>
  )
}
