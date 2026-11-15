'use client'

import { useState, useEffect } from 'react'
import { useI18n } from '@/lib/i18n'
import { Database, Trash2, RefreshCw, Loader2, Zap, BarChart3, Clock } from 'lucide-react'

interface CacheStats {
  cache: {
    size: number
    hits: number
    totalAccesses: number
  }
  maxSize: number
  ttlMs: number
}

export function SearchCacheManager() {
  const { t } = useI18n()
  const [stats, setStats] = useState<CacheStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [clearing, setClearing] = useState(false)

  useEffect(() => {
    loadStats()
  }, [])

  const loadStats = async () => {
    try {
      setLoading(true)
      const res = await fetch('/api/search/cache')
      if (res.ok) {
        const data = await res.json()
        setStats(data)
      }
    } catch (error) {
      console.error('Failed to load cache stats:', error)
    } finally {
      setLoading(false)
    }
  }

  const clearCache = async () => {
    try {
      setClearing(true)
      const res = await fetch('/api/search/cache', { method: 'DELETE' })
      if (res.ok) {
        loadStats()
      }
    } catch (error) {
      console.error('Failed to clear cache:', error)
    } finally {
      setClearing(false)
    }
  }

  const hitRate = stats ? (stats.cache.totalAccesses > 0 ? ((stats.cache.hits / stats.cache.totalAccesses) * 100).toFixed(1) : '0.0') : '0.0'
  const ttlMinutes = stats ? Math.round(stats.ttlMs / 60000) : 0
  const utilization = stats ? ((stats.cache.size / stats.maxSize) * 100).toFixed(0) : '0'

  return (
    <div className="h-full flex flex-col bg-white dark:bg-zinc-900">
      <div className="border-b border-zinc-200 dark:border-zinc-800 p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Database className="size-5 text-blue-600" />
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Search Cache</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={clearCache}
              disabled={clearing}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors disabled:opacity-50"
            >
              {clearing ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
              Clear Cache
            </button>
            <button
              onClick={loadStats}
              className="p-1.5 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
            >
              <RefreshCw className={`size-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="size-6 text-zinc-400 animate-spin" />
          </div>
        ) : stats ? (
          <div className="space-y-6">
            <div className="grid grid-cols-4 gap-3">
              <div className="bg-blue-50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-lg p-4 text-center">
                <Database className="size-5 text-blue-600 dark:text-blue-400 mx-auto mb-2" />
                <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{stats.cache.size}</div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400">Cached Entries</div>
              </div>

              <div className="bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-200 dark:border-emerald-800 rounded-lg p-4 text-center">
                <Zap className="size-5 text-emerald-600 dark:text-emerald-400 mx-auto mb-2" />
                <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{hitRate}%</div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400">Hit Rate</div>
              </div>

              <div className="bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-lg p-4 text-center">
                <Clock className="size-5 text-amber-600 dark:text-amber-400 mx-auto mb-2" />
                <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{ttlMinutes}m</div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400">TTL</div>
              </div>

              <div className="bg-purple-50 dark:bg-purple-900/10 border border-purple-200 dark:border-purple-800 rounded-lg p-4 text-center">
                <BarChart3 className="size-5 text-purple-600 dark:text-purple-400 mx-auto mb-2" />
                <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">{utilization}%</div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400">Capacity Used</div>
              </div>
            </div>

            <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-lg p-4 space-y-3">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Cache Configuration</h3>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-zinc-500 dark:text-zinc-400">Max Size:</span>
                  <span className="ml-2 font-medium text-zinc-900 dark:text-zinc-100">{stats.maxSize} entries</span>
                </div>
                <div>
                  <span className="text-zinc-500 dark:text-zinc-400">TTL:</span>
                  <span className="ml-2 font-medium text-zinc-900 dark:text-zinc-100">{ttlMinutes} minutes</span>
                </div>
                <div>
                  <span className="text-zinc-500 dark:text-zinc-400">Total Accesses:</span>
                  <span className="ml-2 font-medium text-zinc-900 dark:text-zinc-100">{stats.cache.totalAccesses}</span>
                </div>
                <div>
                  <span className="text-zinc-500 dark:text-zinc-400">Cache Hits:</span>
                  <span className="ml-2 font-medium text-zinc-900 dark:text-zinc-100">{stats.cache.hits}</span>
                </div>
              </div>
            </div>

            <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 mb-2">Capacity</h3>
              <div className="w-full h-3 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    parseInt(utilization) > 90 ? 'bg-red-500' : parseInt(utilization) > 70 ? 'bg-amber-500' : 'bg-emerald-500'
                  }`}
                  style={{ width: utilization + '%' }}
                />
              </div>
              <div className="flex justify-between mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                <span>{stats.cache.size} used</span>
                <span>{stats.maxSize} total</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Database className="size-12 text-zinc-300 dark:text-zinc-600 mb-3" />
            <p className="text-sm text-zinc-500 dark:text-zinc-400">Cache statistics unavailable</p>
          </div>
        )}
      </div>
    </div>
  )
}
