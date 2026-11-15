import fs from 'fs'
import path from 'path'
// xlsx and other heavy parsers are lazy-loaded inside extractFileText
import prisma from '@/lib/db'
import { OPENAI_EMBEDDINGS_URL } from './constants'

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

export type IndexProgressEvent = {
  stage: 'scan' | 'file' | 'embed' | 'save' | 'done' | 'error' | 'connect' | 'fetch_table' | 'table'
  file?: string
  table?: string
  done?: number
  total?: number
  chunkCount?: number
  stats?: { documentCount: number; chunkCount: number; semanticIndexed: boolean; sourceType?: string }
  error?: string
}

export const TEXT_EXTENSIONS = new Set([
  '.txt', '.md', '.mdx', '.json', '.csv', '.tsv',
  '.ts', '.tsx', '.js', '.jsx',
  '.css', '.scss', '.html', '.xml',
  '.yaml', '.yml', '.sql', '.prisma',
  '.py', '.go', '.rs', '.java',
  '.c', '.cpp', '.h', '.hpp', '.cs',
  '.sh', '.bat', '.ps1', '.env',
  '.toml', '.ini', '.cfg', '.conf',
  '.vue', '.svelte', '.php', '.rb',
  '.swift', '.kt', '.dart', '.lua', '.graphql'
])

const SKIP_DIRS = new Set(['.git', '.next', 'node_modules', 'dist', 'build', 'coverage', 'tmp', '.cache', 'out', '.svn'])
const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024 // Increased to 20MB to support larger PPTX/PDF files
const MAX_CHUNKS_PER_KB = 20000
const CHUNK_SIZE = 1500
const CHUNK_OVERLAP = 300
const CONCURRENT_FILE_PARSE = 4

// ── util ──────────────────────────────────────────────────────────────────────

function safeJsonParse<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback
  try { return JSON.parse(value) as T } catch { return fallback }
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
    for (let i = 0; i < group.length - 1; i += 1) tokens.push(group.slice(i, i + 2))
    return tokens
  })
  return dedupe([...latin, ...cjkTokens]).filter((t) => t.length > 1)
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0
  let count = 0, start = 0
  while (true) {
    const index = haystack.indexOf(needle, start)
    if (index === -1) break
    count += 1
    start = index + needle.length
  }
  return count
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function valueToText(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return value.map(valueToText).filter(Boolean).join('\n')
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>)
      .map(([k, v]) => `${k}: ${valueToText(v)}`).filter(Boolean).join('\n')
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
    for (let i = 0; i < paragraph.length; i += chunkSize - overlap) {
      pushChunk(paragraph.slice(i, i + chunkSize))
    }
    current = ''
  }
  if (current) pushChunk(current)
  return chunks
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (!a.length || !b.length || a.length !== b.length) return 0
  let dot = 0, normA = 0, normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]; normA += a[i] * a[i]; normB += b[i] * b[i]
  }
  if (!normA || !normB) return 0
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

function sanitizeKnowledgeBaseConfig(sourceType: string, config: JsonObject): JsonObject {
  if (sourceType !== 'api') return config
  const sanitized = { ...config }
  if (sanitized.headers && typeof sanitized.headers === 'object') {
    const headers = { ...(sanitized.headers as Record<string, unknown>) }
    for (const key of Object.keys(headers)) {
      if (/authorization|token|secret|key/i.test(key)) headers[key] = '******'
    }
    sanitized.headers = headers
  }
  return sanitized
}

// ── file parsing ──────────────────────────────────────────────────────────────

