import fs from 'fs'
import path from 'path'
import * as xlsx from 'xlsx'
import { PDFParse } from 'pdf-parse'
import OfficeParser from 'officeparser'
import prisma from '@/lib/db'

type JsonObject = Record<string, unknown>

type KnowledgeDocument = {
  title: string
  sourceUri: string
  content: string
  metadata?: JsonObject
}

type ChunkCandidate = {
  sourceUri: string
  title: string
  chunkIndex: number
  content: string
  keywords: string
  metadata: JsonObject
}

type KnowledgeBaseRecord = Awaited<ReturnType<typeof prisma.knowledgeBase.findFirst>>

const TEXT_EXTENSIONS = new Set([
  '.txt',
  '.md',
  '.mdx',
  '.json',
  '.csv',
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.css',
  '.scss',
  '.html',
  '.xml',
  '.yaml',
  '.yml',
  '.sql',
  '.prisma',
  '.py',
  '.go',
  '.rs',
  '.java',
  '.c',
  '.cpp',
  '.h',
  '.hpp',
])

const SKIP_DIRS = new Set(['.git', '.next', 'node_modules', 'dist', 'build', 'coverage', 'tmp'])
const MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024
const MAX_API_RECORDS = 50
const MAX_CHUNKS_PER_KB = 400
const CHUNK_SIZE = 1200
const CHUNK_OVERLAP = 200

function safeJsonParse<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

function dedupe<T>(items: T[]): T[] {
  return Array.from(new Set(items))
}

function normalizeText(input: string): string {
  return input
    .replace(/\u0000/g, ' ')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

function tokenize(text: string): string[] {
  const normalized = text.toLowerCase()
  const latin = normalized.match(/[a-z0-9_./:-]{2,}/g) || []
  const cjkGroups = normalized.match(/[\u4e00-\u9fff]{2,}/g) || []
  const cjkTokens = cjkGroups.flatMap((group) => {
    const tokens: string[] = [group]
    for (let i = 0; i < group.length - 1; i += 1) {
      tokens.push(group.slice(i, i + 2))
    }
    return tokens
  })

  return dedupe([...latin, ...cjkTokens]).filter((token) => token.length > 1)
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0
  let count = 0
  let start = 0
  while (true) {
    const index = haystack.indexOf(needle, start)
    if (index === -1) break
    count += 1
    start = index + needle.length
  }
  return count
}

function valueToText(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return value.map((item) => valueToText(item)).filter(Boolean).join('\n')
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => `${key}: ${valueToText(item)}`)
      .filter(Boolean)
      .join('\n')
  }
  return ''
}

