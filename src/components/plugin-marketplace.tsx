"use client"

import React, { useState, useEffect, useCallback, useRef } from "react"
import {
  Package, Boxes, Search, Download, Check, Settings2, Trash2,
  ExternalLink, Sparkles, Star, ShieldCheck, Terminal,
  Globe, Database, Send, GitBranch, Network, Palette,
  Upload, RefreshCw, Loader2, Plus, AlertCircle, Eye,
  Sliders, Shield, Layers, HelpCircle, CheckCircle2, ChevronRight, X, ArrowUpRight
} from "lucide-react"
import { useI18n } from "@/lib/i18n"
import { notify } from "@/lib/notifications"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface PluginManifest {
  id: string
  name: string
  version: string
  description?: string
  author?: string
  icon?: string
  category?: string
  homepage?: string
  repository?: string
  permissions?: string[]
  settingsFields?: Array<{
    key: string
    label: string
    type: string
    description?: string
    defaultValue?: any
    placeholder?: string
    options?: Array<{ label: string; value: string }>
    required?: boolean
  }>
  contributes?: {
    tools?: Array<{ name: string; description: string }>
    workflowNodes?: Array<{ type: string; label: string; description: string }>
  }
  readme?: string
}

interface InstalledPlugin {
  id: string
  pluginId: string
  name: string
  version: string
  description?: string
  author?: string
  icon?: string
  category: string
  homepage?: string
  repository?: string
  manifest: PluginManifest
  config: Record<string, any>
  enabled: boolean
  isSystem: boolean
  installSource: string
  createdAt: string
  updatedAt: string
}

interface MarketPluginItem {
  id: string
  name: string
  version: string
  description: string
  author: string
  icon: string
  category: string
  downloads: number
  rating: number
  featured?: boolean
  tags: string[]
  permissions: string[]
  homepage?: string
  repository?: string
  settingsFields: any[]
  defaultConfig: Record<string, any>
  contributes?: any
  readme: string
  isInstalled: boolean
  installedData?: InstalledPlugin | null
}

const CATEGORIES = [
  { id: 'all', label: 'All', icon: Boxes },
  { id: 'productivity', label: 'Productivity', icon: Send },
  { id: 'devtools', label: 'Developer Tools', icon: Terminal },
  { id: 'data', label: 'Data & Analytics', icon: Database },
  { id: 'workflow', label: 'Workflows', icon: Network },
  { id: 'creative', label: 'Creative & Visual', icon: Sparkles },
  { id: 'theme', label: 'Themes & UI', icon: Palette },
]

