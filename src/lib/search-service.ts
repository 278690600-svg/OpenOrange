
export type SearchResult = { title: string; snippet: string; url: string }

/**
 * Bing search — works in China, no API key needed.
 * Upgraded with robust CAPTCHA detection for fallback triggering.
 */
export async function searchBing(query: string, count: number = 8, first: number = 0): Promise<SearchResult[]> {
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
      signal: AbortSignal.timeout(6000),
    })

    if (!res.ok) throw new Error(`Bing returned ${res.status}`)
    const html = await res.text()

    if (html.includes('class="captcha"') || html.includes('captcha_header') || html.includes('checkbox')) {
      console.warn('[Search] Bing search triggered CAPTCHA and got blocked. Fallback immediately.')
      return []
    }

    const results: SearchResult[] = []
    const blocks = html.split(/class="b_algo"/)
    for (let i = 1; i < blocks.length && results.length < count; i++) {
      const block = blocks[i]

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
  } catch (e: unknown) {
    console.error('[Search] Bing failed:', (e as Error).message)
    return []
  }
}

/**
 * DuckDuckGo HTML search — highly reliable, no API key needed, zero-wind CAPTCHA.
 */
export async function searchDuckDuckGo(query: string, count: number = 6): Promise<SearchResult[]> {
  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      signal: AbortSignal.timeout(5000),
    })

    if (!res.ok) throw new Error(`DuckDuckGo returned ${res.status}`)
    const html = await res.text()

    const results: SearchResult[] = []

    const blocks = html.split(/class="result results_links/)
    for (let i = 1; i < blocks.length && results.length < count; i++) {
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

    console.log(`[Search] DuckDuckGo parsed ${results.length} results (limit: ${count})`)
    return results
  } catch (e: unknown) {
    console.error('[Search] DuckDuckGo HTML search failed:', (e as Error).message)
    return []
  }
}

/**
 * Wikipedia search — always works, good for factual queries.
 */
export async function searchWikipedia(query: string, count: number = 4): Promise<SearchResult[]> {
  try {
    const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=${count}&utf8=1`
    const res = await fetch(url, {
      signal: AbortSignal.timeout(5000),
      headers: { 'User-Agent': 'ClosedUI/1.0' },
    })
    if (!res.ok) throw new Error(`Wikipedia returned ${res.status}`)
    const data = (await res.json()) as { query?: { search?: Array<{ title: string; snippet: string }> } }

    return (data.query?.search || []).map((r) => ({
      title: r.title,
      snippet: r.snippet?.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() || '',
      url: `https://en.wikipedia.org/wiki/${encodeURIComponent(r.title.replace(/ /g, '_'))}`,
    }))
  } catch (e: unknown) {
    console.error('[Search] Wikipedia failed:', (e as Error).message)
    return []
  }
}

/**
 * Wikipedia (Chinese) search.
 */
export async function searchWikipediaZh(query: string, count: number = 4): Promise<SearchResult[]> {
  try {
    const url = `https://zh.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=${count}&utf8=1`
    const res = await fetch(url, {
      signal: AbortSignal.timeout(5000),
      headers: { 'User-Agent': 'ClosedUI/1.0' },
    })
    if (!res.ok) throw new Error(`Wikipedia Zh returned ${res.status}`)
    const data = (await res.json()) as { query?: { search?: Array<{ title: string; snippet: string }> } }

    return (data.query?.search || []).map((r) => ({
      title: r.title,
      snippet: r.snippet?.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() || '',
      url: `https://zh.wikipedia.org/wiki/${encodeURIComponent(r.title.replace(/ /g, '_'))}`,
    }))
  } catch (e: unknown) {
    console.error('[Search] Wikipedia Zh failed:', (e as Error).message)
    return []
  }
}

/**
 * Tavily search — requires API key, high quality results.
 */
export async function searchTavily(query: string, apiKey: string, count: number = 5): Promise<SearchResult[]> {
  const res = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_key: apiKey, query, max_results: count, search_depth: 'advanced' }),
    signal: AbortSignal.timeout(10000),
  })
  if (!res.ok) throw new Error(`Tavily error: ${res.status}`)
  const data = (await res.json()) as { results?: Array<{ title: string; content: string; url: string }> }
  return (data.results || []).map((r) => ({
    title: r.title,
    snippet: r.content,
    url: r.url,
  }))
}

/**
 * SerpApi search — requires API key, Google results.
 */
export async function searchSerpApi(query: string, apiKey: string, count: number = 5): Promise<SearchResult[]> {
  const url = `https://serpapi.com/search.json?q=${encodeURIComponent(query)}&api_key=${apiKey}&num=${count}`
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) })
  if (!res.ok) throw new Error(`SerpApi error: ${res.status}`)
  const data = (await res.json()) as { organic_results?: Array<{ title: string; snippet?: string; link: string }> }
  return (data.organic_results || []).slice(0, count).map((r) => ({
    title: r.title,
    snippet: r.snippet || '',
    url: r.link,
  }))
}

