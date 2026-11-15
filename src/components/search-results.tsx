"use client"

import { ExternalLink, Globe, Search, ChevronDown, ChevronUp } from "lucide-react"
import { useState } from "react"
import { useI18n } from "@/lib/i18n"

interface Citation {
  title: string
  url: string
}

export function SearchResults({ citations }: { citations: Citation[] }) {
  const { t } = useI18n()
  const [isExpanded, setIsExpanded] = useState(false)

  if (!citations || citations.length === 0) return null

  // Extract favicons
  const favicons = citations.slice(0, 5).map(c => {
    try {
      const url = new URL(c.url)
      return `https://icon.horse/icon/${url.hostname}`
    } catch {
      return null
    }
  }).filter(Boolean)

  return (
    <div className="mb-6 w-full animate-in fade-in slide-in-from-top-2 duration-500">
      {/* Search Status Header (Perplexity/DeepSeek Style) */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-3 w-full p-2.5 rounded-2xl bg-zinc-50/50 dark:bg-zinc-900/30 border border-zinc-200/50 dark:border-zinc-800/50 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all duration-300 group text-left"
      >
        <div className="size-5 rounded-full bg-indigo-500/10 flex items-center justify-center shrink-0">
          <Search className="size-3 text-indigo-600 dark:text-indigo-400" />
        </div>
        
        <div className="flex-1 flex items-center gap-2 overflow-hidden">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300 whitespace-nowrap">
            {t("Read {{count}} pages", { count: citations.length })}
          </span>
          
          <div className="flex -space-x-1.5 overflow-hidden py-1">
            {favicons.map((src, i) => (
              <div 
                key={i} 
                className="size-5 rounded-full border border-white dark:border-zinc-950 bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center overflow-hidden shrink-0 shadow-sm"
              >
                <img src={src!} alt="site" className="size-3.5 object-contain" />
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-1.5 text-zinc-400 group-hover:text-zinc-600 dark:group-hover:text-zinc-300 transition-colors">
          {isExpanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
        </div>
      </button>

      {/* Detailed Cards (Collapsible) */}
      {isExpanded && (
        <div className="mt-3 animate-in fade-in zoom-in-95 duration-300 origin-top">
          <div className="flex gap-3 overflow-x-auto pb-4 app-scrollbar snap-x no-scrollbar scroll-smooth px-1">
            {citations.map((c, i) => {
              let hostname = ""
              try {
                hostname = new URL(c.url).hostname.replace('www.', '')
              } catch {
                hostname = "source"
              }

              return (
                <a
                  key={i}
                  href={c.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-none w-56 p-4 rounded-2xl border border-zinc-200/80 dark:border-zinc-800/80 bg-white/50 dark:bg-zinc-900/40 backdrop-blur-sm hover:border-indigo-500/40 hover:bg-white dark:hover:bg-zinc-800 hover:shadow-xl hover:shadow-indigo-500/5 transition-all duration-300 group snap-start"
                >
                  <div className="flex items-center gap-2.5 mb-2.5">
                    <div className="size-5 rounded-lg bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center shrink-0 border border-zinc-200 dark:border-zinc-700 group-hover:bg-indigo-50 dark:group-hover:bg-indigo-900/20 group-hover:border-indigo-200 dark:group-hover:border-indigo-800/50 transition-colors">
                      <Globe className="size-3 text-zinc-500 group-hover:text-indigo-600 dark:group-hover:text-indigo-400" />
                    </div>
                    <div className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400 truncate uppercase tracking-widest">
                      {hostname}
                    </div>
                  </div>
                  
                  <div className="text-[13px] font-semibold text-zinc-800 dark:text-zinc-200 line-clamp-2 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 leading-tight min-h-[2.5rem]">
                    {c.title}
                  </div>
                  
                  <div className="mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-mono text-indigo-500 dark:text-indigo-400 font-bold bg-indigo-50 dark:bg-indigo-500/10 px-1.5 py-0.5 rounded leading-none">
                        {i + 1}
                      </span>
                    </div>
                    <ExternalLink className="size-3 text-zinc-300 group-hover:text-indigo-500/70 transition-colors" />
                  </div>
                </a>
              )
            })}
            <div className="flex-none w-4" />
          </div>
        </div>
      )}
    </div>
  )
}
