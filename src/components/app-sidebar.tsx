"use client"

import { Bot, MessageSquare, Plus, Settings, Trash2 } from "lucide-react"
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
} from "@/components/ui/sidebar"
import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { SettingsDialog } from "@/components/settings-dialog"
import { KnowledgeDialog } from "@/components/knowledge-dialog"
import { Database, Search, X, Calendar } from "lucide-react"
import { useI18n } from "@/lib/i18n"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useDebounce } from "@/hooks/use-debounce" // Assuming this exists or I'll implement a simple one

type Chat = { id: string; title: string; updatedAt: string }

function groupByDate(chats: Chat[]) {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today.getTime() - 86400000)
  const weekAgo = new Date(today.getTime() - 7 * 86400000)

  const groups: Record<string, Chat[]> = {
    Today: [],
    Yesterday: [],
    'Past 7 Days': [],
    Older: [],
  }

  chats.forEach(chat => {
    const d = new Date(chat.updatedAt)
    if (d >= today) groups['Today'].push(chat)
    else if (d >= yesterday) groups['Yesterday'].push(chat)
    else if (d >= weekAgo) groups['Past 7 Days'].push(chat)
    else groups['Older'].push(chat)
  })
  return groups
}

export function AppSidebar() {
  const [chats, setChats] = useState<Chat[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [dateFilter, setDateFilter] = useState("all")
  const [isSearching, setIsSearching] = useState(false)
  const debouncedSearch = useDebounce(searchQuery, 300)

  const [settingsOpen, setSettingsOpen] = useState(false)
  const [kbOpen, setKbOpen] = useState(false)
  const router = useRouter()
  const { t } = useI18n()

  const fetchChats = async () => {
    setIsSearching(true)
    try {
      if (debouncedSearch || dateFilter !== "all") {
        const params = new URLSearchParams()
        if (debouncedSearch) params.append("q", debouncedSearch)
        if (dateFilter !== "all") params.append("date", dateFilter)
        
        const res = await fetch(`/api/chats/search?${params.toString()}`)
        const data = await res.json()
        setChats(Array.isArray(data) ? data : [])
      } else {
        const res = await fetch('/api/chats')
        const data = await res.json()
        setChats(Array.isArray(data) ? data : [])
      }
    } catch (err) {
      console.error(err)
    } finally {
      setIsSearching(false)
    }
  }

  useEffect(() => { fetchChats() }, [debouncedSearch, dateFilter])

  const deleteChat = async (id: string, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!confirm(t('Delete this chat?'))) return
    await fetch(`/api/chats/${id}`, { method: 'DELETE' })
    fetchChats()
    router.push('/')
  }

  const grouped = groupByDate(chats)

  return (
    <>
      <Sidebar className="border-r border-zinc-200 dark:border-zinc-800">
        {/* Header */}
        <SidebarHeader className="px-4 py-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="size-8 transition-transform hover:scale-105 active:scale-95">
              <img src="/logo.png" alt="Logo" className="size-full object-contain" />
            </div>
            <span className="font-bold text-foreground text-lg tracking-tight">OpenOrangeAI</span>
          </div>
          <SidebarMenuButton 
            className="w-full gap-2 h-10 bg-primary hover:brightness-125 text-primary-foreground rounded-xl justify-center font-semibold shadow-sm transition-all active:scale-[0.98] mb-4"
            render={<Link href="/" onClick={() => { setSearchQuery(""); setDateFilter("all"); fetchChats(); }} />}
          >
            <Plus className="size-4" />
            <span className="text-sm">{t('New Chat')}</span>
          </SidebarMenuButton>

          <div className="space-y-2">
            <div className="relative group">
              <Search className="absolute left-2.5 top-2.5 size-4 text-zinc-400" />
              <Input
                placeholder={t("Search chats")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-8 h-9 bg-zinc-100/50 dark:bg-zinc-800/50 border-none rounded-lg text-sm focus-visible:ring-1 focus-visible:ring-primary/20 transition-all"
              />
              {searchQuery && (
                <button 
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-2.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                >
                  <X className="size-4" />
                </button>
              )}
            </div>
            <Select value={dateFilter} onValueChange={(v) => setDateFilter(v || "all")}>
              <SelectTrigger className="h-8 text-[11px] bg-transparent border-none text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors px-1 w-fit shadow-none focus:ring-0">
                <Calendar className="size-3 mr-1.5" />
                <SelectValue placeholder={t("All time")} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("All time")}</SelectItem>
                <SelectItem value="today">{t("Today")}</SelectItem>
                <SelectItem value="yesterday">{t("Yesterday")}</SelectItem>
                <SelectItem value="week">{t("Last 7 Days")}</SelectItem>
                <SelectItem value="month">{t("Last 30 Days")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </SidebarHeader>

        {/* Chat List */}
        <SidebarContent className="px-1">
          {Object.entries(grouped).map(([group, items]) =>
            items.length === 0 ? null : (
              <SidebarGroup key={group}>
                <SidebarGroupLabel className="text-xs text-zinc-400 uppercase tracking-wider px-2">{t(group)}</SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu>
                    {items.map((chat) => (
                      <SidebarMenuItem key={chat.id}>
                        <div className="flex items-center w-full group relative">
                          <SidebarMenuButton 
                            className="w-full px-3 rounded-lg flex-1"
                            render={<Link href={`/chat/${chat.id}`} />}
                          >
                            <MessageSquare className="mr-2 size-3.5 text-zinc-400 shrink-0" />
                            <span className="truncate text-sm pr-6">{chat.title || 'New Chat'}</span>
                          </SidebarMenuButton>
                          <button
                            onClick={(e) => deleteChat(chat.id, e)}
                            className="absolute right-1 opacity-0 group-hover:opacity-100 p-1.5 rounded-md hover:bg-red-100 dark:hover:bg-red-900/30 transition-all z-10"
                            title={t('Delete this chat?')}
                          >
                            <Trash2 className="size-3.5 text-red-500" />
                          </button>
                        </div>
                      </SidebarMenuItem>
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            )
          )}
          {chats.length === 0 && (
            <div className="px-4 py-8 text-center text-xs text-zinc-400">
              {t("No chats yet. Start a new conversation!")}
            </div>
          )}
        </SidebarContent>

        {/* Footer */}
        <SidebarFooter className="px-3 py-3 border-t border-zinc-200 dark:border-zinc-800 space-y-1">
          <SidebarMenuButton
            onClick={() => setKbOpen(true)}
            className="w-full justify-start gap-2.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 px-3"
          >
            <Database className="size-4 text-indigo-500" />
            <span className="text-sm text-zinc-600 dark:text-zinc-400">{t("Knowledge Base")}</span>
          </SidebarMenuButton>
          <SidebarMenuButton
            onClick={() => setSettingsOpen(true)}
            className="w-full justify-start gap-2.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 px-3"
          >
            <Settings className="size-4 text-zinc-500" />
            <span className="text-sm text-zinc-600 dark:text-zinc-400">{t("Settings")}</span>
          </SidebarMenuButton>
        </SidebarFooter>
      </Sidebar>
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      <KnowledgeDialog open={kbOpen} onOpenChange={setKbOpen} />
    </>
  )
}
