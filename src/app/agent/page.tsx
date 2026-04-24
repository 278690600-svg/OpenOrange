"use client"

import { useState, useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { Bot, Terminal, Globe, Search, Check, X, Clock, ArrowRight, Send, StopCircle, RotateCcw, Copy, Monitor, MousePointer, Type, FileText, Zap, Eye, ChevronDown, ChevronRight, Layers } from "lucide-react"
import { useAgent, AgentAction } from "@/hooks/use-agent"
import { MessageRenderer } from "@/components/message-renderer"

function getActionIcon(action: AgentAction) {
  switch (action.type) {
    case 'tool-call':
      if (action.tool?.includes('browser') || action.tool?.includes('navigate')) return Globe
      if (action.tool?.includes('search')) return Search
      if (action.tool?.includes('screenshot')) return Monitor
      if (action.tool?.includes('click')) return MousePointer
      if (action.tool?.includes('type')) return Type
      if (action.tool?.includes('file')) return FileText
      return Zap
    case 'tool-result':
      return Check
    case 'agent-message':
      return Bot
    case 'error':
      return X
    default:
      return Clock
  }
}

function getActionColor(action: AgentAction) {
  switch (action.type) {
    case 'tool-call':
      return 'text-blue-500 bg-blue-50 dark:bg-blue-900/20'
    case 'tool-result':
      return 'text-emerald-500 bg-emerald-50 dark:bg-emerald-900/20'
    case 'agent-message':
      return 'text-violet-500 bg-violet-50 dark:bg-violet-900/20'
    case 'error':
      return 'text-red-500 bg-red-50 dark:bg-red-900/20'
    default:
      return 'text-zinc-500 bg-zinc-50 dark:bg-zinc-900/20'
  }
}

function ActionItem({ action }: { action: AgentAction }) {
  const [expanded, setExpanded] = useState(false)
  const Icon = getActionIcon(action)
  const colorClass = getActionColor(action)
  const time = new Date(action.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

  return (
    <div className="group">
      {/* Timeline line */}
      <div className="flex gap-3">
        {/* Timeline dot and line */}
        <div className="flex flex-col items-center">
          <div className={`size-6 rounded-full flex items-center justify-center ${colorClass} shrink-0`}>
            <Icon className="size-3" />
          </div>
          <div className="w-px h-full bg-zinc-200 dark:bg-zinc-700 min-h-[2rem] my-1" />
        </div>

        {/* Content */}
        <div className="flex-1 pb-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{action.message}</span>
            <span className="text-[10px] text-zinc-400">{time}</span>
          </div>

          {/* Tool call details */}
          {action.type === 'tool-call' && action.data && (
            <div className="mt-2 space-y-1">
              {action.data.url && (
                <a href={action.data.url} target="_blank" rel="noopener noreferrer" 
                  className="text-xs text-blue-500 hover:underline break-all">
                  {action.data.url}
                </a>
              )}
              {action.data.query && (
                <div className="text-xs text-zinc-500">
                  搜索: {action.data.query}
                </div>
              )}
              {action.data.args && Object.keys(action.data.args).length > 0 && (
                <button 
                  onClick={() => setExpanded(!expanded)}
                  className="text-xs text-zinc-400 hover:text-zinc-600 flex items-center gap-1"
                >
                  {expanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
                  查看参数
                </button>
              )}
              {expanded && action.data.args && (
                <pre className="text-[10px] text-zinc-500 bg-zinc-50 dark:bg-zinc-800/50 rounded p-2 mt-1 overflow-x-auto font-mono">
                  {JSON.stringify(action.data.args, null, 2)}
                </pre>
              )}
            </div>
          )}

          {/* Tool result details */}
          {action.type === 'tool-result' && action.data && (
            <div className="mt-2 space-y-2">
              {/* URL results */}
              {action.data.items && action.data.items.length > 0 && (
                <div className="space-y-1.5">
                  {action.data.items.map((item: any, i: number) => (
                    <div key={i} className="text-xs p-2 bg-zinc-50 dark:bg-zinc-800/50 rounded-lg">
                      <div className="font-medium text-zinc-700 dark:text-zinc-300">{item.title}</div>
                      {item.url && (
                        <a href={item.url} target="_blank" rel="noopener noreferrer" 
                          className="text-blue-500 hover:underline break-all text-[11px]">
                          {item.url}
                        </a>
                      )}
                      {item.snippet && (
                        <div className="text-zinc-500 mt-0.5 line-clamp-2">{item.snippet}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              
              {/* Page info */}
              {action.data.completedUrl && (
                <div className="text-xs text-emerald-600 dark:text-emerald-400">
                  <Eye className="size-3 inline mr-1" />
                  已打开: {action.data.completedUrl}
                </div>
              )}
              {action.data.pageTitle && (
                <div className="text-xs text-zinc-600 dark:text-zinc-400">
                  页面: {action.data.pageTitle}
                </div>
              )}
              
              {/* Raw result */}
              {action.data.result && !action.data.items && (
                <div className="text-xs text-zinc-500 bg-zinc-50 dark:bg-zinc-800/50 rounded p-2 max-h-40 overflow-y-auto font-mono whitespace-pre-wrap">
                  {action.data.result}
                </div>
              )}
            </div>
          )}

          {/* Agent message */}
          {action.type === 'agent-message' && (
            <div className="mt-2">
              <MessageRenderer 
                content={action.message} 
                role="assistant" 
                isStreaming={action.data?.streaming}
                isThinking={false}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const SUGGESTIONS = [
  { icon: Globe, label: "打开百度新闻", prompt: "帮我打开百度新闻" },
  { icon: Search, label: "搜索今日热点", prompt: "搜索今天的热点新闻" },
  { icon: Monitor, label: "截屏", prompt: "帮我截图当前浏览器页面" },
  { icon: FileText, label: "查找文件", prompt: "帮我搜索最近的文档" },
]

export default function AgentPage() {
  const router = useRouter()
  const [selectedModel, setSelectedModel] = useState("ollama::llama3")
  const [models, setModels] = useState<any[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)
  
  const { actions, isRunning, error, inputValue, setInputValue, send, stop, clear } = useAgent()

  useEffect(() => {
    fetch('/api/models')
      .then(r => r.json())
      .then(data => setModels(data || []))
      .catch(() => {})
  }, [])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [actions, isRunning])

  const handleSend = () => {
    if (!inputValue.trim() || isRunning) return
    send(inputValue.trim(), selectedModel)
    setInputValue('')
  }

  const handleSuggestion = (prompt: string) => {
    send(prompt, selectedModel)
  }

  return (
    <div className="flex flex-col h-full bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950">
        <div className="flex items-center gap-3">
          <div className="size-8 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
            <Bot className="size-4 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <h1 className="text-lg font-bold">Agent 模式</h1>
            <p className="text-xs text-zinc-500">自动化执行 · 多轮交互 · 结果确认</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={selectedModel}
            onChange={(e) => setSelectedModel(e.target.value)}
            className="text-xs px-2 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 border-none outline-none"
          >
            {models.map((m: any) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
          {actions.length > 0 && !isRunning && (
            <button
              onClick={clear}
              className="text-xs px-3 py-1.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors flex items-center gap-1"
            >
              <RotateCcw className="size-3" /> 清空
            </button>
          )}
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto">
        {actions.length === 0 ? (
          <div className="flex flex-col items-center justify-center min-h-full px-4 py-16">
            <div className="size-16 rounded-2xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mb-6">
              <Bot className="size-8 text-amber-600 dark:text-amber-400" />
            </div>
            <h2 className="text-2xl font-bold mb-2">Agent 模式</h2>
            <p className="text-zinc-500 dark:text-zinc-400 mb-8 text-center max-w-md text-sm">
              Agent 会帮你执行浏览器操作、搜索、文件管理等任务，并在每一步后询问你的下一步指令。
            </p>
            <div className="grid grid-cols-2 gap-3 max-w-lg w-full">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s.label}
                  onClick={() => handleSuggestion(s.prompt)}
                  className="flex items-center gap-3 p-4 rounded-xl border border-zinc-200 dark:border-zinc-700 hover:border-amber-300 dark:hover:border-amber-700 hover:bg-amber-50 dark:hover:bg-amber-900/10 transition-all text-left"
                >
                  <div className="size-8 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center shrink-0">
                    <s.icon className="size-4 text-amber-600 dark:text-amber-400" />
                  </div>
                  <span className="text-sm font-medium">{s.label}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto px-6 py-6">
            {/* Action Timeline */}
            <div className="space-y-0">
              {actions.map((action) => (
                <ActionItem key={action.id} action={action} />
              ))}
            </div>
            <div ref={messagesEndRef} className="h-4" />
          </div>
        )}
      </div>

      {/* Input Area */}
      <div className="px-6 pb-6 pt-2 border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950">
        <div className="max-w-3xl mx-auto">
          {error && (
            <div className="mb-3 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-sm">
              {error}
            </div>
          )}
          <div className="flex items-end gap-2 p-2 rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/50 focus-within:border-amber-400 dark:focus-within:border-amber-600 transition-colors">
            <Terminal className="size-5 text-zinc-400 ml-2 mt-2.5 shrink-0" />
            <textarea
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleSend()
                }
              }}
              placeholder={isRunning ? "Agent 执行中..." : "告诉 Agent 要做什么..."}
              rows={1}
              disabled={isRunning}
              className="flex-1 bg-transparent resize-none outline-none text-sm py-2.5 px-1 min-h-[40px] max-h-32"
            />
            <button
              onClick={isRunning ? stop : handleSend}
              disabled={!inputValue.trim() && !isRunning}
              className={`size-9 rounded-xl flex items-center justify-center shrink-0 transition-all ${
                isRunning
                  ? 'bg-red-500 hover:bg-red-600 text-white'
                  : inputValue.trim()
                    ? 'bg-amber-500 hover:bg-amber-600 text-white shadow-lg shadow-amber-500/20'
                    : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-400 cursor-not-allowed'
              }`}
            >
              {isRunning ? <StopCircle className="size-5" /> : <Send className="size-4" />}
            </button>
          </div>
          <p className="text-[10px] text-zinc-400 mt-2 text-center">
            Agent 会执行浏览器操作，请谨慎使用。按 Enter 发送，Shift+Enter 换行。
          </p>
        </div>
      </div>
    </div>
  )
}
