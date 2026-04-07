"use client"

import React, { createContext, useContext, useEffect, useState } from "react"

type Language = "en" | "zh"

type Translations = Record<string, string>

const en: Translations = {
  // Sidebar
  "New Chat": "New Chat",
  "Settings": "Settings",
  "Knowledge Base": "Knowledge Base",
  "Today": "Today",
  "Yesterday": "Yesterday",
  "Past 7 Days": "Past 7 Days",
  "Older": "Older",
  "Delete this chat?": "Delete this chat?",
  "No chats yet. Start a new conversation!": "No chats yet. Start a new conversation!",
  
  // Settings Dialog
  "Settings Title": "Settings",
  "Models": "Models",
  "Search": "Search",
  "General": "General",
  "Language": "Language",
  "Ollama URL": "Ollama URL",
  "LM Studio URL": "LM Studio URL",
  "OpenAI API Key (optional)": "OpenAI API Key (optional)",
  "DeepSeek API Key (optional)": "DeepSeek API Key (optional)",
  "MiniMax API Key (optional)": "MiniMax API Key (optional)",
  "Default Model": "Default Model",
  "Search Engine": "Search Engine",
  "Test Search": "Test Search",
  "Save changes": "Save changes",
  "Working!": "Working!",
  "Failed": "Failed",

  // Knowledge Base
  "Knowledge Base Management": "Knowledge Base Management",
  "Local folders, files, DBs · Unified AI Search": "Local folders, files, DBs · Unified AI Search",
  "Add": "Add",
  "Uploaded Files": "Uploaded Files",
  "Ready": "Ready",
  "Indexing": "Indexing...",
  "Error": "Error",
  "sources": "sources",
  "fragments": "fragments",
  "Updated": "Updated",
  "Search in KB": "Search in KB...",
  "No relevant content found.": "No relevant content found.",
  "Add Knowledge Base": "Add Knowledge Base",
  "Name (Required)": "Name (Required)",
  "Source Type": "Source Type",
  "Local Directory": "Local Directory",
  "Database": "Database",
  "Path": "Path",
  "Select a folder on the server": "Select a folder on the server",
  "Cancel": "Cancel",
  "Confirm": "Confirm",
  
  // Chat
  "Message ClosedUI...": "Message ClosedUI...",
  "Search Web": "Search Web",
  "Think": "Think",
  "Stop": "Stop",
  "Clear chat": "Clear chat",
}

const zh: Translations = {
  // Sidebar
  "New Chat": "新对话",
  "Settings": "设置",
  "Knowledge Base": "本地知识库",
  "Today": "今天",
  "Yesterday": "昨天",
  "Past 7 Days": "过去 7 天",
  "Older": "更早",
  "Delete this chat?": "确定删除该对话？",
  "No chats yet. Start a new conversation!": "尚未有对话，开启一段新的聊天吧！",
  
  // Settings Dialog
  "Settings Title": "设置",
  "Models": "模型",
  "Search": "搜索",
  "General": "通用",
  "Language": "语言",
  "Ollama URL": "Ollama URL",
  "LM Studio URL": "LM Studio URL",
  "OpenAI API Key (optional)": "OpenAI API Key (可选)",
  "DeepSeek API Key (optional)": "DeepSeek API Key (可选)",
  "MiniMax API Key (optional)": "MiniMax API Key (可选)",
  "Default Model": "默认模型",
  "Search Engine": "搜索引擎",
  "Test Search": "测试搜索",
  "Save changes": "保存更改",
  "Working!": "正常工作！",
  "Failed": "彻底失败",

  // Knowledge Base
  "Knowledge Base Management": "知识库管理",
  "Local folders, files, DBs · Unified AI Search": "本地文件·文件夹·数据库·一体化 AI 检索",
  "Add": "添加",
  "Uploaded Files": "上传的文件",
  "Ready": "就绪",
  "Indexing": "索引中",
  "Error": "错误",
  "sources": "个来源",
  "fragments": "个片段",
  "Updated": "更新于",
  "Search in KB": "在知识库中搜索...",
  "No relevant content found.": "没有找到相关内容。",
  "Add Knowledge Base": "添加知识库",
  "Name (Required)": "名称 (必填)",
  "Source Type": "来源类型",
  "Local Directory": "本地目录",
  "Database": "数据库",
  "Path": "路径",
  "Select a folder on the server": "选择服务器上的文件夹",
  "Cancel": "取消",
  "Confirm": "确认",
  
  // Chat
  "Message ClosedUI...": "发送消息...",
  "Search Web": "联网搜索",
  "Think": "深度思考",
  "Stop": "停止",
  "Clear chat": "清空对话",
}

const dictionaries: Record<Language, Translations> = { en, zh }

interface I18nContextType {
  language: Language
  setLanguage: (lang: Language) => void
  t: (key: string, params?: Record<string, string | number>) => string
}

const I18nContext = createContext<I18nContextType>({
  language: "zh", // default to Chinese as per user global rule
  setLanguage: () => {},
  t: (key: string) => key,
})

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>("zh")
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    // Note: To avoid hydration mismatch, we only use the local storage on the client
    const saved = localStorage.getItem("closedui_lang") as Language
    if (saved && (saved === "en" || saved === "zh")) {
      setLanguageState(saved)
    }
    setMounted(true)
  }, [])

  const setLanguage = (lang: Language) => {
    setLanguageState(lang)
    localStorage.setItem("closedui_lang", lang)
  }

  const t = (key: string, params?: Record<string, string | number>): string => {
    let str = dictionaries[language][key] || key
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        str = str.replace(new RegExp(`{{${k}}}`, 'g'), String(v))
      }
    }
    return str
  }

  // Hide until mounted to prevent hydration errors due to text mismatch
  // Actually, standard practice for SSR is to render default, then re-render.
  // We'll let it render default "zh" and hydrate, it might cause a small mismatch warning in React if local storage says "en", but that's typical without a cookie-based approach.

  return (
    <I18nContext.Provider value={{ language, setLanguage, t }}>
      <div style={{ visibility: mounted ? 'visible' : 'hidden', display: 'contents' }}>
        {children}
      </div>
    </I18nContext.Provider>
  )
}

export function useI18n() {
  return useContext(I18nContext)
}