function chunkText(text: string, chunkSize = CHUNK_SIZE, overlap = CHUNK_OVERLAP): string[] {
  const normalized = normalizeText(text)
  if (!normalized) return []

  const paragraphs = normalized.split(/\n{2,}/).filter(Boolean)
  const chunks: string[] = []
  let current = ''

  const pushChunk = (value: string) => {
    const trimmed = value.trim()
    if (trimmed) chunks.push(trimmed)
  }

  for (const paragraph of paragraphs) {
    if ((current + '\n\n' + paragraph).length <= chunkSize) {
      current = current ? `${current}\n\n${paragraph}` : paragraph
      continue
    }

    if (current) {
      pushChunk(current)
      current = current.slice(Math.max(0, current.length - overlap))
    }

    if (paragraph.length <= chunkSize) {
      current = current ? `${current}\n\n${paragraph}` : paragraph
      continue
    }

    for (let index = 0; index < paragraph.length; index += chunkSize - overlap) {
      pushChunk(paragraph.slice(index, index + chunkSize))
    }
    current = ''
  }

  if (current) pushChunk(current)
  return chunks
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (!a.length || !b.length || a.length !== b.length) return 0
  let dot = 0
  let normA = 0
  let normB = 0
  for (let index = 0; index < a.length; index += 1) {
    dot += a[index] * b[index]
    normA += a[index] * a[index]
    normB += b[index] * b[index]
  }
  if (!normA || !normB) return 0
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

function getValueAtPath(input: unknown, dottedPath?: string): unknown {
  if (!dottedPath) return input
  return dottedPath.split('.').reduce<unknown>((accumulator, key) => {
    if (accumulator && typeof accumulator === 'object') {
      return (accumulator as Record<string, unknown>)[key]
    }
    return undefined
  }, input)
}

function sanitizeKnowledgeBaseConfig(sourceType: string, config: JsonObject): JsonObject {
  if (sourceType !== 'api') return config
  const sanitized = { ...config }
  if (sanitized.headers && typeof sanitized.headers === 'object') {
    const headers = { ...(sanitized.headers as Record<string, unknown>) }
    for (const key of Object.keys(headers)) {
      if (/authorization|token|secret|key/i.test(key)) {
        headers[key] = '******'
      }
    }
    sanitized.headers = headers
  }
  return sanitized
}

async function createEmbeddings(texts: string[], settings: { openaiKey?: string | null; hybridSearchEnabled?: boolean | null; embeddingModel?: string | null }): Promise<number[][] | null> {
  if (!texts.length) return []
  if (!settings.openaiKey || settings.hybridSearchEnabled === false) return null

  const batches: string[][] = []
  for (let index = 0; index < texts.length; index += 32) {
    batches.push(texts.slice(index, index + 32))
  }

  const vectors: number[][] = []
  for (const batch of batches) {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.openaiKey}`,
      },
      body: JSON.stringify({
        model: settings.embeddingModel || 'text-embedding-3-small',
        input: batch,
      }),
    })

    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      throw new Error(`Embedding request failed (${response.status}): ${detail || response.statusText}`)
    }

    const payload = (await response.json()) as { data?: Array<{ embedding: number[] }> }
    vectors.push(...(payload.data || []).map((entry) => entry.embedding))
  }

  return vectors
}

async function extractFileText(filePath: string): Promise<string> {
  const ext = path.extname(filePath).toLowerCase()

  if (ext === '.pdf') {
    const parser = new PDFParse({ data: fs.readFileSync(filePath) })
    const result = await parser.getText()
    return normalizeText(result.text || '')
  }

  if (ext === '.docx') {
    const officeAst = (await OfficeParser.parseOffice(filePath)) as { toText?: () => string }
    return normalizeText(officeAst.toText?.() || '')
  }

  if (ext === '.xlsx' || ext === '.xls') {
    const workbook = xlsx.readFile(filePath)
    return normalizeText(
      workbook.SheetNames.map((sheetName) => {
        const worksheet = workbook.Sheets[sheetName]
        return `Sheet: ${sheetName}\n${xlsx.utils.sheet_to_csv(worksheet)}`
      }).join('\n\n')
    )
  }

  if (!TEXT_EXTENSIONS.has(ext)) return ''
  return normalizeText(fs.readFileSync(filePath, 'utf8'))
}

function walkDirectory(rootPath: string): string[] {
  const queue = [rootPath]
  const files: string[] = []

  while (queue.length > 0) {
    const current = queue.pop()!
    const entries = fs.readdirSync(current, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name)
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) queue.push(fullPath)
        continue
      }

      const ext = path.extname(entry.name).toLowerCase()
      if (!TEXT_EXTENSIONS.has(ext) && !['.pdf', '.docx', '.xlsx', '.xls'].includes(ext)) continue

      const stats = fs.statSync(fullPath)
      if (stats.size > MAX_FILE_SIZE_BYTES) continue
      files.push(fullPath)
    }
  }

  return files
}

async function collectLocalDocuments(kb: NonNullable<KnowledgeBaseRecord>, config: JsonObject): Promise<KnowledgeDocument[]> {
  const rootPath = path.resolve(String(config.rootPath || kb.path || ''))
  const files = walkDirectory(rootPath)
  const documents: KnowledgeDocument[] = []

  for (const filePath of files) {
    try {
      const content = await extractFileText(filePath)
      if (!content) continue
      documents.push({
        title: path.relative(rootPath, filePath) || path.basename(filePath),
        sourceUri: `file://${filePath}`,
        content,
        metadata: { absolutePath: filePath, relativePath: path.relative(rootPath, filePath) },
      })
    } catch (error) {
      console.warn('[KB] Failed to parse file:', filePath, error)
    }
  }

  return documents
}

async function collectApiDocuments(kb: NonNullable<KnowledgeBaseRecord>, config: JsonObject): Promise<KnowledgeDocument[]> {
  const url = String(config.url || '')
  const method = String(config.method || 'GET').toUpperCase()
  const headers = (config.headers && typeof config.headers === 'object' ? config.headers : {}) as Record<string, string>
  const rawBody = typeof config.body === 'string' ? config.body : undefined
  const response = await fetch(url, {
    method,
    headers,
    body: method === 'GET' ? undefined : rawBody,
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`API source request failed (${response.status}): ${detail || response.statusText}`)
  }

  const payload = await response.json()
  const selected = getValueAtPath(payload, typeof config.dataPath === 'string' ? config.dataPath : undefined)

  if (Array.isArray(selected)) {
    return selected.slice(0, MAX_API_RECORDS).map((item, index) => ({
      title: `${kb.name} #${index + 1}`,
      sourceUri: url,
      content: normalizeText(valueToText(item)),
      metadata: { index },
    }))
  }

  return [
    {
      title: kb.name,
      sourceUri: url,
      content: normalizeText(valueToText(selected)),
      metadata: {},
    },
  ]
}

