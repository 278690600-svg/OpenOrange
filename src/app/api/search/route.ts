import { NextResponse } from 'next/server'
import prisma from '@/lib/db'

type SearchResult = { title: string; snippet: string; url: string }

/**
 * DuckDuckGo HTML search — reliable, no API key needed.
 */
async function searchDuckDuckGo(query: string): Promise<SearchResult[]> {
  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      signal: AbortSignal.timeout(8000),
    })

    if (!res.ok) throw new Error(`DuckDuckGo returned ${res.status}`)
    const html = await res.text()

    const results: SearchResult[] = []

    // Each result is wrapped in: <div class="result results_links ...">
    // Inside: <a class="result__a" href="...redirect...">TITLE</a>
    //         <a class="result__snippet" href="...">SNIPPET</a>
    // The href contains: //duckduckgo.com/l/?uddg=ENCODED_URL&amp;rut=...

    // Split by result containers
    const blocks = html.split(/class="result results_links/)
    for (let i = 1; i < blocks.length && results.length < 6; i++) {
      const block = blocks[i]

      // Extract title from <a class="result__a">
      const titleMatch = block.match(/class="result__a"[^>]*>([\s\S]*?)<\/a>/)
      const title = titleMatch?.[1]
        ?.replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&#x27;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/\s+/g, ' ')
        .trim() || ''

      // Extract snippet from <a class="result__snippet">
      const snippetMatch = block.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/)
      const snippet = snippetMatch?.[1]
        ?.replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&#x27;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/\s+/g, ' ')
        .trim() || ''

      // Extract real URL from the uddg parameter in any result__a href
      let resultUrl = ''
      const hrefMatch = block.match(/class="result__a"[^>]*href="([^"]*)"/)
      if (hrefMatch?.[1]) {
        const href = hrefMatch[1].replace(/&amp;/g, '&')
        const uddgMatch = href.match(/uddg=([^&]+)/)
        if (uddgMatch?.[1]) {
          resultUrl = decodeURIComponent(uddgMatch[1])
        }
      }

      if (title && snippet && resultUrl) {
        results.push({ title, snippet, url: resultUrl })
      }
    }

    console.log(`[Search] DuckDuckGo parsed ${results.length} results`)
    return results
  } catch (e: any) {
    console.error('[Search] DuckDuckGo HTML search failed:', e.message)
    return []
  }
}

/**
 * Wikipedia search — always works, good for factual queries.
 */
async function searchWikipedia(query: string): Promise<SearchResult[]> {
  try {
    const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=4&utf8=1`
    const res = await fetch(url, {
      signal: AbortSignal.timeout(5000),
      headers: { 'User-Agent': 'ClosedUI/1.0' },
    })
    if (!res.ok) throw new Error(`Wikipedia returned ${res.status}`)
    const data = await res.json()

    return (data.query?.search || []).map((r: any) => ({
      title: r.title,
      snippet: r.snippet?.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() || '',
      url: `https://en.wikipedia.org/wiki/${encodeURIComponent(r.title.replace(/ /g, '_'))}`,
    }))
  } catch (e: any) {
    console.error('[Search] Wikipedia failed:', e.message)
    return []
  }
}

/**
 * Tavily search — requires API key, high quality results.
 */
async function searchTavily(query: string, apiKey: string): Promise<SearchResult[]> {
  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_key: apiKey, query, max_results: 5, search_depth: 'advanced' }),
    signal: AbortSignal.timeout(10000),
  })
  if (!res.ok) throw new Error(`Tavily error: ${res.status}`)
  const data = await res.json()
  return (data.results || []).map((r: any) => ({
    title: r.title,
    snippet: r.content,
    url: r.url,
  }))
}

/**
 * SerpApi search — requires API key, Google results.
 */
async function searchSerpApi(query: string, apiKey: string): Promise<SearchResult[]> {
  const url = `https://serpapi.com/search.json?q=${encodeURIComponent(query)}&api_key=${apiKey}&num=5`
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
  if (!res.ok) throw new Error(`SerpApi error: ${res.status}`)
  const data = await res.json()
  return (data.organic_results || []).slice(0, 5).map((r: any) => ({
    title: r.title,
    snippet: r.snippet || '',
    url: r.link,
  }))
}

export async function POST(req: Request) {
  try {
    const { query } = await req.json()
    if (!query) return NextResponse.json({ error: 'Query required' }, { status: 400 })

    const settings = await prisma.settings.findUnique({ where: { id: 'default' } })
    const engine = (settings as any)?.searchEngine || 'duckduckgo'
    const searchKey = (settings as any)?.searchKey || ''

    console.log(`[Search] engine=${engine}, query="${query}"`)

    let results: SearchResult[] = []

    switch (engine) {
      case 'duckduckgo':
        results = await searchDuckDuckGo(query)
        break
      case 'wikipedia':
        results = await searchWikipedia(query)
        break
      case 'tavily':
        if (!searchKey) return NextResponse.json({ error: 'Tavily API key not set in Settings' }, { status: 400 })
        results = await searchTavily(query, searchKey)
        break
      case 'serpapi':
        if (!searchKey) return NextResponse.json({ error: 'SerpAPI key not set in Settings' }, { status: 400 })
        results = await searchSerpApi(query, searchKey)
        break
      default:
        results = await searchDuckDuckGo(query)
    }

    console.log(`[Search] Got ${results.length} results`)
    return NextResponse.json({ results, engine })
  } catch (error: any) {
    console.error('[Search] Error:', error)
    return NextResponse.json({ error: error.message || 'Search failed' }, { status: 500 })
  }
}