/**
 * Integrated search function with automated fallback.
 * Node-native service avoiding self-fetch web loop requests.
 */
export async function searchWithFallback(
  query: string,
  engine: string,
  searchKey: string,
  deep: boolean = false
): Promise<{ results: SearchResult[]; engine: string }> {
  console.log(`[Search-Service] Trying engine: ${engine}${deep ? ' (DEEP MODE)' : ''}`)

  const targetCount = deep ? 100 : 30 // 普通搜索目标是 30 个结果，深度搜索目标是 100 个结果

  if (deep) {
    console.log('[Search-Service] Deep research: fetching massive results concurrently...')
    const promises: Promise<SearchResult[]>[] = []

    // 深度模式：放开各个引擎的限制，并发拉取大批量数据
    promises.push(searchDuckDuckGo(query, 50))
    promises.push(searchWikipedia(query, 30))
    promises.push(searchWikipediaZh(query, 30))

    if (engine === 'tavily' && searchKey) {
      promises.push(searchTavily(query, searchKey, 40))
    }
    if (engine === 'serpapi' && searchKey) {
      promises.push(searchSerpApi(query, searchKey, 40))
    }

    // Fetch multiple pages of Bing
    promises.push(searchBing(query, 50, 0))
    promises.push(searchBing(query, 50, 50))
    promises.push(searchBing(query, 50, 100))

    const resultsArray = await Promise.allSettled(promises)
    let combined: SearchResult[] = []
    for (const res of resultsArray) {
      if (res.status === 'fulfilled') {
        combined = combined.concat(res.value)
      }
    }

    // Deduplicate by URL
    const uniqueResults = Array.from(new Map(combined.map(r => [r.url, r])).values())
    console.log(`[Search-Service] Deep research collected ${uniqueResults.length} unique results.`)
    return { results: uniqueResults, engine: 'deep-ensemble' }
  }

  // 1. Try primary engine
  let primaryResults: SearchResult[] = []
  try {
    switch (engine) {
      case 'bing':
        primaryResults = await searchBing(query, targetCount)
        break
      case 'duckduckgo':
        primaryResults = await searchDuckDuckGo(query, targetCount)
        break
      case 'wikipedia':
        primaryResults = await searchWikipedia(query, targetCount)
        break
      case 'tavily':
        if (searchKey) {
          primaryResults = await searchTavily(query, searchKey, targetCount)
        }
        break
      case 'serpapi':
        if (searchKey) {
          primaryResults = await searchSerpApi(query, searchKey, targetCount)
        }
        break
    }
  } catch (err: unknown) {
    console.warn(`[Search-Service] Primary engine ${engine} failed:`, (err as Error).message)
  }

  // 如果主搜索引擎返回的结果数量足够（比如 >= 25 条），直接返回
  if (primaryResults.length >= 25) {
    return { results: primaryResults.slice(0, targetCount), engine }
  }

  // 2. 如果主引擎结果不够 25 条，触发并发 fallback 并进行合并去重
  console.log(`[Search-Service] Primary engine returned only ${primaryResults.length} results. Trying fallback engines concurrently to reach target ~30...`)

  const fallbackEngines = ['duckduckgo', 'wikipedia', 'bing'].filter(e => e !== engine)
  const fallbackPromises = fallbackEngines.map(async (eng) => {
    try {
      let results: SearchResult[] = []
      switch (eng) {
        case 'bing':
          results = await searchBing(query, targetCount)
          break
        case 'duckduckgo':
          results = await searchDuckDuckGo(query, targetCount)
          break
        case 'wikipedia':
          results = await searchWikipedia(query, targetCount)
          break
      }
      return results
    } catch (err) {
      console.warn(`[Search-Service] Fallback ${eng} failed:`, err instanceof Error ? err.message : err)
      return []
    }
  })

  const fallbackResultsList = await Promise.allSettled(fallbackPromises)
  let combined = [...primaryResults]
  for (const res of fallbackResultsList) {
    if (res.status === 'fulfilled') {
      combined = combined.concat(res.value)
    }
  }

  // 去重
  const uniqueResults = Array.from(new Map(combined.map(r => [r.url, r])).values())
  console.log(`[Search-Service] Combined search results: ${uniqueResults.length} (target: 30)`)

  return { 
    results: uniqueResults.slice(0, targetCount), 
    engine: uniqueResults.length > primaryResults.length ? 'combined-fallback' : engine 
  }
}
