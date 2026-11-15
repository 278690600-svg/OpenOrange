import { NextRequest, NextResponse } from 'next/server'
import prisma from '@/lib/db'
import { SearchCache } from '@/lib/search-cache'

const searchCache = new SearchCache({
  maxSize: 200,
  ttlMs: 10 * 60 * 1000
})

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const query = searchParams.get('q')
  const type = searchParams.get('type') || 'all'
  const dateRange = searchParams.get('dateRange') || 'all'

  if (!query) {
    return NextResponse.json({ results: [] })
  }

  const cachedResult = searchCache.get(query, type, dateRange)
  if (cachedResult) {
    return NextResponse.json({ results: cachedResult, cached: true })
  }

  const results: Array<{
    id: string
    type: 'message' | 'file' | 'document'
    title: string
    content: string
    timestamp: string
    relevance: number
    highlights: string[]
  }> = []

  const queryLower = query.toLowerCase()
  const searchTerms = queryLower.split(/\s+/).filter(t => t.length > 2)

  // Search chats/messages
  if (type === 'all' || type === 'message') {
    try {
      const chats = await prisma.chat.findMany({
        where: {
          OR: [
            { title: { contains: query } },
            { id: { contains: query } }
          ]
        },
        orderBy: { updatedAt: 'desc' },
        take: 20,
        include: { messages: true }
      })

      chats.forEach(chat => {
        const relevance = chat.title.toLowerCase().includes(queryLower) ? 0.9 : 0.6
        const highlights = searchTerms.filter(term =>
          chat.title.toLowerCase().includes(term)
        )

        results.push({
          id: chat.id,
          type: 'message',
          title: chat.title,
          content: `Chat conversation - ${chat.messages.length} messages`,
          timestamp: chat.updatedAt.toISOString(),
          relevance,
          highlights
        })
      })
    } catch (err) {
      console.error('Chat search failed:', err)
    }
  }

  // Search documents
  if (type === 'all' || type === 'document') {
    try {
      const docs = await prisma.document.findMany({
        where: {
          OR: [
            { title: { contains: query } },
            { content: { contains: query } }
          ]
        },
        orderBy: { updatedAt: 'desc' },
        take: 20
      })

      docs.forEach(doc => {
        const titleMatch = doc.title.toLowerCase().includes(queryLower)
        const contentMatch = doc.content.toLowerCase().includes(queryLower)
        const relevance = titleMatch ? 0.95 : contentMatch ? 0.7 : 0.5
        const highlights = searchTerms.filter(term =>
          doc.title.toLowerCase().includes(term) || doc.content.toLowerCase().includes(term)
        )

        results.push({
          id: doc.id,
          type: 'document',
          title: doc.title,
          content: doc.content.slice(0, 200),
          timestamp: doc.updatedAt.toISOString(),
          relevance,
          highlights
        })
      })
    } catch (err) {
      console.error('Document search failed:', err)
    }
  }

  // Search knowledge base
  if (type === 'all' || type === 'file') {
    try {
      const kb = await prisma.knowledgeBase.findMany({
        where: {
          OR: [
            { name: { contains: query } },
            { stats: { contains: query } }
          ]
        },
        orderBy: { updatedAt: 'desc' },
        take: 20
      })

      kb.forEach(item => {
        const relevance = item.name.toLowerCase().includes(queryLower) ? 0.85 : 0.65
        const highlights = searchTerms.filter(term =>
          item.name.toLowerCase().includes(term)
        )

        results.push({
          id: item.id,
          type: 'file',
          title: item.name,
          content: `Knowledge base - ${item.sourceType}`,
          timestamp: item.updatedAt.toISOString(),
          relevance,
          highlights
        })
      })
    } catch (err) {
      console.error('Knowledge base search failed:', err)
    }
  }

  // Sort by relevance
  results.sort((a, b) => b.relevance - a.relevance)

  searchCache.set(query, type, dateRange, results)

  return NextResponse.json({ results })
}