async function collectDocumentsForKnowledgeBase(kb: NonNullable<KnowledgeBaseRecord>): Promise<KnowledgeDocument[]> {
  const config = safeJsonParse<JsonObject>(kb.config, {})

  if (kb.sourceType === 'local') {
    return collectLocalDocuments(kb, config)
  }

  if (kb.sourceType === 'api') {
    return collectApiDocuments(kb, config)
  }

  throw new Error(`Unsupported knowledge source type: ${kb.sourceType}`)
}

function buildChunks(documents: KnowledgeDocument[]): ChunkCandidate[] {
  const chunks: ChunkCandidate[] = []

  for (const document of documents) {
    const contentChunks = chunkText(document.content)
    for (const [chunkIndex, content] of contentChunks.entries()) {
      chunks.push({
        sourceUri: document.sourceUri,
        title: document.title,
        chunkIndex,
        content,
        keywords: tokenize(`${document.title}\n${content}`).join(' '),
        metadata: document.metadata || {},
      })
    }
  }

  return chunks.slice(0, MAX_CHUNKS_PER_KB)
}

function scoreChunk(query: string, queryTokens: string[], queryEmbedding: number[] | null, chunk: { title: string; content: string; keywords: string; embedding: string | null }): number {
  const queryLower = query.toLowerCase()
  const titleLower = chunk.title.toLowerCase()
  const contentLower = chunk.content.toLowerCase()
  const keywordSet = new Set(chunk.keywords.split(' ').filter(Boolean))

  let lexicalScore = 0
  if (queryLower && contentLower.includes(queryLower)) lexicalScore += 8
  if (queryLower && titleLower.includes(queryLower)) lexicalScore += 12

  for (const token of queryTokens) {
    if (keywordSet.has(token)) lexicalScore += token.length > 4 ? 4 : 2.5
    if (titleLower.includes(token)) lexicalScore += 6
    lexicalScore += Math.min(4, countOccurrences(contentLower, token)) * (token.length > 3 ? 1.8 : 1.1)
  }

  let semanticScore = 0
  if (queryEmbedding && chunk.embedding) {
    const vector = safeJsonParse<number[]>(chunk.embedding, [])
    semanticScore = cosineSimilarity(queryEmbedding, vector) * 12
  }

  return lexicalScore + semanticScore
}

function serializeKnowledgeBase(record: any) {
  return {
    id: record.id,
    name: record.name,
    sourceType: record.sourceType,
    engine: record.engine,
    path: record.path,
    config: sanitizeKnowledgeBaseConfig(record.sourceType, safeJsonParse<JsonObject>(record.config, {})),
    stats: safeJsonParse<JsonObject>(record.stats, {}),
    status: record.status,
    lastError: record.lastError,
    lastIndexedAt: record.lastIndexedAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    chunkCount: record._count?.chunks ?? 0,
  }
}

export async function listKnowledgeBases() {
  const records = await prisma.knowledgeBase.findMany({
    orderBy: { createdAt: 'desc' },
    include: { _count: { select: { chunks: true } } },
  })

  return records.map(serializeKnowledgeBase)
}

export async function createKnowledgeBase(input: {
  name: string
  sourceType?: string
  engine?: string
  path?: string | null
  config?: JsonObject | string
}) {
  const sourceType = input.sourceType || 'local'
  const config = typeof input.config === 'string' ? safeJsonParse<JsonObject>(input.config, {}) : (input.config || {})
  const normalizedPath = input.path ? path.resolve(input.path) : null

  if (!input.name?.trim()) {
    throw new Error('Name is required')
  }

  if (sourceType === 'local') {
    if (!normalizedPath) throw new Error('Local directory path is required')
    if (!fs.existsSync(normalizedPath) || !fs.statSync(normalizedPath).isDirectory()) {
      throw new Error('Directory does not exist or is inaccessible')
    }
    config.rootPath = normalizedPath
  }

  if (sourceType === 'api') {
    const url = String(config.url || '')
    if (!url) throw new Error('API URL is required')
    try {
      new URL(url)
    } catch {
      throw new Error('API URL is invalid')
    }
  }

  const kb = await prisma.knowledgeBase.create({
    data: {
      name: input.name.trim(),
      sourceType,
      engine: input.engine || (sourceType === 'api' ? 'json-api' : 'directory'),
      path: normalizedPath,
      config: JSON.stringify(config),
      stats: JSON.stringify({}),
      status: 'idle',
      lastError: '',
    },
  })

  await indexKnowledgeBase(kb.id)

  const stored = await prisma.knowledgeBase.findUnique({
    where: { id: kb.id },
    include: { _count: { select: { chunks: true } } },
  })

  return stored ? serializeKnowledgeBase(stored) : kb
}

