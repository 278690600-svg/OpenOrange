"use client"

import React, { createContext, useContext, useEffect, useState } from "react"

type Language = "en" | "zh" | "es" | "fr" | "de" | "ja" | "ko"

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
  "Appearance": "Appearance",
  "Language": "Language",
  "Search chats": "Search chats...",
  "All time": "All time",
  "Last 7 Days": "Last 7 Days",
  "Last 30 Days": "Last 30 Days",
  "Custom Range": "Custom Range",
  "Select Date Range": "Select Date Range",
  "Start Date": "Start Date",
  "End Date": "End Date",
  "Apply": "Apply",
  "Clear filter": "Clear filter",
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
  "MCP Servers": "MCP Servers",
  "MCP Server": "MCP Server",
  "Add Server": "Add Server",
  "Server Name": "Server Name",
  "Type": "Type",
  "Command": "Command",
  "Arguments (JSON array)": "Arguments (JSON array)",
  "URL (for SSE)": "URL (for SSE)",
  "Environment Variables (JSON)": "Environment Variables (JSON)",
  "Enabled": "Enabled",
  "Market": "Market",
  "Model Market": "Model Market",
  "Search Models": "Search Models",
  "My Servers": "My Servers",
  "Search Servers": "Search Servers",
  "Install": "Install",
  "Visit Homepage": "Visit Homepage",
  "Registry": "Registry",
  "Installing...": "Installing...",
  "Installed": "Installed",
  "Add to My Servers": "Add to My Servers",
  "Source": "Source",
  "GitHub": "GitHub",
  "ModelScope": "ModelScope",
  "Smithery": "Smithery",
  "Glama": "Glama",
  "Edit": "Edit",
  "Delete": "Delete",
  "Save Server": "Save Server",
  "No MCP servers configured.": "No MCP servers configured.",
  "Local GGUF Models": "Local GGUF Models",
  "To use local models, place your .gguf files in the following directory. They will appear in the model list automatically.": "To use local models, place your .gguf files in the following directory. They will appear in the model list automatically.",
  "Supports pure CPU inference. GPU acceleration is handled automatically.": "Supports pure CPU inference. GPU acceleration is handled automatically.",
  "Providers": "Providers",
  "Local GGUF": "Local GGUF",
  "Agent": "Agent",
  "Force Eject from VRAM": "Force Eject from VRAM",
  "Releasing...": "Releasing...",
  "Standby": "Standby",
  "Loaded in VRAM": "Loaded in VRAM",
  "Current Status": "Current Status",
  "Engine Status": "Engine Status",
  "Inference Parameters": "Inference Parameters",
  "Context Size": "Context Size",
  "Max Tokens": "Max Tokens",
  "Temperature": "Temperature",
  "Global Temperature": "Global Temperature",
  "Repeat Penalty": "Repeat Penalty",
  "Model Parameters": "Model Parameters",
  "Context Length": "Context Length",
  "Tools": "Tools",
  "Resources": "Resources",
  "Prompts": "Prompts",
  "Are you sure you want to delete this model?": "Are you sure you want to delete this model?",
  "No local models found": "No local models found",
  "No servers added yet": "No servers added yet",
  "Browse Market": "Browse Market",
  "Downloaded Models": "Downloaded Models",
  "Search for models on Hugging Face": "Search for models on Hugging Face",
  "No relevant content found.": "No relevant content found.",
  "Failed to load details": "Failed to load details",



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
  "Message OpenOrangeAI...": "Message OpenOrangeAI...",
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
  "Appearance": "外观设置",
  "Language": "语言",
  "Search chats": "搜索对话...",
  "All time": "不限时间",
  "Last 7 Days": "过去 7 天",
  "Last 30 Days": "过去 30 天",
  "Custom Range": "自定义范围",
  "Select Date Range": "选择日期范围",
  "Start Date": "开始日期",
  "End Date": "结束日期",
  "Apply": "应用",
  "Clear filter": "清除筛选",
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
  "MCP Servers": "MCP 服务器",
  "MCP Server": "MCP 服务",
  "Add Server": "添加服务器",
  "Server Name": "服务器名称",
  "Type": "类型",
  "Command": "命令",
  "Arguments (JSON array)": "参数 (JSON 数组)",
  "URL (for SSE)": "URL (适用于 SSE)",
  "Environment Variables (JSON)": "环境变量 (JSON)",
  "Enabled": "已启用",
  "Market": "市场",
  "Model Market": "模型市场",
  "Search Models": "搜索模型",
  "My Servers": "我的服务",
  "Search Servers": "搜索服务",
  "Install": "安装",
  "Visit Homepage": "访问主页",
  "Registry": "注册表",
  "Installing...": "安装中...",
  "Installed": "已安装",
  "Add to My Servers": "添加到我的服务",
  "Source": "来源",
  "GitHub": "GitHub",
  "ModelScope": "魔搭社区",
  "Smithery": "Smithery",
  "Edit": "编辑",
  "Delete": "删除",
  "Save Server": "保存服务器",
  "No MCP servers configured.": "未配置 MCP 服务器。",
  "Local GGUF Models": "本地 GGUF 模型",
  "To use local models, place your .gguf files in the following directory. They will appear in the model list automatically.": "要使用本地模型，请将您的 .gguf 文件放入以下目录中。它们将自动出现在模型列表中。",
  "Supports pure CPU inference. GPU acceleration is handled automatically.": "支持纯 CPU 推理。GPU 加速会自动处理。",
  "Enable Local GGUF Engine": "启用本地 GGUF 引擎 (实验性)",
  "Disable this to save memory and speed up development.": "关闭此项可释放内存并大幅提升构建速度。",
  "Providers": "服务商",
  "Local GGUF": "本地 GGUF",
  "Force Eject from VRAM": "强制释放显存",
  "Releasing...": "释放中...",
  "Standby": "待命中",
  "Loaded in VRAM": "已读入显存",
  "Current Status": "当前状态",
  "Engine Status": "引擎状态",
  "Inference Parameters": "推理参数",
  "Context Size": "上下文长度",
  "Max Tokens": "最大 Token",
  "Temperature": "温度 (Temperature)",
  "Global Temperature": "全局温度 (Temperature)",
  "Repeat Penalty": "重复惩罚 (Repeat Penalty)",
  "Model Parameters": "模型参数设置",
  "Context Length": "上下文限制 (Context)",
  "Tools": "工具",
  "Resources": "资源",
  "Prompts": "提示词",
  "Are you sure you want to delete this model?": "确定要删除这个模型吗？",
  "No local models found": "未找到本地模型",
  "No servers added yet": "尚未添加服务器",
  "Browse Market": "前往市场浏览",
  "Downloaded Models": "已下载模型",
  "Search for models on Hugging Face": "从 Hugging Face 搜寻模型",
  "No relevant content found.": "未找到相关内容。",
  "Failed to load details": "加载详情失败",



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
  "Message OpenOrangeAI...": "发送消息...",
  "Search Web": "联网搜索",
  "Think": "深度思考",
  "Stop": "停止",
  "Clear chat": "清空对话",
}

