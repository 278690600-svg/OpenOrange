import fs from 'fs'
import path from 'path'
import * as xlsx from 'xlsx'
import Papa from 'papaparse'
import prisma from '@/lib/db'

type JsonObject = Record<string, unknown>

type TableColumn = {
  name: string
  type: string
}

type TableSnapshot = {
  name: string
  columns: TableColumn[]
  sample: Record<string, unknown>[]
}

const MAX_TABLES = 8
const MAX_SAMPLE_ROWS = 5

function safeJsonParse<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

function sanitizeConfig(config: JsonObject): JsonObject {
  const sanitized = { ...config }

  for (const key of Object.keys(sanitized)) {
    if (/password|secret|token|key/i.test(key)) {
      sanitized[key] = '******'
    }
  }

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

function normalizeTableRows(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return rows.slice(0, MAX_SAMPLE_ROWS).map((row) => {
    const normalized: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(row)) {
      if (value instanceof Date) normalized[key] = value.toISOString()
      else normalized[key] = value
    }
    return normalized
  })
}

function summarizeTables(tables: TableSnapshot[]): string {
  return tables
    .map((table) => `${table.name}(${table.columns.map((column) => `${column.name}:${column.type}`).join(', ')})`)
    .join('; ')
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

function toRowsFromSheet(sheet: xlsx.WorkSheet) {
  const rows = xlsx.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null })
  const headerRows = xlsx.utils.sheet_to_json(sheet, { header: 1, blankrows: false }) as unknown[][]
  const header = (headerRows[0] || []).map((value) => String(value))
  return {
    columns: header.map((name) => ({ name, type: 'string' })),
    rows: normalizeTableRows(rows),
  }
}

function buildMetadata(engine: string, tables: TableSnapshot[]) {
  return {
    engine,
    tableCount: tables.length,
    tables,
    summary: summarizeTables(tables),
  }
}

function escapePostgresIdentifier(identifier: string) {
  return `"${identifier.replace(/"/g, '""')}"`
}

function escapeMysqlIdentifier(identifier: string) {
  return `\`${identifier.replace(/`/g, '``')}\``
}

function escapeSqlServerIdentifier(identifier: string) {
  return `[${identifier.replace(/]/g, ']]')}]`
}

function splitTopLevel(input: string, delimiter: string): string[] {
  const parts: string[] = []
  let current = ''
  let quote: "'" | '"' | '`' | null = null
  let depth = 0

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index]
    const previous = input[index - 1]

    if (quote) {
      current += char
      if (char === quote && previous !== '\\') {
        quote = null
      }
      continue
    }

    if (char === "'" || char === '"' || char === '`') {
      quote = char
      current += char
      continue
    }

    if (char === '(') {
      depth += 1
      current += char
      continue
    }

    if (char === ')') {
      depth = Math.max(0, depth - 1)
      current += char
      continue
    }

    if (char === delimiter && depth === 0) {
      parts.push(current.trim())
      current = ''
      continue
    }

    current += char
  }

  if (current.trim()) parts.push(current.trim())
  return parts
}

