import { NextResponse } from 'next/server'
import prisma from '@/lib/db'

type SearchResult = { title: string; snippet: string; url: string }

/**
 * Bing search — works in China, no API key needed.
 */
async function searchBing(query: string, count: number = 8, first: number = 0): Promise<SearchResult[]> {
  try {
    const url = `https://cn.bing.com/search?q=${encodeURIComponent(query)}&count=${count}&first=${first}`
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Accept-Encoding': 'identity',
        'Connection': 'keep-alive',
      },
      signal: AbortSignal.timeout(20000),
    })

    if (!res.ok) throw new Error(`Bing returned ${res.status}`)
    const html = await res.text()

    const results: SearchResult[] = []

    // Bing results structure: <h2><a href="URL">Title</a></h2><div class="b_caption"><p>Snippet</p></div>
    const blocks = html.split(/class="b_algo"/)
    for (let i = 1; i < blocks.length && results.length < count; i++) {
      const block = blocks[i]

      // Extract title and URL from <h2><a href="...">Title</a></h2>
      const h2Match = block.match(/<h2[^>]*>\s*<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>\s*<\/h2>/)
      const url = h2Match?.[1]?.replace(/&amp;/g, '&') || ''
      const title = h2Match?.[2]
        ?.replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&#x27;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&ensp;|&nbsp;|&#x2002;|&#x2003;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim() || ''

      // Extract snippet from <div class="b_caption"><p>...</p></div>
      const captionMatch = block.match(/class="b_caption"[^>]*>\s*<p[^>]*>([\s\S]*?)<\/p>/)
      const snippet = captionMatch?.[1]
        ?.replace(/<[^>]+>/g, '')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&#x27;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&ensp;|&nbsp;|&#x2002;|&#x2003;|&#0183;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim() || ''

      if (title && url && url.startsWith('http')) {
        results.push({ title, snippet, url })
      }
    }

    console.log(`[Search] Bing parsed ${results.length} results`)
    return results
  } catch (e: any) {
    console.error('[Search] Bing search failed:', e.message)
    return []
  }
}

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
      signal: AbortSignal.timeout(10000),
    })

    if (!res.ok) throw new Error(`DuckDuckGo returned ${res.status}`)
    const html = await res.text()

    const results: SearchResult[] = []

    const blocks = html.split(/class="result results_links/)
    for (let i = 1; i < blocks.length && results.length < 6; i++) {
      const block = blocks[i]

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
 * Wikipedia (Chinese) search.
 */
async function searchWikipediaZh(query: string): Promise<SearchResult[]> {
  try {
    const url = `https://zh.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=4&utf8=1`
    const res = await fetch(url, {
      signal: AbortSignal.timeout(5000),
      headers: { 'User-Agent': 'ClosedUI/1.0' },
    })
    if (!res.ok) throw new Error(`Wikipedia Zh returned ${res.status}`)
    const data = await res.json()

    return (data.query?.search || []).map((r: any) => ({
      title: r.title,
      snippet: r.snippet?.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() || '',
      url: `https://zh.wikipedia.org/wiki/${encodeURIComponent(r.title.replace(/ /g, '_'))}`,
    }))
  } catch (e: any) {
    console.error('[Search] Wikipedia Zh failed:', e.message)
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

async function searchWithFallback(query: string, engine: string, searchKey: string, deep: boolean = false): Promise<{ results: SearchResult[]; engine: string }> {
  console.log(`[Search] Trying engine: ${engine}${deep ? ' (DEEP MODE)' : ''}`)

  if (deep) {
    console.log('[Search] Deep research: fetching massive results concurrently...')
    const promises: Promise<SearchResult[]>[] = []
    
    // Concurrently fetch DuckDuckGo and Wikipedia
    promises.push(searchDuckDuckGo(query))
    promises.push(searchWikipedia(query))
    promises.push(searchWikipediaZh(query))
    
    // Fetch multiple pages of Bing
    promises.push(searchBing(query, 50, 0))
    promises.push(searchBing(query, 50, 50)) // Next 50
    
    const resultsArray = await Promise.allSettled(promises)
    let combined: SearchResult[] = []
    for (const res of resultsArray) {
      if (res.status === 'fulfilled') {
        combined = combined.concat(res.value)
      }
    }
    
    // Deduplicate by URL
    const uniqueResults = Array.from(new Map(combined.map(r => [r.url, r])).values())
    console.log(`[Search] Deep research collected ${uniqueResults.length} unique results.`)
    return { results: uniqueResults, engine: 'deep-ensemble' }
  }

  switch (engine) {
    case 'bing': {
      const results = await searchBing(query)
      if (results.length > 0) return { results, engine: 'bing' }
      break
    }
    case 'duckduckgo': {
      const results = await searchDuckDuckGo(query)
      if (results.length > 0) return { results, engine: 'duckduckgo' }
      break
    }
    case 'wikipedia': {
      const results = await searchWikipedia(query)
      if (results.length > 0) return { results, engine: 'wikipedia' }
      break
    }
    case 'tavily': {
      if (searchKey) {
        try {
          const results = await searchTavily(query, searchKey)
          if (results.length > 0) return { results, engine: 'tavily' }
        } catch (e) {
          console.warn('[Search] Tavily failed, falling back')
        }
      }
      break
    }
    case 'serpapi': {
      if (searchKey) {
        try {
          const results = await searchSerpApi(query, searchKey)
          if (results.length > 0) return { results, engine: 'serpapi' }
        } catch (e) {
          console.warn('[Search] SerpApi failed, falling back')
        }
      }
      break
    }
  }

  console.log('[Search] Primary engine failed, trying fallback engines')

  const engines = ['bing', 'duckduckgo', 'wikipedia']
  for (const e of engines) {
    if (e === engine) continue
    try {
      let results: SearchResult[] = []
      switch (e) {
        case 'bing': results = await searchBing(query); break
        case 'duckduckgo': results = await searchDuckDuckGo(query); break
        case 'wikipedia': results = await searchWikipedia(query); break
      }
      if (results.length > 0) return { results, engine: e }
    } catch (e) {
      console.warn(`[Search] Fallback ${e} failed`)
    }
  }

  return { results: [], engine }
}

export async function POST(req: Request) {
  try {
    const { query, deep } = await req.json()
    if (!query) return NextResponse.json({ error: 'Query required' }, { status: 400 })

    const settings = await prisma.settings.findUnique({ where: { id: 'default' } })
    const engine = (settings as any)?.searchEngine || 'bing'
    const searchKey = (settings as any)?.searchKey || ''

    console.log(`[Search] query="${query}" deep=${!!deep}`)

    const { results, engine: usedEngine } = await searchWithFallback(query, engine, searchKey, deep)

    console.log(`[Search] Got ${results.length} results from ${usedEngine}`)
    return NextResponse.json({ results, engine: usedEngine })
  } catch (error: any) {
    console.error('[Search] Error:', error)
    return NextResponse.json({ error: error.message || 'Search failed' }, { status: 500 })
  }
}
