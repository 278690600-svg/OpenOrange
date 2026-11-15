"use client"

import { ExternalLink, Globe, Search, ChevronDown, ChevronUp, Check, Loader2, BookOpen, Sparkles, AlertCircle, Wrench, Cpu } from "lucide-react"
import { useState, useEffect } from "react"
import type { StatusEvent, Citation } from "@/hooks/use-sse-chat"
import { useI18n } from "@/lib/i18n"

interface SearchProgressProps {
  steps: StatusEvent[]
  citations: Citation[]
  isActive: boolean
}

const STAGE_CONFIG: Record<string, { icon: React.ComponentType<{ className?: string }>; labelKey: string; color: string }> = {
  'intent': { icon: Sparkles, labelKey: 'Analyze search intent', color: 'text-amber-500' },
  'skip': { icon: Check, labelKey: 'No search needed', color: 'text-zinc-400' },
  'rewrite': { icon: Sparkles, labelKey: 'Extract keywords', color: 'text-blue-500' },
  'rewrite_done': { icon: Check, labelKey: 'Keywords extracted', color: 'text-blue-500' },
  'searching': { icon: Search, labelKey: 'Searching', color: 'text-primary' },
  'found': { icon: Check, labelKey: 'Found results', color: 'text-emerald-500' },
  'reading': { icon: BookOpen, labelKey: 'Reading web content', color: 'text-amber-500' },
  'read_page': { icon: BookOpen, labelKey: 'Read', color: 'text-amber-500' },
  'done': { icon: Check, labelKey: 'Operation complete', color: 'text-emerald-500' },
  'error': { icon: AlertCircle, labelKey: 'Error occurred', color: 'text-red-500' },
  'loading': { icon: Loader2, labelKey: 'Loading...', color: 'text-zinc-500' },
  'call': { icon: Wrench, labelKey: 'Call tool', color: 'text-primary' },
  'result': { icon: Check, labelKey: 'Tool returned result', color: 'text-emerald-500' },
  // model_load stages
  'compiling': { icon: Cpu, labelKey: 'Init engine', color: 'text-violet-500' },
  'context': { icon: Cpu, labelKey: 'Create context', color: 'text-violet-500' },
  'ready': { icon: Check, labelKey: 'Model ready', color: 'text-emerald-500' },
}

