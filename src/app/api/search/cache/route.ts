import { NextRequest, NextResponse } from 'next/server'
import { SearchCache } from '@/lib/search-cache'

const searchCache = new SearchCache({
  maxSize: 200,
  ttlMs: 10 * 60 * 1000
})

export async function GET(req: NextRequest) {
  const stats = searchCache.getStats()
  return NextResponse.json({
    cache: stats,
    maxSize: 200,
    ttlMs: 10 * 60 * 1000
  })
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const query = searchParams.get('q')
  const type = searchParams.get('type')

  if (query && type) {
    searchCache.invalidate(query, type)
    return NextResponse.json({ message: `Cache invalidated for query: ${query}` })
  }

  searchCache.clear()
  return NextResponse.json({ message: 'All search caches cleared' })
}
