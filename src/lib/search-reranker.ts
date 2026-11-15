import { SearchResult } from './search-service'

// 简易中文停用词列表，用于过滤搜索词
const STOP_WORDS = new Set([
  '的', '了', '是', '在', '我', '有', '和', '人', '这', '中', '大', '来', '上', '国', '个', '到', '说', '要', '帮我',
  '怎么', '如何', '什么', '为什么', '哪些', '哪里', '哪', '个', '这', '那', '与', '及', '或', '都', '也', '而', '及',
  '了', '吧', '呢', '啊', '吗', '哦', '哈', '呀', '的', '地', '得', '着', '过', '被', '把', '让', '使', '给', '对',
  '关于', '对于', '把', '从', '自', '往', '朝', '向', '到', '在', '于', '比', '同', '跟', '和', '跟', '与', '同'
])

/**
 * 提取核心关键词（简易分词：英文字串 + 连续汉字切分，过滤停用词）
 */
function extractKeywords(query: string): string[] {
  const cleanQuery = query.toLowerCase().trim()
  const keywords: string[] = []

  // 1. 提取英文字符和数字
  const englishMatches = cleanQuery.match(/[a-z0-9]+/g) || []
  englishMatches.forEach(w => {
    if (w.length > 1 && !STOP_WORDS.has(w)) {
      keywords.push(w)
    }
  })

  // 2. 双字切分（2-gram）结合汉字块
  const chineseBlocks = cleanQuery.match(/[\u4e00-\u9fa5]+/g) || []
  chineseBlocks.forEach(block => {
    if (block.length <= 2) {
      if (!STOP_WORDS.has(block)) {
        keywords.push(block)
      }
    } else {
      for (let i = 0; i < block.length - 1; i++) {
        const bigram = block.substring(i, i + 2)
        if (!STOP_WORDS.has(bigram)) {
          keywords.push(bigram)
        }
      }
    }
  })

  // 去重并返回
  return Array.from(new Set(keywords))
}

/**
 * 轻量级 Reranker：对搜索引擎返回的多路结果进行基于相关性的快速重排
 */
export function rankSearchResults(query: string, results: SearchResult[]): SearchResult[] {
  if (results.length === 0) return []
  const keywords = extractKeywords(query)
  if (keywords.length === 0) return results

  const scoredResults = results.map((res, index) => {
    const titleLower = res.title.toLowerCase()
    const snippetLower = res.snippet.toLowerCase()

    let tfScore = 0
    let matchedCount = 0

    // 计算词频 (TF) 和命中覆盖率
    keywords.forEach(kw => {
      let isMatched = false

      // Title 命中：6.0 权重
      const titleMatches = (titleLower.match(new RegExp(escapeRegex(kw), 'g')) || []).length
      if (titleMatches > 0) {
        tfScore += titleMatches * 6.0
        isMatched = true
      }

      // Snippet 命中：1.5 权重
      const snippetMatches = (snippetLower.match(new RegExp(escapeRegex(kw), 'g')) || []).length
      if (snippetMatches > 0) {
        tfScore += snippetMatches * 1.5
        isMatched = true
      }

      if (isMatched) {
        matchedCount++
      }
    })

    // 覆盖率加权 (多词共现乘数)
    const coverageRatio = matchedCount / keywords.length
    const coverageBonus = 1.0 + (coverageRatio * coverageRatio * 2.0) // 全覆盖可以获得 3 倍加成

    // 结合搜索引擎原始排名分 (排名靠前的通常基础权重更高)
    const baseRankScore = 35 / (index + 1.2)

    // 域名权威加权
    let domainBonus = 0
    const url = res.url.toLowerCase()
    if (url.includes('wikipedia.org') || url.includes('.wiki')) domainBonus += 15
    if (url.includes('github.com')) domainBonus += 12
    if (url.includes('.gov') || url.includes('.edu')) domainBonus += 18
    if (url.includes('official') || url.includes('docs.')) domainBonus += 10

    const totalScore = (baseRankScore + tfScore) * coverageBonus + domainBonus

    return { result: res, score: totalScore }
  })

  // 按得分降序排序，取回原始 SearchResult 格式
  scoredResults.sort((a, b) => b.score - a.score)
  return scoredResults.map(sr => sr.result)
}

/**
 * 网页黄金段落提取器：利用滑动窗口，在抓取的全文中抽取匹配度最高的 1-2 段文字，去除噪音长文本
 */
export function extractGoldenSnippets(query: string, fullText: string, maxChars = 800): string {
  if (!fullText) return ''
  const trimmedText = fullText.replace(/\s+/g, ' ').trim()
  if (trimmedText.length <= maxChars) return trimmedText

  const keywords = extractKeywords(query)
  if (keywords.length === 0) return trimmedText.substring(0, maxChars)

  const windowSize = 500
  const stepSize = 250
  const windows: Array<{ text: string; score: number }> = []

  // 滑动窗口切分与打分
  for (let i = 0; i < trimmedText.length - windowSize / 2; i += stepSize) {
    const chunk = trimmedText.substring(i, i + windowSize)
    const chunkLower = chunk.toLowerCase()
    
    let chunkScore = 0
    let matchedCount = 0

    keywords.forEach(kw => {
      const matches = (chunkLower.match(new RegExp(escapeRegex(kw), 'g')) || []).length
      if (matches > 0) {
        chunkScore += matches * 2.0
        matchedCount++
      }
    })

    const ratio = matchedCount / keywords.length
    const finalScore = chunkScore * (1 + ratio * ratio * 3) // 鼓励词汇密集的窗口

    windows.push({ text: chunk, score: finalScore })
  }

  // 排序获取得分最高的窗口
  windows.sort((a, b) => b.score - a.score)

  // 筛选出有匹配分数的 Top 窗口。
  const bestWindows = windows.filter(w => w.score > 0)

  if (bestWindows.length === 0) {
    // 降级策略：截取网页开头段落
    return trimmedText.substring(0, maxChars)
  }

  // 拼装前 1 到 2 个不重复的最佳窗口
  let result = bestWindows[0].text
  if (bestWindows.length > 1 && result.length < maxChars) {
    const secondWindow = bestWindows[1].text
    // 判断是否有很多重叠
    if (!result.includes(secondWindow.substring(0, 100)) && !secondWindow.includes(result.substring(0, 100))) {
      result += '\n...\n' + secondWindow
    }
  }

  if (result.length > maxChars) {
    result = result.substring(0, maxChars) + '...'
  }
  return result
}

// 辅助转义正则表达式字符
function escapeRegex(str: string): string {
  return str.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')
}