const es: Translations = { "New Chat": "Nuevo Chat", "Settings": "Ajustes", "Language": "Idioma", "Appearance": "Apariencia", "Save changes": "Guardar cambios", "General": "General" }
const fr: Translations = { "New Chat": "Nouveau Chat", "Settings": "Paramètres", "Language": "Langue", "Appearance": "Apparence", "Save changes": "Enregistrer", "General": "Général" }
const de: Translations = { "New Chat": "Neuer Chat", "Settings": "Einstellungen", "Language": "Sprache", "Appearance": "Erscheinungsbild", "Save changes": "Speichern", "General": "Allgemein" }
const ja: Translations = { "New Chat": "新しいチャット", "Settings": "設定", "Language": "言語", "Appearance": "外観", "Save changes": "変更を保存", "General": "一般" }
const ko: Translations = { "New Chat": "새 채팅", "Settings": "설정", "Language": "언어", "Appearance": "모양", "Save changes": "변경 사항 저장", "General": "일반" }

const dictionaries: Record<Language, Translations> = { en, zh, es, fr, de, ja, ko }

interface I18nContextType {
  language: Language
  setLanguage: (lang: Language) => void
  t: (key: string, params?: Record<string, string | number>) => string
}

const I18nContext = createContext<I18nContextType>({
  language: "en", 
  setLanguage: () => {},
  t: (key: string) => key,
})

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>("en")
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem("closedui_lang") as Language
    const supported = ["en", "zh", "es", "fr", "de", "ja", "ko"]
    if (saved && supported.includes(saved)) {
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
