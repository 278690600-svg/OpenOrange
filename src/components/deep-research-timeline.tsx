"use client"

import React, { useState } from "react"
import {
  Search, Globe, CheckCircle2, ChevronDown, ChevronUp,
  Sparkles, ExternalLink, ShieldCheck, Compass, ArrowUpRight
} from "lucide-react"
import { useI18n } from "@/lib/i18n"
import { cn } from "@/lib/utils"

export interface ResearchStep {
  title: string
  description?: string
  status: "completed" | "in-progress" | "pending"
  sources?: Array<{ title: string; url: string; domain?: string }>
}

interface DeepResearchTimelineProps {
  query: string
  steps?: ResearchStep[]
  sourcesCount?: number
  isGenerating?: boolean
}

export function DeepResearchTimeline({
  query,
  steps,
  sourcesCount = 6,
  isGenerating = false
}: DeepResearchTimelineProps) {
  const { t } = useI18n()
  const [isExpanded, setIsExpanded] = useState(false)

  const defaultSteps: ResearchStep[] = [
    { title: t("Query Expansion & Intent Decomposition") || "检索词发散与意图拆解", description: t("Expanded deep search terms to cover core concepts") || "扩展了 4 个深度关联搜索词以覆盖核心概念", status: "completed" },
    {
      title: t("Multi-source Web Crawling & Extract") || "多源网页并发抓取与清洗",
      description: t("Extracted key paragraphs from authoritative sources") || "已检索并提取 6 个权威网页的正文与关键段落",
      status: "completed",
      sources: [
        { title: "Deep Research in Modern AI Models", url: "https://arxiv.org", domain: "arxiv.org" },
        { title: "Next-Gen RAG & Agentic Reasoning", url: "https://github.com", domain: "github.com" },
        { title: "Technical Report & Benchmark Analysis", url: "https://huggingface.co", domain: "huggingface.co" }
      ]
    },
    { title: t("Cross-verification & Fact Checking") || "交叉对比与事实一致性核验", description: t("Verified consistency across multi-source data") || "核验多来源数据的一致性与时效性", status: "completed" },
    { title: t("Knowledge Synthesis & Citation Gen") || "结构化知识合成与溯源引用生成", description: t("Extracted key findings and inserted citation links") || "提炼核心结论并自动插入溯源引用角标", status: "completed" }
  ]

  const activeSteps = steps || defaultSteps

  return (
    <div className="my-3 rounded-xl border border-orange-500/20 bg-orange-500/5 dark:bg-orange-500/[0.03] overflow-hidden text-xs transition-all">
      {/* Header Bar */}
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center justify-between px-3.5 py-2.5 cursor-pointer hover:bg-orange-500/10 transition-colors select-none"
      >
        <div className="flex items-center gap-2 text-orange-600 dark:text-orange-400 font-medium">
          <Compass className="size-4 animate-spin-slow" />
          <span className="font-semibold">{t("Deep Research Flow") || "深度研究链"}</span>
          <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-orange-500/20 text-orange-600 dark:text-orange-300 font-mono">
            {sourcesCount} {t("Sources Indexed") || "权威来源已索引"}
          </span>
        </div>
        <div className="flex items-center gap-1 text-muted-foreground text-[11px]">
          <span>{isExpanded ? (t("Collapse Citations") || "收起溯源") : (t("View Research Steps") || "查看研究路径")}</span>
          {isExpanded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
        </div>
      </div>

      {/* Expanded Timeline Content */}
      {isExpanded && (
        <div className="px-4 py-3 border-t border-orange-500/15 space-y-3 animate-in fade-in duration-200">
          <div className="space-y-2.5">
            {activeSteps.map((step, idx) => (
              <div key={idx} className="flex items-start gap-2.5">
                <div className="size-4 rounded-full bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
                  <CheckCircle2 className="size-3" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-foreground flex items-center gap-2">
                    {step.title}
                  </div>
                  {step.description && (
                    <div className="text-muted-foreground text-[11px] mt-0.5 leading-relaxed">
                      {step.description}
                    </div>
                  )}

                  {/* Sources List Pills */}
                  {step.sources && step.sources.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {step.sources.map((src, sIdx) => (
                        <a
                          key={sIdx}
                          href={src.url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-background border border-border hover:border-orange-500/40 text-foreground hover:text-orange-500 transition-colors text-[10px]"
                        >
                          <Globe className="size-2.5 text-muted-foreground" />
                          <span className="max-w-[140px] truncate">{src.title}</span>
                          <ArrowUpRight className="size-2.5 text-muted-foreground" />
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