export async function indexKnowledgeBase(knowledgeBaseId: string) {
  await prisma.knowledgeBase.update({
    where: { id: knowledgeBaseId },
    data: {
      status: 'indexing',
      lastError: '',
    },
  })

  const kb = await prisma.knowledgeBase.findUnique({
    where: { id: knowledgeBaseId },
  })

  if (!kb) {
    throw new Error('Knowledge base not found')
  }

  try {
    const settings = await prisma.settings.findUnique({ where: { id: 'default' } })
    const documents = await collectDocumentsForKnowledgeBase(kb)
    const chunks = buildChunks(documents)

    let embeddings: number[][] | null = null
    if (chunks.length > 0) {
      try {
        embeddings = await createEmbeddings(chunks.map((chunk) => chunk.content), settings || {})
      } catch (error) {
        console.warn('[KB] Embedding generation failed, falling back to lexical search:', error)
      }
    }

    await prisma.$transaction([
      prisma.knowledgeChunk.deleteMany({
        where: { knowledgeBaseId },
      }),
      ...(chunks.length > 0
        ? [
            prisma.knowledgeChunk.createMany({
              data: chunks.map((chunk, index) => ({
                knowledgeBaseId,
                sourceUri: chunk.sourceUri,
                title: chunk.title,
                chunkIndex: chunk.chunkIndex,
                content: chunk.content,
                keywords: chunk.keywords,
                metadata: JSON.stringify(chunk.metadata || {}),
                embedding: embeddings?.[index] ? JSON.stringify(embeddings[index]) : null,
              })),
            }),
          ]
        : []),
    ])

    const stats = {
      documentCount: documents.length,
      chunkCount: chunks.length,
      semanticIndexed: Boolean(embeddings?.length),
    }

    await prisma.knowledgeBase.update({
      where: { id: knowledgeBaseId },
      data: {
        status: 'ready',
        lastError: '',
        lastIndexedAt: new Date(),
        stats: JSON.stringify(stats),
      },
    })

    return stats
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Knowledge base indexing failed'
    await prisma.knowledgeBase.update({
      where: { id: knowledgeBaseId },
      data: {
        status: 'error',
        lastError: message,
      },
    })
    throw error
  }
}

export async function deleteKnowledgeBase(knowledgeBaseId: string) {
  await prisma.knowledgeBase.delete({
    where: { id: knowledgeBaseId },
  })
}

export async function buildKnowledgeContext(knowledgeBaseId: string, query: string) {
  let kb = await prisma.knowledgeBase.findUnique({
    where: { id: knowledgeBaseId },
    include: { chunks: true },
  })

  if (!kb) return null

  if (kb.chunks.length === 0 || kb.status !== 'ready') {
    await indexKnowledgeBase(knowledgeBaseId)
    kb = await prisma.knowledgeBase.findUnique({
      where: { id: knowledgeBaseId },
      include: { chunks: true },
    })
  }

  if (!kb) return null

  if (kb.chunks.length === 0) {
    return {
      knowledgeBase: kb,
      citations: [] as Array<{ title: string; url: string }>,
      chunks: [],
      context: '',
    }
  }

  const settings = await prisma.settings.findUnique({ where: { id: 'default' } })
  const queryTokens = tokenize(query)
  let queryEmbedding: number[] | null = null

  if (kb.chunks.some((chunk) => chunk.embedding)) {
    try {
      const vectors = await createEmbeddings([query], settings || {})
      queryEmbedding = vectors?.[0] || null
    } catch (error) {
      console.warn('[KB] Query embedding failed, using lexical-only retrieval:', error)
    }
  }

  const ranked = kb.chunks
    .map((chunk) => ({
      ...chunk,
      score: scoreChunk(query, queryTokens, queryEmbedding, chunk),
    }))
    .sort((a, b) => b.score - a.score)

  const selected: typeof ranked = []
  const perSourceCount = new Map<string, number>()
  for (const chunk of ranked) {
    const currentCount = perSourceCount.get(chunk.sourceUri) || 0
    if (currentCount >= 2) continue
    if (chunk.score <= 0 && selected.length >= 3) break
    selected.push(chunk)
    perSourceCount.set(chunk.sourceUri, currentCount + 1)
    if (selected.length >= 6) break
  }

  const citations = dedupe(selected.map((chunk) => `${chunk.title}|||${chunk.sourceUri}`)).map((value) => {
    const [title, url] = value.split('|||')
    return { title, url }
  })

  const context = selected.length
    ? [
        '# KNOWLEDGE BASE CONTEXT',
        `Knowledge Base: ${kb.name}`,
        '',
        ...selected.map(
          (chunk, index) =>
            `SOURCE [${index + 1}]\nTitle: ${chunk.title}\nReference: ${chunk.sourceUri}\nContent:\n${chunk.content}`
        ),
        '',
        'Use the retrieved passages as high-priority context. If the context is insufficient, say so clearly.',
      ].join('\n\n')
    : ''

  return {
    knowledgeBase: kb,
    citations,
    chunks: selected,
    context,
  }
}
