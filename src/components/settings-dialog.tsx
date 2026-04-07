"use client"

import { useEffect, useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Save, ExternalLink, Loader2, CheckCircle2, XCircle } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { useI18n } from "@/lib/i18n"

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
  const [defaultModel, setDefaultModel] = useState("")
  const [searchEngine, setSearchEngine] = useState("duckduckgo")
  const [searchKey, setSearchKey] = useState("")
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<'ok' | 'fail' | null>(null)
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
          setDefaultModel(data.defaultModel || "")
          setSearchEngine(data.searchEngine || "duckduckgo")
          setSearchKey(data.searchKey || "")
        })
        .catch(console.error)
    }
  }, [open])

  const saveSettings = async () => {
    setSaving(true)
    await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ollamaUrl, lmstudioUrl, openaiKey, minimaxKey, deepseekKey, defaultModel, searchEngine, searchKey })
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
        body: JSON.stringify({ ollamaUrl, lmstudioUrl, openaiKey, minimaxKey, deepseekKey, defaultModel, searchEngine, searchKey })
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