function parseSqlLiteral(token: string): unknown {
  const trimmed = token.trim()
  if (/^null$/i.test(trimmed)) return null
  if (/^(true|false)$/i.test(trimmed)) return /^true$/i.test(trimmed)
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed)
  if ((trimmed.startsWith("'") && trimmed.endsWith("'")) || (trimmed.startsWith('"') && trimmed.endsWith('"'))) {
    return trimmed
      .slice(1, -1)
      .replace(/\\'/g, "'")
      .replace(/\\"/g, '"')
      .replace(/''/g, "'")
  }
  return trimmed
}

function parseSqlDump(text: string): TableSnapshot[] {
  const tables = new Map<string, TableSnapshot>()
  const createTableRegex = /CREATE TABLE\s+(?:IF NOT EXISTS\s+)?["`\[]?([\w.-]+)["`\]]?\s*\(([\s\S]*?)\);/gi
  const insertRegex = /INSERT INTO\s+["`\[]?([\w.-]+)["`\]]?\s*(?:\(([\s\S]*?)\))?\s+VALUES\s+([\s\S]*?);/gi

  let match: RegExpExecArray | null
  while ((match = createTableRegex.exec(text)) !== null) {
    const tableName = match[1]
    const body = match[2]
    const lines = body.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
    const columns = lines
      .filter((line) => !/^(primary|foreign|unique|constraint|key)\b/i.test(line))
      .map((line) => {
        const parts = line.replace(/,$/, '').split(/\s+/)
        const rawName = parts[0]?.replace(/^["`\[]?|["`\]]?$/g, '')
        return rawName
          ? {
              name: rawName,
              type: parts[1] || 'text',
            }
          : null
      })
      .filter(Boolean) as TableColumn[]

    tables.set(tableName, {
      name: tableName,
      columns,
      sample: [],
    })
  }

  while ((match = insertRegex.exec(text)) !== null) {
    const tableName = match[1]
    const columnsInput = match[2]
    const valuesInput = match[3]
    const columnNames = columnsInput
      ? splitTopLevel(columnsInput, ',').map((column) => column.replace(/^["`\[]?|["`\]]?$/g, '').trim())
      : tables.get(tableName)?.columns.map((column) => column.name) || []
    const tuples = splitTopLevel(valuesInput, ',').filter((item) => item.startsWith('('))

    const existing = tables.get(tableName) || {
      name: tableName,
      columns: columnNames.map((name) => ({ name, type: 'text' })),
      sample: [],
    }

    for (const tuple of tuples) {
      if (existing.sample.length >= MAX_SAMPLE_ROWS) break
      const rawValues = tuple.replace(/^\(/, '').replace(/\)$/, '')
      const parsedValues = splitTopLevel(rawValues, ',').map(parseSqlLiteral)
      const row = Object.fromEntries(columnNames.map((column, index) => [column, parsedValues[index] ?? null]))
      existing.sample.push(row)
    }

    if (existing.columns.length === 0) {
      existing.columns = columnNames.map((name) => ({ name, type: 'text' }))
    }
    tables.set(tableName, existing)
  }

  return Array.from(tables.values()).slice(0, MAX_TABLES)
}

async function inspectApiSource(config: JsonObject) {
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
    throw new Error(`API request failed (${response.status}): ${detail || response.statusText}`)
  }

  const payload = await response.json()
  const selected = getValueAtPath(payload, typeof config.dataPath === 'string' ? config.dataPath : undefined)

  if (Array.isArray(selected)) {
    const rows = normalizeTableRows(
      selected.slice(0, MAX_SAMPLE_ROWS).map((item) => (typeof item === 'object' && item ? (item as Record<string, unknown>) : { value: item }))
    )
    const columns = Array.from(
      new Set(rows.flatMap((row) => Object.keys(row)))
    ).map((name) => ({ name, type: 'json' }))
    return buildMetadata('rest', [{ name: 'api_records', columns, sample: rows }])
  }

  if (selected && typeof selected === 'object') {
    const row = selected as Record<string, unknown>
    const columns = Object.keys(row).map((name) => ({ name, type: 'json' }))
    return buildMetadata('rest', [{ name: 'api_payload', columns, sample: normalizeTableRows([row]) }])
  }

  return buildMetadata('rest', [{ name: 'api_payload', columns: [{ name: 'value', type: typeof selected }], sample: [{ value: selected }] }])
}

async function inspectPostgresSource(config: JsonObject) {
  const { Client } = await import('pg')
  const client = new Client({
    host: String(config.host || '127.0.0.1'),
    port: Number(config.port || 5432),
    user: String(config.user || ''),
    password: String(config.password || ''),
    database: String(config.database || ''),
    ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
  })

  await client.connect()
  try {
    const tablesRes = await client.query(
      `SELECT table_schema, table_name
       FROM information_schema.tables
       WHERE table_type = 'BASE TABLE'
         AND table_schema NOT IN ('pg_catalog', 'information_schema')
       ORDER BY table_schema, table_name
       LIMIT ${MAX_TABLES}`
    )

    const tables: TableSnapshot[] = []
    for (const row of tablesRes.rows) {
      const schemaName = row.table_schema as string
      const tableName = row.table_name as string
      const columnsRes = await client.query(
        `SELECT column_name, data_type
         FROM information_schema.columns
         WHERE table_schema = $1 AND table_name = $2
         ORDER BY ordinal_position`,
        [schemaName, tableName]
      )
      const sampleRes = await client.query(
        `SELECT * FROM ${escapePostgresIdentifier(schemaName)}.${escapePostgresIdentifier(tableName)} LIMIT ${MAX_SAMPLE_ROWS}`
      )
      tables.push({
        name: `${schemaName}.${tableName}`,
        columns: (columnsRes.rows as Array<{ column_name: string; data_type: string }>).map((column) => ({ name: column.column_name, type: column.data_type })),
        sample: normalizeTableRows(sampleRes.rows as Record<string, unknown>[]),
      })
    }

    return buildMetadata('postgres', tables)
  } finally {
    await client.end().catch(() => undefined)
  }
}

async function inspectMySqlSource(config: JsonObject) {
  const mysql = await import('mysql2/promise')
  const connection = await mysql.createConnection({
    host: String(config.host || '127.0.0.1'),
    port: Number(config.port || 3306),
    user: String(config.user || ''),
    password: String(config.password || ''),
    database: String(config.database || ''),
    ssl: config.ssl ? {} : undefined,
  })

  try {
    const [tableRows] = await connection.query(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = ?
       ORDER BY table_name
       LIMIT ${MAX_TABLES}`,
      [String(config.database || '')]
    )

    const tables: TableSnapshot[] = []
    for (const entry of tableRows as Array<{ table_name: string }>) {
      const tableName = entry.table_name
      const [columnRows] = await connection.query(
        `SELECT column_name, data_type
         FROM information_schema.columns
         WHERE table_schema = ? AND table_name = ?
         ORDER BY ordinal_position`,
        [String(config.database || ''), tableName]
      )
      const [sampleRows] = await connection.query(`SELECT * FROM ${escapeMysqlIdentifier(tableName)} LIMIT ${MAX_SAMPLE_ROWS}`)
      tables.push({
        name: tableName,
        columns: (columnRows as Array<{ column_name: string; data_type: string }>).map((column) => ({
          name: column.column_name,
          type: column.data_type,
        })),
        sample: normalizeTableRows(sampleRows as Record<string, unknown>[]),
      })
    }

    return buildMetadata('mysql', tables)
  } finally {
    await connection.end().catch(() => undefined)
  }
}

async function inspectSqlServerSource(config: JsonObject) {
  const sql = await import('mssql')
  const pool = await sql.connect({
    server: String(config.host || '127.0.0.1'),
    port: Number(config.port || 1433),
    user: String(config.user || ''),
    password: String(config.password || ''),
    database: String(config.database || ''),
    options: {
      encrypt: Boolean(config.encrypt),
      trustServerCertificate: true,
    },
  })

  try {
    const tableResult = await pool.request().query(
      `SELECT TOP ${MAX_TABLES} TABLE_SCHEMA, TABLE_NAME
       FROM INFORMATION_SCHEMA.TABLES
       WHERE TABLE_TYPE = 'BASE TABLE'
       ORDER BY TABLE_SCHEMA, TABLE_NAME`
    )

    const tables: TableSnapshot[] = []
    for (const row of tableResult.recordset as Array<{ TABLE_SCHEMA: string; TABLE_NAME: string }>) {
      const schemaName = row.TABLE_SCHEMA
      const tableName = row.TABLE_NAME
      const columnResult = await pool
        .request()
        .input('schemaName', sql.NVarChar, schemaName)
        .input('tableName', sql.NVarChar, tableName)
        .query(
          `SELECT COLUMN_NAME, DATA_TYPE
           FROM INFORMATION_SCHEMA.COLUMNS
           WHERE TABLE_SCHEMA = @schemaName AND TABLE_NAME = @tableName
           ORDER BY ORDINAL_POSITION`
        )
      const sampleResult = await pool
        .request()
        .query(`SELECT TOP ${MAX_SAMPLE_ROWS} * FROM ${escapeSqlServerIdentifier(schemaName)}.${escapeSqlServerIdentifier(tableName)}`)
      tables.push({
        name: `${schemaName}.${tableName}`,
        columns: (columnResult.recordset as Array<{ COLUMN_NAME: string; DATA_TYPE: string }>).map((column) => ({
          name: column.COLUMN_NAME,
          type: column.DATA_TYPE,
        })),
        sample: normalizeTableRows(sampleResult.recordset as Record<string, unknown>[]),
      })
    }

    return buildMetadata('sqlserver', tables)
  } finally {
    await pool.close()
  }
}

async function inspectSqliteFile(filePath: string) {
  const initSqlJs = (await import('sql.js')).default
  const SQL = await initSqlJs({})
  const db = new SQL.Database(fs.readFileSync(filePath))

  const tableQuery = db.exec(
    `SELECT name
     FROM sqlite_master
     WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
     ORDER BY name
     LIMIT ${MAX_TABLES}`
  )
  const tableNames = tableQuery[0]?.values.map((row) => String(row[0])) || []

  const tables: TableSnapshot[] = []
  for (const tableName of tableNames) {
    const columnsResult = db.exec(`PRAGMA table_info(${JSON.stringify(tableName)})`)
    const columnRows = columnsResult[0]?.values || []
    const columns = columnRows.map((row) => ({
      name: String(row[1]),
      type: String(row[2] || 'text'),
    }))

    const sampleResult = db.exec(`SELECT * FROM ${JSON.stringify(tableName)} LIMIT ${MAX_SAMPLE_ROWS}`)
    const sampleColumns = sampleResult[0]?.columns || []
    const sampleRows = (sampleResult[0]?.values || []).map((values) =>
      Object.fromEntries(sampleColumns.map((column, index) => [column, values[index]]))
    )

    tables.push({
      name: tableName,
      columns,
      sample: normalizeTableRows(sampleRows as Record<string, unknown>[]),
    })
  }

  db.close()
  return buildMetadata('sqlite', tables)
}

async function inspectBackupFile(filePath: string) {
  const extension = path.extname(filePath).toLowerCase()

  if (['.db', '.sqlite', '.sqlite3'].includes(extension)) {
    return inspectSqliteFile(filePath)
  }

  if (extension === '.json') {
    const payload = JSON.parse(fs.readFileSync(filePath, 'utf8')) as unknown
    if (Array.isArray(payload)) {
      const rows = normalizeTableRows(
        payload.slice(0, MAX_SAMPLE_ROWS).map((item) => (typeof item === 'object' && item ? (item as Record<string, unknown>) : { value: item }))
      )
      const columns = Array.from(new Set(rows.flatMap((row) => Object.keys(row)))).map((name) => ({ name, type: 'json' }))
      return buildMetadata('json', [{ name: 'records', columns, sample: rows }])
    }

    if (payload && typeof payload === 'object') {
      const objectPayload = payload as Record<string, unknown>
      const tableEntries = Object.entries(objectPayload).filter(([, value]) => Array.isArray(value))
      if (tableEntries.length > 0) {
        const tables = tableEntries.slice(0, MAX_TABLES).map(([tableName, value]) => {
          const rows = normalizeTableRows(
            (value as unknown[]).slice(0, MAX_SAMPLE_ROWS).map((item) =>
              typeof item === 'object' && item ? (item as Record<string, unknown>) : { value: item }
            )
          )
          const columns = Array.from(new Set(rows.flatMap((row) => Object.keys(row)))).map((name) => ({ name, type: 'json' }))
          return { name: tableName, columns, sample: rows }
        })
        return buildMetadata('json', tables)
      }

      const row = objectPayload
      const columns = Object.keys(row).map((name) => ({ name, type: 'json' }))
      return buildMetadata('json', [{ name: 'payload', columns, sample: normalizeTableRows([row]) }])
    }
  }

  if (extension === '.csv') {
    const csv = fs.readFileSync(filePath, 'utf8')
    const parsed = Papa.parse<Record<string, unknown>>(csv, { header: true, skipEmptyLines: true })
    const columns = (parsed.meta.fields || []).map((name) => ({ name, type: 'string' }))
    return buildMetadata('csv', [{ name: path.basename(filePath, extension), columns, sample: normalizeTableRows(parsed.data) }])
  }

  if (extension === '.xlsx' || extension === '.xls') {
    const workbook = xlsx.readFile(filePath)
    const tables = workbook.SheetNames.slice(0, MAX_TABLES).map((sheetName) => {
      const { columns, rows } = toRowsFromSheet(workbook.Sheets[sheetName])
      return {
        name: sheetName,
        columns,
        sample: rows,
      }
    })
    return buildMetadata('xlsx', tables)
  }

  if (extension === '.sql') {
    const dump = fs.readFileSync(filePath, 'utf8')
    return buildMetadata('sql-dump', parseSqlDump(dump))
  }

  throw new Error('Unsupported backup file type')
}

async function inspectSource(record: { type: string; engine: string; path: string | null; config: string }) {
  const config = safeJsonParse<JsonObject>(record.config, {})

  if (record.type === 'api' || record.engine === 'rest') {
    return inspectApiSource(config)
  }

  if (record.engine === 'postgres') {
    return inspectPostgresSource(config)
  }

  if (record.engine === 'mysql') {
    return inspectMySqlSource(config)
  }

  if (record.engine === 'sqlserver') {
    return inspectSqlServerSource(config)
  }

  if (record.engine === 'sqlite' && record.path) {
    return inspectSqliteFile(record.path)
  }

  if (record.type === 'backup' && record.path) {
    return inspectBackupFile(record.path)
  }

  throw new Error(`Unsupported data source engine: ${record.engine}`)
}

function serializeDataSource(record: any) {
  return {
    id: record.id,
    name: record.name,
    type: record.type,
    engine: record.engine,
    path: record.path,
    config: sanitizeConfig(safeJsonParse<JsonObject>(record.config, {})),
    metadata: safeJsonParse<JsonObject>(record.metadata, {}),
    status: record.status,
    lastError: record.lastError,
    lastSyncedAt: record.lastSyncedAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  }
}

export async function listDataSources() {
  const records = await prisma.dataSource.findMany({
    orderBy: { createdAt: 'desc' },
  })
  return records.map(serializeDataSource)
}

export async function createDataSource(input: {
  name: string
  type: string
  engine: string
  path?: string | null
  config?: JsonObject | string
}) {
  if (!input.name?.trim()) {
    throw new Error('Name is required')
  }

  const config = typeof input.config === 'string' ? safeJsonParse<JsonObject>(input.config, {}) : (input.config || {})
  const resolvedPath = input.path ? path.resolve(input.path) : null

  if (input.type === 'backup') {
    if (!resolvedPath || !fs.existsSync(resolvedPath)) {
      throw new Error('Backup file does not exist or is inaccessible')
    }
  }

  if (input.engine === 'sqlite') {
    if (!resolvedPath || !fs.existsSync(resolvedPath)) {
      throw new Error('SQLite file does not exist or is inaccessible')
    }
  }

  if (input.type === 'api') {
    const url = String(config.url || '')
    if (!url) throw new Error('API URL is required')
    try {
      new URL(url)
    } catch {
      throw new Error('API URL is invalid')
    }
  }

  if (input.type === 'database' && !['postgres', 'mysql', 'sqlserver', 'sqlite'].includes(input.engine)) {
    throw new Error('Unsupported database type')
  }

  const record = await prisma.dataSource.create({
    data: {
      name: input.name.trim(),
      type: input.type,
      engine: input.engine,
      path: resolvedPath,
      config: JSON.stringify(config),
      metadata: JSON.stringify({}),
      status: 'idle',
      lastError: '',
    },
  })

  await syncDataSource(record.id)

  const stored = await prisma.dataSource.findUnique({ where: { id: record.id } })
  return stored ? serializeDataSource(stored) : record
}

export async function syncDataSource(dataSourceId: string) {
  await prisma.dataSource.update({
    where: { id: dataSourceId },
    data: {
      status: 'syncing',
      lastError: '',
    },
  })

  const record = await prisma.dataSource.findUnique({
    where: { id: dataSourceId },
  })

  if (!record) {
    throw new Error('Data source not found')
  }

  try {
    const metadata = await inspectSource(record)
    await prisma.dataSource.update({
      where: { id: dataSourceId },
      data: {
        metadata: JSON.stringify(metadata),
        status: 'ready',
        lastError: '',
        lastSyncedAt: new Date(),
      },
    })
    return metadata
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Data source sync failed'
    await prisma.dataSource.update({
      where: { id: dataSourceId },
      data: {
        status: 'error',
        lastError: message,
      },
    })
    throw error
  }
}

export async function importBackupDataSource(input: {
  name: string
  filePath: string
}) {
  const resolvedPath = path.resolve(input.filePath)
  if (!fs.existsSync(resolvedPath)) {
    throw new Error('Backup file does not exist')
  }

  const extension = path.extname(resolvedPath).toLowerCase()
  const engine =
    extension === '.csv'
      ? 'csv'
      : extension === '.xlsx' || extension === '.xls'
        ? 'xlsx'
        : extension === '.json'
          ? 'json'
          : extension === '.sql'
            ? 'sql-dump'
            : 'sqlite'

  return createDataSource({
    name: input.name,
    type: 'backup',
    engine,
    path: resolvedPath,
  })
}

export async function deleteDataSource(dataSourceId: string) {
  const record = await prisma.dataSource.findUnique({
    where: { id: dataSourceId },
  })

  if (!record) return

  const shouldDeleteFile = record.type === 'backup' && record.path && fs.existsSync(record.path)
  if (shouldDeleteFile) {
    fs.unlinkSync(record.path!)
  }

  await prisma.dataSource.delete({
    where: { id: dataSourceId },
  })
}

export async function buildDataSourceContext(dataSourceId: string) {
  let record = await prisma.dataSource.findUnique({
    where: { id: dataSourceId },
  })

  if (!record) return null

  const isStale = !record.lastSyncedAt || Date.now() - record.lastSyncedAt.getTime() > 10 * 60 * 1000
  if ((record.status !== 'ready' || isStale) && record.type !== 'backup') {
    await syncDataSource(dataSourceId)
    record = await prisma.dataSource.findUnique({
      where: { id: dataSourceId },
    })
  }

  if (!record) return null

  const metadata = safeJsonParse<{ engine?: string; tables?: TableSnapshot[]; summary?: string }>(record.metadata, {})
  const tables = (metadata.tables || []).slice(0, MAX_TABLES)
  const context = [
    `# DATA SOURCE CONTEXT`,
    `Source: ${record.name}`,
    `Type: ${record.engine}`,
    metadata.summary ? `Schema Summary: ${metadata.summary}` : '',
    '',
    ...tables.map((table, index) => {
      const sample = table.sample.slice(0, MAX_SAMPLE_ROWS)
      return [
        `TABLE [${index + 1}] ${table.name}`,
        `Columns: ${table.columns.map((column) => `${column.name} (${column.type})`).join(', ')}`,
        `Sample Rows:`,
        JSON.stringify(sample, null, 2),
      ].join('\n')
    }),
    '',
    'Use the source schema and sample rows to answer the user. If exact calculations need rows that are not present in the sample, state the limitation clearly.',
    'If the user asks for trends, comparisons, or distributions, prefer returning a chart block in the app-supported format.',
  ]
    .filter(Boolean)
    .join('\n\n')

  return {
    source: record,
    metadata,
    context,
  }
}