export function PluginMarketplace() {
  const { t } = useI18n()
  const [activeTab, setActiveTab] = useState<'market' | 'installed' | 'import'>('market')
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [marketPlugins, setMarketPlugins] = useState<MarketPluginItem[]>([])
  const [installedPlugins, setInstalledPlugins] = useState<InstalledPlugin[]>([])
  const [loading, setLoading] = useState(true)
  const [installingId, setInstallingId] = useState<string | null>(null)
  
  // Modals
  const [detailPlugin, setDetailPlugin] = useState<MarketPluginItem | InstalledPlugin | null>(null)
  const [configPlugin, setConfigPlugin] = useState<InstalledPlugin | null>(null)
  const [configForm, setConfigForm] = useState<Record<string, any>>({})
  const [savingConfig, setSavingConfig] = useState(false)

  // Manual URL import
  const [importUrl, setImportUrl] = useState('')
  const [importingUrl, setImportingUrl] = useState(false)

  // File upload
  const [dragActive, setDragActive] = useState(false)
  const [uploadingZip, setUploadingZip] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const fetchMarket = useCallback(async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams()
      if (searchQuery) params.append('search', searchQuery)
      if (selectedCategory && selectedCategory !== 'all') params.append('category', selectedCategory)

      const [marketRes, installedRes] = await Promise.all([
        fetch(`/api/plugins/market?${params.toString()}`),
        fetch('/api/plugins')
      ])

      const marketData = await marketRes.json()
      const installedData = await installedRes.json()

      if (Array.isArray(marketData.plugins)) {
        setMarketPlugins(marketData.plugins)
      }
      if (Array.isArray(installedData.plugins)) {
        setInstalledPlugins(installedData.plugins)
      }
    } catch (err) {
      console.error('Failed to fetch plugins:', err)
      notify('error', t('Failed to fetch plugins'))
    } finally {
      setLoading(false)
    }
  }, [searchQuery, selectedCategory, t])

  useEffect(() => {
    fetchMarket()
  }, [fetchMarket])

  const handleInstallFromMarket = async (pluginId: string) => {
    try {
      setInstallingId(pluginId)
      const res = await fetch('/api/plugins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ marketPluginId: pluginId })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Installation failed')

      notify('success', t('Plugin installed successfully'))
      await fetchMarket()
    } catch (err: any) {
      console.error(err)
      notify('error', err.message || t('Installation failed'))
    } finally {
      setInstallingId(null)
    }
  }

  const handleToggleEnabled = async (plugin: InstalledPlugin) => {
    try {
      const nextState = !plugin.enabled
      const res = await fetch(`/api/plugins/${plugin.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'toggle', enabled: nextState })
      })
      if (!res.ok) throw new Error('Toggle failed')

      setInstalledPlugins(prev => prev.map(p => p.id === plugin.id ? { ...p, enabled: nextState } : p))
      notify('success', nextState ? t('Plugin enabled') : t('Plugin disabled'))
    } catch (err: any) {
      console.error(err)
      notify('error', t('Operation failed'))
    }
  }

  const handleOpenConfig = (plugin: InstalledPlugin) => {
    setConfigPlugin(plugin)
    setConfigForm({ ...plugin.config })
  }

  const handleSaveConfig = async () => {
    if (!configPlugin) return
    try {
      setSavingConfig(true)
      const res = await fetch(`/api/plugins/${configPlugin.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'config', config: configForm })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Save failed')

      notify('success', t('Plugin settings saved'))
      setConfigPlugin(null)
      await fetchMarket()
    } catch (err: any) {
      console.error(err)
      notify('error', err.message || t('Save failed'))
    } finally {
      setSavingConfig(false)
    }
  }

  const handleUninstall = async (pluginId: string, e?: React.MouseEvent) => {
    e?.stopPropagation()
    if (!confirm(t('Are you sure you want to uninstall this plugin?'))) return
    try {
      const res = await fetch(`/api/plugins/${pluginId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Uninstall failed')

      notify('success', t('Plugin uninstalled'))
      if (detailPlugin && ('id' in detailPlugin) && detailPlugin.id === pluginId) {
        setDetailPlugin(null)
      }
      await fetchMarket()
    } catch (err: any) {
      console.error(err)
      notify('error', t('Uninstall failed'))
    }
  }

  const handleUrlInstall = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!importUrl.trim()) return
    try {
      setImportingUrl(true)
      const res = await fetch('/api/plugins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: importUrl.trim() })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Import failed')

      notify('success', t('Plugin imported successfully'))
      setImportUrl('')
      setActiveTab('installed')
      await fetchMarket()
    } catch (err: any) {
      console.error(err)
      notify('error', err.message || t('Import failed'))
    } finally {
      setImportingUrl(false)
    }
  }

  const handleZipUpload = async (file: File) => {
    if (!file) return
    try {
      setUploadingZip(true)
      const formData = new FormData()
      formData.append('file', file)

      const res = await fetch('/api/plugins/upload', {
        method: 'POST',
        body: formData
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Upload installation failed')

      notify('success', t('Plugin installed from ZIP package'))
      setActiveTab('installed')
      await fetchMarket()
    } catch (err: any) {
      console.error(err)
      notify('error', err.message || t('Upload installation failed'))
    } finally {
      setUploadingZip(false)
    }
  }

  // Icon Resolver
  const renderPluginIcon = (iconName?: string, className: string = "size-6") => {
    switch (iconName) {
      case 'Send': return <Send className={className} />
      case 'GitBranch': return <GitBranch className={className} />
      case 'Terminal': return <Terminal className={className} />
      case 'Globe': return <Globe className={className} />
      case 'Network': return <Network className={className} />
      case 'Database': return <Database className={className} />
      case 'Sparkles': return <Sparkles className={className} />
      case 'Palette': return <Palette className={className} />
      default: return <Package className={className} />
    }
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card/60 backdrop-blur-md px-6 py-5 shrink-0 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="size-9 rounded-xl bg-orange-500/10 dark:bg-orange-500/20 text-orange-600 dark:text-orange-400 flex items-center justify-center shadow-sm">
              <Boxes className="size-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
                {t("Plugin Marketplace")}
                <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20">
                  {t("Store")}
                </span>
              </h1>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t("Extend capabilities with tools, workflow nodes, themes and agents")}
              </p>
            </div>
          </div>
        </div>

        {/* Tab Controls */}
        <div className="flex items-center gap-1.5 p-1 bg-muted/60 dark:bg-muted/40 rounded-xl border border-border/50 shrink-0">
          <button
            onClick={() => setActiveTab('market')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'market'
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Boxes className="size-3.5" />
            <span>{t("Browse Market")}</span>
            <Badge variant="secondary" className="h-4 px-1 text-[10px] ml-0.5">
              {marketPlugins.length}
            </Badge>
          </button>
          
          <button
            onClick={() => setActiveTab('installed')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'installed'
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <CheckCircle2 className="size-3.5" />
            <span>{t("Installed")}</span>
            <Badge variant="secondary" className="h-4 px-1 text-[10px] ml-0.5">
              {installedPlugins.length}
            </Badge>
          </button>

          <button
            onClick={() => setActiveTab('import')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              activeTab === 'import'
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Upload className="size-3.5" />
            <span>{t("Manual Import")}</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {activeTab === 'market' && (
          <div className="flex-1 flex flex-col min-h-0">
            {/* Search & Category Filter Header */}
            <div className="p-6 border-b border-border/50 bg-card/20 space-y-4 shrink-0">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                <div className="relative w-full sm:w-96">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                  <Input
                    placeholder={t("Search market plugins, tools, authors...")}
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="pl-10 h-10 bg-background/80 border-border/70 rounded-xl text-sm"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      <X className="size-4" />
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <button
                    onClick={fetchMarket}
                    disabled={loading}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-card border border-border/60 hover:bg-muted transition-all active:scale-95 shadow-sm"
                  >
                    <RefreshCw className={`size-3.5 ${loading ? 'animate-spin' : ''}`} />
                    <span>{t("Refresh")}</span>
                  </button>
                </div>
              </div>

              {/* Category Pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto custom-scrollbar pb-1">
                {CATEGORIES.map(cat => {
                  const Icon = cat.icon
                  const isSelected = selectedCategory === cat.id
                  return (
                    <button
                      key={cat.id}
                      onClick={() => setSelectedCategory(cat.id)}
                      className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all shrink-0 ${
                        isSelected
                          ? 'bg-primary text-primary-foreground shadow-sm'
                          : 'bg-card text-muted-foreground hover:text-foreground border border-border/50 hover:bg-muted'
                      }`}
                    >
                      <Icon className="size-3.5" />
                      <span>{t(cat.label)}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Plugin Cards Grid */}
            <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
              {loading ? (
                <div className="flex flex-col items-center justify-center h-64 gap-3">
                  <Loader2 className="size-8 animate-spin text-primary" />
                  <span className="text-xs text-muted-foreground">{t("Loading marketplace plugins...")}</span>
                </div>
              ) : marketPlugins.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-center">
                  <Package className="size-12 text-muted-foreground/40 mb-3" />
                  <h3 className="text-sm font-semibold text-foreground">{t("No plugins found")}</h3>
                  <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                    {t("Try adjusting your search terms or filter category")}
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {marketPlugins.map(plugin => {
                    const isInstalled = plugin.isInstalled
                    const isInstalling = installingId === plugin.id

                    return (
                      <div
                        key={plugin.id}
                        onClick={() => setDetailPlugin(plugin)}
                        className="group relative flex flex-col justify-between p-5 rounded-2xl border border-border bg-card/80 dark:bg-card/40 hover:bg-card hover:border-primary/40 hover:shadow-lg transition-all duration-200 cursor-pointer"
                      >
                        <div>
                          {/* Card Top */}
                          <div className="flex items-start justify-between gap-3 mb-3">
                            <div className="size-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0 border border-primary/20 shadow-sm group-hover:scale-105 transition-transform">
                              {renderPluginIcon(plugin.icon, "size-5 text-primary")}
                            </div>

                            <div className="flex items-center gap-1">
                              {plugin.featured && (
                                <Badge variant="secondary" className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 text-[10px]">
                                  {t("Featured")}
                                </Badge>
                              )}
                              <span className="text-[10px] text-muted-foreground font-mono">v{plugin.version}</span>
                            </div>
                          </div>

                          {/* Title & Author */}
                          <h3 className="text-sm font-bold text-foreground group-hover:text-primary transition-colors line-clamp-1">
                            {plugin.name}
                          </h3>
                          <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">
                            {t("By")} <span className="font-medium text-foreground/80">{plugin.author}</span>
                          </p>

                          {/* Description */}
                          <p className="text-xs text-muted-foreground/90 mt-2 line-clamp-2 leading-relaxed min-h-[32px]">
                            {plugin.description}
                          </p>

                          {/* Tags */}
                          <div className="flex flex-wrap gap-1 mt-3">
                            {plugin.tags.slice(0, 3).map((tag, idx) => (
                              <span key={idx} className="text-[9px] font-medium px-2 py-0.5 rounded-md bg-muted text-muted-foreground">
                                #{tag}
                              </span>
                            ))}
                          </div>
                        </div>

                        {/* Card Bottom / Action */}
                        <div className="mt-4 pt-3 border-t border-border/50 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                            <div className="flex items-center gap-0.5 text-amber-500">
                              <Star className="size-3 fill-amber-500" />
                              <span className="font-semibold text-foreground">{plugin.rating.toFixed(1)}</span>
                            </div>
                            <span>•</span>
                            <div className="flex items-center gap-1">
                              <Download className="size-3" />
                              <span>{plugin.downloads}</span>
                            </div>
                          </div>

                          {isInstalled ? (
                            <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 text-[10px] font-bold">
                              <Check className="size-3" />
                              <span>{t("Installed")}</span>
                            </div>
                          ) : (
                            <Button
                              size="sm"
                              disabled={isInstalling}
                              onClick={(e) => {
                                e.stopPropagation()
                                handleInstallFromMarket(plugin.id)
                              }}
                              className="h-8 text-xs font-semibold px-3 rounded-xl gap-1.5 shadow-sm"
                            >
                              {isInstalling ? (
                                <Loader2 className="size-3.5 animate-spin" />
                              ) : (
                                <Download className="size-3.5" />
                              )}
                              <span>{t("Install")}</span>
                            </Button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Installed Plugins Tab */}
        {activeTab === 'installed' && (
          <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
            {installedPlugins.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-80 text-center">
                <div className="size-16 rounded-2xl bg-muted flex items-center justify-center mb-4 border border-border text-muted-foreground">
                  <Package className="size-8" />
                </div>
                <h3 className="text-base font-bold text-foreground">{t("No installed plugins yet")}</h3>
                <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                  {t("Explore the marketplace to discover and install plugins to enhance your AI workspace.")}
                </p>
                <Button
                  onClick={() => setActiveTab('market')}
                  className="mt-4 rounded-xl gap-1.5 font-semibold text-xs h-9"
                >
                  <Boxes className="size-4" />
                  <span>{t("Browse Marketplace")}</span>
                </Button>
              </div>
            ) : (
              <div className="space-y-3 max-w-5xl mx-auto">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm font-bold text-foreground">
                    {t("Installed Plugins")} ({installedPlugins.length})
                  </h2>
                </div>

                {installedPlugins.map(plugin => (
                  <div
                    key={plugin.id}
                    className={`flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 rounded-2xl border transition-all gap-4 bg-card ${
                      plugin.enabled ? 'border-border shadow-sm' : 'border-border/40 opacity-70 bg-card/40'
                    }`}
                  >
                    <div className="flex items-center gap-3.5 flex-1 min-w-0">
                      <div className={`size-11 rounded-xl flex items-center justify-center shrink-0 border ${
                        plugin.enabled ? 'bg-primary/10 text-primary border-primary/20' : 'bg-muted text-muted-foreground border-border'
                      }`}>
                        {renderPluginIcon(plugin.icon, "size-5")}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-sm font-bold text-foreground truncate">{plugin.name}</h3>
                          <Badge variant="outline" className="text-[10px] font-mono h-4 px-1.5">
                            v{plugin.version}
                          </Badge>
                          <Badge variant="secondary" className="text-[10px] h-4 px-1.5 capitalize">
                            {plugin.category}
                          </Badge>
                          <span className="text-[11px] text-muted-foreground">
                            {t("By")} {plugin.author}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                          {plugin.description || t("No description available")}
                        </p>
                      </div>
                    </div>

                    {/* Action Controls */}
                    <div className="flex items-center gap-2 w-full sm:w-auto justify-end border-t sm:border-t-0 pt-2 sm:pt-0 border-border/50">
                      <div className="flex items-center gap-2 mr-2">
                        <span className="text-xs text-muted-foreground font-medium">
                          {plugin.enabled ? t("Enabled") : t("Disabled")}
                        </span>
                        <Switch
                          checked={plugin.enabled}
                          onCheckedChange={() => handleToggleEnabled(plugin)}
                        />
                      </div>

                      {plugin.manifest?.settingsFields && plugin.manifest.settingsFields.length > 0 && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenConfig(plugin)}
                          className="h-8 text-xs font-semibold gap-1.5 rounded-xl"
                        >
                          <Settings2 className="size-3.5" />
                          <span>{t("Configure")}</span>
                        </Button>
                      )}

                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDetailPlugin(plugin)}
                        className="h-8 text-xs gap-1 rounded-xl text-muted-foreground hover:text-foreground"
                      >
                        <Eye className="size-3.5" />
                        <span>{t("Details")}</span>
                      </Button>

                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => handleUninstall(plugin.id, e)}
                        className="h-8 text-xs gap-1 rounded-xl text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Manual Import Tab */}
        {activeTab === 'import' && (
          <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
            <div className="max-w-2xl mx-auto space-y-6">
              {/* Option 1: Drag & Drop ZIP */}
              <div className="p-6 rounded-2xl border border-border bg-card shadow-sm space-y-4">
                <div className="flex items-center gap-2.5">
                  <div className="size-8 rounded-xl bg-sky-500/10 text-sky-500 flex items-center justify-center">
                    <Upload className="size-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-foreground">{t("Upload Local ZIP Plugin Package")}</h3>
                    <p className="text-xs text-muted-foreground">{t("Drag and drop a .zip archive containing plugin.json")}</p>
                  </div>
                </div>

                <div
                  onDragOver={(e) => { e.preventDefault(); setDragActive(true) }}
                  onDragLeave={() => setDragActive(false)}
                  onDrop={(e) => {
                    e.preventDefault()
                    setDragActive(false)
                    const file = e.dataTransfer.files[0]
                    if (file) handleZipUpload(file)
                  }}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-2xl p-8 text-center transition-all cursor-pointer ${
                    dragActive
                      ? 'border-primary bg-primary/5 scale-[0.99]'
                      : 'border-border/80 hover:border-primary/60 bg-muted/20 hover:bg-muted/40'
                  }`}
                >
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept=".zip,.plugin"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) handleZipUpload(file)
                    }}
                    className="hidden"
                  />
                  <div className="flex flex-col items-center gap-2">
                    {uploadingZip ? (
                      <Loader2 className="size-8 text-primary animate-spin" />
                    ) : (
                      <Upload className="size-8 text-muted-foreground/70" />
                    )}
                    <span className="text-sm font-semibold text-foreground mt-1">
                      {uploadingZip ? t("Extracting and installing plugin...") : t("Click or drag plugin ZIP here")}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      {t("Supports .zip package with standard plugin.json manifest")}
                    </span>
                  </div>
                </div>
              </div>

              {/* Option 2: Install from GitHub / URL */}
              <div className="p-6 rounded-2xl border border-border bg-card shadow-sm space-y-4">
                <div className="flex items-center gap-2.5">
                  <div className="size-8 rounded-xl bg-purple-500/10 text-purple-500 flex items-center justify-center">
                    <Globe className="size-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-foreground">{t("Install from Git / Raw URL")}</h3>
                    <p className="text-xs text-muted-foreground">{t("Enter GitHub repository URL or direct plugin.json link")}</p>
                  </div>
                </div>

                <form onSubmit={handleUrlInstall} className="flex gap-2">
                  <Input
                    placeholder="https://github.com/owner/my-plugin or raw JSON URL"
                    value={importUrl}
                    onChange={e => setImportUrl(e.target.value)}
                    className="h-10 text-xs rounded-xl"
                  />
                  <Button
                    type="submit"
                    disabled={importingUrl || !importUrl.trim()}
                    className="h-10 text-xs font-semibold px-4 rounded-xl shrink-0 gap-1.5"
                  >
                    {importingUrl ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <Download className="size-3.5" />
                    )}
                    <span>{t("Fetch & Install")}</span>
                  </Button>
                </form>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Plugin Details Dialog */}
      {detailPlugin && (
        <Dialog open={!!detailPlugin} onOpenChange={() => setDetailPlugin(null)}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto custom-scrollbar p-6 rounded-2xl">
            <DialogHeader className="flex flex-row items-start justify-between gap-4 border-b border-border pb-4">
              <div className="flex items-center gap-3">
                <div className="size-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0 border border-primary/20">
                  {renderPluginIcon(detailPlugin.icon, "size-6")}
                </div>
                <div>
                  <DialogTitle className="text-base font-bold text-foreground flex items-center gap-2">
                    {detailPlugin.name}
                    <Badge variant="outline" className="text-[10px] font-mono">
                      v{detailPlugin.version}
                    </Badge>
                  </DialogTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {t("By")} {detailPlugin.author} • <span className="capitalize">{detailPlugin.category}</span>
                  </p>
                </div>
              </div>
            </DialogHeader>

            <div className="space-y-5 pt-4">
              {/* Description */}
              <div>
                <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">{t("Description")}</h4>
                <p className="text-sm text-foreground/90 leading-relaxed bg-muted/30 p-3 rounded-xl border border-border/50">
                  {detailPlugin.description || t("No description provided.")}
                </p>
              </div>

              {/* Permissions & Capabilities */}
              {(detailPlugin as any).permissions && (detailPlugin as any).permissions.length > 0 && (
                <div>
                  <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <ShieldCheck className="size-3.5 text-emerald-500" />
                    <span>{t("Requested Permissions")}</span>
                  </h4>
                  <div className="flex flex-wrap gap-1.5">
                    {((detailPlugin as any).permissions as string[]).map((perm: string, idx: number) => (
                      <span key={idx} className="text-[11px] font-mono px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                        {perm}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Contributes */}
              {(detailPlugin as any).contributes?.tools && (detailPlugin as any).contributes.tools.length > 0 && (
                <div>
                  <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Terminal className="size-3.5 text-primary" />
                    <span>{t("Contributed Tools")}</span>
                  </h4>
                  <div className="space-y-1.5">
                    {(detailPlugin as any).contributes.tools.map((tool: any, idx: number) => (
                      <div key={idx} className="p-2.5 rounded-xl bg-muted/40 border border-border/50 text-xs">
                        <span className="font-bold text-primary font-mono">{tool.name}</span>: <span className="text-muted-foreground">{tool.description}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* README */}
              {(detailPlugin as any).readme && (
                <div>
                  <h4 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-1.5">{t("Documentation & Usage")}</h4>
                  <div className="text-xs text-foreground/80 leading-relaxed whitespace-pre-wrap bg-muted/30 p-4 rounded-xl border border-border/50 font-mono">
                    {(detailPlugin as any).readme}
                  </div>
                </div>
              )}

              {/* Links */}
              <div className="flex items-center gap-3 pt-2">
                {detailPlugin.repository && (
                  <a
                    href={detailPlugin.repository}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-primary flex items-center gap-1 hover:underline"
                  >
                    <GitBranch className="size-3.5" />
                    <span>{t("Repository")}</span>
                    <ArrowUpRight className="size-3" />
                  </a>
                )}
                {detailPlugin.homepage && (
                  <a
                    href={detailPlugin.homepage}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-primary flex items-center gap-1 hover:underline"
                  >
                    <Globe className="size-3.5" />
                    <span>{t("Homepage")}</span>
                    <ArrowUpRight className="size-3" />
                  </a>
                )}
              </div>
            </div>

            <DialogFooter className="border-t border-border pt-4 mt-4 flex items-center justify-between">
              <Button variant="ghost" size="sm" onClick={() => setDetailPlugin(null)}>
                {t("Close")}
              </Button>

              {'isInstalled' in detailPlugin && !detailPlugin.isInstalled && (
                <Button
                  size="sm"
                  disabled={installingId === detailPlugin.id}
                  onClick={() => {
                    handleInstallFromMarket(detailPlugin.id)
                    setDetailPlugin(null)
                  }}
                  className="gap-1.5 font-semibold text-xs"
                >
                  <Download className="size-3.5" />
                  <span>{t("Install Plugin")}</span>
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Plugin Configuration Dialog */}
      {configPlugin && (
        <Dialog open={!!configPlugin} onOpenChange={() => setConfigPlugin(null)}>
          <DialogContent className="max-w-lg p-6 rounded-2xl">
            <DialogHeader className="border-b border-border pb-3">
              <DialogTitle className="text-base font-bold text-foreground flex items-center gap-2">
                <Settings2 className="size-4 text-primary" />
                <span>{configPlugin.name} {t("Settings")}</span>
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto custom-scrollbar">
              {(configPlugin.manifest?.settingsFields || []).map((field: any) => (
                <div key={field.key} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-semibold text-foreground">{field.label}</Label>
                    {field.required && <span className="text-[10px] text-rose-500 font-bold">*</span>}
                  </div>

                  {field.type === 'boolean' ? (
                    <div className="flex items-center justify-between p-2 rounded-xl bg-muted/30 border border-border">
                      <span className="text-xs text-muted-foreground">{field.description}</span>
                      <Switch
                        checked={!!configForm[field.key]}
                        onCheckedChange={(val) => setConfigForm({ ...configForm, [field.key]: val })}
                      />
                    </div>
                  ) : field.type === 'select' ? (
                    <select
                      value={configForm[field.key] ?? field.defaultValue ?? ''}
                      onChange={(e) => setConfigForm({ ...configForm, [field.key]: e.target.value })}
                      className="w-full h-9 px-3 rounded-xl text-xs bg-background border border-border focus:outline-none focus:ring-2 focus:ring-primary/20"
                    >
                      {(field.options || []).map((opt: any) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <Input
                      type={field.type === 'password' ? 'password' : field.type === 'number' ? 'number' : 'text'}
                      placeholder={field.placeholder || ''}
                      value={configForm[field.key] ?? ''}
                      onChange={(e) => setConfigForm({ ...configForm, [field.key]: e.target.value })}
                      className="h-9 text-xs rounded-xl"
                    />
                  )}

                  {field.description && field.type !== 'boolean' && (
                    <p className="text-[11px] text-muted-foreground">{field.description}</p>
                  )}
                </div>
              ))}
            </div>

            <DialogFooter className="border-t border-border pt-4 flex items-center justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setConfigPlugin(null)}>
                {t("Cancel")}
              </Button>
              <Button
                size="sm"
                disabled={savingConfig}
                onClick={handleSaveConfig}
                className="gap-1.5 font-semibold text-xs"
              >
                {savingConfig && <Loader2 className="size-3.5 animate-spin" />}
                <span>{t("Save Settings")}</span>
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