export async function extractFileText(filePath: string): Promise<string> {
  const ext = path.extname(filePath).toLowerCase()
  console.log(`[Knowledge] Extracting text from ${ext} file: ${path.basename(filePath)}`)

  try {
    if (ext === '.pdf') {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const PDFParser = require('pdf2json')
        const pdfParser = new PDFParser(null, 1) // 1 means text-only format

        return new Promise<string>((resolve, reject) => {
          pdfParser.on('pdfParser_dataError', (errData: { parserError: Error }) => reject(errData.parserError))
          pdfParser.on('pdfParser_dataReady', () => {
            let fullText = ''
            try {
              // Extract text cleanly from the text-only output format
              fullText = pdfParser.getRawTextContent()
            } catch (e: unknown) {
              console.error(`[Knowledge] Error extracting raw text from pdf2json:`, (e as Error).message)
            }
            const normalized = normalizeText(fullText)
            console.log(`[Knowledge] PDF extraction (pdf2json) success: ${normalized.length} characters`)
            resolve(normalized)
          })

          const buf = fs.readFileSync(filePath)
          pdfParser.parseBuffer(buf)
        })
      } catch (err: unknown) {
        console.error(`[Knowledge] PDF parse error:`, (err as Error).message)
        return ''
      }
    }

    if (ext === '.docx' || ext === '.doc' || ext === '.pptx' || ext === '.ppt' || ext === '.odt' || ext === '.odp' || ext === '.ods') {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const OfficeParser = require('officeparser')
        const result = await OfficeParser.parseOffice(filePath)
        
        // officeparser v6.0+ might return an object with toText() or just a string
        let text = ''
        if (typeof result === 'string') {
          text = result
        } else if (result && typeof result.toText === 'function') {
          text = result.toText()
        } else if (result && typeof result.text === 'string') {
          text = result.text
        } else {
          text = String(result || '')
        }

        const normalized = normalizeText(text)
        console.log(`[Knowledge] Office extraction success (${ext}): ${normalized.length} characters`)
        return normalized
      } catch (err: unknown) {
        console.error(`[Knowledge] Office parse error (${ext}):`, (err as Error).message)
        return ''
      }
    }

    if (ext === '.xlsx' || ext === '.xls') {
      try {
        const xlsx = await import('xlsx')
        const buf = fs.readFileSync(filePath)
        const workbook = xlsx.read(buf, { type: 'buffer', cellFormula: false, cellHTML: false, cellText: true })
        const text = normalizeText(
          workbook.SheetNames.map((name: string) => {
            const sheet = workbook.Sheets[name]
            // Skip empty sheets
            const csv = xlsx.utils.sheet_to_csv(sheet).trim()
            if (!csv) return ''
            return `--- SHEET: ${name} ---\n${csv}`
          }).filter(Boolean).join('\n\n')
        )
        console.log(`[Knowledge] Excel extraction (Deep mode) success: ${text.length} characters`)
        return text
      } catch (err: unknown) {
        console.error(`[Knowledge] Excel parse error:`, (err as Error).message)
        return ''
      }
    }

    if (!TEXT_EXTENSIONS.has(ext)) {
      // Null-byte dynamic detection to support ALL text formats
      try {
        const buffer = fs.readFileSync(filePath)
        let isBinary = false
        const detectLength = Math.min(buffer.length, 1024)
        for (let i = 0; i < detectLength; i++) {
          if (buffer[i] === 0) {
            isBinary = true
            break
          }
        }
        if (!isBinary) {
          const content = buffer.toString('utf8')
          const normalized = normalizeText(content)
          console.log(`[Knowledge] Text auto-detected success (${ext}): ${normalized.length} characters`)
          return normalized
        }
      } catch (err) {
        console.error(`[Knowledge] Text auto-detection failed for ${filePath}:`, (err as Error).message)
      }
      console.warn(`[Knowledge] Extension ${ext} not in text whitelist and detected as binary, skip.`)
      return ''
    }
    
    const content = fs.readFileSync(filePath, 'utf8')
    const normalized = normalizeText(content)
    console.log(`[Knowledge] Text extraction success: ${normalized.length} characters`)
    return normalized
  } catch (err: unknown) {
    console.error(`[Knowledge] Critical error extracting text from ${filePath}:`, (err as Error).message)
    return ''
  }
}

function walkDirectory(rootPath: string): string[] {
  const queue = [rootPath]
  const files: string[] = []

  while (queue.length > 0) {
    const current = queue.pop()!
    let entries: fs.Dirent[]
    try { entries = fs.readdirSync(current, { withFileTypes: true }) } catch { continue }

    for (const entry of entries) {
      const fullPath = path.join(current, entry.name)
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) queue.push(fullPath)
        continue
      }
      const ext = path.extname(entry.name).toLowerCase()
      const isExplicitFile = ['dockerfile', 'makefile', '.gitignore'].includes(entry.name.toLowerCase()) || entry.name.toLowerCase().startsWith('.env.')

      if (!isExplicitFile && !TEXT_EXTENSIONS.has(ext) && !['.pdf', '.docx', '.pptx', '.xlsx', '.xls', '.csv'].includes(ext)) {
        continue
      }
      try {
        const stats = fs.statSync(fullPath)
        if (stats.size > MAX_FILE_SIZE_BYTES) continue
        files.push(fullPath)
      } catch { /* ignore stat errors */ }
    }
  }
  return files
}

