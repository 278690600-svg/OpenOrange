"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { Search, FileText, MessageSquare, Clock, Hash, ArrowRight, Loader2, X, Eye, Filter } from "lucide-react"
import { useI18n } from "@/lib/i18n"

interface SearchResult {
  id: string
  type: "message" | "file" | "document"
  title: string
  content: string
  timestamp: string
  relevance: number
  highlights: string[]
}

interface SearchFilters {
  type: "all" | "message" | "file" | "document"
  dateRange: "all" | "today" | "week" | "month"
}

export function SearchPanel() {
  const { t } = useI18n()
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [recentSearches, setRecentSearches] = useState<string[]>([])
  const [showFilters, setShowFilters] = useState(false)
  const [filters, setFilters] = useState<SearchFilters>({
    type: "all",
    dateRange: "all"
  })
  const [selectedResult, setSelectedResult] = useState<SearchResult | null>(null)

  useEffect(() => {
    const saved = localStorage.getItem("recent-searches")
    if (saved) {
      try {
        setRecentSearches(JSON.parse(saved).slice(0, 5))
      } catch (e) {
        console.error("Failed to parse recent searches:", e)
      }
    }
  }, [])

  const handleSearch = useCallback(async () => {
    if (!query.trim()) return

    setSearching(true)
    setSelectedResult(null)

    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(query)}&type=${filters.type}&dateRange=${filters.dateRange}`)
      const data = await res.json()
      setResults(data.results || [])

      const updated = [query, ...recentSearches.filter(s => s !== query)].slice(0, 5)
      setRecentSearches(updated)
      localStorage.setItem("recent-searches", JSON.stringify(updated))
    } catch (err) {
      console.error("Search failed:", err)
    } finally {
      setSearching(false)
    }
  }, [query, filters])

  useEffect(() => {
    const timer = setTimeout(() => {
      if (query.trim()) {
        handleSearch()
      } else {
        setResults([])
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [query, filters])

  const highlightText = (text: string, highlights: string[]) => {
    if (!highlights || highlights.length === 0) return text
    let result = text
    highlights.forEach(h => {
      const regex = new RegExp(`(${h})`, "gi")
      result = result.replace(regex, "<mark class='bg-yellow-200 dark:bg-yellow-500/40'>$1</mark>")
    })
    return result
  }

  return (
    <div className="flex flex-col h-full bg-zinc-50 dark:bg-zinc-900">
      {/* Header */}
      <div className="flex items-center gap-4 pl-14 md:pl-16 pr-6 py-4 border-b border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800">
        <div className="relative flex-1 max-w-2xl">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-zinc-400" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSearch()}
            placeholder={t("Search messages, files, documents...")}
            className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
            autoFocus
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-zinc-100 dark:hover:bg-zinc-700"
            >
              <X className="size-3" />
            </button>
          )}
        </div>

        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`p-2 rounded-lg border ${showFilters ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-500/20 text-indigo-500" : "border-zinc-200 dark:border-zinc-700 text-zinc-500"}`}
        >
          <Filter className="size-4" />
        </button>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="bg-white dark:bg-zinc-800 border-b border-zinc-200 dark:border-zinc-700 px-6 py-3">
          <div className="flex items-center gap-4">
            <div>
              <span className="text-xs text-zinc-500 mr-2">{t("Type")}:</span>
              <select
                value={filters.type}
                onChange={e => setFilters({ ...filters, type: e.target.value as any })}
                className="rounded border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 px-2 py-1 text-xs"
              >
                <option value="all">{t("All")}</option>
                <option value="message">{t("Messages")}</option>
                <option value="file">{t("Files")}</option>
                <option value="document">{t("Documents")}</option>
              </select>
            </div>
            <div>
              <span className="text-xs text-zinc-500 mr-2">{t("Date")}:</span>
              <select
                value={filters.dateRange}
                onChange={e => setFilters({ ...filters, dateRange: e.target.value as any })}
                className="rounded border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900 px-2 py-1 text-xs"
              >
                <option value="all">{t("All Time")}</option>
                <option value="today">{t("Today")}</option>
                <option value="week">{t("This Week")}</option>
                <option value="month">{t("This Month")}</option>
              </select>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-hidden flex">
        {/* Results */}
        <div className="flex-1 overflow-y-auto p-6">
          {searching ? (
            <div className="flex items-center justify-center h-64">
              <Loader2 className="size-8 animate-spin text-zinc-400" />
            </div>
          ) : results.length > 0 ? (
            <div className="space-y-3">
              <p className="text-xs text-zinc-500 mb-4">{results.length} {t("results found")}</p>
              {results.map(result => (
                <div
                  key={result.id}
                  onClick={() => setSelectedResult(result)}
                  className={`bg-white dark:bg-zinc-800 rounded-lg border p-4 cursor-pointer transition-all ${selectedResult?.id === result.id ? "border-indigo-500 shadow-sm" : "border-zinc-200 dark:border-zinc-700 hover:border-zinc-300"}`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`size-8 rounded-lg flex items-center justify-center flex-shrink-0 ${result.type === "message" ? "bg-blue-50 dark:bg-blue-500/20" : result.type === "file" ? "bg-green-50 dark:bg-green-500/20" : "bg-purple-50 dark:bg-purple-500/20"}`}>
                      {result.type === "message" ? <MessageSquare className="size-4 text-blue-500" /> :
                       result.type === "file" ? <FileText className="size-4 text-green-500" /> :
                       <Hash className="size-4 text-purple-500" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">{result.title}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${result.type === "message" ? "bg-blue-50 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400" : result.type === "file" ? "bg-green-50 dark:bg-green-500/20 text-green-600 dark:text-green-400" : "bg-purple-50 dark:bg-purple-500/20 text-purple-600 dark:text-purple-400"}`}>
                          {result.type}
                        </span>
                      </div>
                      <p
                        className="text-xs text-zinc-600 dark:text-zinc-400 line-clamp-2"
                        dangerouslySetInnerHTML={{ __html: highlightText(result.content, result.highlights) }}
                      />
                      <div className="flex items-center gap-3 mt-2 text-[10px] text-zinc-500">
                        <span className="flex items-center gap-1">
                          <Clock className="size-3" />
                          {new Date(result.timestamp).toLocaleString()}
                        </span>
                        <span>{t("Relevance")}: {Math.round(result.relevance * 100)}%</span>
                      </div>
                    </div>
                    <ArrowRight className="size-4 text-zinc-400 flex-shrink-0" />
                  </div>
                </div>
              ))}
            </div>
          ) : query ? (
            <div className="flex flex-col items-center justify-center h-64 text-zinc-400">
              <Search className="size-16 mb-4" />
              <p className="text-sm">{t("No results found")}</p>
            </div>
          ) : (
            <div className="space-y-6">
              {recentSearches.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-3">{t("Recent Searches")}</h3>
                  <div className="flex flex-wrap gap-2">
                    {recentSearches.map((search, i) => (
                      <button
                        key={i}
                        onClick={() => setQuery(search)}
                        className="flex items-center gap-2 px-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs hover:border-indigo-300 dark:hover:border-indigo-700"
                      >
                        <Clock className="size-3" />
                        {search}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-3">{t("Search Tips")}</h3>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { icon: <MessageSquare className="size-4" />, title: t("Messages"), desc: t("Search chat messages") },
                    { icon: <FileText className="size-4" />, title: t("Files"), desc: t("Search file names and content") },
                    { icon: <Hash className="size-4" />, title: t("Documents"), desc: t("Search document content") },
                    { icon: <Clock className="size-4" />, title: t("Recent"), desc: t("Search recent items") }
                  ].map((tip, i) => (
                    <div key={i} className="p-3 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800">
                      <div className="flex items-center gap-2 mb-1 text-zinc-900 dark:text-zinc-100">
                        {tip.icon}
                        <span className="text-xs font-medium">{tip.title}</span>
                      </div>
                      <p className="text-[10px] text-zinc-500">{tip.desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Preview Panel */}
        {selectedResult && (
          <div className="w-96 border-l border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 overflow-y-auto">
            <div className="sticky top-0 bg-white dark:bg-zinc-800 border-b border-zinc-200 dark:border-zinc-700 px-4 py-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold">{selectedResult.title}</h3>
              <button onClick={() => setSelectedResult(null)} className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-700">
                <X className="size-3" />
              </button>
            </div>
            <div className="p-4">
              <div className="flex items-center gap-2 mb-3 text-[10px] text-zinc-500">
                <span className={`px-1.5 py-0.5 rounded ${selectedResult.type === "message" ? "bg-blue-50 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400" : selectedResult.type === "file" ? "bg-green-50 dark:bg-green-500/20 text-green-600 dark:text-green-400" : "bg-purple-50 dark:bg-purple-500/20 text-purple-600 dark:text-purple-400"}`}>
                  {selectedResult.type}
                </span>
                <span>{new Date(selectedResult.timestamp).toLocaleString()}</span>
                <span>{t("Relevance")}: {Math.round(selectedResult.relevance * 100)}%</span>
              </div>
              <div
                className="text-xs text-zinc-600 dark:text-zinc-400 whitespace-pre-wrap"
                dangerouslySetInnerHTML={{ __html: highlightText(selectedResult.content, selectedResult.highlights) }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
