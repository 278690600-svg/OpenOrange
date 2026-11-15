"use client"

import { MessageSquare, Plus, Settings, Trash2, CalendarDays, Loader2, Brain, Search, Sparkles, Database, X, Calendar, Clock, FileText, Table2, ArrowRightLeft, Image as ImageIcon, Search as SearchIcon, Presentation, Split, Layout, StickyNote, ChevronDown, ChevronUp, HardDrive, Workflow, Package, GitBranch, Share2, Archive, Boxes } from "lucide-react"
import React, { useEffect, useState, useRef } from "react"
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent,
  SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuItem,
  SidebarRail, useSidebar,
} from "@/components/ui/sidebar"
import Link from "next/link"
import { useRouter, usePathname } from "next/navigation"
import { SettingsDialog } from "@/components/settings-dialog"
import { KnowledgeDialog } from "@/components/knowledge-dialog"
import { DatabaseQueryDialog } from "@/components/database-query-dialog"
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

type Chat = { id: string; title: string; createdAt?: string; updatedAt: string }

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

interface ChatStateType {
  status?: string;
  currentSearch?: unknown[];
  isThinking?: boolean;
  messages?: Array<{ content?: string }>;
}

const SidebarChatItem = React.memo(({ 
  chat, 
  chatState, 
  t, 
  deleteChat,
  forkChat 
}: { 
  chat: Chat, 
  chatState: ChatStateType | null, 
  t: (key: string) => string, 
  deleteChat: (id: string, e: React.MouseEvent) => Promise<void>
  forkChat?: (id: string, e: React.MouseEvent) => Promise<void>
}) => {
  const isRunning = chatState && (chatState.status === 'streaming' || chatState.status === 'submitted')
  const isQueued = chatState?.status === 'queued'
  const isSearching = chatState && (chatState.currentSearch?.length ?? 0) > 0

  return (
    <SidebarMenuItem>
      <div className="group/item relative flex items-center w-full px-1 py-0.5">
        <Link 
          href={`/chat/${chat.id}`}
          className="flex-1 flex items-center gap-2.5 px-3 py-2 rounded-xl transition-all duration-200 hover:bg-muted/50 group/link active:scale-[0.99]"
        >
          {/* 图标容器：平闲无框极简，运行态下浮现状态色指示背景 */}
          <div className={`size-7 rounded-lg flex items-center justify-center shrink-0 transition-all ${
            isSearching ? 'bg-amber-500/10 dark:bg-amber-400/10 text-amber-500' :
            chatState?.isThinking ? 'bg-purple-500/10 dark:bg-purple-400/10 text-purple-500' :
            chatState?.status === 'streaming' ? 'bg-indigo-500/10 dark:bg-indigo-400/10 text-indigo-500' :
            isQueued ? 'bg-muted border border-dashed border-muted-foreground/30 text-muted-foreground' :
            isRunning ? 'bg-primary/10 text-primary' :
            'bg-transparent text-muted-foreground group-hover/link:text-foreground/90'
          }`}>
            {isSearching ? (
              <Search className="size-4 animate-pulse" />
            ) : chatState?.isThinking ? (
              <Brain className="size-4 animate-bounce" style={{ animationDuration: '2s' }} />
            ) : chatState?.status === 'streaming' ? (
              <Sparkles className="size-4 animate-spin" style={{ animationDuration: '3.5s' }} />
            ) : isQueued ? (
              <Clock className="size-4 animate-pulse" />
            ) : isRunning ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              chat.title?.includes('搜索') || chat.title?.includes('查') || chat.title?.includes('找') ? (
                <Search className="size-4 opacity-75 group-hover/link:opacity-100 transition-opacity" />
              ) : (
                <MessageSquare className="size-4 opacity-75 group-hover/link:opacity-100 transition-opacity" />
              )
            )}
          </div>
          
          {/* 标题文字：精细微偏移与溢出截断安全间距 */}
          <span className="flex-1 truncate text-[13px] font-medium text-muted-foreground/90 group-hover/link:text-foreground transition-all group-hover/link:translate-x-1 pr-14 select-none">
            {chat.title || t('New Chat')}
          </span>
        </Link>
        
        {/* 控制按钮：轻量级磨砂玻璃无边框气泡，Hover 时自右侧淡入浮现 */}
        <div className="absolute right-2 flex items-center gap-1 opacity-0 pointer-events-none group-hover/item:opacity-100 group-hover/item:pointer-events-auto transition-all duration-200 z-20">
          {forkChat && (
            <button
              onClick={(e) => forkChat(chat.id, e)}
              className="size-7 p-1.5 rounded-lg bg-card/90 dark:bg-zinc-900/90 text-muted-foreground/80 hover:text-emerald-500 hover:bg-emerald-500/10 dark:hover:bg-emerald-400/15 border border-border/50 hover:border-emerald-500/30 transition-all active:scale-90 shadow-sm"
              title={t('Fork this chat')}
            >
              <GitBranch className="size-full" />
            </button>
          )}

          <button
            onClick={(e) => deleteChat(chat.id, e)}
            className="size-7 p-1.5 rounded-lg bg-card/90 dark:bg-zinc-900/90 text-muted-foreground/80 hover:text-red-500 hover:bg-red-500/10 dark:hover:bg-red-400/15 border border-border/50 hover:border-red-500/30 transition-all active:scale-90 shadow-sm"
            title={t('Delete this chat?')}
          >
            <Trash2 className="size-full" />
          </button>
        </div>
      </div>
    </SidebarMenuItem>
  )
})
SidebarChatItem.displayName = 'SidebarChatItem'

