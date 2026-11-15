interface CacheEntry<T> {
  data: T
  timestamp: number
  lastAccessed: number
  accessCount: number
}

interface SearchCacheOptions {
  maxSize: number
  ttlMs: number
}

export class SearchCache<T> {
  private cache: Map<string, CacheEntry<T>>
  private readonly maxSize: number
  private readonly ttlMs: number

  constructor(options: SearchCacheOptions = { maxSize: 100, ttlMs: 5 * 60 * 1000 }) {
    this.cache = new Map()
    this.maxSize = options.maxSize
    this.ttlMs = options.ttlMs
  }

  private generateKey(query: string, type: string, dateRange: string): string {
    return `${query.toLowerCase()}|${type}|${dateRange}`
  }

  get(query: string, type: string, dateRange: string): T | null {
    const key = this.generateKey(query, type, dateRange)
    const entry = this.cache.get(key)

    if (!entry) {
      return null
    }

    const now = Date.now()
    if (now - entry.timestamp > this.ttlMs) {
      this.cache.delete(key)
      return null
    }

    entry.lastAccessed = now
    entry.accessCount += 1
    return entry.data
  }

  set(query: string, type: string, dateRange: string, data: T): void {
    const key = this.generateKey(query, type, dateRange)

    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      this.evictLRU()
    }

    const now = Date.now()
    this.cache.set(key, {
      data,
      timestamp: now,
      lastAccessed: now,
      accessCount: 1
    })
  }

  invalidate(query?: string, type?: string): void {
    if (query && type) {
      const key = this.generateKey(query, type, 'all')
      this.cache.delete(key)
    } else {
      this.cache.clear()
    }
  }

  clear(): void {
    this.cache.clear()
  }

  getStats(): { size: number; hits: number; totalAccesses: number } {
    let totalAccesses = 0
    this.cache.forEach(entry => {
      totalAccesses += entry.accessCount
    })

    return {
      size: this.cache.size,
      hits: totalAccesses,
      totalAccesses
    }
  }

  private evictLRU(): void {
    let oldestKey: string | null = null
    let oldestTime = Date.now()

    this.cache.forEach((entry, key) => {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed
        oldestKey = key
      }
    })

    if (oldestKey) {
      this.cache.delete(oldestKey)
    }
  }
}
