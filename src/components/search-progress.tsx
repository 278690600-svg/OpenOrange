"use client"

import { ExternalLink, Globe, Search, ChevronDown, ChevronUp, Check, Loader2, BookOpen, Sparkles, AlertCircle, Wrench } from "lucide-react"
import { useState, useEffect } from "react"
import type { StatusEvent, Citation } from "@/hooks/use-sse-chat"

interface SearchProgressProps {
  steps: StatusEvent[]
  citations: Citation[]
  isActive: boolean
}

const STAGE_CONFIG: Record<string, { icon: any; label: string; color: string }> = {
  'intent': { icon: Sparkles, label: '分析搜索意图', color: 'text-amber-500' },
  'skip': { icon: Check, label: '无需搜索', color: 'text-zinc-400' },
  'rewrite': { icon: Sparkles, label: '优化搜索关键词', color: 'text-blue-500' },
  'rewrite_done': { icon: Check, label: '关键词已优化', color: 'text-blue-500' },
  'searching': { icon: Search, label: '正在搜索', color: 'text-primary' },
  'found': { icon: Check, label: '找到结果', color: 'text-emerald-500' },
  'reading': { icon: BookOpen, label: '阅读网页内容', color: 'text-amber-500' },
  'read_page': { icon: BookOpen, label: '已阅读', color: 'text-amber-500' },
  'done': { icon: Check, label: '操作完成', color: 'text-emerald-500' },
  'error': { icon: AlertCircle, label: '发生错误', color: 'text-red-500' },
  'loading': { icon: Loader2, label: '正在加载工具...', color: 'text-zinc-500' },
  'call': { icon: Wrench, label: '调用工具', color: 'text-primary' },
}

export function SearchProgress({ steps, citations, isActive }: SearchProgressProps) {
  const [expanded, setExpanded] = useState(true)
  const [showResults, setShowResults] = useState(false)

  const latestStep = steps[steps.length - 1]
  const isDone = latestStep?.stage === 'done' || latestStep?.stage === 'skip'
  const hasError = latestStep?.stage === 'error'

  // Auto-collapse when done
  useEffect(() => {
    if (isDone && !hasError) {
      const timer = setTimeout(() => setExpanded(false), 1000)
      return () => clearTimeout(timer)
    }
  }, [isDone, hasError])

  if (steps.length === 0 && citations.length === 0) return null

  // Extract found results from steps
  const foundResults = steps.find(s => s.stage === 'found')?.results || []

  return (
    <div className="search-progress-container">
      {/* Main search status bar */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="search-progress-header"
      >
        <div className={`search-progress-icon ${isDone ? 'search-done' : isActive ? 'search-active' : ''}`}>
          {isActive && !isDone ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : isDone ? (
            <Check className="size-3.5" />
          ) : (
            <Search className="size-3.5" />
          )}
        </div>

        <div className="search-progress-info">
          <span className="search-progress-label">
            {isDone
              ? `已搜索 ${citations.length || foundResults.length} 个来源`
              : latestStep?.message || '准备搜索...'}
          </span>

          {/* Favicon strip */}
          {(citations.length > 0 || foundResults.length > 0) && (
            <div className="search-favicon-strip">
              {(citations.length > 0 ? citations : foundResults).slice(0, 5).map((c, i) => {
                try {
                  const hostname = new URL(c.url).hostname
                  return (
                    <div key={i} className="search-favicon">
                      <img
                        src={`https://www.google.com/s2/favicons?domain=${hostname}&sz=32`}
                        alt=""
                        className="size-3.5 object-contain"
                      />
                    </div>
                  )
                } catch {
                  return null
                }
              })}
            </div>
          )}
        </div>

        <div className="search-progress-toggle">
          {expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
        </div>
      </button>

      {/* Expanded: steps timeline */}
      {expanded && (
        <div className="search-steps-timeline">
          {steps.map((step, i) => {
            const config = STAGE_CONFIG[step.stage] || { icon: Search, label: step.stage, color: 'text-zinc-400' }
            const StepIcon = config.icon
            const isLast = i === steps.length - 1
            const isStepActive = isLast && isActive && !isDone

            return (
              <div key={i} className={`search-step ${isStepActive ? 'search-step-active' : ''}`}>
                <div className={`search-step-icon ${config.color}`}>
                  {isStepActive ? (
                    <Loader2 className="size-3 animate-spin" />
                  ) : (
                    <StepIcon className="size-3" />
                  )}
                </div>
                <span className="search-step-text">{step.message}</span>
              </div>
            )
          })}
        </div>
      )}

      {/* Citations cards */}
      {citations.length > 0 && (
        <div className="search-citations-section">
          <button
            onClick={() => setShowResults(!showResults)}
            className="search-citations-toggle"
          >
            <Globe className="size-3.5" />
            <span>查看 {citations.length} 个来源</span>
            {showResults ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
          </button>

          {showResults && (
            <div className="search-citations-grid">
              {citations.map((c, i) => {
                let hostname = ''
                try {
                  hostname = new URL(c.url).hostname.replace('www.', '')
                } catch {
                  hostname = 'source'
                }

                return (
                  <a
                    key={i}
                    href={c.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="search-citation-card"
                  >
                    <div className="search-citation-header">
                      <div className="search-citation-favicon">
                        <img
                          src={`https://www.google.com/s2/favicons?domain=${hostname}&sz=32`}
                          alt=""
                          className="size-4 object-contain"
                        />
                      </div>
                      <span className="search-citation-domain">{hostname}</span>
                      <span className="search-citation-index bg-primary/10 text-primary font-bold">{i + 1}</span>
                    </div>
                    <div className="search-citation-title">{c.title}</div>
                    <div className="search-citation-footer">
                      <ExternalLink className="size-3" />
                    </div>
                  </a>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