// ── embedding ─────────────────────────────────────────────────────────────────

async function createEmbeddings(
  texts: string[],
  settings: { openaiKey?: string | null; hybridSearchEnabled?: boolean | null; embeddingModel?: string | null }
): Promise<number[][] | null> {
  if (!texts.length) return []
  if (!settings.openaiKey || settings.hybridSearchEnabled === false) return null

  const batches: string[][] = []
  for (let i = 0; i < texts.length; i += 32) batches.push(texts.slice(i, i + 32))

  const vectors: number[][] = []
  for (const batch of batches) {
    const response = await fetch(OPENAI_EMBEDDINGS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${settings.openaiKey}` },
      body: JSON.stringify({ model: settings.embeddingModel || 'text-embedding-3-small', input: batch }),
    })
    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      throw new Error(`Embedding request failed (${response.status}): ${detail}`)
    }
    const payload = (await response.json()) as { data?: Array<{ embedding: number[] }> }
    vectors.push(...(payload.data || []).map((e) => e.embedding))
  }
  return vectors
}

// ── stream indexing ───────────────────────────────────────────────────────────

/**
 * Indexes a knowledge base, yielding progress events as files are processed.
 * This allows the API route to stream progress to the frontend via SSE.
 */
export async function* indexKnowledgeBaseStream(
  knowledgeBaseId: string
): AsyncGenerator<IndexProgressEvent> {
  await prisma.knowledgeBase.update({
    where: { id: knowledgeBaseId },
    data: { status: 'indexing', lastError: '' },
  })

  const kb = await prisma.knowledgeBase.findUnique({ where: { id: knowledgeBaseId } })
  if (!kb) {
    yield { stage: 'error', error: 'Knowledge base not found' }
    return
  }

  try {
    const config = safeJsonParse<JsonObject>(kb.config, {})
    const rootPath = path.resolve(String(config.rootPath || kb.path || ''))
    
    // SAFETY GUARD: If path resolves to current working directory but sourceType is not 'local',
    // it likely means a database or other source was incorrectly routed here.
    if (rootPath === path.resolve('.') && kb.sourceType !== 'local') {
      yield { stage: 'error', error: `Attempted to index project root for non-local source (${kb.sourceType})` }
      return
    }

    // Phase 1: scan
    yield { stage: 'scan', total: 0 }
    let files: string[] = []
    if (fs.statSync(rootPath).isFile()) {
      files = [rootPath]
    } else {
      files = walkDirectory(rootPath)
    }
    const total = files.length
    yield { stage: 'scan', total }

    // Phase 2: parse files with sequential batches for true streaming progress
    const allDocs: KnowledgeDocument[] = []
    let done = 0

    for (let batchStart = 0; batchStart < files.length; batchStart += CONCURRENT_FILE_PARSE) {
      const batch = files.slice(batchStart, batchStart + CONCURRENT_FILE_PARSE)
      const results = await Promise.allSettled(batch.map(f => extractFileText(f)))

      for (let i = 0; i < batch.length; i++) {
        const filePath = batch[i]
        const result = results[i]
        done++

        if (result.status === 'fulfilled' && result.value) {
          allDocs.push({
            title: path.relative(rootPath, filePath) || path.basename(filePath),
            sourceUri: `file://${filePath}`,
            content: result.value,
            metadata: { absolutePath: filePath, relativePath: path.relative(rootPath, filePath) },
          })
        }

        yield {
          stage: 'file',
          file: path.basename(filePath),
          done,
          total,
        }
      }
    }

    // Phase 3: chunk
    const chunks: ChunkCandidate[] = []
    for (const doc of allDocs) {
      const contentChunks = chunkText(doc.content)
      for (const [chunkIndex, content] of contentChunks.entries()) {
        chunks.push({
          sourceUri: doc.sourceUri,
          title: doc.title,
          chunkIndex,
          content,
          keywords: tokenize(`${doc.title}\n${content}`).join(' '),
          metadata: doc.metadata || {},
        })
        if (chunks.length >= MAX_CHUNKS_PER_KB) break
      }
      if (chunks.length >= MAX_CHUNKS_PER_KB) break
    }

    // Phase 4: embeddings (optional)
    yield { stage: 'embed' }
    const settings = await prisma.settings.findUnique({ where: { id: 'default' } })
    let embeddings: number[][] | null = null
    if (chunks.length > 0) {
      try {
        embeddings = await createEmbeddings(chunks.map(c => c.content), settings || {})
      } catch {
        // Fallback to lexical only
      }
    }

    // Phase 5: save to DB
    yield { stage: 'save' }
    await prisma.$transaction([
      prisma.knowledgeChunk.deleteMany({ where: { knowledgeBaseId } }),
      ...(chunks.length > 0 ? [
        prisma.knowledgeChunk.createMany({
          data: chunks.map((chunk, idx) => ({
            knowledgeBaseId,
            sourceUri: chunk.sourceUri,
            title: chunk.title,
            chunkIndex: chunk.chunkIndex,
            content: chunk.content,
            keywords: chunk.keywords,
            metadata: JSON.stringify(chunk.metadata || {}),
            embedding: embeddings?.[idx] ? JSON.stringify(embeddings[idx]) : null,
          })),
        }),
      ] : []),
    ])

    const stats = {
      documentCount: allDocs.length,
      chunkCount: chunks.length,
      semanticIndexed: Boolean(embeddings?.length),
    }

    await prisma.knowledgeBase.update({
      where: { id: knowledgeBaseId },
      data: { status: 'ready', lastError: '', lastIndexedAt: new Date(), stats: JSON.stringify(stats) },
    })

    yield { stage: 'done', stats }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Knowledge base indexing failed'
    await prisma.knowledgeBase.update({
      where: { id: knowledgeBaseId },
      data: { status: 'error', lastError: message },
    }).catch(() => {})
    yield { stage: 'error', error: message }
  }
}