/** Renders a model loading progress bar */
function ModelLoadProgress({ steps, isActive }: { steps: StatusEvent[]; isActive: boolean }) {
  const { t } = useI18n()
  const latestModelStep = [...steps].reverse().find(s => s.type === 'model_load')
  if (!latestModelStep) return null

  const stage = latestModelStep.stage as string
  const progress = latestModelStep.progress ?? 0
  const isReady = stage === 'ready'
  const isError = stage === 'error'
  const isLoading = stage === 'loading'

  // Stage labels for the timeline
  const stages = [
    { key: 'compiling', label: t('Engine init') },
    { key: 'loading', label: t('Model load') },
    { key: 'context', label: t('Context') },
    { key: 'ready', label: t('Ready') },
  ]
  const stageOrder = stages.map(s => s.key)
  const currentStageIdx = isError ? -1 : stageOrder.indexOf(stage)

  return (
    <div className="mb-3 p-3 rounded-xl border border-violet-200 dark:border-violet-900/40 bg-violet-50/60 dark:bg-violet-950/20">
      <div className="flex items-center gap-2 mb-2.5">
        <div className={`p-1.5 rounded-lg ${isReady ? 'bg-emerald-100 dark:bg-emerald-900/30' : isError ? 'bg-red-100 dark:bg-red-900/30' : 'bg-violet-100 dark:bg-violet-900/30'}`}>
          {isActive && !isReady && !isError ? (
            <Loader2 className="size-3.5 animate-spin text-violet-500" />
          ) : isReady ? (
            <Check className="size-3.5 text-emerald-500" />
          ) : isError ? (
            <AlertCircle className="size-3.5 text-red-500" />
          ) : (
            <Cpu className="size-3.5 text-violet-500" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold text-violet-700 dark:text-violet-300">
            {latestModelStep.modelName ? `${t('Local model')}: ${latestModelStep.modelName}` : t('Local model')}
          </div>
          <div className="text-[10px] text-zinc-500 truncate">{latestModelStep.message}</div>
        </div>
        {isLoading && <span className="text-xs font-mono text-violet-600 dark:text-violet-400 tabular-nums">{progress}%</span>}
      </div>

      {/* Progress bar for loading stage */}
      {(isLoading || (stage === 'context')) && (
        <div className="mb-2 h-1.5 w-full bg-violet-200 dark:bg-violet-900/50 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-violet-500 to-indigo-500 rounded-full transition-all duration-300"
            style={{ width: `${isLoading ? progress : 100}%` }}
          />
        </div>
      )}

      {/* Stage dots */}
      {!isError && (
        <div className="flex items-center gap-1">
          {stages.map((s, i) => {
            const done = currentStageIdx > i || isReady
            const active = currentStageIdx === i && !isReady
            return (
              <div key={s.key} className="flex items-center gap-1 flex-1">
                <div className="flex flex-col items-center gap-0.5">
                  <div className={`size-2 rounded-full transition-colors ${done || active ? (done ? 'bg-emerald-500' : 'bg-violet-500 animate-pulse') : 'bg-zinc-300 dark:bg-zinc-700'}`} />
                  <span className={`text-[8px] whitespace-nowrap ${active ? 'text-violet-500 font-semibold' : done ? 'text-emerald-500' : 'text-zinc-400'}`}>{s.label}</span>
                </div>
                {i < stages.length - 1 && (
                  <div className={`h-px flex-1 mb-3 transition-colors ${done ? 'bg-emerald-300 dark:bg-emerald-700' : 'bg-zinc-200 dark:bg-zinc-700'}`} />
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function SearchProgress({ steps, citations, isActive }: SearchProgressProps) {
  const { t } = useI18n()
  const [expanded, setExpanded] = useState(true)
  const [showResults, setShowResults] = useState(false)

  // Separate model load events from search/mcp events
  const modelSteps = steps.filter(s => s.type === 'model_load')
  const otherSteps = steps.filter(s => s.type !== 'model_load')

  const latestStep = otherSteps[otherSteps.length - 1]
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
  const foundResults = otherSteps.find(s => s.stage === 'found')?.results || []

  return (
    <div className="search-progress-container">
      {/* Model loading progress (rendered above search steps) */}
      {modelSteps.length > 0 && (
        <ModelLoadProgress steps={modelSteps} isActive={isActive} />
      )}

      {/* Main search status bar - only when there are non-model steps */}
      {otherSteps.length > 0 && (
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
                ? t('Searched {{count}} sources', { count: citations.length || foundResults.length })
                : latestStep?.message || t('Loading...')}
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
                          src={`https://icon.horse/icon/${hostname}`}
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
      )}

      {/* Expanded: steps timeline */}
      {expanded && otherSteps.length > 0 && (
        <div className="search-steps-timeline">
          {otherSteps.map((step, i) => {
            const config = STAGE_CONFIG[step.stage] || { icon: Search, labelKey: step.stage, color: 'text-zinc-400' }
            const StepIcon = config.icon
            const isLast = i === otherSteps.length - 1
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
                <div className="flex-1 min-w-0">
                  <span className="search-step-text">{step.message}</span>
                  {/* MCP tool result details */}
                  {step.type === 'mcp' && step.stage === 'call' && step.url && (
                    <div className="mt-1 text-[11px] text-zinc-500">
                      <a href={step.url} target="_blank" rel="noopener noreferrer" className="hover:text-blue-500 break-all">
                        {step.url}
                      </a>
                    </div>
                  )}
                  {step.type === 'mcp' && step.stage === 'result' && step.result && (
                    <div className="mt-1 text-[11px] text-zinc-400 max-h-20 overflow-y-auto font-mono bg-zinc-50 dark:bg-zinc-800/50 rounded px-2 py-1">
                      {step.result}
                    </div>
                  )}
                  {step.type === 'mcp' && step.stage === 'result' && step.completedUrl && (
                    <div className="mt-1 text-[11px] text-blue-500">
                      {t('Opened:')} <a href={step.completedUrl} target="_blank" rel="noopener noreferrer" className="hover:underline break-all">{step.completedUrl}</a>
                    </div>
                  )}
                  {step.type === 'mcp' && step.stage === 'result' && step.pageTitle && (
                    <div className="mt-1 text-[11px] text-emerald-600 dark:text-emerald-400">
                      {t('Page title:')} {step.pageTitle}
                    </div>
                  )}
                </div>
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
            <span>{t('View {{count}} sources', { count: citations.length })}</span>
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
                          src={`https://icon.horse/icon/${hostname}`}
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
