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
  const [settingsOpen, setSettingsOpen] = useState(false)
  const router = useRouter()

  const fetchChats = () => {
    fetch('/api/chats')
      .then(res => res.json())
      .then(data => Array.isArray(data) ? setChats(data) : setChats([]))
      .catch(console.error)
  }

  useEffect(() => { fetchChats() }, [])

  const deleteChat = async (id: string, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!confirm('Delete this chat?')) return
    await fetch(`/api/chats/${id}`, { method: 'DELETE' })
    fetchChats()
    router.push('/')
  }

  const grouped = groupByDate(chats)

  return (
    <>
      <Sidebar className="border-r border-zinc-200 dark:border-zinc-800">
        {/* Header */}
        <SidebarHeader className="px-3 py-4">
          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center">
              <Bot className="size-4 text-white" />
            </div>
            <span className="font-bold text-zinc-900 dark:text-zinc-100 text-base">ClosedUI</span>
          </div>
          <SidebarMenuButton 
            size="lg" 
            className="w-full gap-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg justify-center font-medium transition-colors"
            render={<Link href="/" onClick={fetchChats} />}
          >
            <Plus className="size-4" />
            New Chat
          </SidebarMenuButton>
        </SidebarHeader>

        {/* Chat List */}
        <SidebarContent className="px-1">
          {Object.entries(grouped).map(([group, items]) =>
            items.length === 0 ? null : (
              <SidebarGroup key={group}>
                <SidebarGroupLabel className="text-xs text-zinc-400 uppercase tracking-wider px-2">{group}</SidebarGroupLabel>
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
                            title="Delete chat"
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
              No chats yet. Start a new conversation!
            </div>
          )}
        </SidebarContent>

        {/* Footer */}
        <SidebarFooter className="px-3 py-3 border-t border-zinc-200 dark:border-zinc-800">
          <SidebarMenuButton
            onClick={() => setSettingsOpen(true)}
            className="w-full justify-start gap-2.5 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 px-3"
          >
            <Settings className="size-4 text-zinc-500" />
            <span className="text-sm text-zinc-600 dark:text-zinc-400">Settings</span>
          </SidebarMenuButton>
        </SidebarFooter>
      </Sidebar>
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </>
  )
}