// ── Database source indexer ────────────────────────────────────────────────────

export async function* indexDatabaseSourceStream(
  knowledgeBaseId: string
): AsyncGenerator<IndexProgressEvent> {
  await prisma.knowledgeBase.update({ where: { id: knowledgeBaseId }, data: { status: 'indexing', lastError: '' } })
  const kb = await prisma.knowledgeBase.findUnique({ where: { id: knowledgeBaseId } })
  if (!kb) { yield { stage: 'error', error: 'Knowledge base not found' }; return }

  try {
    const config = safeJsonParse<JsonObject>(kb.config, {})
    const dbType = String(config.type || 'sqlite')
    const selectedTables = Array.isArray(config.tables) ? (config.tables as string[]) : []

    yield { stage: 'connect', total: 0 }

    // Open connection
    let queryFn: (sql: string) => Promise<Record<string, unknown>[]>
    let closeFn: () => Promise<void> = async () => {}

    if (dbType === 'sqlite') {
      const Database = (await import('better-sqlite3')).default
      const db = new Database(String(config.filePath || ''))
      queryFn = async (sql: string) => db.prepare(sql).all() as Record<string, unknown>[]
      closeFn = async () => { db.close() }
    } else if (dbType === 'mysql') {
      const mysql = await import('mysql2/promise')
      const csStr = String(config.connectionString || '')
      const conn = csStr
        ? await mysql.createConnection(csStr)
        : await mysql.createConnection({
            host: String(config.host || 'localhost'), port: Number(config.port || 3306),
            user: String(config.user || ''), password: String(config.password || ''),
            database: String(config.database || ''),
          })
      queryFn = async (sql: string) => { const [rows] = await conn.execute(sql); return rows as Record<string, unknown>[] }
      closeFn = async () => { await conn.end() }
    } else if (dbType === 'postgresql') {
      const { Client } = await import('pg')
      const csStr = String(config.connectionString || '')
      const client = csStr
        ? new Client(csStr)
        : new Client({
            host: String(config.host || 'localhost'), port: Number(config.port || 5432),
            user: String(config.user || ''), password: String(config.password || ''),
            database: String(config.database || ''),
          })
      await client.connect()
      queryFn = async (sql: string) => { const res = await client.query(sql); return res.rows }
      closeFn = async () => { await client.end() }
    } else if (dbType === 'sqlserver') {
      const mssql = await import('mssql')
      const csStr = String(config.connectionString || '')
      const pool = csStr
        ? await mssql.connect(csStr)
        : await mssql.connect({
            user: String(config.user || ''), password: String(config.password || ''),
            server: String(config.host || 'localhost'), port: Number(config.port || 1433),
            database: String(config.database || ''),
            options: { encrypt: true, trustServerCertificate: true }
          })
      queryFn = async (sql: string) => { const res = await pool.request().query(sql); return res.recordset }
      closeFn = async () => { await pool.close() }
    } else if (dbType === 'mongodb') {
      const { MongoClient } = await import('mongodb')
      const uri = config.connectionString 
        ? String(config.connectionString)
        : `mongodb://${config.user ? `${config.user}:${config.password}@` : ''}${config.host || 'localhost'}:${config.port || 27017}/${config.database || ''}`
      const client = new MongoClient(uri)
      await client.connect()
      const db = client.db(config.database ? String(config.database) : undefined)
      queryFn = async (collectionName: string) => {
        // Here we overload queryFn to take collection name
        const docs = await db.collection(collectionName).find({}).limit(5000).toArray()
        return docs as unknown as Record<string, unknown>[]
      }
      closeFn = async () => { await client.close() }
    } else if (dbType === 'redis') {
      const Redis = (await import('ioredis')).default
      const client = config.connectionString 
        ? new Redis(String(config.connectionString)) 
        : new Redis({
            host: String(config.host || 'localhost'),
            port: Number(config.port || 6379),
            password: config.password ? String(config.password) : undefined,
            db: config.database ? parseInt(String(config.database), 10) : 0
          })
      queryFn = async (key: string) => {
        // QueryFn takes key pattern for Redis
        const type = await client.type(key)
        let data: any
        if (type === 'string') data = await client.get(key)
        else if (type === 'hash') data = await client.hgetall(key)
        else if (type === 'list') data = await client.lrange(key, 0, -1)
        else if (type === 'set') data = await client.smembers(key)
        else if (type === 'zset') data = await client.zrange(key, 0, -1, 'WITHSCORES')
        else data = `Unsupported type: ${type}`
        return [{ key, type, data }] as Record<string, unknown>[]
      }
      closeFn = async () => { client.disconnect() }
    } else {
      yield { stage: 'error', error: `Unsupported DB type: ${dbType}` }; return
    }

    // Determine tables to import
    const customSql = String(config.customSql || '')
    let tables = selectedTables
    if (tables.length === 0) {
      // Auto-discover all tables
      let discoverSql = 'SHOW TABLES'
      if (dbType === 'sqlite') discoverSql = `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`
      if (dbType === 'postgresql') discoverSql = `SELECT table_name as name FROM information_schema.tables WHERE table_schema='public'`
      if (dbType === 'sqlserver') discoverSql = `SELECT TABLE_NAME as name FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE'`
      
      if (dbType === 'mongodb') {
        const { MongoClient } = await import('mongodb')
        const uri = config.connectionString ? String(config.connectionString) : `mongodb://${config.user ? `${config.user}:${config.password}@` : ''}${config.host || 'localhost'}:${config.port || 27017}/${config.database || ''}`
        const client = new MongoClient(uri)
        await client.connect()
        const collections = await client.db(config.database ? String(config.database) : undefined).listCollections().toArray()
        tables = collections.map(c => c.name)
        await client.close()
      } else if (dbType === 'redis') {
        const Redis = (await import('ioredis')).default
        const client = config.connectionString ? new Redis(String(config.connectionString)) : new Redis({ host: String(config.host || 'localhost'), port: Number(config.port || 6379), password: config.password ? String(config.password) : undefined, db: config.database ? parseInt(String(config.database), 10) : 0 })
        tables = await client.keys('*')
        if (tables.length > 100) tables = tables.slice(0, 100) // limit for safety
        client.disconnect()
      } else {
        const rows = await queryFn(discoverSql)
        tables = rows.map(r => String(Object.values(r)[0] || ''))
      }
    }

    const allDocs: KnowledgeDocument[] = []
    yield { stage: 'fetch_table', total: tables.length, done: 0 }

    const quote = (name: string) => dbType === 'mysql' ? `\`${name}\`` : dbType === 'sqlserver' ? `[${name}]` : `"${name}"`

    for (let ti = 0; ti < tables.length; ti++) {
      const tableName = tables[ti]
      yield { stage: 'table', table: tableName, done: ti + 1, total: tables.length }
      try {
        let rows: Record<string, unknown>[] = []
        if (dbType === 'mongodb' || dbType === 'redis') {
           rows = await queryFn(tableName)
        } else {
           const sql = customSql 
             ? customSql.replace(/\{table\}/g, quote(tableName)) 
             : dbType === 'sqlserver'
               ? `SELECT TOP 5000 * FROM ${quote(tableName)}`
               : `SELECT * FROM ${quote(tableName)} LIMIT 5000`
           rows = await queryFn(sql)
        }

        if (rows.length > 0) {
          const headers = Object.keys(rows[0])
          const header = `Table: ${tableName}\nColumns: ${headers.join(', ')}\n\n`
          const rowsText = rows.map((row, idx) =>
            `Row ${idx + 1}:\n${headers.map(h => {
               let val = row[h];
               if (typeof val === 'object') val = JSON.stringify(val);
               return `  ${h}: ${val ?? ''}`;
            }).join('\n')}`
          ).join('\n\n')
          allDocs.push({
            title: `[DB] ${kb.name} -> ${tableName}`,
            sourceUri: `db://${dbType}/${tableName}`,
            content: header + rowsText,
            metadata: { tableName, dbType, rowCount: rows.length },
          })
        }
      } catch (tableErr: unknown) {
        console.warn(`[KB-DB] Failed to query table ${tableName}:`, (tableErr as Error).message)
      }
    }

    await closeFn()

    // Chunk + embed + save using the shared pipeline
    const chunks: ChunkCandidate[] = []
    for (const doc of allDocs) {
      for (const [ci, content] of chunkText(doc.content).entries()) {
        chunks.push({ sourceUri: doc.sourceUri, title: doc.title, chunkIndex: ci, content, keywords: tokenize(`${doc.title}\n${content}`).join(' '), metadata: doc.metadata || {} })
        if (chunks.length >= MAX_CHUNKS_PER_KB) break
      }
      if (chunks.length >= MAX_CHUNKS_PER_KB) break
    }

    yield { stage: 'embed' }
    const settings = await prisma.settings.findUnique({ where: { id: 'default' } })
    let embeddings: number[][] | null = null
    if (chunks.length > 0) {
      try { embeddings = await createEmbeddings(chunks.map(c => c.content), settings || {}) } catch { }
    }

    yield { stage: 'save' }
    await prisma.$transaction([
      prisma.knowledgeChunk.deleteMany({ where: { knowledgeBaseId } }),
      ...(chunks.length > 0 ? [prisma.knowledgeChunk.createMany({
        data: chunks.map((chunk, idx) => ({
          knowledgeBaseId, sourceUri: chunk.sourceUri, title: chunk.title,
          chunkIndex: chunk.chunkIndex, content: chunk.content, keywords: chunk.keywords,
          metadata: JSON.stringify(chunk.metadata || {}),
          embedding: embeddings?.[idx] ? JSON.stringify(embeddings[idx]) : null,
        })),
      })] : []),
    ])

    const stats = { documentCount: allDocs.length, chunkCount: chunks.length, semanticIndexed: Boolean(embeddings?.length), sourceType: 'database' }
    await prisma.knowledgeBase.update({ where: { id: knowledgeBaseId }, data: { status: 'ready', lastError: '', lastIndexedAt: new Date(), stats: JSON.stringify(stats) } })
    yield { stage: 'done', stats }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Database indexing failed'
    await prisma.knowledgeBase.update({ where: { id: knowledgeBaseId }, data: { status: 'error', lastError: message } }).catch(() => {})
    yield { stage: 'error', error: message }
  }
}

