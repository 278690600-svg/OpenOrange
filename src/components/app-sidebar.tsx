"use client"

import { Bot, MessageSquare, Plus, Settings, Trash2, CalendarDays, Bot as BotIcon, Loader2, Brain, Search, Sparkles, Database, X, Calendar, Clock, PanelLeft, File, Folder, ChevronDown, ChevronRight } from "lucide-react"
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar"
import { useEffect, useState, useRef } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { SettingsDialog } from "@/components/settings-dialog"
import { KnowledgeDialog } from "@/components/knowledge-dialog"
import { useChatState, useChatActions } from "@/lib/chat-context"
import { useI18n } from "@/lib/i18n"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useDebounce } from "@/hooks/use-debounce"

type Chat = { id: string; title: string; updatedAt: string }

type DateFilterType = "all" | "today" | "yesterday" | "week" | "month" | "custom"

interface DateRange {
  start: string
  end: string
}

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
  const chatStates = useChatState()
  const [chats, setChats] = useState<Chat[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [dateFilter, setDateFilter] = useState<DateFilterType>("all")
  const [dateRange, setDateRange] = useState<DateRange>({ start: "", end: "" })
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const debouncedSearch = useDebounce(searchQuery, 300)
  const datePickerRef = useRef<HTMLDivElement>(null)

  const [settingsOpen, setSettingsOpen] = useState(false)
  const [kbOpen, setKbOpen] = useState(false)
  const { stopAll } = useChatActions()
  const router = useRouter()
  const { t } = useI18n()

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (datePickerRef.current && !datePickerRef.current.contains(event.target as Node)) {
        setShowDatePicker(false)
      }
    }
    if (showDatePicker) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showDatePicker])

  const fetchChats = async () => {
    setIsSearching(true)
    try {
      if (debouncedSearch || dateFilter !== "all") {
        const params = new URLSearchParams()
        if (debouncedSearch) params.append("q", debouncedSearch)
        if (dateFilter === "custom" && dateRange.start && dateRange.end) {
          params.append("startDate", dateRange.start)
          params.append("endDate", dateRange.end)
        } else if (dateFilter !== "all") {
          params.append("date", dateFilter)
        }
        
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

  useEffect(() => { fetchChats() }, [debouncedSearch, dateFilter, dateRange])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const handleChatUpdated = () => {
      fetchChats()
    }
    window.addEventListener('chat-updated', handleChatUpdated)
    return () => window.removeEventListener('chat-updated', handleChatUpdated)
  }, [])

  const handleDateFilterChange = (value: DateFilterType | null) => {
    if (value === "custom") {
      setShowDatePicker(true)
      setDateFilter("custom")
    } else {
      setShowDatePicker(false)
      if (value) setDateFilter(value)
    }
  }

  const handleDateRangeApply = () => {
    if (dateRange.start && dateRange.end) {
      setShowDatePicker(false)
      fetchChats()
    }
  }

  const handleDateRangeClear = () => {
    setDateRange({ start: "", end: "" })
    setDateFilter("all")
    setShowDatePicker(false)
  }

  const deleteChat = async (id: string, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!confirm(t('Delete this chat?'))) return
    await fetch(`/api/chats/${id}`, { method: 'DELETE' })
    fetchChats()
    router.push('/')
  }

  const combinedChats = [...chats]
  Object.entries(chatStates).forEach(([id, state]) => {
    if (state.status !== 'idle' && !combinedChats.find(c => c.id === id)) {
      combinedChats.unshift({
        id,
        title: state.messages[0]?.content?.substring(0, 40) || t('New Chat'),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      } as Chat)
    }
  })
  const grouped = groupByDate(combinedChats)

  const getDateFilterLabel = () => {
    if (dateFilter === "custom" && dateRange.start && dateRange.end) {
      const start = new Date(dateRange.start).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
      const end = new Date(dateRange.end).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
      return `${start} - ${end}`
    }
    return t("All time")
  }

  return (
    <>
      <Sidebar className="border-r border-zinc-200 dark:border-zinc-800">
        {/* Header */}
        <SidebarHeader className="px-4 py-8">
          <div className="flex items-center justify-between mb-8 px-2">
            <div className="flex items-center gap-3">
              <div className="size-8 bg-black dark:bg-white rounded-xl flex items-center justify-center shrink-0 transition-transform hover:scale-105 active:scale-95 shadow-sm">
                <BotIcon className="size-5 text-white dark:text-black" />
              </div>
              <span className="font-bold text-foreground text-lg tracking-tight">OpenOrangeAI</span>
            </div>

            {/* Task Center Pill */}
            {Object.values(chatStates).filter(c => c.status !== 'idle').length > 0 && (
              <div className="flex items-center gap-2 bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-100 dark:border-indigo-800 px-2.5 py-1 rounded-full animate-in fade-in zoom-in duration-300">
                <div className="relative flex items-center justify-center">
                  <div className="size-2 bg-indigo-500 rounded-full animate-ping absolute" />
                  <div className="size-2 bg-indigo-500 rounded-full relative" />
                </div>
                <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400">
                  {Object.values(chatStates).filter(c => c.status !== 'idle').length}
                </span>
                <button 
                  onClick={stopAll}
                  className="p-1 hover:bg-indigo-100 dark:hover:bg-indigo-800 rounded-full transition-colors group"
                  title={t("Stop All Tasks")}
                >
                  <X className="size-3 text-indigo-400 group-hover:text-indigo-600" />
                </button>
              </div>
            )}
          </div>

          <button 
            className="w-full flex items-center justify-center gap-2 h-11 bg-zinc-900 dark:bg-white text-white dark:text-black hover:bg-zinc-800 dark:hover:bg-zinc-100 rounded-full font-semibold mb-8 shadow-md transition-all active:scale-[0.98] group"
            onClick={() => { setSearchQuery(""); setDateFilter("all"); fetchChats(); router.push("/chat/new"); }}
          >
            <div className="size-6 rounded-full bg-white/10 dark:bg-black/10 flex items-center justify-center transition-transform group-hover:scale-110">
              <Plus className="size-4" />
            </div>
            <span className="text-sm tracking-wide">{t('New Chat')}</span>
          </button>

          <div className="space-y-4 px-1">
            <div className="relative group">
              <Search className="absolute left-3.5 top-3 size-4 text-zinc-400 group-focus-within:text-black dark:group-focus-within:text-white transition-colors" />
              <Input
                placeholder={t("Search chats")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-11 pr-8 h-10 bg-zinc-100/70 dark:bg-zinc-800/70 border-none rounded-xl text-sm focus-visible:ring-2 focus-visible:ring-zinc-200 dark:focus-visible:ring-zinc-700 transition-all placeholder:text-zinc-400"
              />
              {searchQuery && (
                <button 
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-3 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors"
                >
                  <X className="size-4" />
                </button>
              )}
            </div>
            <div className="relative flex items-center gap-1.5 w-full">
              <Select value={dateFilter} onValueChange={handleDateFilterChange}>
                <SelectTrigger className="h-10 text-xs bg-zinc-100/50 dark:bg-zinc-800/50 border-none text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all px-3.5 w-full rounded-xl shadow-none focus:ring-0 group">
                  <div className="flex items-center gap-2">
                    <Calendar className="size-4 text-zinc-400 group-hover:text-zinc-600 dark:group-hover:text-zinc-200 transition-colors" />
                    <SelectValue placeholder={getDateFilterLabel()} />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">{t("All time")}</SelectItem>
                  <SelectItem value="today">{t("Today")}</SelectItem>
                  <SelectItem value="yesterday">{t("Yesterday")}</SelectItem>
                  <SelectItem value="week">{t("Last 7 Days")}</SelectItem>
                  <SelectItem value="month">{t("Last 30 Days")}</SelectItem>
                  <SelectItem value="custom">
                    <span className="flex items-center gap-1.5">
                      <CalendarDays className="size-3" />
                      {t("Custom Range")}
                    </span>
                  </SelectItem>
                </SelectContent>
              </Select>
              {(dateFilter === "custom" || dateFilter !== "all") && (
                <button
                  onClick={handleDateRangeClear}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors p-1 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-md"
                  title={t("Clear filter")}
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>
            {showDatePicker && (
              <div 
                ref={datePickerRef}
                className="absolute left-0 right-0 z-50 mt-1 p-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 rounded-xl shadow-lg"
              >
                <div className="text-xs font-medium text-zinc-700 dark:text-zinc-300 mb-2">{t("Select Date Range")}</div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-zinc-500 mb-1 block">{t("Start Date")}</label>
                    <input
                      type="date"
                      value={dateRange.start}
                      onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
                      className="w-full h-8 px-2 text-xs border border-zinc-200 dark:border-zinc-700 rounded-lg bg-zinc-50 dark:bg-zinc-800 focus:outline-none focus:ring-1 focus:ring-primary/20"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-zinc-500 mb-1 block">{t("End Date")}</label>
                    <input
                      type="date"
                      value={dateRange.end}
                      onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
                      className="w-full h-8 px-2 text-xs border border-zinc-200 dark:border-zinc-700 rounded-lg bg-zinc-50 dark:bg-zinc-800 focus:outline-none focus:ring-1 focus:ring-primary/20"
                    />
                  </div>
                </div>
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={handleDateRangeApply}
                    disabled={!dateRange.start || !dateRange.end}
                    className="flex-1 h-7 text-xs font-medium bg-primary text-primary-foreground rounded-lg hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                  >
                    {t("Apply")}
                  </button>
                  <button
                    onClick={() => setShowDatePicker(false)}
                    className="flex-1 h-7 text-xs font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-all"
                  >
                    {t("Cancel")}
                  </button>
                </div>
              </div>
            )}
          </div>
        </SidebarHeader>

        {/* Chat List */}
        <SidebarContent className="px-2 app-scrollbar">
          {Object.entries(grouped).map(([group, items]) =>
            items.length === 0 ? null : (
              <SidebarGroup key={group} className="pb-4">
                <SidebarGroupLabel className="text-[10px] font-bold text-zinc-400 uppercase tracking-[0.12em] px-3 mb-2">
                  {t(group)}
                </SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu className="gap-1">
                    {items.map((chat) => {
                      const chatState = chatStates[chat.id]
                      const isRunning = chatState && (chatState.status === 'streaming' || chatState.status === 'submitted')
                      const isQueued = chatState?.status === 'queued'

                      return (
                        <SidebarMenuItem key={chat.id}>
                          <div className="group/item relative flex items-center w-full">
                            <Link 
                              href={`/chat/${chat.id}`}
                              className="flex-1 flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-300 hover:bg-zinc-100/80 dark:hover:bg-zinc-900/60 group/link"
                            >
                              <div className={`size-8 rounded-lg flex items-center justify-center shrink-0 border transition-all shadow-sm ${
                                isRunning ? 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200/50 dark:border-indigo-700/50' : 
                                isQueued ? 'bg-zinc-50 dark:bg-zinc-800/30 border-dashed border-zinc-300 dark:border-zinc-700' :
                                'bg-zinc-50 dark:bg-zinc-800/50 border-zinc-200/50 dark:border-zinc-700/50 group-hover/link:bg-white dark:group-hover/link:bg-zinc-800'
                              }`}>
                                {chatState?.currentSearch?.length > 0 ? (
                                  <Search className="size-4 text-indigo-500 animate-pulse" />
                                ) : chatState?.isThinking ? (
                                  <Brain className="size-4 text-purple-500 animate-bounce" style={{ animationDuration: '2s' }} />
                                ) : chatState?.status === 'streaming' ? (
                                  <Sparkles className="size-4 text-amber-500 animate-spin" style={{ animationDuration: '3s' }} />
                                ) : chatState?.status === 'queued' ? (
                                  <Clock className="size-4 text-zinc-400 animate-pulse" />
                                ) : isRunning ? (
                                  <Loader2 className="size-4 text-indigo-500 animate-spin" />
                                ) : (
                                  <MessageSquare className="size-4 text-zinc-500 dark:text-zinc-400 group-hover/link:text-black dark:group-hover/link:text-white transition-colors" />
                                )}
                              </div>
                              <span className="flex-1 truncate text-sm font-medium text-zinc-600 dark:text-zinc-400 group-hover/link:text-zinc-900 dark:group-hover/link:text-zinc-100 transition-all group-hover/link:translate-x-1.5 pr-8">
                                {chat.title || t('New Chat')}
                              </span>
                            <div className="absolute right-12 opacity-0 -translate-x-2 group-hover/link:opacity-100 group-hover/link:translate-x-0 transition-all duration-300">
                              <div className="size-6 rounded-full bg-zinc-200/50 dark:bg-zinc-700/50 flex items-center justify-center">
                                <Plus className="size-3 text-zinc-500 rotate-45" />
                              </div>
                            </div>
                          </Link>
                          
                          <button
                            onClick={(e) => deleteChat(chat.id, e)}
                            className="absolute right-3 opacity-0 group-hover/item:opacity-100 p-2 rounded-lg bg-white/80 dark:bg-zinc-900/80 hover:bg-red-50 dark:hover:bg-red-900/20 text-zinc-400 hover:text-red-500 transition-all z-20 shadow-sm border border-zinc-200/50 dark:border-zinc-700/50 active:scale-90"
                            title={t('Delete this chat?')}
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                        </SidebarMenuItem>
                      )
                    })}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            )
          )}
          {chats.length === 0 && (
            <div className="px-6 py-12 text-center">
              <div className="size-12 bg-zinc-50 dark:bg-zinc-900/50 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-zinc-100 dark:border-zinc-800">
                <BotIcon className="size-6 text-zinc-300" />
              </div>
              <div className="text-[11px] font-medium text-zinc-400 leading-relaxed uppercase tracking-wider">
                {t("No chats yet")}
              </div>
            </div>
          )}
        </SidebarContent>

        {/* Footer */}
        <SidebarFooter className="p-4 border-t border-zinc-100 dark:border-zinc-800 space-y-2">
          <button
            onClick={() => setKbOpen(true)}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-all group"
          >
            <div className="size-8 rounded-xl bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center transition-transform group-hover:scale-110">
              <Database className="size-4 text-indigo-500" />
            </div>
            <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 group-hover:text-zinc-900 dark:group-hover:text-zinc-100 truncate">{t("Knowledge Base")}</span>
          </button>
          
          <button
            onClick={() => setSettingsOpen(true)}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-all group"
          >
            <div className="size-8 rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center transition-transform group-hover:scale-110">
              <Settings className="size-4 text-zinc-500" />
            </div>
            <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300 group-hover:text-zinc-900 dark:group-hover:text-zinc-100 truncate">{t("Settings")}</span>
          </button>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      <KnowledgeDialog open={kbOpen} onOpenChange={setKbOpen} />
    </>
  )
}