export function AppSidebar() {
  const pathname = usePathname()
  const { isMobile, setOpenMobile } = useSidebar()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    if (isMobile) {
      setOpenMobile(false)
    }
  }, [pathname, isMobile, setOpenMobile])

  useEffect(() => {
    setMounted(true)
    const saved = localStorage.getItem('toolsExpanded')
    if (saved === 'true') {
      setToolsExpanded(true)
    }
  }, [])

  const chatStates = useChatState()
  const [chats, setChats] = useState<Chat[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [dateFilter, setDateFilter] = useState<DateFilterType>("all")
  const [dateRange, setDateRange] = useState<DateRange>({ start: "", end: "" })
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [_isSearching, setIsSearching] = useState(false)
  const debouncedSearch = useDebounce(searchQuery, 300)
  const datePickerRef = useRef<HTMLDivElement>(null)
  const chatIdMappingRef = useRef<Map<string, string>>(new Map())

  const [settingsOpen, setSettingsOpen] = useState(false)
  const [kbOpen, setKbOpen] = useState(false)
  const [dbQueryOpen, setDbQueryOpen] = useState(false)
  const [toolsExpanded, setToolsExpanded] = useState(false)
  const { stopAll, updateChat: __updateChat } = useChatActions()
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

  const fetchChatsControllerRef = useRef<AbortController | null>(null)

  const fetchChats = async () => {
    setIsSearching(true)
    fetchChatsControllerRef.current?.abort()
    const controller = new AbortController()
    fetchChatsControllerRef.current = controller
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
        
        const res = await fetch(`/api/chats/search?${params.toString()}`, { signal: controller.signal })
        const data = await res.json()
        if (!controller.signal.aborted) setChats(Array.isArray(data) ? data : [])
      } else {
        const res = await fetch('/api/chats', { signal: controller.signal })
        const data = await res.json()
        if (!controller.signal.aborted) setChats(Array.isArray(data) ? data : [])
      }
    } catch (err: unknown) {
      if (err instanceof Error && err.name !== 'AbortError') console.error(err)
    } finally {
      if (!controller.signal.aborted) setIsSearching(false)
    }
  }

  const fetchChatsRef = useRef(fetchChats)
  fetchChatsRef.current = fetchChats

  useEffect(() => { fetchChatsRef.current() }, [debouncedSearch, dateFilter, dateRange])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const handleChatIdMigrated = (e: Event) => {
      const { oldId, newId } = (e as CustomEvent).detail
      chatIdMappingRef.current.set(oldId, newId)
      fetchChatsRef.current()
    }
    window.addEventListener('chat-id-migrated', handleChatIdMigrated)
    return () => {
      window.removeEventListener('chat-id-migrated', handleChatIdMigrated)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    let timer: ReturnType<typeof setTimeout> | null = null
    const handleChatUpdated = () => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => fetchChatsRef.current(), 500)
    }
    window.addEventListener('chat-updated', handleChatUpdated)
    return () => {
      window.removeEventListener('chat-updated', handleChatUpdated)
      if (timer) clearTimeout(timer)
    }
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

  const resolveChatState = (chatId: string) => {
    if (chatStates[chatId]) return chatStates[chatId]
    for (const [key, mapping] of chatIdMappingRef.current.entries()) {
      if (mapping === chatId && chatStates[key]) {
        return chatStates[key]
      }
    }
    return null
  }

  const deleteChat = async (id: string, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!confirm(t('Delete this chat?'))) return
    try {
      const res = await fetch(`/api/chats/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        alert(t('Delete failed'))
        return
      }
      fetchChats()
      const newChatId = `new-${Date.now()}`
      router.push(`/chat/${newChatId}`)
    } catch (err) {
      console.error(err)
      alert(t('Delete failed'))
    }
  }

  const forkChat = async (id: string, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    try {
      const res = await fetch('/api/chats/branch?action=fork', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chatId: id })
      })
      if (res.ok) {
        const data = await res.json()
        if (data.chat?.id) {
          fetchChats()
          router.push(`/chat/${data.chat.id}`)
        }
      }
    } catch (err) {
      console.error('Fork failed:', err)
    }
  }

  const combinedChats = React.useMemo(() => {
    const list = [...chats]
    const existingIds = new Set(list.map(c => c.id))
    const mappedIds = new Set<string>()
    
    Object.entries(chatStates).forEach(([id, state]) => {
      if (state.status !== 'idle') {
        const mappedId = chatIdMappingRef.current.get(id) || id
        if (!existingIds.has(mappedId) && !mappedIds.has(mappedId)) {
          const title = state.messages?.[0]?.content?.substring(0, 40) || t('New Chat')
          list.unshift({
            id: mappedId,
            title,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          } as Chat)
          mappedIds.add(mappedId)
        }
      }
    })

    return list.filter((chat, index, self) => {
      return self.findIndex(c => c.id === chat.id) === index
    })
  }, [chats, chatStates, t])

  const grouped = React.useMemo(() => groupByDate(combinedChats), [combinedChats])
  const activeTaskCount = React.useMemo(() => Object.values(chatStates).filter(c => c.status !== 'idle').length, [chatStates])
  const [backendTaskCount, setBackendTaskCount] = useState(0)

  useEffect(() => {
    let timer: NodeJS.Timeout | null = null
    let isDisposed = false

    const fetchTasks = async () => {
      try {
        const res = await fetch('/api/chat/tasks')
        if (res.ok && !isDisposed) {
          const data = await res.json()
          const total = (data.stats?.activeCount || 0) + (data.stats?.queuedCount || 0)
          setBackendTaskCount(total)
          return total
        }
      } catch {}
      return 0
    }

    const scheduleNext = (currentCount: number) => {
      if (isDisposed) return
      // When tasks are active, poll every 1.5s; when idle, back off to 20s
      const delay = currentCount > 0 || activeTaskCount > 0 ? 1500 : 20000
      timer = setTimeout(async () => {
        const count = await fetchTasks()
        scheduleNext(count)
      }, delay)
    }

    // Initial check
    fetchTasks().then(count => scheduleNext(count))

    // Event-driven immediate refresh on task lifecycle events
    const handleTaskEvent = () => {
      if (timer) clearTimeout(timer)
      fetchTasks().then(count => scheduleNext(count))
    }

    window.addEventListener('chat-task-created', handleTaskEvent)
    window.addEventListener('chat-task-finished', handleTaskEvent)
    window.addEventListener('chat-task-updated', handleTaskEvent)

    return () => {
      isDisposed = true
      if (timer) clearTimeout(timer)
      window.removeEventListener('chat-task-created', handleTaskEvent)
      window.removeEventListener('chat-task-finished', handleTaskEvent)
      window.removeEventListener('chat-task-updated', handleTaskEvent)
    }
  }, [activeTaskCount])

  const displayTaskCount = Math.max(activeTaskCount, backendTaskCount)

  const getDateFilterLabel = () => {
    if (dateFilter === "custom" && dateRange.start && dateRange.end) {
      const start = new Date(dateRange.start).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
      const end = new Date(dateRange.end).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
      return `${start} - ${end}`
    }
    return t("All time")
  }

  if (!mounted) {
    return (
      <Sidebar className="border-r border-border">
        <SidebarHeader className="px-4 py-8">
          <div className="flex items-center justify-between mb-8 px-2">
            <div className="flex items-center gap-2.5 group/logo">
              <div className="size-8 rounded-xl flex items-center justify-center shrink-0 shadow-[0_2px_10px_rgba(249,115,22,0.15)] dark:shadow-[0_2px_10px_rgba(249,115,22,0.05)] overflow-hidden border border-orange-500/20 dark:border-orange-500/10 bg-white dark:bg-zinc-950">
                <img src="/brand/logo.png" alt="OpenOrangeAI Logo" className="size-full object-contain p-0.5" />
              </div>
              <div className="flex items-start gap-1">
                <span className="font-extrabold text-foreground text-[17px] tracking-tight flex items-center gap-0.5 select-none">
                  <span>Open</span>
                  <span className="bg-gradient-to-r from-orange-500 to-amber-500 bg-clip-text text-transparent dark:from-orange-400 dark:to-amber-400 drop-shadow-[0_1.5px_4px_rgba(249,115,22,0.1)]">Orange</span>
                  <span className="text-orange-500 dark:text-orange-400">AI</span>
                </span>
                <span className="text-[9px] font-black px-1 py-0.2 rounded bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20 select-none scale-75 origin-top-left mt-0.5">
                  BETA
                </span>
              </div>
            </div>
          </div>
        </SidebarHeader>
      </Sidebar>
    )
  }

  return (
    <>
      <Sidebar className="border-r border-border">
        {/* Header */}
        <SidebarHeader className="px-4 py-8">
          <div className="flex items-center justify-between mb-8 px-2">
            <div className="flex items-center gap-2.5 group/logo cursor-pointer">
              <div className="size-8 rounded-xl flex items-center justify-center shrink-0 transition-all duration-300 group-hover/logo:scale-110 group-hover/logo:rotate-[6deg] active:scale-95 shadow-[0_2px_10px_rgba(249,115,22,0.15)] dark:shadow-[0_2px_10px_rgba(249,115,22,0.05)] overflow-hidden border border-orange-500/20 dark:border-orange-500/10 bg-white dark:bg-zinc-950">
                <img src="/brand/logo.png" alt="OpenOrangeAI Logo" className="size-full object-contain p-0.5 animate-[spin_8s_linear_infinite] group-hover/logo:animate-[spin_2s_linear_infinite]" />
              </div>
              <div className="flex items-start gap-1">
                <span className="font-extrabold text-foreground text-[17px] tracking-tight flex items-center gap-0.5 select-none">
                  <span>Open</span>
                  <span className="bg-gradient-to-r from-orange-500 to-amber-500 bg-clip-text text-transparent dark:from-orange-400 dark:to-amber-400 drop-shadow-[0_1.5px_4px_rgba(249,115,22,0.1)]">Orange</span>
                  <span className="text-orange-500 dark:text-orange-400">AI</span>
                </span>
                <span className="text-[9px] font-black px-1 py-0.2 rounded bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20 select-none scale-75 origin-top-left mt-0.5">
                  BETA
                </span>
              </div>
            </div>

            {/* Task Center Pill */}
            {displayTaskCount > 0 && (
              <div className="flex items-center gap-1.5 bg-indigo-500/10 dark:bg-indigo-400/15 border border-indigo-500/20 dark:border-indigo-400/25 pl-2 pr-1 py-0.5 rounded-full select-none shadow-[0_2px_8px_rgba(99,102,241,0.08)] animate-in fade-in zoom-in duration-300 shrink-0">
                <div className="relative flex items-center justify-center size-2">
                  <div className="size-1.5 bg-indigo-500 dark:bg-indigo-400 rounded-full animate-ping absolute opacity-75" />
                  <div className="size-1.5 bg-indigo-500 dark:bg-indigo-400 rounded-full relative" />
                </div>
                <span className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400 leading-none">
                  {displayTaskCount}
                </span>
                <button 
                  onClick={async () => {
                    try {
                      await fetch('/api/chat/tasks?action=clear-all', { method: 'DELETE' })
                      setBackendTaskCount(0)
                      stopAll()
                    } catch {}
                  }}
                  className="p-1 hover:bg-indigo-500/20 dark:hover:bg-indigo-400/20 rounded-full transition-all active:scale-90 group"
                  title={t("Stop All Tasks")}
                >
                  <X className="size-2.5 text-indigo-500 dark:text-indigo-400 group-hover:text-indigo-700 dark:group-hover:text-indigo-200 transition-colors" />
                </button>
              </div>
            )}
          </div>

          <button
            onClick={() => { 
              setSearchQuery(""); 
              setDateFilter("all"); 
              fetchChats(); 
              const newChatId = `new-${Date.now()}`;
              router.push(`/chat/${newChatId}`); 
            }}
            className="w-full flex items-center justify-center gap-2 h-11 bg-foreground text-background hover:bg-foreground/90 rounded-full font-semibold mb-8 shadow-md transition-all active:scale-[0.98] group"
          >
            <div className="size-6 rounded-full bg-background/10 flex items-center justify-center transition-transform group-hover:scale-110">
              <Plus className="size-4" />
            </div>
            <span className="text-sm tracking-wide">{t('New Chat')}</span>
          </button>

          <div className="space-y-4 px-1">
            <div className="relative group">
              <Search className="absolute left-3.5 top-3 size-4 text-muted-foreground group-focus-within:text-foreground transition-colors" />
              <Input
                placeholder={t("Search chats")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-11 pr-8 h-10 bg-muted/70 border-none rounded-xl text-sm focus-visible:ring-2 focus-visible:ring-border transition-all placeholder:text-muted-foreground"
              />
              {searchQuery && (
                <button 
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-3 text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="size-4" />
                </button>
              )}
            </div>
            <div className="relative flex items-center gap-1.5 w-full">
              <Select value={dateFilter} onValueChange={handleDateFilterChange}>
                <SelectTrigger className="h-10 text-xs bg-muted/50 border-none text-muted-foreground hover:bg-muted transition-all px-3.5 w-full rounded-xl shadow-none focus:ring-0 group">
                  <div className="flex items-center gap-2">
                    <Calendar className="size-4 text-muted-foreground group-hover:text-foreground transition-colors" />
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
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-1 hover:bg-muted rounded-md"
                  title={t("Clear filter")}
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>
            {showDatePicker && (
              <div 
                ref={datePickerRef}
                className="fixed z-50 mt-1 p-3 bg-card border border-border rounded-xl shadow-lg"
                style={{ width: '320px' }}
              >
                <div className="text-xs font-medium text-foreground mb-2">{t("Select Date Range")}</div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-muted-foreground mb-1 block">{t("Start Date")}</label>
                    <input
                      type="date"
                      value={dateRange.start}
                      onChange={(e) => setDateRange({ ...dateRange, start: e.target.value })}
                      className="w-full h-8 px-2 text-xs border border-border rounded-lg bg-muted focus:outline-none focus:ring-1 focus:ring-primary/20"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground mb-1 block">{t("End Date")}</label>
                    <input
                      type="date"
                      value={dateRange.end}
                      onChange={(e) => setDateRange({ ...dateRange, end: e.target.value })}
                      className="w-full h-8 px-2 text-xs border border-border rounded-lg bg-muted focus:outline-none focus:ring-1 focus:ring-primary/20"
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
                    className="flex-1 h-7 text-xs font-medium bg-muted text-muted-foreground rounded-lg hover:bg-muted/80 transition-all"
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
                <SidebarGroupLabel className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.12em] px-3 mb-2">
                  {t(group)}
                </SidebarGroupLabel>
                <SidebarGroupContent>
                  <SidebarMenu className="gap-1">
                    {items.map((chat) => (
                      <SidebarChatItem 
                        key={chat.id}
                        chat={chat} 
                        chatState={resolveChatState(chat.id)} 
                        t={t} 
                        deleteChat={deleteChat}
                        forkChat={forkChat}
                      />
                    ))}
                  </SidebarMenu>
                </SidebarGroupContent>
              </SidebarGroup>
            )
          )}
          {combinedChats.length === 0 && (
            <div className="px-6 py-12 text-center">
              <div className="size-12 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-border overflow-hidden opacity-30 grayscale dark:invert bg-white dark:bg-zinc-950">
                <img src="/brand/logo.png" alt="Logo Placeholder" className="size-full object-contain p-1" />
              </div>
              <div className="text-[11px] font-medium text-muted-foreground leading-relaxed uppercase tracking-wider">
                {t("No chats yet")}
              </div>
            </div>
          )}
        </SidebarContent>

        {/* Footer - Tools + Settings */}
        <SidebarFooter className="p-0 border-t border-border flex flex-col gap-0">
          {/* Tools Section Header with Toggle */}
          <button
            onClick={() => {
              const next = !toolsExpanded
              setToolsExpanded(next)
              localStorage.setItem('toolsExpanded', String(next))
            }}
            className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-muted/50 transition-all group border-b border-border/50"
          >
            <div className="flex items-center gap-2">
              <Package className="size-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground group-hover:text-foreground">
                {t("Tools")}
              </span>
              {!toolsExpanded && (
                <span className="text-[9px] text-muted-foreground/60">6</span>
              )}
            </div>
            <ChevronDown className={`size-3.5 text-muted-foreground transition-transform duration-200 ${toolsExpanded ? 'rotate-180' : ''}`} />
          </button>

          {/* Collapsible Tools List */}
          <div className={`transition-all duration-300 ease-in-out overflow-hidden ${toolsExpanded ? 'max-h-[450px] opacity-100' : 'max-h-0 opacity-0'}`}>
            <div className="overflow-y-auto custom-scrollbar py-2 px-2 space-y-0.5 max-h-[450px]">

            <button
              onClick={() => setKbOpen(true)}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-muted/50 transition-all group text-left"
            >
              <div className="size-6 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0 animate-[pulse_3s_ease-in-out_infinite]">
                <Database className="size-3.5 text-primary" />
              </div>
              <span className="text-xs font-semibold text-foreground/90 group-hover:text-foreground truncate">{t("Knowledge Base")}</span>
            </button>

            <Link
              href="/ocr"
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-muted/50 transition-all group"
            >
              <div className="size-6 rounded-md bg-sky-500/10 flex items-center justify-center flex-shrink-0">
                <ImageIcon className="size-3.5 text-sky-500" />
              </div>
              <span className="text-xs font-semibold text-foreground/90 group-hover:text-foreground truncate">{t("OCR Processor")}</span>
            </Link>

            <Link
              href="/convert"
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-muted/50 transition-all group"
            >
              <div className="size-6 rounded-md bg-teal-500/10 flex items-center justify-center flex-shrink-0">
                <ArrowRightLeft className="size-3.5 text-teal-500" />
              </div>
              <span className="text-xs font-semibold text-foreground/90 group-hover:text-foreground truncate">{t("Conversion Center")}</span>
            </Link>

            <Link
              href="/presentations"
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-muted/50 transition-all group"
            >
              <div className="size-6 rounded-md bg-rose-500/10 flex items-center justify-center flex-shrink-0">
                <Presentation className="size-3.5 text-rose-500" />
              </div>
              <span className="text-xs font-semibold text-foreground/90 group-hover:text-foreground truncate">{t("Presentations")}</span>
            </Link>

            <Link
              href="/templates"
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-muted/50 transition-all group"
            >
              <div className="size-6 rounded-md bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                <Layout className="size-3.5 text-amber-500" />
              </div>
              <span className="text-xs font-semibold text-foreground/90 group-hover:text-foreground truncate">{t("Template Center")}</span>
            </Link>

            <Link
              href="/workflows"
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-muted/50 transition-all group"
            >
              <div className="size-6 rounded-md bg-indigo-500/10 flex items-center justify-center flex-shrink-0">
                <Workflow className="size-3.5 text-indigo-500" />
              </div>
              <span className="text-xs font-semibold text-foreground/90 group-hover:text-foreground truncate">{t("Workflows")}</span>
            </Link>

            <Link
              href="/plugins"
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-muted/50 transition-all group"
            >
              <div className="size-6 rounded-md bg-orange-500/10 flex items-center justify-center flex-shrink-0">
                <Boxes className="size-3.5 text-orange-500" />
              </div>
              <span className="text-xs font-semibold text-foreground/90 group-hover:text-foreground truncate">{t("Plugin Marketplace")}</span>
            </Link>



            </div>
          </div>

          {/* Settings */}
          <div className="px-3 py-2 border-t border-border/50">
            <button
              onClick={() => setSettingsOpen(true)}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-muted/50 transition-all group"
            >
              <div className="size-6 rounded-md bg-muted/80 flex items-center justify-center transition-transform group-hover:scale-105">
                <Settings className="size-3.5 text-muted-foreground" />
              </div>
              <span className="text-xs font-medium text-foreground/80 group-hover:text-foreground">{t("Settings")}</span>
            </button>
          </div>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      <KnowledgeDialog open={kbOpen} onOpenChange={setKbOpen} />
      <DatabaseQueryDialog open={dbQueryOpen} onOpenChange={setDbQueryOpen} />
    </>
  )
}