// ── legacy compat: used by createKnowledgeBase ─────────────────────────────────

export async function indexKnowledgeBase(knowledgeBaseId: string) {
  const kb = await prisma.knowledgeBase.findUnique({ where: { id: knowledgeBaseId } })
  if (!kb) return

  // Dispatch to the correct streaming indexer based on sourceType
  const generator = kb.sourceType === 'database'
    ? indexDatabaseSourceStream(knowledgeBaseId)
    : indexKnowledgeBaseStream(knowledgeBaseId)

  let lastStats: IndexProgressEvent['stats']
  for await (const event of generator) {
    if (event.stage === 'done') lastStats = event.stats
    if (event.stage === 'error') {
      console.error(`[Knowledge] Indexing error for ${knowledgeBaseId}:`, event.error)
      throw new Error(event.error)
    }
  }
  return lastStats
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

function serializeKnowledgeBase(record: { id: string; name: string; sourceType: string; engine: string; path: string | null; config: string | null; stats: string | null; status: string; lastError: string | null; lastIndexedAt: Date | null; tags: string | null; createdAt: Date; updatedAt: Date; _count?: { chunks: number } }) {
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
    tags: record.tags,
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

export async function getKnowledgeBase(id: string) {
  const record = await prisma.knowledgeBase.findUnique({
    where: { id },
    include: { _count: { select: { chunks: true } } },
  })
  return record ? serializeKnowledgeBase(record) : null
}

export async function createKnowledgeBase(input: {
  name: string
  sourceType?: string
  engine?: string
  path?: string | null
  config?: JsonObject | string
  tags?: string[]
}) {
  const sourceType = input.sourceType || 'local'
  const config = typeof input.config === 'string' ? safeJsonParse<JsonObject>(input.config, {}) : (input.config || {})
  const normalizedPath = input.path ? path.resolve(input.path) : null

  if (!input.name?.trim()) throw new Error('Name is required')

  if (sourceType === 'local') {
    if (!normalizedPath) throw new Error('Local directory or file path is required')
    if (!fs.existsSync(normalizedPath) || (!fs.statSync(normalizedPath).isDirectory() && !fs.statSync(normalizedPath).isFile())) {
      throw new Error('Directory or file does not exist or is inaccessible')
    }
    config.rootPath = normalizedPath
  }

  if (sourceType === 'api') {
    const url = String(config.url || '')
    if (!url) throw new Error('API URL is required')
    try { new URL(url) } catch { throw new Error('API URL is invalid') }
  }

  if (sourceType === 'database') {
    const dbType = String(config.type || '')
    if (!['mysql', 'postgresql', 'sqlite'].includes(dbType)) {
      throw new Error('Unsupported database type. Use mysql, postgresql, or sqlite.')
    }
    if (dbType === 'sqlite' && !config.filePath) {
      throw new Error('SQLite file path is required')
    }
    if (dbType !== 'sqlite' && !config.host && !config.connectionString) {
      throw new Error('Database host or connection string is required')
    }
  }

  const kb = await prisma.knowledgeBase.create({
    data: {
      name: input.name.trim(),
      sourceType,
      engine: input.engine || (
        sourceType === 'api' ? 'json-api' 
        : sourceType === 'database' ? 'database'
        : 'directory'
      ),
      path: normalizedPath,
      config: JSON.stringify(config),
      stats: JSON.stringify({}),
      status: 'idle',
      lastError: '',
      tags: input.tags?.length ? JSON.stringify(input.tags) : null,
    },
  })

  return kb
}

export async function deleteKnowledgeBase(knowledgeBaseId: string) {
  await prisma.knowledgeBase.delete({ where: { id: knowledgeBaseId } })
}

export async function updateKnowledgeBase(id: string, input: { name?: string; tags?: string[] }) {
  const data: Record<string, unknown> = {}
  if (input.name !== undefined) data.name = input.name.trim()
  if (input.tags !== undefined) data.tags = input.tags.length ? JSON.stringify(input.tags) : null
  return prisma.knowledgeBase.update({ where: { id }, data })
}

// ── retrieval ─────────────────────────────────────────────────────────────────

export async function buildKnowledgeContext(knowledgeBaseId: string, query: string) {
  let kb = await prisma.knowledgeBase.findUnique({
    where: { id: knowledgeBaseId },
    include: { _count: { select: { chunks: true } } },
  })

  if (!kb) return null

  // Auto-index if not ready
  const chunkCount = kb._count?.chunks ?? 0
  if (chunkCount === 0 || kb.status !== 'ready') {
    await indexKnowledgeBase(knowledgeBaseId)
    kb = await prisma.knowledgeBase.findUnique({
      where: { id: knowledgeBaseId },
      include: { _count: { select: { chunks: true } } },
    })
  }

  if (!kb) return null

  const totalChunks = kb._count?.chunks ?? 0
  if (totalChunks === 0) {
    return { knowledgeBase: kb, citations: [] as Array<{ title: string; url: string }>, chunks: [], context: '' }
  }

  const queryTokens = tokenize(query)
  const LEXICAL_TOP_K = 50

  // ── Stage 1: Load only keywords/metadata (no embedding) for lexical pre-filtering ──
  const lightweightChunks = await prisma.knowledgeChunk.findMany({
    where: { knowledgeBaseId },
    select: { id: true, keywords: true, sourceUri: true, title: true, chunkIndex: true, content: true },
  })

  // Compute lexical scores for all chunks
  const queryLower = query.toLowerCase()
  const scored = lightweightChunks.map((chunk) => {
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

    // Path boost
    const pathTokens = tokenize(chunk.title.split(/[\\/.]/).join(' '))
    let pathMatches = 0
    for (const t of queryTokens) if (pathTokens.includes(t)) pathMatches++
    if (pathMatches > 0) lexicalScore += pathMatches * 15

    return { id: chunk.id, score: lexicalScore }
  })

  scored.sort((a, b) => b.score - a.score)
  const topIds = scored.slice(0, LEXICAL_TOP_K).map((s) => s.id)

  // ── Stage 2: Load full data (with embedding) only for top-K candidates ──
  const topChunks = await prisma.knowledgeChunk.findMany({
    where: { id: { in: topIds } },
  })

  // Build a score lookup from stage 1
  const scoreMap = new Map(scored.map((s) => [s.id, s.score]))

  const settings = await prisma.settings.findUnique({ where: { id: 'default' } })
  let queryEmbedding: number[] | null = null

  if (topChunks.some((c) => c.embedding)) {
    try {
      const vectors = await createEmbeddings([query], settings || {})
      queryEmbedding = vectors?.[0] || null
    } catch { /* fallback to lexical */ }
  }

  // Re-score with semantic similarity added
  const ranked = topChunks
    .map((chunk) => {
      let score = scoreMap.get(chunk.id) || 0

      // Add semantic score
      if (queryEmbedding && chunk.embedding) {
        const vector = safeJsonParse<number[]>(chunk.embedding, [])
        score += cosineSimilarity(queryEmbedding, vector) * 12
      }

      return { ...chunk, score }
    })
    .sort((a, b) => b.score - a.score)

  // Top 20, but with Dynamic Noise Filtering (drop garbage chunks relative to best match)
  const topScore = ranked[0]?.score || 0
  const dynamicThreshold = Math.max(0.5, topScore * 0.25)
  const selected = ranked.filter((c) => c.score >= dynamicThreshold).slice(0, 20)

  // Context Merging (Group by File to prevent disjointed reading)
  const groupedByFile = new Map<string, typeof selected>()
  for (const c of selected) {
    const list = groupedByFile.get(c.sourceUri) || []
    list.push(c)
    groupedByFile.set(c.sourceUri, list)
  }

  const mergedSnippets: string[] = []
  let sourceIndex = 1
  for (const [uri, list] of groupedByFile.entries()) {
    // Sort physically by appearance in the file
    list.sort((a, b) => a.chunkIndex - b.chunkIndex)
    const title = list[0].title

    let fileContent = ''
    let lastIndex = -99
    for (const c of list) {
       if (lastIndex !== -99 && c.chunkIndex - lastIndex > 1) {
          fileContent += '\n\n... (other code) ...\n\n'
       } else if (lastIndex !== -99) {
          fileContent += '\n\n'
       }
       fileContent += c.content
       lastIndex = c.chunkIndex
    }

    mergedSnippets.push(`SOURCE [${sourceIndex}]\nFile: ${title}\nReference: ${uri}\nContent:\n${fileContent}`)
    sourceIndex++
  }

  const citationMap = new Map<string, string>()
  for (const c of selected) citationMap.set(c.sourceUri, c.title)
  const citations = Array.from(citationMap.entries()).map(([url, title]) => ({ title, url }))

  const context = mergedSnippets.length
    ? [
        '# KNOWLEDGE BASE CONTEXT (WORLD-CLASS RAG)',
        `Knowledge Base: ${kb.name}`,
        '',
        ...mergedSnippets,
        '',
        'INSTRUCTIONS: Use the retrieved contiguous file passages above as high-priority, authoritative context. Cite sources using [1], [2], etc. immediately after relevant information. Ensure logical consistency across the single-file snippets provided. If the context is insufficient, state clearly what is missing.',
      ].join('\n\n')
    : ''

  return { knowledgeBase: kb, citations, chunks: selected, context }
}
